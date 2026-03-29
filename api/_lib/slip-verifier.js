import crypto from 'node:crypto';
import { clampText, createHttpError, toIsoDate, toNumber } from './server-utils.js';

function parseJsonEnv(envKey, fallbackValue) {
  const rawValue = process.env[envKey];
  if (!rawValue) {
    return fallbackValue;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw createHttpError(500, `Invalid JSON in ${envKey}`);
  }
}

function replaceTemplateTokens(value, variables) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const resolved = variables[key];
    return resolved == null ? '' : String(resolved);
  });
}

function applyTemplate(value, variables) {
  if (Array.isArray(value)) {
    return value.map((entry) => applyTemplate(entry, variables));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => [key, applyTemplate(entryValue, variables)])
        .filter(([, entryValue]) => entryValue !== undefined)
    );
  }

  return replaceTemplateTokens(value, variables);
}

function cleanupObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cleanupObject(entry)).filter((entry) => entry !== undefined);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => [key, cleanupObject(entryValue)])
        .filter(([, entryValue]) => entryValue !== undefined && entryValue !== '')
    );
  }

  if (value === '') {
    return undefined;
  }

  return value;
}

function getByPath(target, path) {
  return path.split('.').reduce((current, key) => (current == null ? undefined : current[key]), target);
}

function pickFirst(target, paths) {
  for (const path of paths) {
    const value = getByPath(target, path);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

function parseDateValue(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function getSlipVerifyConfig() {
  return {
    mode: String(process.env.SLIP_VERIFY_MODE || 'mock').trim().toLowerCase(),
    providerName: String(process.env.SLIP_VERIFY_PROVIDER_NAME || 'slip-verify').trim(),
    verifyUrl: String(process.env.SLIP_VERIFY_URL || '').trim(),
    apiKey: String(process.env.SLIP_VERIFY_API_KEY || '').trim(),
    timeoutMs: Math.max(3000, toNumber(process.env.SLIP_VERIFY_TIMEOUT_MS, 15000)),
    expectedAccountNumber: String(process.env.SLIP_VERIFY_EXPECTED_ACCOUNT_NUMBER || '').trim(),
    expectedAccountName: String(process.env.SLIP_VERIFY_EXPECTED_ACCOUNT_NAME || '').trim(),
    expectedBank: String(process.env.SLIP_VERIFY_EXPECTED_BANK || '').trim().toLowerCase(),
    headers: parseJsonEnv('SLIP_VERIFY_HEADERS_JSON', {}),
    template: parseJsonEnv('SLIP_VERIFY_TEMPLATE', {
      slipUrl: '{{slipUrl}}',
      amount: '{{amount}}',
      requestDt: '{{requestDt}}',
      uid: '{{uid}}',
      paymentMethod: '{{paymentMethod}}',
      note: '{{note}}'
    })
  };
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['true', 'success', 'passed', 'verified', 'valid', 'ok'].includes(normalized)) {
    return true;
  }

  if (['false', 'failed', 'invalid', 'rejected', 'error'].includes(normalized)) {
    return false;
  }

  return null;
}

function normalizeLiveResponse(payload, fallbackAmount) {
  const successValue =
    pickFirst(payload, ['success', 'ok', 'valid', 'data.success', 'data.ok', 'data.valid']) ??
    pickFirst(payload, ['status', 'data.status']);
  const success = normalizeBoolean(successValue);
  const amount = toNumber(
    pickFirst(payload, ['amount', 'data.amount', 'data.totalAmount', 'data.payment.amount']),
    fallbackAmount
  );
  const reference =
    String(
      pickFirst(payload, [
        'reference',
        'data.reference',
        'data.transRef',
        'data.transactionId',
        'data.txnId',
        'data.slipRef'
      ]) || ''
    ).trim();

  return {
    provider: String(getSlipVerifyConfig().providerName || 'slip-verify').trim(),
    verified: success !== false,
    amount,
    paidAt: parseDateValue(
      pickFirst(payload, ['paidAt', 'data.paidAt', 'data.transDate', 'data.transactionDateTime']),
      new Date()
    ),
    reference:
      reference ||
      crypto
        .createHash('sha1')
        .update(JSON.stringify(payload))
        .digest('hex')
        .slice(0, 20),
    payerName: clampText(
      pickFirst(payload, ['payerName', 'data.payerName', 'data.sender.name', 'data.account.from.name']),
      120
    ),
    payeeName: clampText(
      pickFirst(payload, ['payeeName', 'data.payeeName', 'data.receiver.name', 'data.account.to.name']),
      120
    ),
    receiverAccountNumber: clampText(
      pickFirst(payload, ['receiverAccountNumber', 'data.receiver.accountNo', 'data.account.to.accountNo']),
      64
    ),
    receiverBank: clampText(
      pickFirst(payload, ['receiverBank', 'data.receiver.bank', 'data.account.to.bank']),
      64
    ),
    failureReason: clampText(
      pickFirst(payload, ['message', 'error', 'data.message', 'data.error', 'data.reason']),
      180
    ),
    rawResponse: payload
  };
}

function assertSlipMatchesExpected({ verification, requestedAmount }) {
  const config = getSlipVerifyConfig();

  if (!verification.verified) {
    throw createHttpError(400, verification.failureReason || 'Slip verification failed', verification.rawResponse);
  }

  if (requestedAmount > 0 && verification.amount > 0 && Math.abs(verification.amount - requestedAmount) > 0.01) {
    throw createHttpError(400, 'Slip amount does not match the requested topup amount');
  }

  if (
    config.expectedAccountNumber &&
    verification.receiverAccountNumber &&
    verification.receiverAccountNumber !== config.expectedAccountNumber
  ) {
    throw createHttpError(400, 'Slip was paid to a different destination account');
  }

  if (
    config.expectedAccountName &&
    verification.payeeName &&
    verification.payeeName.toLowerCase() !== config.expectedAccountName.toLowerCase()
  ) {
    throw createHttpError(400, 'Slip payee name does not match the configured account');
  }

  if (
    config.expectedBank &&
    verification.receiverBank &&
    verification.receiverBank.toLowerCase().includes(config.expectedBank) === false
  ) {
    throw createHttpError(400, 'Slip bank does not match the configured destination bank');
  }
}

function buildMockVerification({ amount, slipPath, slipUrl }) {
  const source = `${slipPath}|${slipUrl}|${amount}`;
  const reference = `mock-${crypto.createHash('sha1').update(source).digest('hex').slice(0, 18)}`;

  return {
    provider: 'mock-slip-verify',
    verified: true,
    amount,
    paidAt: new Date(),
    reference,
    payerName: 'Mock Customer',
    payeeName: '',
    receiverAccountNumber: '',
    receiverBank: '',
    failureReason: '',
    rawResponse: {
      ok: true,
      reference
    }
  };
}

export async function verifySlipPayment({ amount, slipPath, slipUrl, note, paymentMethod, uid }) {
  const config = getSlipVerifyConfig();

  if (config.mode === 'mock') {
    return buildMockVerification({ amount, slipPath, slipUrl });
  }

  if (!config.verifyUrl) {
    throw createHttpError(500, 'Missing SLIP_VERIFY_URL');
  }

  const payload = cleanupObject(
    applyTemplate(config.template, {
      amount: Number(amount).toFixed(2),
      note: clampText(note, 120),
      paymentMethod,
      requestDt: toIsoDate(),
      slipPath,
      slipUrl,
      uid
    })
  );

  const headers = {
    'Content-Type': 'application/json',
    ...config.headers
  };

  if (config.apiKey && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(config.verifyUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(config.timeoutMs)
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw createHttpError(502, 'Slip verification provider returned invalid JSON');
  }

  if (!response.ok) {
    throw createHttpError(502, 'Slip verification request failed', data);
  }

  const verification = normalizeLiveResponse(data, amount);
  assertSlipMatchesExpected({ verification, requestedAmount: amount });
  return verification;
}

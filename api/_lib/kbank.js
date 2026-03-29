import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { clampText, createHttpError, toIsoDate, toNumber } from './server-utils.js';

const tokenCache = {
  accessToken: '',
  expiresAt: 0
};

const DEFAULT_CREATE_TEMPLATE = {
  partnerId: '{{partnerId}}',
  partnerSecret: '{{partnerSecret}}',
  partnerTxnUid: '{{partnerTxnUid}}',
  requestDt: '{{requestDt}}',
  amount: '{{amount}}',
  reference1: '{{topupId}}',
  reference2: '{{uid}}',
  reference3: '{{note}}'
};

const DEFAULT_INQUIRY_TEMPLATE = {
  partnerId: '{{partnerId}}',
  partnerSecret: '{{partnerSecret}}',
  partnerTxnUid: '{{partnerTxnUid}}',
  providerTxnId: '{{providerTxnId}}',
  requestDt: '{{requestDt}}'
};

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

function deepMerge(baseValue, overrideValue) {
  if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
    return overrideValue;
  }

  if (baseValue && typeof baseValue === 'object' && overrideValue && typeof overrideValue === 'object') {
    const keys = [...new Set([...Object.keys(baseValue), ...Object.keys(overrideValue)])];
    return Object.fromEntries(
      keys.map((key) => [
        key,
        key in overrideValue ? deepMerge(baseValue[key], overrideValue[key]) : baseValue[key]
      ])
    );
  }

  return overrideValue === undefined ? baseValue : overrideValue;
}

function cleanupObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cleanupObject(entry)).filter((entry) => entry !== undefined);
  }

  if (value && typeof value === 'object') {
    const cleanedEntries = Object.entries(value)
      .map(([key, entryValue]) => [key, cleanupObject(entryValue)])
      .filter(([, entryValue]) => entryValue !== undefined && entryValue !== '');

    return Object.fromEntries(cleanedEntries);
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

function parseDateValue(value, fallbackDate = null) {
  if (!value) {
    return fallbackDate;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallbackDate : value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallbackDate : date;
}

function normalizeStatus(statusValue, statusCodeValue) {
  const rawStatus = String(statusValue || '').trim().toLowerCase();
  const rawCode = String(statusCodeValue || '').trim().toLowerCase();

  if (
    ['paid', 'success', 'successful', 'succeeded', 'complete', 'completed'].includes(rawStatus) ||
    ['00', '0000', '1000', 'success'].includes(rawCode)
  ) {
    return 'paid';
  }

  if (['expired', 'timeout'].includes(rawStatus) || ['expired', 'timeout'].includes(rawCode)) {
    return 'expired';
  }

  if (['cancelled', 'canceled', 'voided', 'void'].includes(rawStatus) || ['cancelled', 'canceled'].includes(rawCode)) {
    return 'cancelled';
  }

  if (['failed', 'declined', 'error', 'rejected'].includes(rawStatus) || ['failed', 'error', 'rejected'].includes(rawCode)) {
    return 'failed';
  }

  return 'pending';
}

function getKbankConfig() {
  return {
    mode: String(process.env.KBANK_PROVIDER_MODE || 'live').trim().toLowerCase(),
    partnerId: String(process.env.KBANK_PARTNER_ID || '').trim(),
    partnerSecret: String(process.env.KBANK_PARTNER_SECRET || '').trim(),
    createQrUrl: String(process.env.KBANK_CREATE_QR_URL || '').trim(),
    inquiryUrl: String(process.env.KBANK_INQUIRY_URL || '').trim(),
    authUrl: String(process.env.KBANK_AUTH_URL || '').trim(),
    clientId: String(process.env.KBANK_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.KBANK_CLIENT_SECRET || '').trim(),
    staticAccessToken: String(process.env.KBANK_STATIC_ACCESS_TOKEN || '').trim(),
    callbackSecret: String(process.env.KBANK_CALLBACK_SECRET || '').trim(),
    requestTimeoutMs: Math.max(3000, toNumber(process.env.KBANK_REQUEST_TIMEOUT_MS, 15000)),
    qrExpiryMinutes: Math.max(1, toNumber(process.env.KBANK_QR_EXPIRY_MINUTES, 15)),
    commonHeaders: parseJsonEnv('KBANK_COMMON_HEADERS_JSON', {}),
    createQrHeaders: parseJsonEnv('KBANK_CREATE_QR_HEADERS_JSON', {}),
    inquiryHeaders: parseJsonEnv('KBANK_INQUIRY_HEADERS_JSON', {}),
    createQrTemplate: parseJsonEnv('KBANK_CREATE_QR_TEMPLATE', DEFAULT_CREATE_TEMPLATE),
    inquiryTemplate: parseJsonEnv('KBANK_INQUIRY_TEMPLATE', DEFAULT_INQUIRY_TEMPLATE)
  };
}

function isMockMode() {
  return getKbankConfig().mode === 'mock';
}

async function createQrImageDataUrl(qrValue) {
  return QRCode.toDataURL(qrValue, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 7,
    color: {
      dark: '#032a24',
      light: '#f8fffd'
    }
  });
}

async function getAccessToken(config) {
  if (config.staticAccessToken) {
    return config.staticAccessToken;
  }

  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 10_000) {
    return tokenCache.accessToken;
  }

  if (!config.authUrl || !config.clientId || !config.clientSecret) {
    return '';
  }

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const response = await fetch(config.authUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(config.requestTimeoutMs)
  });

  const text = await response.text();
  let payload = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    throw createHttpError(502, 'KBank auth response was not valid JSON');
  }

  if (!response.ok) {
    throw createHttpError(502, 'KBank auth request failed', payload);
  }

  const accessToken = pickFirst(payload, ['access_token', 'data.accessToken', 'accessToken']);
  const expiresInSeconds = toNumber(pickFirst(payload, ['expires_in', 'data.expiresIn', 'expiresIn']), 1800);

  if (!accessToken) {
    throw createHttpError(502, 'KBank auth response did not include an access token', payload);
  }

  tokenCache.accessToken = accessToken;
  tokenCache.expiresAt = now + expiresInSeconds * 1000;
  return accessToken;
}

function buildRequestHeaders(baseHeaders, accessToken) {
  const headers = cleanupObject(baseHeaders) || {};

  if (accessToken && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (!headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

async function callJsonEndpoint(url, headers, payload, timeoutMs) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw createHttpError(502, 'KBank returned a non-JSON response');
  }

  if (!response.ok) {
    throw createHttpError(502, 'KBank request failed', data);
  }

  return data;
}

function normalizeCreateResponse(payload, fallbackExpiresAt) {
  const qrText = String(
    pickFirst(payload, ['data.qrRawData', 'data.qrData', 'data.qrCode', 'qrRawData', 'qrData', 'qrCode']) || ''
  ).trim();

  const qrImageDataUrl = String(
    pickFirst(payload, ['data.qrImage', 'data.qrImageUrl', 'qrImage', 'qrImageUrl']) || ''
  ).trim();

  const providerTxnId = String(
    pickFirst(payload, ['data.txnId', 'data.transactionId', 'txnId', 'transactionId']) || ''
  ).trim();

  const providerStatus = String(
    pickFirst(payload, ['data.status', 'data.statusCode', 'status', 'statusCode']) || 'pending'
  ).trim();

  const expiresAt = parseDateValue(
    pickFirst(payload, ['data.expiredAt', 'data.expireAt', 'data.qrExpireTime', 'expiredAt', 'expireAt', 'qrExpireTime']),
    fallbackExpiresAt
  );

  return {
    qrText,
    qrImageDataUrl,
    providerTxnId,
    providerStatus,
    normalizedStatus: normalizeStatus(providerStatus, providerStatus),
    expiresAt
  };
}

export function normalizeInquiryResponse(payload, fallbackTopup) {
  const providerStatus = String(
    pickFirst(payload, ['data.status', 'data.statusCode', 'status', 'statusCode']) || fallbackTopup?.providerStatus || ''
  ).trim();
  const statusCode = String(pickFirst(payload, ['data.statusCode', 'statusCode']) || '').trim();

  return {
    providerTxnId: String(
      pickFirst(payload, ['data.txnId', 'data.transactionId', 'txnId', 'transactionId']) || fallbackTopup?.providerTxnId || ''
    ).trim(),
    providerStatus,
    normalizedStatus: normalizeStatus(providerStatus, statusCode),
    amount: toNumber(pickFirst(payload, ['data.amount', 'amount']), Number(fallbackTopup?.amount || 0)),
    paidAt: parseDateValue(
      pickFirst(payload, ['data.paidAt', 'data.paymentDateTime', 'data.transactionDateTime', 'paidAt', 'paymentDateTime']),
      null
    ),
    expiresAt: parseDateValue(
      pickFirst(payload, ['data.expiredAt', 'data.expireAt', 'expiredAt', 'expireAt']),
      parseDateValue(fallbackTopup?.expiresAt, null)
    ),
    failureReason: String(
      pickFirst(payload, ['data.message', 'data.statusDesc', 'message', 'statusDesc']) || ''
    ).trim()
  };
}

export async function createKbankQrPayment({ amount, partnerTxnUid, topupId, uid, note }) {
  const config = getKbankConfig();
  const expiresAt = new Date(Date.now() + config.qrExpiryMinutes * 60_000);

  if (isMockMode()) {
    const qrText = `KBANK-MOCK|TOPUP:${topupId}|TXN:${partnerTxnUid}|AMOUNT:${amount.toFixed(2)}`;

    return {
      providerTxnId: `mock-${partnerTxnUid}`,
      providerStatus: 'MOCK_PENDING',
      normalizedStatus: 'pending',
      qrText,
      qrImageDataUrl: await createQrImageDataUrl(qrText),
      expiresAt
    };
  }

  if (!config.createQrUrl) {
    throw createHttpError(500, 'Missing KBANK_CREATE_QR_URL');
  }

  const accessToken = await getAccessToken(config);
  const variables = {
    amount: amount.toFixed(2),
    note: clampText(note, 80),
    partnerId: config.partnerId,
    partnerSecret: config.partnerSecret,
    partnerTxnUid,
    requestDt: toIsoDate(),
    topupId,
    uid
  };

  const payload = cleanupObject(applyTemplate(config.createQrTemplate, variables));
  const headers = buildRequestHeaders(
    deepMerge(config.commonHeaders, config.createQrHeaders),
    accessToken
  );
  const responsePayload = await callJsonEndpoint(config.createQrUrl, headers, payload, config.requestTimeoutMs);
  const normalized = normalizeCreateResponse(responsePayload, expiresAt);

  if (!normalized.qrText && !normalized.qrImageDataUrl) {
    throw createHttpError(502, 'KBank create-QR response did not include QR data', responsePayload);
  }

  return {
    ...normalized,
    qrImageDataUrl: normalized.qrImageDataUrl || (await createQrImageDataUrl(normalized.qrText))
  };
}

export async function inquireKbankPayment(topup) {
  const config = getKbankConfig();

  if (isMockMode()) {
    return {
      providerTxnId: topup.providerTxnId || `mock-${topup.partnerTxnUid}`,
      providerStatus: 'MOCK_PAID',
      normalizedStatus: 'paid',
      amount: Number(topup.amount || 0),
      paidAt: new Date(),
      expiresAt: parseDateValue(topup.expiresAt, null),
      failureReason: ''
    };
  }

  if (!config.inquiryUrl) {
    throw createHttpError(500, 'Missing KBANK_INQUIRY_URL');
  }

  const accessToken = await getAccessToken(config);
  const variables = {
    amount: Number(topup.amount || 0).toFixed(2),
    partnerId: config.partnerId,
    partnerSecret: config.partnerSecret,
    partnerTxnUid: topup.partnerTxnUid || topup.id,
    providerTxnId: topup.providerTxnId || '',
    requestDt: toIsoDate(),
    topupId: topup.id,
    uid: topup.uid
  };

  const payload = cleanupObject(applyTemplate(config.inquiryTemplate, variables));
  const headers = buildRequestHeaders(
    deepMerge(config.commonHeaders, config.inquiryHeaders),
    accessToken
  );
  const responsePayload = await callJsonEndpoint(config.inquiryUrl, headers, payload, config.requestTimeoutMs);

  return normalizeInquiryResponse(responsePayload, topup);
}

export function verifyKbankCallbackSecret(req) {
  const config = getKbankConfig();

  if (!config.callbackSecret) {
    return;
  }

  const providedSecret = String(
    req.headers['x-kbank-callback-secret'] ||
      req.headers['x-callback-secret'] ||
      req.query?.secret ||
      ''
  ).trim();

  if (!providedSecret) {
    throw createHttpError(401, 'Missing callback secret');
  }

  const expected = Buffer.from(config.callbackSecret);
  const received = Buffer.from(providedSecret);

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw createHttpError(401, 'Invalid callback secret');
  }
}

export function normalizeKbankCallbackPayload(payload, topup) {
  return normalizeInquiryResponse(payload, topup);
}

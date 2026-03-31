import QRCode from 'qrcode';
import { createHttpError, toNumber } from './server-utils.js';

const ID_PAYLOAD_FORMAT = '00';
const ID_POI_METHOD = '01';
const ID_MERCHANT_INFORMATION_BOT = '29';
const ID_TRANSACTION_CURRENCY = '53';
const ID_TRANSACTION_AMOUNT = '54';
const ID_COUNTRY_CODE = '58';
const ID_CRC = '63';

const PAYLOAD_FORMAT_EMV_QRCPS_MERCHANT_PRESENTED_MODE = '01';
const POI_METHOD_STATIC = '11';
const POI_METHOD_DYNAMIC = '12';

const MERCHANT_INFORMATION_TEMPLATE_ID_GUID = '00';
const BOT_ID_MERCHANT_PHONE_NUMBER = '01';
const BOT_ID_MERCHANT_TAX_ID = '02';
const BOT_ID_MERCHANT_EWALLET_ID = '03';

const GUID_PROMPTPAY = 'A000000677010111';
const TRANSACTION_CURRENCY_THB = '764';
const COUNTRY_CODE_TH = 'TH';

function field(id, value) {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

function serialize(entries) {
  return entries.filter(Boolean).join('');
}

function sanitizePromptPayId(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function resolvePromptPayTargetType(target) {
  if (target.length >= 15) {
    return BOT_ID_MERCHANT_EWALLET_ID;
  }

  if (target.length >= 13) {
    return BOT_ID_MERCHANT_TAX_ID;
  }

  return BOT_ID_MERCHANT_PHONE_NUMBER;
}

function formatPromptPayTarget(target) {
  if (target.length >= 13) {
    return target;
  }

  return `0000000000000${target.replace(/^0/, '66')}`.slice(-13);
}

function validatePromptPayId(value) {
  const target = sanitizePromptPayId(value);

  if (![10, 13, 15].includes(target.length)) {
    throw createHttpError(400, 'PromptPay ID must be a 10-digit phone number, 13-digit ID/tax ID, or 15-digit e-wallet ID');
  }

  return target;
}

function validateAmount(value) {
  const amount = toNumber(value, NaN);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createHttpError(400, 'Invalid PromptPay amount');
  }

  return amount;
}

function crc16Xmodem(input) {
  let crc = 0xffff;

  for (let index = 0; index < input.length; index += 1) {
    crc ^= input.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }

  return crc;
}

function formatCrc(crcValue) {
  return crcValue.toString(16).toUpperCase().padStart(4, '0');
}

export function maskPromptPayId(value) {
  const target = sanitizePromptPayId(value);

  if (target.length <= 4) {
    return target;
  }

  return `${target.slice(0, 3)}-${'*'.repeat(Math.max(0, target.length - 6))}-${target.slice(-3)}`;
}

export function generatePromptPayPayload(target, { amount } = {}) {
  const sanitizedTarget = validatePromptPayId(target);
  const numericAmount = amount == null || amount === '' ? 0 : validateAmount(amount);
  const targetType = resolvePromptPayTargetType(sanitizedTarget);

  const payloadFields = [
    field(ID_PAYLOAD_FORMAT, PAYLOAD_FORMAT_EMV_QRCPS_MERCHANT_PRESENTED_MODE),
    field(ID_POI_METHOD, numericAmount > 0 ? POI_METHOD_DYNAMIC : POI_METHOD_STATIC),
    field(
      ID_MERCHANT_INFORMATION_BOT,
      serialize([
        field(MERCHANT_INFORMATION_TEMPLATE_ID_GUID, GUID_PROMPTPAY),
        field(targetType, formatPromptPayTarget(sanitizedTarget))
      ])
    ),
    field(ID_COUNTRY_CODE, COUNTRY_CODE_TH),
    field(ID_TRANSACTION_CURRENCY, TRANSACTION_CURRENCY_THB),
    numericAmount > 0 ? field(ID_TRANSACTION_AMOUNT, numericAmount.toFixed(2)) : ''
  ];

  const dataToCrc = `${serialize(payloadFields)}${ID_CRC}04`;
  return serialize([...payloadFields, field(ID_CRC, formatCrc(crc16Xmodem(dataToCrc)))]);
}

export async function createPromptPayQrImageDataUrl(payload) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 7,
    color: {
      dark: '#032a24',
      light: '#f8fffd'
    }
  });
}

export async function createPromptPayQrPreview({ promptPayId, amount, expiryMinutes = 15 }) {
  const normalizedPromptPayId = validatePromptPayId(promptPayId);
  const normalizedAmount = validateAmount(amount);
  const qrText = generatePromptPayPayload(normalizedPromptPayId, { amount: normalizedAmount });
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + Math.max(1, toNumber(expiryMinutes, 15)) * 60_000);

  return {
    amount: normalizedAmount,
    createdAt,
    expiresAt,
    promptPayId: normalizedPromptPayId,
    promptPayIdMasked: maskPromptPayId(normalizedPromptPayId),
    qrImageDataUrl: await createPromptPayQrImageDataUrl(qrText),
    qrText
  };
}

import { clampText, createHttpError, readJsonBody, requireMethod, sendError, sendJson, toNumber } from '../_lib/server-utils.js';
import { createPromptPayQrPreview } from '../_lib/promptpay.js';

const MIN_TOPUP_AMOUNT = 50;
const MAX_TOPUP_AMOUNT = 50000;

function readPromptPayId(body) {
  return clampText(body.promptPayId || process.env.PROMPTPAY_ID || '', 32);
}

export default async function handler(req, res) {
  try {
    requireMethod(req, 'POST');

    const body = await readJsonBody(req);
    const amount = toNumber(body.amount, 0);
    const promptPayId = readPromptPayId(body);
    const expiryMinutes = Math.max(1, toNumber(process.env.PROMPTPAY_QR_EXPIRY_MINUTES, 15));

    if (amount < MIN_TOPUP_AMOUNT || amount > MAX_TOPUP_AMOUNT) {
      throw createHttpError(400, `Amount must be between ${MIN_TOPUP_AMOUNT}-${MAX_TOPUP_AMOUNT} THB`);
    }

    if (!promptPayId) {
      throw createHttpError(500, 'Missing PromptPay ID. Set PROMPTPAY_ID or provide promptPayId in the request.');
    }

    const preview = await createPromptPayQrPreview({
      promptPayId,
      amount,
      expiryMinutes
    });

    sendJson(res, 200, {
      ok: true,
      ...preview
    });
  } catch (error) {
    sendError(res, error);
  }
}

import { requireVerifiedUser } from '../_lib/firebase-admin.js';
import { createPaidTopup, getTopupByVerificationRef } from '../_lib/topup-store.js';
import { verifySlipPayment } from '../_lib/slip-verifier.js';
import {
  clampText,
  createHttpError,
  readJsonBody,
  requireMethod,
  sendError,
  sendJson,
  toNumber
} from '../_lib/server-utils.js';

const MIN_TOPUP_AMOUNT = 50;
const MAX_TOPUP_AMOUNT = 50000;

export default async function handler(req, res) {
  try {
    requireMethod(req, 'POST');

    const user = await requireVerifiedUser(req);
    const body = await readJsonBody(req);
    const amount = toNumber(body.amount, 0);
    const note = clampText(body.note, 240);
    const paymentMethod = clampText(body.paymentMethod || 'bank', 40) || 'bank';
    const channelLabel = clampText(body.channelLabel || 'Bank Transfer', 120) || 'Bank Transfer';
    const slipPath = String(body.slipPath || '').trim();
    const slipUrl = String(body.slipUrl || '').trim();

    if (amount < MIN_TOPUP_AMOUNT || amount > MAX_TOPUP_AMOUNT) {
      throw createHttpError(400, `Amount must be between ${MIN_TOPUP_AMOUNT}-${MAX_TOPUP_AMOUNT} THB`);
    }

    if (!slipPath || !slipUrl) {
      throw createHttpError(400, 'Missing uploaded slip file');
    }

    const verification = await verifySlipPayment({
      amount,
      slipPath,
      slipUrl,
      note,
      paymentMethod,
      uid: user.uid
    });

    const duplicateTopup = await getTopupByVerificationRef(verification.reference);
    if (duplicateTopup) {
      throw createHttpError(409, 'This slip has already been used');
    }

    const topup = await createPaidTopup({
      uid: user.uid,
      userEmail: user.email || '',
      amount,
      note,
      paymentMethod,
      channelLabel,
      slipPath,
      slipUrl,
      verificationProvider: verification.provider,
      verificationRef: verification.reference,
      paidAt: verification.paidAt,
      payerName: verification.payerName,
      payeeName: verification.payeeName,
      receiverAccountNumber: verification.receiverAccountNumber,
      receiverBank: verification.receiverBank,
      rawVerification: verification.rawResponse
    });

    sendJson(res, 200, {
      ok: true,
      topupId: topup.id,
      status: topup.status
    });
  } catch (error) {
    sendError(res, error);
  }
}

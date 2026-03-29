import { requireVerifiedUser } from '../_lib/firebase-admin.js';
import { createKbankQrPayment } from '../_lib/kbank.js';
import { createPendingTopup, findReusablePendingTopup } from '../_lib/topup-store.js';
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

    if (amount < MIN_TOPUP_AMOUNT || amount > MAX_TOPUP_AMOUNT) {
      throw createHttpError(400, `Amount must be between ${MIN_TOPUP_AMOUNT}-${MAX_TOPUP_AMOUNT} THB`);
    }

    const existingTopup = await findReusablePendingTopup(user.uid);
    if (existingTopup) {
      sendJson(res, 200, {
        ok: true,
        reusedExistingTopup: true,
        topupId: existingTopup.id
      });
      return;
    }

    const partnerTxnUid = `tp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const kbankPayment = await createKbankQrPayment({
      amount,
      partnerTxnUid,
      topupId: partnerTxnUid,
      uid: user.uid,
      note
    });

    const topup = await createPendingTopup({
      uid: user.uid,
      userEmail: user.email || '',
      amount,
      note,
      partnerTxnUid,
      providerTxnId: kbankPayment.providerTxnId,
      providerStatus: kbankPayment.providerStatus,
      qrText: kbankPayment.qrText,
      qrImageDataUrl: kbankPayment.qrImageDataUrl,
      expiresAt: kbankPayment.expiresAt
    });

    sendJson(res, 200, {
      ok: true,
      reusedExistingTopup: false,
      topupId: topup.id
    });
  } catch (error) {
    sendError(res, error);
  }
}

import { normalizeKbankCallbackPayload, verifyKbankCallbackSecret } from '../_lib/kbank.js';
import { getTopupByPartnerTxnUid, markTopupStatus } from '../_lib/topup-store.js';
import { createHttpError, readJsonBody, requireMethod, sendError, sendJson } from '../_lib/server-utils.js';

function readPartnerTxnUid(payload) {
  return String(
    payload?.partnerTxnUid ||
      payload?.data?.partnerTxnUid ||
      payload?.reference1 ||
      payload?.data?.reference1 ||
      ''
  ).trim();
}

export default async function handler(req, res) {
  try {
    requireMethod(req, 'POST');
    verifyKbankCallbackSecret(req);

    const body = await readJsonBody(req);
    const partnerTxnUid = readPartnerTxnUid(body);

    if (!partnerTxnUid) {
      throw createHttpError(400, 'Missing partnerTxnUid in callback payload');
    }

    const topup = await getTopupByPartnerTxnUid(partnerTxnUid);
    const gatewayResult = normalizeKbankCallbackPayload(body, topup);
    const syncedTopup = await markTopupStatus({
      topupId: topup.id,
      nextStatus: gatewayResult.normalizedStatus,
      providerTxnId: gatewayResult.providerTxnId,
      providerStatus: gatewayResult.providerStatus,
      failureReason: gatewayResult.failureReason,
      paidAt: gatewayResult.paidAt,
      paidAmount: gatewayResult.amount,
      expiresAt: gatewayResult.expiresAt
    });

    sendJson(res, 200, {
      ok: true,
      topupId: syncedTopup.id,
      status: syncedTopup.status
    });
  } catch (error) {
    sendError(res, error);
  }
}

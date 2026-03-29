import { requireVerifiedUser } from '../_lib/firebase-admin.js';
import { inquireKbankPayment } from '../_lib/kbank.js';
import { getUserTopupById, markTopupStatus } from '../_lib/topup-store.js';
import { createHttpError, readJsonBody, requireMethod, sendError, sendJson } from '../_lib/server-utils.js';

function isExpired(topup) {
  if (!topup?.expiresAt) {
    return false;
  }

  const expiresAt = typeof topup.expiresAt?.toDate === 'function' ? topup.expiresAt.toDate() : new Date(topup.expiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now();
}

export default async function handler(req, res) {
  try {
    requireMethod(req, 'POST');

    const user = await requireVerifiedUser(req);
    const body = await readJsonBody(req);
    const topupId = String(body.topupId || '').trim();

    if (!topupId) {
      throw createHttpError(400, 'Missing topupId');
    }

    const topup = await getUserTopupById(topupId, user.uid);
    const currentStatus = String(topup.status || '').toLowerCase();

    if (currentStatus === 'paid') {
      sendJson(res, 200, { ok: true, topupId, status: 'paid' });
      return;
    }

    if (currentStatus && currentStatus !== 'pending') {
      sendJson(res, 200, { ok: true, topupId, status: currentStatus });
      return;
    }

    if (isExpired(topup)) {
      const expiredTopup = await markTopupStatus({
        topupId,
        nextStatus: 'expired',
        providerTxnId: topup.providerTxnId || '',
        providerStatus: topup.providerStatus || 'expired',
        failureReason: topup.failureReason || 'QR code expired'
      });

      sendJson(res, 200, {
        ok: true,
        topupId,
        status: expiredTopup.status
      });
      return;
    }

    const gatewayResult = await inquireKbankPayment(topup);
    const syncedTopup = await markTopupStatus({
      topupId,
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
      topupId,
      status: syncedTopup.status
    });
  } catch (error) {
    sendError(res, error);
  }
}

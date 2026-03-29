import crypto from 'node:crypto';
import { getAdminDb } from './firebase-admin.js';
import { createHttpError, toNumber } from './server-utils.js';

function toMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value?.toMillis === 'function') {
    return value.toMillis();
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime();
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isExpiredDate(value) {
  const expiresAtMs = toMillis(value);
  return Boolean(expiresAtMs && expiresAtMs <= Date.now());
}

export async function getUserTopupById(topupId, uid) {
  const db = await getAdminDb();
  const snapshot = await db.collection('topups').doc(topupId).get();

  if (!snapshot.exists) {
    throw createHttpError(404, 'Topup not found');
  }

  const topup = { id: snapshot.id, ...snapshot.data() };
  if (uid && topup.uid !== uid) {
    throw createHttpError(403, 'You do not have access to this topup');
  }

  return topup;
}

export async function getTopupByPartnerTxnUid(partnerTxnUid) {
  const db = await getAdminDb();
  const snapshot = await db.collection('topups').where('partnerTxnUid', '==', partnerTxnUid).limit(1).get();

  if (snapshot.empty) {
    throw createHttpError(404, 'Topup not found');
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function getTopupByVerificationRef(verificationRef) {
  if (!verificationRef) {
    return null;
  }

  const db = await getAdminDb();
  const snapshot = await db.collection('topups').where('verificationRef', '==', verificationRef).limit(1).get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function findReusablePendingTopup(uid) {
  const db = await getAdminDb();
  const snapshot = await db.collection('topups').where('uid', '==', uid).where('status', '==', 'pending').get();

  if (snapshot.empty) {
    return null;
  }

  const candidates = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((topup) => topup.paymentMethod === 'kbank_qr')
    .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));

  for (const topup of candidates) {
    if (isExpiredDate(topup.expiresAt)) {
      await markTopupStatus({
        topupId: topup.id,
        nextStatus: 'expired',
        providerStatus: topup.providerStatus || 'expired',
        failureReason: topup.failureReason || 'QR code expired'
      });
      continue;
    }

    return topup;
  }

  return null;
}

export async function createPendingTopup({
  uid,
  userEmail,
  amount,
  note,
  partnerTxnUid,
  providerTxnId,
  providerStatus,
  qrText,
  qrImageDataUrl,
  expiresAt
}) {
  const db = await getAdminDb();
  const topupRef = db.collection('topups').doc();
  const now = new Date();

  await topupRef.set({
    uid,
    userEmail,
    amount: Number(amount),
    paymentMethod: 'kbank_qr',
    channelLabel: 'KBank QR API',
    provider: 'kbank',
    partnerTxnUid,
    providerTxnId: providerTxnId || '',
    providerStatus: providerStatus || 'pending',
    status: 'pending',
    slipPath: '',
    slipUrl: qrImageDataUrl || '',
    qrText: qrText || '',
    qrImageDataUrl: qrImageDataUrl || '',
    expiresAt,
    note,
    paidAt: null,
    paidAmount: 0,
    balanceAppliedAt: null,
    failureReason: '',
    createdAt: now,
    updatedAt: now,
    lastSyncedAt: now,
    reviewedAt: null,
    reviewedBy: '',
    adminNote: ''
  });

  const snapshot = await topupRef.get();
  return { id: snapshot.id, ...snapshot.data() };
}

function buildVerifiedTopupId(verificationRef) {
  return `slip-${crypto.createHash('sha1').update(String(verificationRef || Date.now())).digest('hex').slice(0, 24)}`;
}

export async function createPaidTopup({
  uid,
  userEmail,
  amount,
  note,
  paymentMethod,
  channelLabel,
  slipPath,
  slipUrl,
  verificationProvider,
  verificationRef,
  paidAt,
  payerName,
  payeeName,
  receiverAccountNumber,
  receiverBank,
  rawVerification
}) {
  const db = await getAdminDb();
  const topupRef = db.collection('topups').doc(buildVerifiedTopupId(verificationRef));

  return db.runTransaction(async (transaction) => {
    const existingTopupSnap = await transaction.get(topupRef);
    if (existingTopupSnap.exists) {
      throw createHttpError(409, 'This slip has already been used');
    }

    const userRef = db.collection('users').doc(uid);
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists) {
      throw createHttpError(404, 'User profile not found');
    }

    const now = new Date();
    const paidAtDate = paidAt instanceof Date ? paidAt : new Date(paidAt || now);
    const topupPayload = {
      uid,
      userEmail,
      amount: Number(amount),
      paymentMethod,
      channelLabel,
      status: 'paid',
      slipPath,
      slipUrl,
      note,
      provider: verificationProvider || 'slip-verify',
      verificationProvider: verificationProvider || 'slip-verify',
      verificationRef,
      paidAt: Number.isNaN(paidAtDate.getTime()) ? now : paidAtDate,
      paidAmount: Number(amount),
      balanceAppliedAt: now,
      payerName: payerName || '',
      payeeName: payeeName || '',
      receiverAccountNumber: receiverAccountNumber || '',
      receiverBank: receiverBank || '',
      rawVerification: rawVerification || null,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: now,
      reviewedAt: now,
      reviewedBy: 'slip-verifier',
      adminNote: 'Auto-approved by slip verification'
    };

    transaction.set(topupRef, topupPayload);
    transaction.update(userRef, {
      balance: toNumber(userSnap.data().balance, 0) + Number(amount),
      updatedAt: now
    });

    return {
      id: topupRef.id,
      ...topupPayload
    };
  });
}

export async function markTopupStatus({
  topupId,
  nextStatus,
  providerTxnId = '',
  providerStatus = '',
  failureReason = '',
  paidAt = null,
  paidAmount = 0,
  expiresAt = null
}) {
  const db = await getAdminDb();
  const topupRef = db.collection('topups').doc(topupId);

  return db.runTransaction(async (transaction) => {
    const topupSnap = await transaction.get(topupRef);

    if (!topupSnap.exists) {
      throw createHttpError(404, 'Topup not found');
    }

    const topup = topupSnap.data();
    const currentStatus = String(topup.status || 'pending').toLowerCase();
    const amountToApply = Number(paidAmount || topup.amount || 0);
    const now = new Date();
    const updatePayload = {
      providerTxnId: providerTxnId || topup.providerTxnId || '',
      providerStatus: providerStatus || topup.providerStatus || '',
      status: currentStatus === 'paid' ? 'paid' : nextStatus,
      updatedAt: now,
      lastSyncedAt: now,
      failureReason: failureReason || ''
    };

    if (expiresAt) {
      updatePayload.expiresAt = expiresAt;
    }

    if (currentStatus !== 'paid' && nextStatus === 'paid') {
      const userRef = db.collection('users').doc(topup.uid);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists) {
        throw createHttpError(404, 'User profile not found for this topup');
      }

      const currentBalance = toNumber(userSnap.data().balance, 0);
      transaction.update(userRef, {
        balance: currentBalance + amountToApply,
        updatedAt: now
      });

      updatePayload.paidAt = paidAt || now;
      updatePayload.paidAmount = amountToApply;
      updatePayload.balanceAppliedAt = now;
      updatePayload.failureReason = '';
    }

    if (currentStatus !== 'paid' && nextStatus === 'expired') {
      updatePayload.expiredAt = now;
    }

    transaction.set(topupRef, updatePayload, { merge: true });

    return {
      id: topupSnap.id,
      ...topup,
      ...updatePayload
    };
  });
}

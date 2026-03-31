import { createPromptPayQrPreview } from '../lib/promptpay.js';

async function requestWithAuth(user, url, payload) {
  const idToken = await user.getIdToken();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Payment request failed');
  }

  return data;
}

export function createKbankQrTopup(user, payload) {
  return requestWithAuth(user, '/api/topups/create-kbank-qr', payload);
}

async function createPromptPayQrFallback(payload, originalError = null) {
  const promptPayId = String(payload?.promptPayId || '').trim();

  if (!promptPayId) {
    const baseMessage = 'PromptPay ID is not configured. Set PROMPTPAY_ID on the server or promptPayId in public/js/app-config.js';
    const errorSuffix = originalError?.message ? ` (${originalError.message})` : '';
    throw new Error(`${baseMessage}${errorSuffix}`);
  }

  return createPromptPayQrPreview({
    promptPayId,
    amount: payload?.amount,
    expiryMinutes: payload?.expiryMinutes
  });
}

export async function createPromptPayQr(payload) {
  const requestPayload = payload || {};
  const response = await fetch('/api/topups/create-promptpay-qr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestPayload)
  }).catch((error) => ({ networkError: error }));

  if (response?.networkError) {
    return createPromptPayQrFallback(requestPayload, new Error('PromptPay QR API is unavailable in this deployment'));
  }

  const data = await response.json().catch(() => null);

  if (response.ok && data?.ok !== false) {
    return data;
  }

  const apiError = new Error(data?.error || 'Unable to create PromptPay QR');
  const apiUnavailable = response.status === 404 || response.status === 405 || response.status >= 500 || !data;

  if (apiUnavailable) {
    return createPromptPayQrFallback(requestPayload, apiError);
  }

  throw apiError;
}

export function inquireKbankTopup(user, topupId) {
  return requestWithAuth(user, '/api/topups/inquire-kbank', { topupId });
}

export function verifyTopupSlip(user, payload) {
  return requestWithAuth(user, '/api/topups/verify-slip', payload);
}

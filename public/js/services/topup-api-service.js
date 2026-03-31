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

export async function createPromptPayQr(payload) {
  const response = await fetch('/api/topups/create-promptpay-qr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Unable to create PromptPay QR');
  }

  return data;
}

export function inquireKbankTopup(user, topupId) {
  return requestWithAuth(user, '/api/topups/inquire-kbank', { topupId });
}

export function verifyTopupSlip(user, payload) {
  return requestWithAuth(user, '/api/topups/verify-slip', payload);
}

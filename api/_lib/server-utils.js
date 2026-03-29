function streamToString(stream) {
  return new Promise((resolve, reject) => {
    let data = '';

    stream.on('data', (chunk) => {
      data += chunk;
    });

    stream.on('end', () => resolve(data));
    stream.on('error', reject);
  });
}

export function createHttpError(status, message, details) {
  const error = new Error(message);
  error.statusCode = status;
  error.details = details;
  return error;
}

export function sendJson(res, statusCode, payload) {
  if (typeof res.status === 'function') {
    res.status(statusCode);
  } else {
    res.statusCode = statusCode;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function sendError(res, error) {
  const statusCode = Number(error?.statusCode || 500);
  const message = error?.message || 'Internal server error';

  if (statusCode >= 500) {
    console.error(error);
  }

  sendJson(res, statusCode, {
    ok: false,
    error: message,
    details: error?.details ?? null
  });
}

export function requireMethod(req, allowedMethods) {
  const allowed = Array.isArray(allowedMethods) ? allowedMethods : [allowedMethods];

  if (!allowed.includes(req.method)) {
    throw createHttpError(405, `Method ${req.method} not allowed`);
  }
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : typeof req.body === 'string'
      ? req.body
      : await streamToString(req);

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw createHttpError(400, 'Invalid JSON body');
  }
}

export function readBearerToken(req) {
  const headerValue = req.headers.authorization || req.headers.Authorization || '';

  if (!headerValue.toLowerCase().startsWith('bearer ')) {
    throw createHttpError(401, 'Missing bearer token');
  }

  const token = headerValue.slice(7).trim();
  if (!token) {
    throw createHttpError(401, 'Missing bearer token');
  }

  return token;
}

export function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampText(value, maxLength = 255) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function toIsoDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

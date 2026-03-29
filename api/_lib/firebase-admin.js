import fs from 'node:fs/promises';
import path from 'node:path';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createHttpError, readBearerToken } from './server-utils.js';

let adminAppPromise = null;

async function getAdminOptions() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return {
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    };
  }

  if (process.env.SERVICE_ACCOUNT_PATH) {
    const rawKey = await fs.readFile(path.resolve(process.env.SERVICE_ACCOUNT_PATH), 'utf8');
    return {
      credential: cert(JSON.parse(rawKey))
    };
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {
      credential: applicationDefault()
    };
  }

  throw createHttpError(
    500,
    'Missing Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON, SERVICE_ACCOUNT_PATH, or GOOGLE_APPLICATION_CREDENTIALS.'
  );
}

async function getAdminApp() {
  if (!adminAppPromise) {
    adminAppPromise = (async () => {
      if (getApps().length) {
        return getApps()[0];
      }

      const options = await getAdminOptions();
      return initializeApp(options);
    })();
  }

  return adminAppPromise;
}

export async function getAdminDb() {
  const app = await getAdminApp();
  return getFirestore(app);
}

export async function getAdminAuth() {
  const app = await getAdminApp();
  return getAuth(app);
}

export async function requireVerifiedUser(req) {
  const token = readBearerToken(req);
  const auth = await getAdminAuth();

  try {
    return await auth.verifyIdToken(token);
  } catch (error) {
    throw createHttpError(401, 'Invalid or expired login session');
  }
}

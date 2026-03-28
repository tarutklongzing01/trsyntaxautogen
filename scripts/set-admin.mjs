import fs from 'node:fs/promises';
import path from 'node:path';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

async function getAdminOptions() {
  if (process.env.SERVICE_ACCOUNT_PATH) {
    const rawKey = await fs.readFile(path.resolve(process.env.SERVICE_ACCOUNT_PATH), 'utf8');
    return { credential: cert(JSON.parse(rawKey)) };
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { credential: applicationDefault() };
  }

  throw new Error(
    'Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS or SERVICE_ACCOUNT_PATH before running this script.'
  );
}

async function main() {
  const identifier = process.argv[2];

  if (!identifier) {
    throw new Error('Usage: npm run set-admin -- <email-or-uid>');
  }

  const options = await getAdminOptions();
  const app = getApps().length ? getApps()[0] : initializeApp(options);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const userRecord = identifier.includes('@')
    ? await auth.getUserByEmail(identifier)
    : await auth.getUser(identifier);

  await db.collection('users').doc(userRecord.uid).set(
    {
      uid: userRecord.uid,
      email: userRecord.email ?? '',
      displayName: userRecord.displayName ?? 'Admin',
      photoURL: userRecord.photoURL ?? '',
      phone: '',
      lineId: '',
      discordId: '',
      role: 'admin',
      balance: 0,
      lastOrderId: '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastLoginAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  console.log(`Granted admin role to ${userRecord.email ?? userRecord.uid}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

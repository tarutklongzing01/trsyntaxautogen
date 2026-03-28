import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const options = await getAdminOptions();
  const app = getApps().length ? getApps()[0] : initializeApp(options);
  const db = getFirestore(app);
  const productsFile = path.join(__dirname, '..', 'mock-data', 'products.json');
  const products = JSON.parse(await fs.readFile(productsFile, 'utf8'));

  const batch = db.batch();

  products.forEach((product) => {
    const docRef = db.collection('products').doc(product.id);
    batch.set(
      docRef,
      {
        name: product.name,
        category: product.category,
        shortDescription: product.shortDescription,
        description: product.description,
        price: Number(product.price),
        stock: Number(product.stock),
        soldCount: Number(product.soldCount ?? 0),
        status: product.status,
        badge: product.badge ?? '',
        imageUrl: product.imageUrl,
        deliveryType: product.deliveryType ?? 'manual',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });

  await batch.commit();
  console.log(`Seeded ${products.length} products into Firestore.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});


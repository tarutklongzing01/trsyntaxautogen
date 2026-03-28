import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { APP_CONFIG } from '../app-config.js';
import { db } from './firebase.js';

function mapSnapshot(snapshot) {
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

function sortProducts(products) {
  return [...products].sort((left, right) => left.name.localeCompare(right.name, 'th'));
}

function buildPayload(data, existing = {}) {
  return {
    name: data.name.trim(),
    category: data.category,
    shortDescription: data.shortDescription.trim(),
    description: data.description.trim(),
    price: Number(data.price),
    stock: Number(data.stock),
    soldCount: Number(existing.soldCount ?? data.soldCount ?? 0),
    status: data.status,
    badge: data.badge?.trim() ?? '',
    imageUrl: data.imageUrl?.trim() || APP_CONFIG.defaultProductImage,
    deliveryType: 'manual',
    createdAt: existing.createdAt ?? serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

export async function fetchActiveProducts() {
  const productsQuery = query(collection(db, 'products'), where('status', '==', 'active'));
  const snapshot = await getDocs(productsQuery);
  return sortProducts(mapSnapshot(snapshot));
}

export async function fetchAllProducts() {
  const snapshot = await getDocs(collection(db, 'products'));
  return sortProducts(mapSnapshot(snapshot));
}

export async function saveProduct(productId, data, existing = {}) {
  const payload = buildPayload(data, existing);
  const productRef = productId ? doc(db, 'products', productId) : doc(collection(db, 'products'));

  if (productId) {
    await updateDoc(productRef, payload);
  } else {
    await setDoc(productRef, payload);
  }

  return productRef.id;
}

export async function deleteProduct(productId) {
  await deleteDoc(doc(db, 'products', productId));
}


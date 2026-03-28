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

const PRODUCT_CACHE_KEY = 'tr-syntax-active-products-cache';

function mapSnapshot(snapshot) {
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

function sortProducts(products) {
  return [...products].sort((left, right) => left.name.localeCompare(right.name, 'th'));
}

function saveProductCache(products) {
  try {
    window.localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(products));
  } catch (error) {
    console.warn('Unable to cache products locally:', error);
  }
}

function readProductCache() {
  try {
    const raw = window.localStorage.getItem(PRODUCT_CACHE_KEY);
    if (!raw) {
      return [];
    }

    const products = JSON.parse(raw);
    return Array.isArray(products) ? sortProducts(products) : [];
  } catch (error) {
    console.warn('Unable to read cached products:', error);
    return [];
  }
}

function buildPayload(data, existing = {}) {
  const deliveryType = data.deliveryType === 'instant_url' ? 'instant_url' : 'manual';

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
    deliveryType,
    deliveryValue: deliveryType === 'instant_url' ? data.deliveryValue?.trim() || '' : '',
    deliveryNote: data.deliveryNote?.trim() ?? '',
    createdAt: existing.createdAt ?? serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

export async function fetchActiveProducts() {
  try {
    const productsQuery = query(collection(db, 'products'), where('status', '==', 'active'));
    const snapshot = await getDocs(productsQuery);
    const products = sortProducts(mapSnapshot(snapshot));
    saveProductCache(products);
    return products;
  } catch (error) {
    const cachedProducts = readProductCache();
    if (cachedProducts.length) {
      console.warn('Using cached products because Firestore read failed:', error);
      return cachedProducts;
    }

    console.warn('No Firestore products available for guest view yet:', error);
    return [];
  }
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

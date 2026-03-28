import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { db } from './firebase.js';

function mapSnapshot(snapshot) {
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

function sortByRecent(items) {
  return [...items].sort((left, right) => {
    const leftTime = left.createdAt?.seconds ?? 0;
    const rightTime = right.createdAt?.seconds ?? 0;
    return rightTime - leftTime;
  });
}

export async function createOrder({ user, profile, product }) {
  const orderRef = doc(collection(db, 'orders'));
  const userRef = doc(db, 'users', user.uid);
  const productRef = doc(db, 'products', product.id);

  await runTransaction(db, async (transaction) => {
    const [userSnap, productSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(productRef)
    ]);

    if (!userSnap.exists()) {
      throw new Error('ไม่พบข้อมูลผู้ใช้');
    }

    if (!productSnap.exists()) {
      throw new Error('ไม่พบสินค้า');
    }

    const userData = userSnap.data();
    const productData = productSnap.data();
    const balance = Number(userData.balance || 0);
    const price = Number(productData.price || 0);
    const stock = Number(productData.stock || 0);
    const deliveryType = productData.deliveryType === 'instant_url' ? 'instant_url' : 'manual';
    const deliveryValue = typeof productData.deliveryValue === 'string' ? productData.deliveryValue.trim() : '';
    const deliveryNote = typeof productData.deliveryNote === 'string' ? productData.deliveryNote.trim() : '';
    const isInstantUrl = deliveryType === 'instant_url';

    if (productData.status !== 'active') {
      throw new Error('สินค้านี้ยังไม่พร้อมขาย');
    }

    if (stock <= 0) {
      throw new Error('สินค้าหมดสต็อก');
    }

    if (balance < price) {
      throw new Error('ยอดเงินไม่พอ กรุณาเติมเงินก่อน');
    }

    if (isInstantUrl && !deliveryValue) {
      throw new Error('สินค้าแบบ Instant URL ยังไม่ได้ตั้งค่า delivery URL');
    }

    transaction.update(userRef, {
      balance: balance - price,
      lastOrderId: orderRef.id,
      updatedAt: serverTimestamp()
    });

    transaction.update(productRef, {
      stock: stock - 1,
      soldCount: Number(productData.soldCount || 0) + 1,
      updatedAt: serverTimestamp()
    });

    transaction.set(orderRef, {
      uid: user.uid,
      userEmail: profile?.email ?? user.email ?? '',
      productId: product.id,
      productName: productData.name,
      category: productData.category,
      imageUrl: productData.imageUrl,
      deliveryType,
      deliveryValue,
      deliveryNote,
      price,
      quantity: 1,
      totalAmount: price,
      status: isInstantUrl ? 'completed' : 'paid',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  return orderRef.id;
}

export async function fetchUserOrders(uid) {
  const userOrders = query(collection(db, 'orders'), where('uid', '==', uid));
  const snapshot = await getDocs(userOrders);
  return sortByRecent(mapSnapshot(snapshot));
}

export async function fetchAllOrders() {
  const snapshot = await getDocs(collection(db, 'orders'));
  return sortByRecent(mapSnapshot(snapshot));
}

export async function updateOrderStatus(orderId, status) {
  await updateDoc(doc(db, 'orders', orderId), {
    status,
    updatedAt: serverTimestamp()
  });
}

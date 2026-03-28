import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
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

export async function createTopup(payload) {
  await addDoc(collection(db, 'topups'), {
    uid: payload.uid,
    userEmail: payload.userEmail ?? '',
    amount: Number(payload.amount),
    paymentMethod: payload.paymentMethod,
    channelLabel: payload.channelLabel,
    status: 'pending',
    slipPath: payload.slipPath,
    slipUrl: payload.slipUrl,
    note: payload.note ?? '',
    createdAt: serverTimestamp(),
    reviewedAt: null,
    reviewedBy: '',
    adminNote: ''
  });
}

export async function fetchUserTopups(uid) {
  const userTopups = query(collection(db, 'topups'), where('uid', '==', uid));
  const snapshot = await getDocs(userTopups);
  return sortByRecent(mapSnapshot(snapshot));
}

export async function fetchAllTopups() {
  const snapshot = await getDocs(collection(db, 'topups'));
  return sortByRecent(mapSnapshot(snapshot));
}

export async function reviewTopup(topupId, status, adminUid, adminNote = '') {
  const topupRef = doc(db, 'topups', topupId);

  await runTransaction(db, async (transaction) => {
    const topupSnap = await transaction.get(topupRef);

    if (!topupSnap.exists()) {
      throw new Error('ไม่พบรายการเติมเงิน');
    }

    const topup = topupSnap.data();

    if (topup.status !== 'pending') {
      throw new Error('รายการนี้ถูกดำเนินการแล้ว');
    }

    const updatePayload = {
      status,
      reviewedAt: serverTimestamp(),
      reviewedBy: adminUid,
      adminNote
    };

    if (status === 'approved') {
      const userRef = doc(db, 'users', topup.uid);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists()) {
        throw new Error('ไม่พบผู้ใช้ของรายการนี้');
      }

      // อนุมัติ topup แล้วค่อยเพิ่ม balance เพื่อให้ยอดกับสถานะสลิปอัปเดตพร้อมกัน
      transaction.update(userRef, {
        balance: Number(userSnap.data().balance || 0) + Number(topup.amount || 0),
        updatedAt: serverTimestamp()
      });
    }

    transaction.update(topupRef, updatePayload);
  });
}

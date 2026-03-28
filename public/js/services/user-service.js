import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { APP_CONFIG } from '../app-config.js';
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

export async function ensureUserProfile(user) {
  const userRef = doc(db, 'users', user.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    const newProfile = {
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? user.email?.split('@')[0] ?? 'สมาชิกใหม่',
      photoURL: user.photoURL ?? APP_CONFIG.defaultAvatar,
      phone: '',
      lineId: '',
      discordId: '',
      role: 'customer',
      balance: 0,
      lastOrderId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    };

    await setDoc(userRef, newProfile);
    return { id: user.uid, ...newProfile };
  }

  const current = snapshot.data();

  await updateDoc(userRef, {
    displayName: current.displayName || user.displayName || user.email?.split('@')[0] || 'สมาชิกใหม่',
    photoURL: current.photoURL || user.photoURL || APP_CONFIG.defaultAvatar,
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  });

  return {
    id: snapshot.id,
    ...current
  };
}

export async function fetchUserProfile(uid) {
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function updateUserProfile(uid, payload) {
  const userRef = doc(db, 'users', uid);

  await updateDoc(userRef, {
    displayName: payload.displayName,
    photoURL: payload.photoURL,
    phone: payload.phone ?? '',
    lineId: payload.lineId ?? '',
    discordId: payload.discordId ?? '',
    updatedAt: serverTimestamp()
  });
}

export async function fetchUsers() {
  const snapshot = await getDocs(collection(db, 'users'));
  return sortByRecent(mapSnapshot(snapshot));
}

export async function setUserRole(uid, role) {
  await updateDoc(doc(db, 'users', uid), {
    role,
    updatedAt: serverTimestamp()
  });
}


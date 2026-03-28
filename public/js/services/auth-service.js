import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { auth, googleProvider } from './firebase.js';

export async function registerWithEmail(email, password, displayName) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  return credential.user;
}

export async function loginWithEmail(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function loginWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

export function logoutUser() {
  return signOut(auth);
}

import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { auth, googleProvider } from './firebase.js';

function shouldUseGoogleRedirect() {
  const hostname = window.location.hostname;
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

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
  if (shouldUseGoogleRedirect()) {
    await signInWithRedirect(auth, googleProvider);
    return null;
  }

  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function consumeGoogleRedirectResult() {
  const credential = await getRedirectResult(auth);
  return credential?.user ?? null;
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

export function logoutUser() {
  return signOut(auth);
}

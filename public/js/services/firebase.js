import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
  getAnalytics,
  isSupported as analyticsSupported
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-analytics.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';
import { firebaseConfig } from '../firebase-config.js';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
export const analyticsPromise = firebaseConfig.measurementId
  ? analyticsSupported()
      .then((supported) => (supported ? getAnalytics(app) : null))
      .catch(() => null)
  : Promise.resolve(null);

googleProvider.setCustomParameters({ prompt: 'select_account' });
auth.languageCode = 'th';


import { getDownloadURL, ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';
import { storage } from './firebase.js';

function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, '-').toLowerCase();
}

async function uploadFile(folder, file) {
  const safeName = sanitizeFileName(file.name);
  const fileRef = ref(storage, `${folder}/${Date.now()}-${safeName}`);
  const snapshot = await uploadBytes(fileRef, file, { contentType: file.type });
  const url = await getDownloadURL(snapshot.ref);

  return {
    path: snapshot.ref.fullPath,
    url
  };
}

export function uploadSlip(uid, file) {
  return uploadFile(`slips/${uid}`, file);
}

export function uploadAvatar(uid, file) {
  return uploadFile(`avatars/${uid}`, file);
}

export function uploadProductImage(file) {
  return uploadFile('products', file);
}


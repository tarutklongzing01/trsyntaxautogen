import { $, toggleHidden } from './dom.js';

function createToast(type, message) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  return toast;
}

export function notify(type, message) {
  const container = $('#toast-container');

  if (!container) {
    window.alert(message);
    return;
  }

  const toast = createToast(type, message);
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
    toggleHidden(container, container.childElementCount === 0);
  }, 3200);
}


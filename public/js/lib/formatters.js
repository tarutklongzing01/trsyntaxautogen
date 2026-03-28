const currencyFormatter = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  maximumFractionDigits: 0
});

export function formatCurrency(value = 0) {
  return currencyFormatter.format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) {
    return '-';
  }

  const rawDate = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(rawDate.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(rawDate);
}

export function escapeHTML(value = '') {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]
  );
}

export function normalizeText(value = '') {
  return String(value).trim().toLowerCase();
}


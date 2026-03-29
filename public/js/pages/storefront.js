import { APP_CONFIG } from '../app-config.js';
import { $, $$, clearForm, setDisabled, toggleHidden } from '../lib/dom.js';
import { escapeHTML, formatCurrency, formatDate, normalizeText } from '../lib/formatters.js';
import { notify } from '../lib/notifications.js';
import {
  consumeGoogleRedirectResult,
  loginWithEmail,
  loginWithGoogle,
  logoutUser,
  registerWithEmail,
  watchAuthState
} from '../services/auth-service.js';
import { createOrder, fetchUserOrders } from '../services/order-service.js';
import { fetchActiveProducts } from '../services/product-service.js';
import { uploadAvatar } from '../services/storage-service.js';
import { createKbankQrTopup, inquireKbankTopup } from '../services/topup-api-service.js';
import { fetchUserTopups } from '../services/topup-service.js';
import { ensureUserProfile, fetchUserProfile, updateUserProfile } from '../services/user-service.js';

const state = {
  authUser: null,
  profile: null,
  products: [],
  orders: [],
  topups: [],
  activeTopupId: '',
  selectedCategory: 'ทั้งหมด',
  searchTerm: '',
  activeView: 'catalog',
  selectedProduct: null
};

const viewMeta = {
  catalog: { eyebrow: 'CATALOG', title: 'รายการสินค้าพร้อมขาย' },
  wallet: { eyebrow: 'WALLET', title: 'เติมเงินและจัดการ balance' },
  orders: { eyebrow: 'ORDERS', title: 'คำสั่งซื้อของฉัน' },
  profile: { eyebrow: 'PROFILE', title: 'โปรไฟล์สมาชิก' }
};

const elements = {
  brandName: $('#brand-name'),
  heroTitle: $('#hero-title'),
  heroTagline: $('#hero-tagline'),
  heroBalance: $('#hero-balance'),
  metricProductCount: $('#metric-product-count'),
  metricPaymentCount: $('#metric-payment-count'),
  paymentMethods: $('#payment-methods'),
  supportList: $('#support-list'),
  categoryFilters: $('#category-filters'),
  productGrid: $('#product-grid'),
  productSearch: $('#product-search'),
  searchShell: $('#search-shell'),
  openAuthBtn: $('#open-auth-btn'),
  guestAuthBtn: $('#guest-auth-btn'),
  logoutBtn: $('#logout-btn'),
  adminLink: $('#admin-link'),
  userChip: $('#user-chip'),
  userChipAvatar: $('#user-chip-avatar'),
  userChipName: $('#user-chip-name'),
  userChipBalance: $('#user-chip-balance'),
  guestCallout: $('#guest-callout'),
  memberSummary: $('#member-summary'),
  memberAvatar: $('#member-avatar'),
  memberName: $('#member-name'),
  memberEmail: $('#member-email'),
  memberBalance: $('#member-balance'),
  memberRole: $('#member-role'),
  walletBalance: $('#wallet-balance'),
  topupForm: $('#topup-form'),
  topupMethod: $('#topup-method'),
  topupHistory: $('#topup-history'),
  topupQrPanel: $('#topup-qr-panel'),
  topupQrImage: $('#topup-qr-image'),
  topupQrTitle: $('#topup-qr-title'),
  topupQrStatus: $('#topup-qr-status'),
  topupQrMessage: $('#topup-qr-message'),
  topupQrAmount: $('#topup-qr-amount'),
  topupQrReference: $('#topup-qr-reference'),
  topupQrExpiresAt: $('#topup-qr-expires-at'),
  topupQrUpdatedAt: $('#topup-qr-updated-at'),
  topupQrRefreshBtn: $('#topup-qr-refresh-btn'),
  topupQrCopyRefBtn: $('#topup-qr-copy-ref-btn'),
  ordersList: $('#orders-list'),
  profileForm: $('#profile-form'),
  productModal: $('#product-modal'),
  productModalImage: $('#product-modal-image'),
  productModalBadge: $('#product-modal-badge'),
  productModalTitle: $('#product-modal-title'),
  productModalDescription: $('#product-modal-description'),
  productModalCategory: $('#product-modal-category'),
  productModalPrice: $('#product-modal-price'),
  productModalStock: $('#product-modal-stock'),
  productModalBuy: $('#product-modal-buy'),
  deliveryModal: $('#delivery-modal'),
  deliveryModalTitle: $('#delivery-modal-title'),
  deliveryModalSubtitle: $('#delivery-modal-subtitle'),
  deliveryModalProduct: $('#delivery-modal-product'),
  deliveryModalUrl: $('#delivery-modal-url'),
  deliveryModalNote: $('#delivery-modal-note'),
  deliveryModalOrderId: $('#delivery-modal-order-id'),
  deliveryModalCopyBtn: $('#delivery-modal-copy-btn'),
  deliveryModalOrdersBtn: $('#delivery-modal-orders-btn'),
  authModal: $('#auth-modal'),
  loginForm: $('#login-form'),
  registerForm: $('#register-form'),
  googleLoginBtn: $('#google-login-btn'),
  viewEyebrow: $('#view-eyebrow'),
  viewTitle: $('#view-title'),
  navButtons: $$('[data-view]'),
  viewTargetButtons: $$('[data-view-target]'),
  heroCatalogBtn: $('#hero-catalog-btn'),
  heroTopupBtn: $('#hero-topup-btn')
};

function isLoggedIn() {
  return Boolean(state.authUser && state.profile);
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHTML(message)}</div>`;
}

const TOPUP_STATUS_LABELS = {
  pending: 'Pending',
  paid: 'Paid',
  expired: 'Expired',
  failed: 'Failed',
  cancelled: 'Cancelled',
  approved: 'Approved',
  rejected: 'Rejected'
};

function getDynamicQrMethod() {
  return (
    APP_CONFIG.paymentMethods.find((method) => method?.dynamicQr) || {
      id: 'kbank_qr',
      label: 'KBank QR API',
      accountName: 'Dynamic QR',
      accountValue: 'Generate QR from wallet form',
      copyValue: '',
      copyLabel: '',
      bankName: 'Kasikornbank',
      description: 'A fresh QR is created for each topup amount.',
      instructions: 'Create the QR, scan it in your banking app, and check the payment status.',
      dynamicQr: true
    }
  );
}

function formatTopupStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return TOPUP_STATUS_LABELS[normalized] || normalized || '-';
}

function getTopupReference(topup) {
  return String(topup?.partnerTxnUid || topup?.providerTxnId || topup?.id || '-').trim() || '-';
}

function hasRenderableQr(topup) {
  return Boolean(String(topup?.qrImageDataUrl || '').trim());
}

function getActiveTopup() {
  const selectedTopup = state.topups.find((topup) => topup.id === state.activeTopupId);
  if (selectedTopup) {
    return selectedTopup;
  }

  return (
    state.topups.find((topup) => topup.status === 'pending' && hasRenderableQr(topup)) || null
  );
}

function getTopupStatusMessage(topup) {
  const status = String(topup?.status || '').toLowerCase();

  if (status === 'paid') {
    return 'Payment confirmed and balance has been added to your wallet.';
  }

  if (status === 'expired') {
    return 'This QR has expired. Create a new topup to continue.';
  }

  if (status === 'failed' || status === 'cancelled') {
    return 'This payment was not completed. Please create a new QR if needed.';
  }

  return 'Scan this QR with your banking app and then check the payment status.';
}

function openModal(element) {
  if (!element) {
    return;
  }

  toggleHidden(element, false);
  document.body.style.overflow = 'hidden';
}

function closeModal(element) {
  if (!element) {
    return;
  }

  toggleHidden(element, true);

  if ($$('.modal:not(.hidden)').length === 0) {
    document.body.style.overflow = '';
  }
}

function closeAllModals() {
  $$('.modal').forEach((modal) => closeModal(modal));
}

function setView(view) {
  state.activeView = view;
  $$('.view').forEach((section) => section.classList.toggle('is-active', section.id === `${view}-view`));
  elements.navButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
  document.body.classList.toggle('catalog-focus', view === 'catalog');

  const meta = viewMeta[view];
  elements.viewEyebrow.textContent = meta.eyebrow;
  elements.viewTitle.textContent = meta.title;
  toggleHidden(elements.searchShell, view !== 'catalog');
}

function resolveAssetUrl(value) {
  const source = String(value || '').trim();
  if (!source) {
    return '';
  }

  try {
    return new URL(source, window.location.href).href;
  } catch (error) {
    return source;
  }
}

function getPaymentDisplayName(method) {
  return String(method?.accountName || method?.bankName || method?.label || '').trim();
}

function getPaymentCopyValue(method) {
  return String(method?.copyValue ?? method?.accountValue ?? '').trim();
}

function getPaymentDisplayValue(method) {
  return String(method?.accountValue || getPaymentCopyValue(method)).trim();
}

function getPaymentChannelLabel(method) {
  return [method?.label, method?.bankName].filter(Boolean).join(' - ');
}

function isConfiguredPaymentMethod(method) {
  if (method?.dynamicQr) {
    return Boolean(method?.label);
  }

  const displayName = getPaymentDisplayName(method);
  const copyValue = getPaymentCopyValue(method);
  const combined = `${method?.label || ''} ${displayName} ${copyValue} ${method?.bankName || ''}`.toLowerCase();

  return Boolean(displayName && copyValue) && !combined.includes('your ') && !combined.includes('example');
}

function renderPaymentMedia(method) {
  const mediaItems = [
    {
      label: 'QR / พร้อมเพย์',
      url: resolveAssetUrl(method?.qrImageUrl)
    },
    {
      label: 'Barcode / Payment Code',
      url: resolveAssetUrl(method?.barcodeImageUrl)
    }
  ].filter((item) => item.url);

  if (!mediaItems.length) {
    return '';
  }

  return `
    <div class="payment-media-grid">
      ${mediaItems
        .map(
          (item) => `
            <div class="payment-media-tile">
              <img src="${escapeHTML(item.url)}" alt="${escapeHTML(item.label)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
              <span>${escapeHTML(item.label)}</span>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderPaymentMethods() {
  const configuredMethods = [getDynamicQrMethod()].filter(isConfiguredPaymentMethod);
  const paymentPanel = elements.paymentMethods.closest('.panel');

  if (elements.metricPaymentCount) {
    elements.metricPaymentCount.textContent = String(configuredMethods.length);
  }

  elements.paymentMethods.innerHTML = configuredMethods
    .map(
      (method) => {
        const displayName = getPaymentDisplayName(method);
        const displayValue = getPaymentDisplayValue(method);
        const copyValue = getPaymentCopyValue(method);
        const copyLabel = method.copyLabel || 'คัดลอกข้อมูลชำระเงิน';
        const metaItems = [method.bankName].filter(Boolean);

        return `
        <article class="payment-card">
          <p class="eyebrow">${escapeHTML(method.label)}</p>
          <h3>${escapeHTML(displayName)}</h3>
          ${
            metaItems.length
              ? `<div class="payment-card-meta">${metaItems
                  .map((item) => `<span>${escapeHTML(item)}</span>`)
                  .join('')}</div>`
              : ''
          }
          <strong class="payment-copy-value">${escapeHTML(displayValue)}</strong>
          ${method.description ? `<p>${escapeHTML(method.description)}</p>` : ''}
          ${method.instructions ? `<p class="help-text payment-card-note">${escapeHTML(method.instructions)}</p>` : ''}
          ${renderPaymentMedia(method)}
          ${
            copyValue
              ? `
                <div class="payment-card-actions">
                  <button
                    type="button"
                    class="ghost-btn payment-copy-btn"
                    data-copy-payment="${escapeHTML(copyValue)}"
                    data-copy-payment-label="${escapeHTML(copyLabel)}"
                  >
                    ${escapeHTML(copyLabel)}
                  </button>
                </div>
              `
              : ''
          }
        </article>
      `;
      }
    )
    .join('');

  if (configuredMethods.length) {
    elements.topupMethod.innerHTML = configuredMethods
      .map(
        (method) =>
          `<option value="${escapeHTML(method.id)}">${escapeHTML(
            `${getPaymentChannelLabel(method)} - ${getPaymentDisplayValue(method)}`
          )}</option>`
      )
      .join('');
    elements.topupMethod.disabled = false;
  } else {
    elements.topupMethod.innerHTML = '<option value="">ยังไม่เปิดช่องทางชำระเงิน</option>';
    elements.topupMethod.disabled = true;
  }

  toggleHidden(paymentPanel, configuredMethods.length === 0);
}

function renderSupportChannels() {
  const channels = APP_CONFIG.supportChannels.filter((channel) => String(channel || '').trim());
  const supportPanel = elements.supportList.closest('.panel');

  elements.supportList.innerHTML = channels
    .map((channel) => `<li>${escapeHTML(channel)}</li>`)
    .join('');

  toggleHidden(supportPanel, channels.length === 0);
}

function renderCategoryFilters() {
  elements.categoryFilters.innerHTML = APP_CONFIG.categories
    .map(
      (category) => `
        <button
          type="button"
          class="filter-pill ${state.selectedCategory === category ? 'is-active' : ''}"
          data-category="${escapeHTML(category)}"
        >
          ${escapeHTML(category)}
        </button>
      `
    )
    .join('');
}

function filterProducts() {
  return state.products.filter((product) => {
    const matchCategory =
      state.selectedCategory === 'ทั้งหมด' || product.category === state.selectedCategory;
    const haystack = normalizeText(`${product.name} ${product.shortDescription} ${product.description}`);
    const matchSearch = haystack.includes(state.searchTerm);
    return matchCategory && matchSearch;
  });
}

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimText(value = '', maxLength = 120) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized;
}

function resolveImageUrl(value) {
  const fallback = APP_CONFIG.defaultProductImage;
  const source = String(value || fallback).trim() || fallback;

  try {
    return new URL(source, window.location.href).href;
  } catch (error) {
    return new URL(fallback, window.location.href).href;
  }
}

function attachFallbackImage(img) {
  if (!img || img.dataset.fallbackBound === 'true') {
    return;
  }

  img.dataset.fallbackBound = 'true';
  img.addEventListener('error', () => {
    const fallbackSrc = resolveImageUrl(APP_CONFIG.defaultProductImage);
    if (img.src !== fallbackSrc) {
      img.src = fallbackSrc;
    }
  });
}

function attachFallbackImages(scope) {
  $$('img[data-product-image]', scope).forEach((img) => {
    attachFallbackImage(img);
  });
}

function resolveComparePrice(product) {
  const price = toSafeNumber(product.price);
  const explicitComparePrice = toSafeNumber(
    product.compareAtPrice ?? product.originalPrice ?? product.listPrice,
    0
  );

  if (explicitComparePrice > price) {
    return explicitComparePrice;
  }

  if (!price) {
    return 0;
  }

  const multipliers = {
    Gem: 1.35,
    GPT: 1.26,
    'AI Credits': 1.22,
    Account: 1.18,
    Voucher: 1.14
  };

  const multiplier = multipliers[product.category] || 1.2;
  return Math.ceil((price * multiplier) / 10) * 10;
}

function getProductPricing(product) {
  const price = toSafeNumber(product.price);
  const comparePrice = resolveComparePrice(product);
  const hasDiscount = comparePrice > price;
  const savings = hasDiscount ? comparePrice - price : 0;
  const discountPercent = hasDiscount ? Math.round((savings / comparePrice) * 100) : 0;

  return {
    price,
    comparePrice,
    hasDiscount,
    savings,
    discountPercent
  };
}

function getDeliveryLabel(product) {
  return product.deliveryType === 'instant_url' ? 'รับ URL ทันที' : 'ส่งมอบโดยแอดมิน';
}

function getProductHighlights(product) {
  const stock = toSafeNumber(product.stock);
  const soldCount = toSafeNumber(product.soldCount);

  return [
    stock > 0 ? `พร้อมขาย ${stock} ชิ้น` : 'สินค้าหมดชั่วคราว',
    soldCount > 0 ? `ขายแล้ว ${soldCount} ออเดอร์` : 'รองรับการซื้อผ่าน Wallet',
    getDeliveryLabel(product)
  ];
}

function getPurchaseState(product) {
  const stock = toSafeNumber(product.stock);

  if (stock <= 0) {
    return {
      disabled: true,
      label: 'สินค้าหมด',
      modalLabel: 'สินค้าหมด'
    };
  }

  if (!isLoggedIn()) {
    return {
      disabled: false,
      label: 'ล็อกอินเพื่อซื้อ',
      modalLabel: 'ล็อกอินเพื่อซื้อ'
    };
  }

  return {
    disabled: false,
    label: 'ซื้อเลย',
    modalLabel: 'ซื้อสินค้านี้'
  };
}

function renderCardPriceBlock(product) {
  const pricing = getProductPricing(product);

  return `
    <div class="product-pricing">
      <strong class="product-price-current">${formatCurrency(pricing.price)}</strong>
      <div class="product-price-row">
        <span class="product-price-old">${formatCurrency(pricing.comparePrice)}</span>
        <span class="product-price-save">Save ${formatCurrency(pricing.savings)}</span>
      </div>
    </div>
  `;
}

function renderModalPriceMarkup(product) {
  const pricing = getProductPricing(product);

  return `
    <span class="modal-price-stack">
      <span class="product-price-current">${formatCurrency(pricing.price)}</span>
      <span class="product-price-row">
        <span class="product-price-old">${formatCurrency(pricing.comparePrice)}</span>
        <span class="product-price-save">${pricing.discountPercent}% OFF</span>
      </span>
    </span>
  `;
}

function productCardTemplate(product) {
  const pricing = getProductPricing(product);
  const detailText = trimText(product.description || product.shortDescription, 110);
  const purchaseState = getPurchaseState(product);
  const imageUrl = resolveImageUrl(product.imageUrl);
  const highlights = getProductHighlights(product)
    .map((item) => `<li>${escapeHTML(item)}</li>`)
    .join('');

  return `
    <article class="product-card">
      <div class="product-media">
        <img
          src="${escapeHTML(imageUrl)}"
          alt="${escapeHTML(product.name)}"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          data-product-image="true"
        />
        <div class="product-media-badges">
          <span class="status-pill accent">${escapeHTML(product.badge || product.category)}</span>
          <span class="product-discount-pill">-${pricing.discountPercent}%</span>
        </div>
      </div>
      <div class="product-body">
        <div class="product-head">
          <div class="product-title-wrap">
            <p class="product-category-label">${escapeHTML(product.category)}</p>
            <h3>${escapeHTML(product.name)}</h3>
          </div>
        </div>
        ${renderCardPriceBlock(product)}
        <p class="product-description">${escapeHTML(product.shortDescription)}</p>
        <p class="product-detail-note">${escapeHTML(detailText)}</p>
        <ul class="product-feature-list">
          ${highlights}
        </ul>
        <div class="product-meta">
          <span>หมวด: ${escapeHTML(product.category)}</span>
          <span>คงเหลือ: ${Number(product.stock || 0)} ชิ้น</span>
        </div>
        <div class="product-extra-meta">
          <span>${getDeliveryLabel(product)}</span>
          <span>${pricing.discountPercent}% OFF</span>
        </div>
        <div class="product-actions">
          <button type="button" class="ghost-btn" data-product-action="view" data-product-id="${product.id}">รายละเอียด</button>
          <button
            type="button"
            class="primary-btn"
            data-product-action="buy"
            data-product-id="${product.id}"
            ${purchaseState.disabled ? 'disabled' : ''}
          >
            ${purchaseState.label}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderProducts() {
  const filteredProducts = filterProducts();
  elements.metricProductCount.textContent = String(state.products.length);

  elements.productGrid.innerHTML = filteredProducts.length
    ? filteredProducts.map(productCardTemplate).join('')
    : emptyState('ยังไม่พบสินค้าที่ตรงกับตัวกรองนี้');

  attachFallbackImages(elements.productGrid);
}

function renderAuthState() {
  const loggedIn = isLoggedIn();
  toggleHidden(elements.openAuthBtn, loggedIn);
  toggleHidden(elements.logoutBtn, !loggedIn);
  toggleHidden(elements.userChip, !loggedIn);
  toggleHidden(elements.guestCallout, loggedIn);
  toggleHidden(elements.memberSummary, !loggedIn);

  if (!loggedIn) {
    elements.heroBalance.textContent = formatCurrency(0);
    elements.walletBalance.textContent = formatCurrency(0);
    toggleHidden(elements.adminLink, true);
    return;
  }

  const avatar = state.profile.photoURL || APP_CONFIG.defaultAvatar;
  elements.userChipAvatar.src = avatar;
  elements.userChipName.textContent = state.profile.displayName || state.authUser.email;
  elements.userChipBalance.textContent = `Balance ${formatCurrency(state.profile.balance)}`;
  elements.memberAvatar.src = avatar;
  elements.memberName.textContent = state.profile.displayName || state.authUser.email;
  elements.memberEmail.textContent = state.profile.email || state.authUser.email || '-';
  elements.memberBalance.textContent = formatCurrency(state.profile.balance);
  elements.memberRole.textContent = state.profile.role;
  elements.heroBalance.textContent = formatCurrency(state.profile.balance);
  elements.walletBalance.textContent = formatCurrency(state.profile.balance);
  toggleHidden(elements.adminLink, state.profile.role !== 'admin');
}

function renderActiveTopup() {
  const topup = getActiveTopup();
  const shouldShow = isLoggedIn() && Boolean(topup) && hasRenderableQr(topup);

  toggleHidden(elements.topupQrPanel, !shouldShow);

  if (!shouldShow) {
    if (elements.topupQrImage) {
      elements.topupQrImage.src = '';
    }
    return;
  }

  state.activeTopupId = topup.id;
  elements.topupQrTitle.textContent = topup.channelLabel || 'KBank QR Payment';
  elements.topupQrStatus.textContent = formatTopupStatus(topup.status);
  elements.topupQrStatus.className = `status-pill ${String(topup.status || '').toLowerCase()}`;
  elements.topupQrMessage.textContent = topup.failureReason || getTopupStatusMessage(topup);
  elements.topupQrAmount.textContent = formatCurrency(topup.amount);
  elements.topupQrReference.textContent = getTopupReference(topup);
  elements.topupQrExpiresAt.textContent = formatDate(topup.expiresAt);
  elements.topupQrUpdatedAt.textContent = formatDate(topup.lastSyncedAt || topup.updatedAt || topup.createdAt);
  elements.topupQrImage.src = topup.qrImageDataUrl || '';
  elements.topupQrRefreshBtn.dataset.topupId = topup.id;
  elements.topupQrCopyRefBtn.dataset.topupRef = getTopupReference(topup);
  elements.topupQrRefreshBtn.disabled = String(topup.status || '').toLowerCase() !== 'pending';
}

async function refreshTopupStatus(topupId) {
  if (!isLoggedIn()) {
    openModal(elements.authModal);
    return;
  }

  try {
    elements.topupQrRefreshBtn.disabled = true;
    await inquireKbankTopup(state.authUser, topupId);
    await loadMemberData();
    renderAuthState();
    renderTopups();

    const latestTopup = state.topups.find((entry) => entry.id === topupId);
    if (!latestTopup) {
      notify('info', 'Payment status refreshed.');
      return;
    }

    const status = String(latestTopup?.status || '').toLowerCase();

    if (status === 'paid') {
      notify('success', 'Payment confirmed and wallet balance updated.');
      return;
    }

    if (status === 'expired') {
      notify('info', 'This QR has expired. Please create a new one.');
      return;
    }

    if (status === 'failed' || status === 'cancelled') {
      notify('error', latestTopup?.failureReason || 'Payment was not completed.');
      return;
    }

    notify('info', 'Payment is still pending. Please complete the transfer and try again.');
  } catch (error) {
    notify('error', error.message || 'Unable to refresh payment status');
  } finally {
    renderActiveTopup();
  }
}

function renderTopups() {
  if (!isLoggedIn()) {
    elements.topupHistory.innerHTML = emptyState('เข้าสู่ระบบก่อนเพื่อดูประวัติแจ้งเติมเงิน');
    setDisabled($$('input, select, textarea, button', elements.topupForm), true);
    state.activeTopupId = '';
    renderActiveTopup();
    return;
  }

  setDisabled($$('input, select, textarea, button', elements.topupForm), false);
  elements.topupHistory.innerHTML = state.topups.length
    ? state.topups
        .map(
          (topup) => `
            <article class="list-card">
              <div class="list-card-head">
                <div>
                  <h3>${formatCurrency(topup.amount)}</h3>
                  <p>${escapeHTML(topup.channelLabel || 'KBank QR API')}</p>
                </div>
                <span class="status-pill ${escapeHTML(topup.status)}">${escapeHTML(formatTopupStatus(topup.status))}</span>
              </div>
              <div class="list-meta">
                <span>${formatDate(topup.createdAt)}</span>
                <a href="${escapeHTML(topup.slipUrl)}" target="_blank" rel="noreferrer">เปิดสลิป</a>
              </div>
              <p>${escapeHTML(topup.note || 'ไม่มีหมายเหตุ')}</p>
            </article>
          `
        )
        .join('')
    : emptyState('ยังไม่มีรายการแจ้งเติมเงิน');
  renderActiveTopup();
}

function hasInstantDelivery(order) {
  return order?.deliveryType === 'instant_url' && Boolean(order.deliveryValue);
}

function renderOrderDeliveryBlock(order) {
  if (!hasInstantDelivery(order)) {
    return '';
  }

  return `
    <div class="delivery-box">
      <strong>Instant URL</strong>
      <div class="delivery-copy-row">
        <input type="text" value="${escapeHTML(order.deliveryValue)}" readonly />
        <button type="button" class="ghost-btn" data-copy-delivery="${order.id}">Copy URL</button>
      </div>
      ${
        order.deliveryNote
          ? `<p>${escapeHTML(order.deliveryNote)}</p>`
          : '<p>Copy this URL and open it to use the product immediately.</p>'
      }
    </div>
  `;
}

function renderDeliveryModal(order) {
  if (!hasInstantDelivery(order)) {
    return;
  }

  elements.deliveryModalTitle.textContent = 'รับลิงก์สินค้าได้ทันที';
  elements.deliveryModalSubtitle.textContent = 'ชำระเงินสำเร็จแล้ว คัดลอกลิงก์นี้ไปใช้งานสินค้าได้ทันที';
  elements.deliveryModalProduct.textContent = order.productName || 'Instant Product';
  elements.deliveryModalUrl.value = order.deliveryValue || '';
  elements.deliveryModalNote.textContent = order.deliveryNote || 'Copy URL นี้ไปเปิดใช้งานได้ทันที';
  elements.deliveryModalOrderId.textContent = `Order ID: ${order.id}`;
}

async function copyTextValue(value, successMessage, fallbackErrorMessage) {
  if (!value) {
    notify('error', fallbackErrorMessage);
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    notify('success', successMessage);
  } catch (error) {
    notify('error', 'Copy failed. Please copy the URL manually.');
  }
}

async function copyDeliveryValue(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  await copyTextValue(order?.deliveryValue, 'Copied delivery URL', 'No delivery URL found for this order');
}

async function copyPaymentValue(value, copyLabel) {
  await copyTextValue(value, `${copyLabel || 'คัดลอกข้อมูลชำระเงิน'}แล้ว`, 'ไม่พบข้อมูลสำหรับคัดลอก');
}

function renderOrders() {
  elements.ordersList.innerHTML = !isLoggedIn()
    ? emptyState('เข้าสู่ระบบก่อนเพื่อดูออเดอร์')
    : state.orders.length
      ? state.orders
          .map(
            (order) => `
              <article class="list-card">
                <div class="list-card-head">
                  <div>
                    <h3>${escapeHTML(order.productName)}</h3>
                    <p>${escapeHTML(order.category)}</p>
                  </div>
                  <span class="status-pill ${escapeHTML(order.status)}">${escapeHTML(order.status)}</span>
                </div>
                <div class="list-meta">
                  <span>${formatCurrency(order.totalAmount)}</span>
                  <span>${formatDate(order.createdAt)}</span>
                  <span>Order ID: ${escapeHTML(order.id)}</span>
                </div>
                ${renderOrderDeliveryBlock(order)}
              </article>
            `
          )
          .join('')
      : emptyState('ยังไม่มีคำสั่งซื้อ');
}

function renderProfileForm() {
  const disabled = !isLoggedIn();
  setDisabled($$('input, button', elements.profileForm), disabled);

  if (!isLoggedIn()) {
    clearForm(elements.profileForm);
    return;
  }

  $('#profile-display-name').value = state.profile.displayName || '';
  $('#profile-phone').value = state.profile.phone || '';
  $('#profile-line-id').value = state.profile.lineId || '';
  $('#profile-discord-id').value = state.profile.discordId || '';
}

function renderProductModal() {
  if (!state.selectedProduct) {
    return;
  }

  const product = state.selectedProduct;
  const purchaseState = getPurchaseState(product);
  elements.productModalImage.src = resolveImageUrl(product.imageUrl);
  elements.productModalImage.alt = product.name;
  elements.productModalImage.setAttribute('referrerpolicy', 'no-referrer');
  elements.productModalImage.dataset.productImage = 'true';
  attachFallbackImage(elements.productModalImage);
  elements.productModalBadge.textContent = product.badge || product.category;
  elements.productModalTitle.textContent = product.name;
  elements.productModalDescription.textContent = [product.shortDescription, product.description]
    .filter(Boolean)
    .join(' | ');
  elements.productModalCategory.textContent = product.category;
  elements.productModalPrice.innerHTML = renderModalPriceMarkup(product);
  elements.productModalStock.textContent = `${Number(product.stock || 0)} ชิ้น`;
  elements.productModalBuy.dataset.productId = product.id;
  elements.productModalBuy.disabled = purchaseState.disabled;
  elements.productModalBuy.textContent = purchaseState.modalLabel;
}

async function loadProducts() {
  state.products = await fetchActiveProducts();
  renderProducts();
}

async function loadMemberData() {
  if (!state.authUser) {
    state.orders = [];
    state.topups = [];
    return;
  }

  const [profile, orders, topups] = await Promise.all([
    fetchUserProfile(state.authUser.uid),
    fetchUserOrders(state.authUser.uid),
    fetchUserTopups(state.authUser.uid)
  ]);

  state.profile = profile;
  state.orders = orders;
  state.topups = topups;
}

async function syncLoggedInState(user) {
  await ensureUserProfile(user);
  state.authUser = user;
  await loadProducts();
  await loadMemberData();
  renderAuthState();
  renderProducts();
  renderTopups();
  renderOrders();
  renderProfileForm();
}

function syncLoggedOutState() {
  state.authUser = null;
  state.profile = null;
  state.orders = [];
  state.topups = [];
  renderAuthState();
  renderProducts();
  renderTopups();
  renderOrders();
  renderProfileForm();
}

async function handleAuthStateChanged(user) {
  try {
    if (!user) {
      syncLoggedOutState();
      return;
    }

    await syncLoggedInState(user);
  } catch (error) {
    notify('error', error.message || 'โหลดข้อมูลผู้ใช้ไม่สำเร็จ');
  }
}

async function handlePurchase(productId) {
  const product = state.products.find((entry) => entry.id === productId);

  if (!product) {
    notify('error', 'ไม่พบสินค้า');
    return;
  }

  if (!isLoggedIn()) {
    openModal(elements.authModal);
    notify('info', 'เข้าสู่ระบบก่อนสั่งซื้อสินค้า');
    return;
  }

  try {
    elements.productModalBuy.disabled = true;
    const orderId = await createOrder({ user: state.authUser, profile: state.profile, product });
    await Promise.all([loadProducts(), loadMemberData()]);
    renderAuthState();
    renderOrders();
    renderTopups();
    closeModal(elements.productModal);
    const createdOrder = state.orders.find((entry) => entry.id === orderId);
    const instantDeliveryOrder = createdOrder || {
      id: orderId,
      productName: product.name,
      deliveryType: product.deliveryType,
      deliveryValue: product.deliveryValue,
      deliveryNote: product.deliveryNote
    };

    if (hasInstantDelivery(instantDeliveryOrder)) {
      setView('orders');
      renderDeliveryModal(instantDeliveryOrder);
      openModal(elements.deliveryModal);
      notify('success', 'ชำระเงินสำเร็จ รับลิงก์สินค้าได้ทันที');
      return;
    }

    notify('success', 'สั่งซื้อสำเร็จ ระบบหัก balance เรียบร้อยแล้ว');
  } catch (error) {
    notify('error', error.message || 'สั่งซื้อไม่สำเร็จ');
  } finally {
    elements.productModalBuy.disabled = false;
  }
}

function openProduct(productId) {
  const product = state.products.find((entry) => entry.id === productId);

  if (!product) {
    notify('error', 'ไม่พบสินค้า');
    return;
  }

  state.selectedProduct = product;
  renderProductModal();
  openModal(elements.productModal);
}

async function submitTopup(event) {
  event.preventDefault();

  if (!isLoggedIn()) {
    openModal(elements.authModal);
    return;
  }

  const amount = Number($('#topup-amount').value);
  const selectedMethod = getDynamicQrMethod();
  const note = $('#topup-note').value.trim();

  if (!selectedMethod || !isConfiguredPaymentMethod(selectedMethod)) {
    notify('error', 'ยังไม่ได้ตั้งค่าช่องทางชำระเงิน');
    return;
  }

  if (amount < APP_CONFIG.topupLimits.min || amount > APP_CONFIG.topupLimits.max) {
    notify('error', `จำนวนเงินต้องอยู่ระหว่าง ${APP_CONFIG.topupLimits.min}-${APP_CONFIG.topupLimits.max} บาท`);
    return;
  }

  if (false) { // Legacy slip validation kept unreachable during QR migration.
    notify('error', 'กรุณาอัปโหลดสลิปก่อนส่งแจ้งเติมเงิน');
    return;
  }

  try {
    setDisabled($$('input, select, textarea, button', elements.topupForm), true);

    // อัปโหลดสลิปขึ้น Storage ก่อน แล้วค่อยสร้างเอกสาร topup เพื่อเก็บ path/url กลับไปใช้
    const result = await createKbankQrTopup(state.authUser, {
      amount,
      note
    });

    clearForm(elements.topupForm);
    state.topups = await fetchUserTopups(state.authUser.uid);
    state.activeTopupId = result.topupId || state.activeTopupId;
    renderTopups();
    notify(
      'success',
      result.reusedExistingTopup
        ? 'You already have an active QR. Showing the latest payment code.'
        : 'QR created successfully. Scan it in your banking app and then check status.'
    );
    return;
    notify('success', 'ส่งแจ้งเติมเงินเรียบร้อย รอแอดมินตรวจสอบสลิป');
  } catch (error) {
    notify('error', error.message || 'ส่งแจ้งเติมเงินไม่สำเร็จ');
  } finally {
    setDisabled($$('input, select, textarea, button', elements.topupForm), false);
  }
}

async function submitProfile(event) {
  event.preventDefault();

  if (!isLoggedIn()) {
    openModal(elements.authModal);
    return;
  }

  const avatarFile = $('#profile-avatar').files?.[0];
  let photoURL = state.profile.photoURL || APP_CONFIG.defaultAvatar;

  try {
    setDisabled($$('input, button', elements.profileForm), true);

    if (avatarFile) {
      const uploadResult = await uploadAvatar(state.authUser.uid, avatarFile);
      photoURL = uploadResult.url;
    }

    await updateUserProfile(state.authUser.uid, {
      displayName: $('#profile-display-name').value.trim(),
      phone: $('#profile-phone').value.trim(),
      lineId: $('#profile-line-id').value.trim(),
      discordId: $('#profile-discord-id').value.trim(),
      photoURL
    });

    state.profile = await fetchUserProfile(state.authUser.uid);
    renderAuthState();
    renderProfileForm();
    notify('success', 'บันทึกโปรไฟล์เรียบร้อย');
  } catch (error) {
    notify('error', error.message || 'บันทึกโปรไฟล์ไม่สำเร็จ');
  } finally {
    setDisabled($$('input, button', elements.profileForm), false);
  }
}

async function submitLogin(event) {
  event.preventDefault();

  try {
    await loginWithEmail($('#login-email').value.trim(), $('#login-password').value);
    closeModal(elements.authModal);
    clearForm(elements.loginForm);
    notify('success', 'เข้าสู่ระบบสำเร็จ');
  } catch (error) {
    notify('error', error.message || 'เข้าสู่ระบบไม่สำเร็จ');
  }
}

async function submitRegister(event) {
  event.preventDefault();

  const displayName = $('#register-name').value.trim();
  const email = $('#register-email').value.trim();
  const password = $('#register-password').value;
  const confirmPassword = $('#register-confirm-password').value;

  if (password !== confirmPassword) {
    notify('error', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    return;
  }

  try {
    await registerWithEmail(email, password, displayName);
    closeModal(elements.authModal);
    clearForm(elements.registerForm);
    notify('success', 'สมัครสมาชิกสำเร็จ');
  } catch (error) {
    notify('error', error.message || 'สมัครสมาชิกไม่สำเร็จ');
  }
}

async function loginByGoogle() {
  try {
    await loginWithGoogle();
    closeModal(elements.authModal);
    notify('success', 'เข้าสู่ระบบด้วย Google สำเร็จ');
  } catch (error) {
    notify('error', error.message || 'Google Login ไม่สำเร็จ');
  }
}

function bindAuthTabs() {
  $$('[data-auth-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.authTab;
      $$('[data-auth-tab]').forEach((entry) => entry.classList.toggle('is-active', entry === button));
      $('#auth-login-panel').classList.toggle('is-active', target === 'login');
      $('#auth-register-panel').classList.toggle('is-active', target === 'register');
    });
  });
}

function prepareQrTopupForm() {
  if (!elements.topupMethod && elements.topupForm) {
    const hiddenSelect = document.createElement('select');
    hiddenSelect.id = 'topup-method';
    hiddenSelect.className = 'hidden';
    hiddenSelect.tabIndex = -1;
    hiddenSelect.setAttribute('aria-hidden', 'true');
    elements.topupForm.prepend(hiddenSelect);
    elements.topupMethod = hiddenSelect;
  }

  const methodField = elements.topupForm?.querySelector('label[for="topup-method"]')?.closest('.field');
  const slipInput = $('#topup-slip');
  const slipField = slipInput?.closest('.field');
  const submitButton = elements.topupForm?.querySelector('button[type="submit"]');
  const walletPanel = elements.walletBalance?.closest('.sub-panel');
  const walletHelpText = walletPanel?.querySelector('.help-text');
  const topupPanel = elements.topupForm?.closest('.sub-panel');
  const topupHeading = topupPanel?.querySelector('h3');
  let formHelpText = elements.topupForm?.querySelector('[data-topup-hint]');

  toggleHidden(methodField, true);
  toggleHidden(slipField, true);

  if (slipInput) {
    slipInput.required = false;
    slipInput.disabled = true;
  }

  if (!formHelpText && submitButton) {
    formHelpText = document.createElement('p');
    formHelpText.className = 'help-text';
    formHelpText.dataset.topupHint = 'true';
    submitButton.before(formHelpText);
  }

  if (submitButton) {
    submitButton.textContent = 'Create QR Topup';
  }

  if (formHelpText) {
    formHelpText.textContent =
      'Create a KBank QR for the exact amount, pay in your banking app, then use Check Status to refresh your wallet.';
  }

  if (walletHelpText) {
    walletHelpText.textContent =
      'Topups now use KBank QR API. Once payment is confirmed, balance is credited to your wallet automatically.';
  }

  if (topupHeading) {
    topupHeading.textContent = 'Create QR Topup';
  }
}

function bindEvents() {
  elements.openAuthBtn.addEventListener('click', () => openModal(elements.authModal));
  elements.guestAuthBtn.addEventListener('click', () => openModal(elements.authModal));
  elements.logoutBtn.addEventListener('click', async () => {
    await logoutUser();
    notify('success', 'ออกจากระบบแล้ว');
  });
  elements.productSearch.addEventListener('input', (event) => {
    state.searchTerm = normalizeText(event.target.value);
    renderProducts();
  });
  elements.topupForm.addEventListener('submit', submitTopup);
  elements.topupQrRefreshBtn.addEventListener('click', () => {
    const topupId = elements.topupQrRefreshBtn.dataset.topupId;
    if (!topupId) {
      notify('error', 'No active QR to refresh');
      return;
    }

    refreshTopupStatus(topupId);
  });
  elements.topupQrCopyRefBtn.addEventListener('click', () => {
    copyTextValue(elements.topupQrCopyRefBtn.dataset.topupRef, 'Copied payment reference', 'No payment reference found');
  });
  elements.profileForm.addEventListener('submit', submitProfile);
  elements.loginForm.addEventListener('submit', submitLogin);
  elements.registerForm.addEventListener('submit', submitRegister);
  elements.googleLoginBtn.addEventListener('click', loginByGoogle);
  elements.heroCatalogBtn.addEventListener('click', () => setView('catalog'));
  elements.heroTopupBtn.addEventListener('click', () => setView('wallet'));
  elements.paymentMethods.addEventListener('click', (event) => {
    const copyButton = event.target.closest('[data-copy-payment]');
    if (!copyButton) {
      return;
    }

    copyPaymentValue(copyButton.dataset.copyPayment, copyButton.dataset.copyPaymentLabel);
  });

  elements.navButtons.forEach((button) =>
    button.addEventListener('click', () => {
      setView(button.dataset.view);
    })
  );

  elements.viewTargetButtons.forEach((button) =>
    button.addEventListener('click', () => {
      setView(button.dataset.viewTarget);
    })
  );

  elements.categoryFilters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) {
      return;
    }

    state.selectedCategory = button.dataset.category;
    renderCategoryFilters();
    renderProducts();
  });

  elements.productGrid.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-product-action]');
    if (!actionButton) {
      return;
    }

    const { productAction, productId } = actionButton.dataset;
    if (productAction === 'view') {
      openProduct(productId);
      return;
    }

    if (productAction === 'buy') {
      handlePurchase(productId);
    }
  });

  elements.ordersList.addEventListener('click', (event) => {
    const copyButton = event.target.closest('[data-copy-delivery]');
    if (!copyButton) {
      return;
    }

    copyDeliveryValue(copyButton.dataset.copyDelivery);
  });

  elements.deliveryModalCopyBtn.addEventListener('click', () => {
    copyTextValue(elements.deliveryModalUrl.value, 'Copied delivery URL', 'No delivery URL found');
  });

  elements.deliveryModalOrdersBtn.addEventListener('click', () => {
    setView('orders');
    closeModal(elements.deliveryModal);
  });

  elements.productModalBuy.addEventListener('click', (event) => {
    handlePurchase(event.currentTarget.dataset.productId);
  });

  document.addEventListener('click', (event) => {
    const closeButton = event.target.closest('[data-close-modal]');
    if (!closeButton) {
      return;
    }

    closeModal($(`#${closeButton.dataset.closeModal}`));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAllModals();
    }
  });

  bindAuthTabs();
}

async function bootstrap() {
  document.title = APP_CONFIG.brandName;
  elements.brandName.textContent = APP_CONFIG.brandName;
  elements.heroTitle.textContent = 'ระบบซื้อขาย GEM';
  elements.heroTagline.textContent = APP_CONFIG.tagline;
  prepareQrTopupForm();
  renderPaymentMethods();
  renderSupportChannels();
  renderCategoryFilters();
  renderTopups();
  renderOrders();
  renderProfileForm();
  bindEvents();
  setView(state.activeView);
  await consumeGoogleRedirectResult().catch((error) => {
    notify('error', error.message || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
    return null;
  });
  await loadProducts();
  watchAuthState(handleAuthStateChanged);
}

bootstrap().catch((error) => {
  notify('error', error.message || 'เริ่มต้นระบบไม่สำเร็จ');
});

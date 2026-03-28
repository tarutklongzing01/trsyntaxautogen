import { APP_CONFIG } from '../app-config.js';
import { $, $$, clearForm, setDisabled, toggleHidden } from '../lib/dom.js';
import { escapeHTML, formatCurrency, formatDate, normalizeText } from '../lib/formatters.js';
import { notify } from '../lib/notifications.js';
import { loginWithEmail, loginWithGoogle, logoutUser, registerWithEmail, watchAuthState } from '../services/auth-service.js';
import { createOrder, fetchUserOrders } from '../services/order-service.js';
import { fetchActiveProducts } from '../services/product-service.js';
import { uploadAvatar, uploadSlip } from '../services/storage-service.js';
import { createTopup, fetchUserTopups } from '../services/topup-service.js';
import { ensureUserProfile, fetchUserProfile, updateUserProfile } from '../services/user-service.js';

const state = {
  authUser: null,
  profile: null,
  products: [],
  orders: [],
  topups: [],
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

  const meta = viewMeta[view];
  elements.viewEyebrow.textContent = meta.eyebrow;
  elements.viewTitle.textContent = meta.title;
  toggleHidden(elements.searchShell, view !== 'catalog');
}

function renderPaymentMethods() {
  elements.paymentMethods.innerHTML = APP_CONFIG.paymentMethods
    .map(
      (method) => `
        <article class="payment-card">
          <p class="eyebrow">${escapeHTML(method.label)}</p>
          <h3>${escapeHTML(method.accountName)}</h3>
          <strong>${escapeHTML(method.accountValue)}</strong>
          <p>${escapeHTML(method.description)}</p>
        </article>
      `
    )
    .join('');

  elements.topupMethod.innerHTML = APP_CONFIG.paymentMethods
    .map(
      (method) =>
        `<option value="${escapeHTML(method.id)}">${escapeHTML(method.label)} - ${escapeHTML(method.accountValue)}</option>`
    )
    .join('');
}

function renderSupportChannels() {
  elements.supportList.innerHTML = APP_CONFIG.supportChannels
    .map((channel) => `<li>${escapeHTML(channel)}</li>`)
    .join('');
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

function productCardTemplate(product) {
  return `
    <article class="product-card">
      <div class="product-media">
        <img src="${escapeHTML(product.imageUrl || APP_CONFIG.defaultProductImage)}" alt="${escapeHTML(product.name)}" />
      </div>
      <div class="product-body">
        <div class="product-head">
          <div>
            <p class="status-pill">${escapeHTML(product.badge || product.category)}</p>
            <h3>${escapeHTML(product.name)}</h3>
          </div>
          <span class="price-tag">${formatCurrency(product.price)}</span>
        </div>
        <p>${escapeHTML(product.shortDescription)}</p>
        <div class="product-meta">
          <span>หมวด: ${escapeHTML(product.category)}</span>
          <span>คงเหลือ: ${Number(product.stock || 0)} ชิ้น</span>
        </div>
        <div class="product-actions">
          <button type="button" class="ghost-btn" data-product-action="view" data-product-id="${product.id}">รายละเอียด</button>
          <button
            type="button"
            class="primary-btn"
            data-product-action="buy"
            data-product-id="${product.id}"
            ${Number(product.stock || 0) <= 0 ? 'disabled' : ''}
          >
            ซื้อเลย
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

function renderTopups() {
  if (!isLoggedIn()) {
    elements.topupHistory.innerHTML = emptyState('เข้าสู่ระบบก่อนเพื่อดูประวัติแจ้งเติมเงิน');
    setDisabled($$('input, select, textarea, button', elements.topupForm), true);
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
                  <p>${escapeHTML(topup.channelLabel)}</p>
                </div>
                <span class="status-pill ${escapeHTML(topup.status)}">${escapeHTML(topup.status)}</span>
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
  elements.productModalImage.src = product.imageUrl || APP_CONFIG.defaultProductImage;
  elements.productModalImage.alt = product.name;
  elements.productModalBadge.textContent = product.badge || product.category;
  elements.productModalTitle.textContent = product.name;
  elements.productModalDescription.textContent = product.description;
  elements.productModalCategory.textContent = product.category;
  elements.productModalPrice.textContent = formatCurrency(product.price);
  elements.productModalStock.textContent = `${Number(product.stock || 0)} ชิ้น`;
  elements.productModalBuy.dataset.productId = product.id;
  elements.productModalBuy.disabled = Number(product.stock || 0) <= 0;
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
  await loadMemberData();
  renderAuthState();
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
    await createOrder({ user: state.authUser, profile: state.profile, product });
    await Promise.all([loadProducts(), loadMemberData()]);
    renderAuthState();
    renderOrders();
    renderTopups();
    closeModal(elements.productModal);
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
  const paymentMethod = elements.topupMethod.value;
  const selectedMethod = APP_CONFIG.paymentMethods.find((method) => method.id === paymentMethod);
  const slipFile = $('#topup-slip').files?.[0];
  const note = $('#topup-note').value.trim();

  if (amount < APP_CONFIG.topupLimits.min || amount > APP_CONFIG.topupLimits.max) {
    notify('error', `จำนวนเงินต้องอยู่ระหว่าง ${APP_CONFIG.topupLimits.min}-${APP_CONFIG.topupLimits.max} บาท`);
    return;
  }

  if (!slipFile) {
    notify('error', 'กรุณาอัปโหลดสลิปก่อนส่งแจ้งเติมเงิน');
    return;
  }

  try {
    setDisabled($$('input, select, textarea, button', elements.topupForm), true);

    // อัปโหลดสลิปขึ้น Storage ก่อน แล้วค่อยสร้างเอกสาร topup เพื่อเก็บ path/url กลับไปใช้
    const uploadResult = await uploadSlip(state.authUser.uid, slipFile);

    await createTopup({
      uid: state.authUser.uid,
      userEmail: state.profile.email || state.authUser.email || '',
      amount,
      paymentMethod,
      channelLabel: selectedMethod?.label || paymentMethod,
      slipPath: uploadResult.path,
      slipUrl: uploadResult.url,
      note
    });

    clearForm(elements.topupForm);
    state.topups = await fetchUserTopups(state.authUser.uid);
    renderTopups();
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
  elements.profileForm.addEventListener('submit', submitProfile);
  elements.loginForm.addEventListener('submit', submitLogin);
  elements.registerForm.addEventListener('submit', submitRegister);
  elements.googleLoginBtn.addEventListener('click', loginByGoogle);
  elements.heroCatalogBtn.addEventListener('click', () => setView('catalog'));
  elements.heroTopupBtn.addEventListener('click', () => setView('wallet'));

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
  elements.heroTitle.textContent = 'โครงเว็บขายสินค้า Digital แนวเว็บขายไอดีเกม';
  elements.heroTagline.textContent = APP_CONFIG.tagline;
  renderPaymentMethods();
  renderSupportChannels();
  renderCategoryFilters();
  renderTopups();
  renderOrders();
  renderProfileForm();
  bindEvents();
  await loadProducts();
  watchAuthState(handleAuthStateChanged);
}

bootstrap().catch((error) => {
  notify('error', error.message || 'เริ่มต้นระบบไม่สำเร็จ');
});

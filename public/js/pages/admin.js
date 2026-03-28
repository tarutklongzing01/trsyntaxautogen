import { APP_CONFIG } from '../app-config.js';
import { $, $$, clearForm, setDisabled, toggleHidden } from '../lib/dom.js';
import { escapeHTML, formatCurrency, formatDate } from '../lib/formatters.js';
import { notify } from '../lib/notifications.js';
import {
  consumeGoogleRedirectResult,
  loginWithEmail,
  loginWithGoogle,
  logoutUser,
  watchAuthState
} from '../services/auth-service.js';
import { fetchAllOrders, updateOrderStatus } from '../services/order-service.js';
import { deleteProduct, fetchAllProducts, saveProduct } from '../services/product-service.js';
import { uploadProductImage } from '../services/storage-service.js';
import { fetchAllTopups, reviewTopup } from '../services/topup-service.js';
import { ensureUserProfile, fetchUserProfile, fetchUsers, setUserRole } from '../services/user-service.js';

const PRODUCT_TEMPLATES = {
  'gem-90': {
    name: 'GEM 90',
    category: 'Gem',
    price: 29,
    stock: 100,
    badge: 'HOT',
    shortDescription: 'แพ็กเริ่มต้นสำหรับลูกค้าที่ต้องการเติม GEM ราคาเบา ๆ',
    description: 'เหมาะสำหรับทำสินค้าเปิดร้านหรือใช้ทดลอง flow การสั่งซื้อในระบบจริง',
    imageUrl: './assets/images/products/gem-rush.svg'
  },
  'gem-500': {
    name: 'GEM 500',
    category: 'Gem',
    price: 129,
    stock: 80,
    badge: 'VALUE',
    shortDescription: 'แพ็กขายดีสำหรับลูกค้าที่ต้องการความคุ้มค่า',
    description: 'เหมาะกับการตั้งเป็นสินค้าหลักของร้าน ใช้ทำโปรโมชันและดันยอดขายได้ง่าย',
    imageUrl: './assets/images/products/combo-pack.svg'
  },
  'gem-1200': {
    name: 'GEM 1200',
    category: 'Gem',
    price: 299,
    stock: 40,
    badge: 'BEST',
    shortDescription: 'แพ็กใหญ่สำหรับลูกค้ากลุ่มเติมหนัก คุ้มต่อหน่วยมากขึ้น',
    description: 'เหมาะสำหรับร้านที่ต้องการทำแพ็กคุ้มค่าและโชว์ราคาประหยัดชัด ๆ บนหน้าร้าน',
    imageUrl: './assets/images/products/gem-rush.svg'
  },
  'gem-vip': {
    name: 'VIP GEM PACKAGE',
    category: 'Gem',
    price: 599,
    stock: 20,
    badge: 'VIP',
    shortDescription: 'แพ็กพรีเมียมสำหรับตั้งเป็นสินค้าตัวท็อปของร้าน',
    description: 'ใช้เป็นแพ็กโชว์สำหรับหน้าร้านสายเติมเกม เน้นความพรีเมียมและเพิ่มมูลค่าต่อออเดอร์',
    imageUrl: './assets/images/products/elite-account.svg'
  }
};

const state = {
  authUser: null,
  profile: null,
  products: [],
  topups: [],
  orders: [],
  users: [],
  activeView: 'products',
  editingProductId: '',
  productSearchTerm: '',
  productPreviewObjectUrl: ''
};

const elements = {
  authPanel: $('#admin-auth-panel'),
  deniedPanel: $('#admin-denied-panel'),
  deniedEmail: $('#admin-denied-email'),
  deniedUid: $('#admin-denied-uid'),
  deniedRole: $('#admin-denied-role'),
  shell: $('#admin-shell'),
  logoutBtn: $('#admin-logout-btn'),
  loginForm: $('#admin-login-form'),
  googleLoginBtn: $('#admin-google-login-btn'),
  currentName: $('#admin-current-name'),
  currentMeta: $('#admin-current-meta'),
  productForm: $('#product-form'),
  productResetBtn: $('#product-reset-btn'),
  productCategory: $('#product-category'),
  productDeliveryType: $('#product-delivery-type'),
  productDeliveryValue: $('#product-delivery-value'),
  productDeliveryNote: $('#product-delivery-note'),
  productImagePreset: $('#product-image-preset'),
  productImageUrl: $('#product-image-url'),
  productImageFile: $('#product-image-file'),
  productImagePreview: $('#product-image-preview'),
  productImagePreviewCaption: $('#product-image-preview-caption'),
  productSearch: $('#admin-product-search'),
  productsList: $('#admin-products-list'),
  topupsList: $('#admin-topups-list'),
  ordersList: $('#admin-orders-list'),
  usersList: $('#admin-users-list'),
  metricProductCount: $('#admin-product-count'),
  metricPendingTopups: $('#admin-pending-topups'),
  metricOrderCount: $('#admin-order-count'),
  metricUserCount: $('#admin-user-count'),
  tabs: $$('[data-admin-view]'),
  templateButtons: $$('[data-product-template]')
};

function isAdmin() {
  return state.profile?.role === 'admin';
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHTML(message)}</div>`;
}

function setAdminView(view) {
  state.activeView = view;

  elements.tabs.forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.adminView === view);
  });

  $$('.admin-view').forEach((panel) => {
    panel.classList.toggle('is-active', panel.id === `admin-${view}-view`);
  });
}

function setAccessState({ showAuth, showDenied, showShell }) {
  toggleHidden(elements.authPanel, !showAuth);
  toggleHidden(elements.deniedPanel, !showDenied);
  toggleHidden(elements.shell, !showShell);
  toggleHidden(elements.logoutBtn, !(showDenied || showShell));
}

function renderMetrics() {
  elements.metricProductCount.textContent = String(state.products.length);
  elements.metricPendingTopups.textContent = String(
    state.topups.filter((topup) => topup.status === 'pending').length
  );
  elements.metricOrderCount.textContent = String(state.orders.length);
  elements.metricUserCount.textContent = String(state.users.length);
}

function renderAccessSummary() {
  const email = state.profile?.email || state.authUser?.email || '-';
  const uid = state.authUser?.uid || '-';
  const role = state.profile?.role || 'customer';

  if (elements.deniedEmail) {
    elements.deniedEmail.textContent = email;
  }

  if (elements.deniedUid) {
    elements.deniedUid.textContent = uid;
  }

  if (elements.deniedRole) {
    elements.deniedRole.textContent = `role: ${role}`;
  }

  if (elements.currentName) {
    elements.currentName.textContent = state.profile?.displayName || state.authUser?.email || 'ระบบหลังบ้าน';
  }

  if (elements.currentMeta) {
    elements.currentMeta.textContent = `${email} | role: ${role} | จัดการสินค้า, users, orders และ topups ได้จากหน้านี้`;
  }
}

function renderProductCategories() {
  elements.productCategory.innerHTML = APP_CONFIG.categories
    .filter((category) => category !== 'ทั้งหมด')
    .map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`)
    .join('');
}

function cleanupPreviewObjectUrl() {
  if (state.productPreviewObjectUrl) {
    URL.revokeObjectURL(state.productPreviewObjectUrl);
    state.productPreviewObjectUrl = '';
  }
}

function updateProductImagePreview({ url, file } = {}) {
  if (!elements.productImagePreview || !elements.productImagePreviewCaption) {
    return;
  }

  cleanupPreviewObjectUrl();

  let previewUrl = url?.trim() || APP_CONFIG.defaultProductImage;
  let caption =
    previewUrl === APP_CONFIG.defaultProductImage
      ? 'กำลังใช้รูปเริ่มต้นของร้าน'
      : 'กำลังใช้ลิงก์รูปที่กรอกไว้';

  if (file) {
    state.productPreviewObjectUrl = URL.createObjectURL(file);
    previewUrl = state.productPreviewObjectUrl;
    caption = `ไฟล์ที่เลือก: ${file.name}`;
  }

  elements.productImagePreview.src = previewUrl;
  elements.productImagePreviewCaption.textContent = caption;
}

function getFriendlyAdminError(error, fallbackMessage) {
  const message = error?.message || '';

  if (
    message.includes('storage/') ||
    message.includes('bucket') ||
    message.includes('object-not-found')
  ) {
    return 'อัปโหลดรูปไม่ได้ เพราะ Firebase Storage ยังไม่พร้อม ให้ใช้รูปสำเร็จรูปหรือใส่ Image URL แทนก่อน';
  }

  if (message.includes('permission') || message.includes('Missing or insufficient permissions')) {
    return 'Firestore rules ยังไม่อนุญาตการทำรายการนี้ หรือบัญชีนี้ยังไม่มีสิทธิ์ admin';
  }

  return fallbackMessage;
}

function syncDeliveryFields() {
  const isInstantUrl = elements.productDeliveryType.value === 'instant_url';
  elements.productDeliveryValue.disabled = !isInstantUrl;
  elements.productDeliveryNote.disabled = !isInstantUrl;

  if (!isInstantUrl) {
    elements.productDeliveryValue.value = '';
  }
}

function resetProductForm() {
  state.editingProductId = '';
  clearForm(elements.productForm);
  $('#product-id').value = '';
  $('#product-status').value = 'active';
  elements.productCategory.value = 'Gem';
  elements.productDeliveryType.value = 'manual';
  elements.productDeliveryValue.value = '';
  elements.productDeliveryNote.value = '';
  elements.productImageUrl.value = APP_CONFIG.defaultProductImage;
  elements.productImageFile.value = '';

  if (elements.productImagePreset) {
    elements.productImagePreset.value = APP_CONFIG.defaultProductImage;
  }

  syncDeliveryFields();
  updateProductImagePreview({ url: APP_CONFIG.defaultProductImage });
}

function fillProductForm(product) {
  state.editingProductId = product.id;
  $('#product-id').value = product.id;
  $('#product-name').value = product.name || '';
  elements.productCategory.value = product.category || 'Gem';
  $('#product-status').value = product.status || 'active';
  $('#product-price').value = product.price ?? '';
  $('#product-stock').value = product.stock ?? '';
  $('#product-badge').value = product.badge || '';
  $('#product-short-description').value = product.shortDescription || '';
  $('#product-description').value = product.description || '';
  elements.productDeliveryType.value = product.deliveryType || 'manual';
  elements.productDeliveryValue.value = product.deliveryValue || '';
  elements.productDeliveryNote.value = product.deliveryNote || '';
  elements.productImageUrl.value = product.imageUrl || APP_CONFIG.defaultProductImage;
  elements.productImageFile.value = '';

  if (elements.productImagePreset) {
    elements.productImagePreset.value = product.imageUrl || '';
  }

  syncDeliveryFields();
  updateProductImagePreview({ url: elements.productImageUrl.value });
}

function applyProductTemplate(templateKey) {
  const template = PRODUCT_TEMPLATES[templateKey];
  if (!template) {
    return;
  }

  state.editingProductId = '';
  $('#product-id').value = '';
  $('#product-name').value = template.name;
  elements.productCategory.value = template.category;
  $('#product-status').value = 'active';
  $('#product-price').value = template.price;
  $('#product-stock').value = template.stock;
  $('#product-badge').value = template.badge;
  $('#product-short-description').value = template.shortDescription;
  $('#product-description').value = template.description;
  elements.productDeliveryType.value = 'manual';
  elements.productDeliveryValue.value = '';
  elements.productDeliveryNote.value = '';
  elements.productImageUrl.value = template.imageUrl;
  elements.productImageFile.value = '';

  if (elements.productImagePreset) {
    elements.productImagePreset.value = template.imageUrl;
  }

  syncDeliveryFields();
  updateProductImagePreview({ url: template.imageUrl });
}

function filteredProducts() {
  const search = state.productSearchTerm.trim().toLowerCase();
  if (!search) {
    return state.products;
  }

  return state.products.filter((product) => {
    const haystack = `${product.name} ${product.category} ${product.badge || ''} ${product.shortDescription || ''}`.toLowerCase();
    return haystack.includes(search);
  });
}

function renderProducts() {
  const products = filteredProducts();

  elements.productsList.innerHTML = products.length
    ? products
        .map(
          (product) => `
            <article class="list-card admin-item" data-product-id="${product.id}">
              <div class="thumb-row">
                <img src="${escapeHTML(product.imageUrl || APP_CONFIG.defaultProductImage)}" alt="${escapeHTML(product.name)}" />
                <div>
                  <div class="list-card-head">
                    <div>
                      <h3>${escapeHTML(product.name)}</h3>
                      <p>${escapeHTML(product.shortDescription || '-')}</p>
                    </div>
                    <span class="status-pill ${escapeHTML(product.status)}">${escapeHTML(product.status)}</span>
                  </div>
                  <div class="list-meta">
                    <span>${escapeHTML(product.category || '-')}</span>
                    <span>${formatCurrency(product.price)}</span>
                    <span>สต็อก ${Number(product.stock || 0)}</span>
                    <span>${product.deliveryType === 'instant_url' ? 'Instant URL' : 'Manual'}</span>
                  </div>
                </div>
              </div>
              <div class="admin-actions">
                <button type="button" class="ghost-btn" data-product-action="edit" data-product-id="${product.id}">แก้ไข</button>
                <button type="button" class="ghost-btn" data-product-action="delete" data-product-id="${product.id}">ลบ</button>
              </div>
            </article>
          `
        )
        .join('')
    : emptyState(state.productSearchTerm ? 'ไม่พบสินค้าที่ตรงกับคำค้นหา' : 'ยังไม่มีสินค้าในระบบ');
}

function renderTopups() {
  elements.topupsList.innerHTML = state.topups.length
    ? state.topups
        .map((topup) => {
          const slipLink = topup.slipUrl
            ? `<a href="${escapeHTML(topup.slipUrl)}" target="_blank" rel="noreferrer">เปิดสลิป</a>`
            : '<span>ยังไม่มีสลิป</span>';

          return `
            <article class="list-card admin-item" data-topup-id="${topup.id}">
              <div class="list-card-head">
                <div>
                  <h3>${formatCurrency(topup.amount)} - ${escapeHTML(topup.userEmail || topup.uid)}</h3>
                  <p>${escapeHTML(topup.channelLabel || topup.paymentMethod || '-')}</p>
                </div>
                <span class="status-pill ${escapeHTML(topup.status)}">${escapeHTML(topup.status)}</span>
              </div>
              <div class="list-meta">
                <span>${formatDate(topup.createdAt)}</span>
                ${slipLink}
                <span>UID: ${escapeHTML(topup.uid)}</span>
              </div>
              <p>${escapeHTML(topup.note || 'ไม่มีหมายเหตุจากลูกค้า')}</p>
              <textarea class="admin-note" placeholder="หมายเหตุจากแอดมิน">${escapeHTML(topup.adminNote || '')}</textarea>
              <div class="admin-actions">
                <button type="button" class="primary-btn" data-topup-action="approve" data-topup-id="${topup.id}" ${
                  topup.status !== 'pending' ? 'disabled' : ''
                }>อนุมัติ</button>
                <button type="button" class="ghost-btn" data-topup-action="reject" data-topup-id="${topup.id}" ${
                  topup.status !== 'pending' ? 'disabled' : ''
                }>ปฏิเสธ</button>
              </div>
            </article>
          `;
        })
        .join('')
    : emptyState('ยังไม่มีรายการแจ้งเติมเงิน');
}

function orderStatusOptions(currentStatus) {
  return APP_CONFIG.orderStatuses
    .map(
      (status) =>
        `<option value="${status}" ${status === currentStatus ? 'selected' : ''}>${escapeHTML(status)}</option>`
    )
    .join('');
}

function renderOrders() {
  elements.ordersList.innerHTML = state.orders.length
    ? state.orders
        .map(
          (order) => `
            <article class="list-card admin-item" data-order-id="${order.id}">
              <div class="list-card-head">
                <div>
                  <h3>${escapeHTML(order.productName || '-')}</h3>
                  <p>${escapeHTML(order.userEmail || order.uid)}</p>
                </div>
                <span class="status-pill ${escapeHTML(order.status)}">${escapeHTML(order.status)}</span>
              </div>
              <div class="list-meta">
                <span>${formatCurrency(order.totalAmount)}</span>
                <span>${formatDate(order.createdAt)}</span>
                <span>${escapeHTML(order.category || '-')}</span>
              </div>
              ${
                order.deliveryType === 'instant_url' && order.deliveryValue
                  ? `
                    <div class="delivery-box">
                      <strong>Instant URL</strong>
                      <a href="${escapeHTML(order.deliveryValue)}" target="_blank" rel="noreferrer">${escapeHTML(order.deliveryValue)}</a>
                      <p>${escapeHTML(order.deliveryNote || 'Customer can copy this URL and use it immediately after payment.')}</p>
                    </div>
                  `
                  : `
                    <div class="delivery-box">
                      <strong>Manual Delivery</strong>
                      <p>${escapeHTML(order.deliveryNote || 'Admin needs to review and deliver this order manually.')}</p>
                    </div>
                  `
              }
              <div class="inline-fields">
                <select class="order-status-select">${orderStatusOptions(order.status)}</select>
                <button type="button" class="ghost-btn" data-order-action="save" data-order-id="${order.id}">อัปเดตสถานะ</button>
              </div>
            </article>
          `
        )
        .join('')
    : emptyState('ยังไม่มีออเดอร์');
}

function renderUsers() {
  elements.usersList.innerHTML = state.users.length
    ? state.users
        .map(
          (user) => `
            <article class="list-card admin-item" data-user-id="${user.id}">
              <div class="list-card-head">
                <div>
                  <h3>${escapeHTML(user.displayName || user.email || user.id)}</h3>
                  <p>${escapeHTML(user.email || '-')}</p>
                </div>
                <span class="status-pill ${escapeHTML(user.role || 'customer')}">${escapeHTML(user.role || 'customer')}</span>
              </div>
              <div class="list-meta">
                <span>Balance ${formatCurrency(user.balance)}</span>
                <span>${formatDate(user.createdAt)}</span>
              </div>
              <div class="inline-fields">
                <select class="user-role-select">
                  <option value="customer" ${user.role === 'customer' ? 'selected' : ''}>customer</option>
                  <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
                </select>
                <button type="button" class="ghost-btn" data-user-action="save" data-user-id="${user.id}">บันทึก role</button>
              </div>
            </article>
          `
        )
        .join('')
    : emptyState('ยังไม่มีสมาชิกในระบบ');
}

async function loadAdminData() {
  const [products, topups, orders, users] = await Promise.all([
    fetchAllProducts(),
    fetchAllTopups(),
    fetchAllOrders(),
    fetchUsers()
  ]);

  state.products = products;
  state.topups = topups;
  state.orders = orders;
  state.users = users;

  renderMetrics();
  renderProducts();
  renderTopups();
  renderOrders();
  renderUsers();
}

async function handleAuthStateChanged(user) {
  try {
    if (!user) {
      state.authUser = null;
      state.profile = null;
      setAccessState({ showAuth: true, showDenied: false, showShell: false });
      return;
    }

    await ensureUserProfile(user);
    state.authUser = user;
    state.profile = await fetchUserProfile(user.uid);
    renderAccessSummary();

    if (!isAdmin()) {
      setAccessState({ showAuth: false, showDenied: true, showShell: false });
      return;
    }

    setAccessState({ showAuth: false, showDenied: false, showShell: true });
    await loadAdminData();
  } catch (error) {
    notify('error', getFriendlyAdminError(error, 'โหลดข้อมูลแอดมินไม่สำเร็จ'));
  }
}

async function submitAdminLogin(event) {
  event.preventDefault();

  try {
    await loginWithEmail($('#admin-login-email').value.trim(), $('#admin-login-password').value);
    clearForm(elements.loginForm);
    notify('success', 'เข้าสู่ระบบแอดมินสำเร็จ');
  } catch (error) {
    notify('error', getFriendlyAdminError(error, 'เข้าสู่ระบบไม่สำเร็จ'));
  }
}

async function loginAdminWithGoogle() {
  try {
    await loginWithGoogle();
    notify('success', 'เข้าสู่ระบบด้วย Google สำเร็จ');
  } catch (error) {
    notify('error', getFriendlyAdminError(error, 'Google Login ไม่สำเร็จ'));
  }
}

async function submitProductForm(event) {
  event.preventDefault();

  if (!isAdmin()) {
    notify('error', 'บัญชีนี้ยังไม่มีสิทธิ์ใช้งานส่วนแอดมิน');
    return;
  }

  const editingProduct = state.products.find((product) => product.id === state.editingProductId) || {};
  let imageUrl = elements.productImageUrl.value.trim();
  const imageFile = elements.productImageFile.files?.[0];
  const formControls = $$('input, select, textarea, button', elements.productForm);
  const deliveryType = elements.productDeliveryType.value;
  const deliveryValue = elements.productDeliveryValue.value.trim();

  try {
    setDisabled(formControls, true);

    if (deliveryType === 'instant_url' && !deliveryValue) {
      throw new Error('กรุณาใส่ Delivery URL สำหรับสินค้าแบบ Instant URL');
    }

    if (imageFile) {
      const uploadResult = await uploadProductImage(imageFile).catch((error) => {
        throw new Error(getFriendlyAdminError(error, 'อัปโหลดรูปสินค้าไม่สำเร็จ'));
      });
      imageUrl = uploadResult.url;
    }

    await saveProduct(
      state.editingProductId,
      {
        name: $('#product-name').value,
        category: elements.productCategory.value,
        status: $('#product-status').value,
        price: $('#product-price').value,
        stock: $('#product-stock').value,
        badge: $('#product-badge').value,
        shortDescription: $('#product-short-description').value,
        description: $('#product-description').value,
        deliveryType,
        deliveryValue,
        deliveryNote: elements.productDeliveryNote.value,
        imageUrl
      },
      editingProduct
    );

    resetProductForm();
    await loadAdminData();
    notify('success', 'บันทึกสินค้าเรียบร้อย');
  } catch (error) {
    notify('error', getFriendlyAdminError(error, 'บันทึกสินค้าไม่สำเร็จ'));
  } finally {
    setDisabled(formControls, false);
  }
}

async function handleProductListClick(event) {
  const button = event.target.closest('[data-product-action]');
  if (!button) {
    return;
  }

  const product = state.products.find((entry) => entry.id === button.dataset.productId);
  if (!product) {
    return;
  }

  if (button.dataset.productAction === 'edit') {
    fillProductForm(product);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (button.dataset.productAction === 'delete') {
    const confirmed = window.confirm(`ลบสินค้า "${product.name}" ใช่หรือไม่?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteProduct(product.id);
      if (state.editingProductId === product.id) {
        resetProductForm();
      }
      await loadAdminData();
      notify('success', 'ลบสินค้าเรียบร้อย');
    } catch (error) {
      notify('error', getFriendlyAdminError(error, 'ลบสินค้าไม่สำเร็จ'));
    }
  }
}

async function handleTopupListClick(event) {
  const button = event.target.closest('[data-topup-action]');
  if (!button) {
    return;
  }

  const article = button.closest('[data-topup-id]');
  const note = article?.querySelector('textarea')?.value?.trim() ?? '';
  const status = button.dataset.topupAction === 'approve' ? 'approved' : 'rejected';

  try {
    await reviewTopup(button.dataset.topupId, status, state.authUser.uid, note);
    await loadAdminData();
    notify('success', status === 'approved' ? 'อนุมัติสลิปเรียบร้อย' : 'ปฏิเสธรายการเรียบร้อย');
  } catch (error) {
    notify('error', getFriendlyAdminError(error, 'อัปเดตรายการเติมเงินไม่สำเร็จ'));
  }
}

async function handleOrdersListClick(event) {
  const button = event.target.closest('[data-order-action]');
  if (!button) {
    return;
  }

  const article = button.closest('[data-order-id]');
  const status = article?.querySelector('.order-status-select')?.value;

  try {
    await updateOrderStatus(button.dataset.orderId, status);
    await loadAdminData();
    notify('success', 'อัปเดตสถานะออเดอร์เรียบร้อย');
  } catch (error) {
    notify('error', getFriendlyAdminError(error, 'อัปเดตสถานะออเดอร์ไม่สำเร็จ'));
  }
}

async function handleUsersListClick(event) {
  const button = event.target.closest('[data-user-action]');
  if (!button) {
    return;
  }

  const article = button.closest('[data-user-id]');
  const role = article?.querySelector('.user-role-select')?.value || 'customer';

  try {
    await setUserRole(button.dataset.userId, role);

    if (button.dataset.userId === state.authUser?.uid) {
      state.profile = {
        ...state.profile,
        role
      };
      renderAccessSummary();

      if (role !== 'admin') {
        setAccessState({ showAuth: false, showDenied: true, showShell: false });
        notify('success', 'อัปเดต role เรียบร้อย บัญชีนี้ไม่ได้เป็น admin แล้ว');
        return;
      }
    }

    await loadAdminData();
    notify('success', 'อัปเดต role ผู้ใช้เรียบร้อย');
  } catch (error) {
    notify('error', getFriendlyAdminError(error, 'อัปเดต role ไม่สำเร็จ'));
  }
}

function bindEvents() {
  elements.loginForm.addEventListener('submit', submitAdminLogin);
  elements.googleLoginBtn.addEventListener('click', loginAdminWithGoogle);
  elements.logoutBtn.addEventListener('click', async () => {
    await logoutUser();
    notify('success', 'ออกจากระบบแล้ว');
  });

  elements.productForm.addEventListener('submit', submitProductForm);
  elements.productResetBtn.addEventListener('click', resetProductForm);
  elements.productDeliveryType.addEventListener('change', syncDeliveryFields);

  elements.productImagePreset.addEventListener('change', (event) => {
    if (event.target.value) {
      elements.productImageUrl.value = event.target.value;
    }
    elements.productImageFile.value = '';
    updateProductImagePreview({ url: elements.productImageUrl.value });
  });

  elements.productImageUrl.addEventListener('input', (event) => {
    if (event.target.value.trim()) {
      elements.productImagePreset.value = '';
    }
    updateProductImagePreview({ url: event.target.value });
  });

  elements.productImageFile.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    if (file) {
      updateProductImagePreview({ file });
      return;
    }

    updateProductImagePreview({ url: elements.productImageUrl.value });
  });

  elements.productSearch.addEventListener('input', (event) => {
    state.productSearchTerm = event.target.value;
    renderProducts();
  });

  elements.templateButtons.forEach((button) =>
    button.addEventListener('click', () => {
      applyProductTemplate(button.dataset.productTemplate);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    })
  );

  elements.productsList.addEventListener('click', handleProductListClick);
  elements.topupsList.addEventListener('click', handleTopupListClick);
  elements.ordersList.addEventListener('click', handleOrdersListClick);
  elements.usersList.addEventListener('click', handleUsersListClick);

  elements.tabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      setAdminView(tab.dataset.adminView);
    })
  );

  window.addEventListener('beforeunload', cleanupPreviewObjectUrl);
}

async function bootstrap() {
  document.title = 'TR SYNTAX AUTOGEN SHOP Admin';
  renderProductCategories();
  resetProductForm();
  bindEvents();

  await consumeGoogleRedirectResult().catch((error) => {
    notify('error', getFriendlyAdminError(error, 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ'));
    return null;
  });

  watchAuthState(handleAuthStateChanged);
}

bootstrap();

import { APP_CONFIG } from '../app-config.js';
import { $, $$, clearForm, setDisabled, toggleHidden } from '../lib/dom.js';
import { escapeHTML, formatCurrency, formatDate } from '../lib/formatters.js';
import { notify } from '../lib/notifications.js';
import { loginWithEmail, loginWithGoogle, logoutUser, watchAuthState } from '../services/auth-service.js';
import { fetchAllOrders, updateOrderStatus } from '../services/order-service.js';
import { deleteProduct, fetchAllProducts, saveProduct } from '../services/product-service.js';
import { uploadProductImage } from '../services/storage-service.js';
import { fetchAllTopups, reviewTopup } from '../services/topup-service.js';
import { ensureUserProfile, fetchUserProfile, fetchUsers, setUserRole } from '../services/user-service.js';

const state = {
  authUser: null,
  profile: null,
  products: [],
  topups: [],
  orders: [],
  users: [],
  activeView: 'products',
  editingProductId: ''
};

const elements = {
  authPanel: $('#admin-auth-panel'),
  deniedPanel: $('#admin-denied-panel'),
  shell: $('#admin-shell'),
  logoutBtn: $('#admin-logout-btn'),
  loginForm: $('#admin-login-form'),
  googleLoginBtn: $('#admin-google-login-btn'),
  productForm: $('#product-form'),
  productResetBtn: $('#product-reset-btn'),
  productCategory: $('#product-category'),
  productsList: $('#admin-products-list'),
  topupsList: $('#admin-topups-list'),
  ordersList: $('#admin-orders-list'),
  usersList: $('#admin-users-list'),
  metricProductCount: $('#admin-product-count'),
  metricPendingTopups: $('#admin-pending-topups'),
  metricOrderCount: $('#admin-order-count'),
  metricUserCount: $('#admin-user-count'),
  tabs: $$('[data-admin-view]')
};

function isAdmin() {
  return Boolean(state.profile?.role === 'admin');
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHTML(message)}</div>`;
}

function setAdminView(view) {
  state.activeView = view;
  elements.tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.adminView === view));
  $$('.admin-view').forEach((panel) => panel.classList.toggle('is-active', panel.id === `admin-${view}-view`));
}

function setAccessState({ showAuth, showDenied, showShell }) {
  toggleHidden(elements.authPanel, !showAuth);
  toggleHidden(elements.deniedPanel, !showDenied);
  toggleHidden(elements.shell, !showShell);
  toggleHidden(elements.logoutBtn, !showShell && !showDenied);
  if (showShell || showDenied) {
    toggleHidden(elements.logoutBtn, false);
  }
}

function renderMetrics() {
  elements.metricProductCount.textContent = String(state.products.length);
  elements.metricPendingTopups.textContent = String(
    state.topups.filter((topup) => topup.status === 'pending').length
  );
  elements.metricOrderCount.textContent = String(state.orders.length);
  elements.metricUserCount.textContent = String(state.users.length);
}

function renderProductCategories() {
  elements.productCategory.innerHTML = APP_CONFIG.categories
    .filter((category) => category !== 'ทั้งหมด')
    .map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`)
    .join('');
}

function resetProductForm() {
  state.editingProductId = '';
  clearForm(elements.productForm);
  $('#product-status').value = 'active';
  elements.productCategory.selectedIndex = 0;
}

function fillProductForm(product) {
  state.editingProductId = product.id;
  $('#product-id').value = product.id;
  $('#product-name').value = product.name;
  $('#product-category').value = product.category;
  $('#product-status').value = product.status;
  $('#product-price').value = product.price;
  $('#product-stock').value = product.stock;
  $('#product-badge').value = product.badge || '';
  $('#product-short-description').value = product.shortDescription;
  $('#product-description').value = product.description;
  $('#product-image-url').value = product.imageUrl || '';
}

function renderProducts() {
  elements.productsList.innerHTML = state.products.length
    ? state.products
        .map(
          (product) => `
            <article class="list-card admin-item" data-product-id="${product.id}">
              <div class="thumb-row">
                <img src="${escapeHTML(product.imageUrl || APP_CONFIG.defaultProductImage)}" alt="${escapeHTML(product.name)}" />
                <div>
                  <div class="list-card-head">
                    <div>
                      <h3>${escapeHTML(product.name)}</h3>
                      <p>${escapeHTML(product.shortDescription)}</p>
                    </div>
                    <span class="status-pill ${escapeHTML(product.status)}">${escapeHTML(product.status)}</span>
                  </div>
                  <div class="list-meta">
                    <span>${escapeHTML(product.category)}</span>
                    <span>${formatCurrency(product.price)}</span>
                    <span>สต็อก ${Number(product.stock || 0)}</span>
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
    : emptyState('ยังไม่มีสินค้าในระบบ');
}

function renderTopups() {
  elements.topupsList.innerHTML = state.topups.length
    ? state.topups
        .map(
          (topup) => `
            <article class="list-card admin-item" data-topup-id="${topup.id}">
              <div class="list-card-head">
                <div>
                  <h3>${formatCurrency(topup.amount)} - ${escapeHTML(topup.userEmail)}</h3>
                  <p>${escapeHTML(topup.channelLabel)}</p>
                </div>
                <span class="status-pill ${escapeHTML(topup.status)}">${escapeHTML(topup.status)}</span>
              </div>
              <div class="list-meta">
                <span>${formatDate(topup.createdAt)}</span>
                <a href="${escapeHTML(topup.slipUrl)}" target="_blank" rel="noreferrer">เปิดสลิป</a>
                <span>UID: ${escapeHTML(topup.uid)}</span>
              </div>
              <p>${escapeHTML(topup.note || 'ไม่มีหมายเหตุ')}</p>
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
          `
        )
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
                  <h3>${escapeHTML(order.productName)}</h3>
                  <p>${escapeHTML(order.userEmail)}</p>
                </div>
                <span class="status-pill ${escapeHTML(order.status)}">${escapeHTML(order.status)}</span>
              </div>
              <div class="list-meta">
                <span>${formatCurrency(order.totalAmount)}</span>
                <span>${formatDate(order.createdAt)}</span>
                <span>${escapeHTML(order.category)}</span>
              </div>
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
                <span class="status-pill ${escapeHTML(user.role)}">${escapeHTML(user.role)}</span>
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
    : emptyState('ยังไม่มีสมาชิก');
}

async function loadAdminData() {
  // หลังบ้านดึงข้อมูลชุดหลักพร้อมกัน แล้วค่อย render เพื่อลดการเด้งของหน้าจอ
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

    if (!isAdmin()) {
      setAccessState({ showAuth: false, showDenied: true, showShell: false });
      return;
    }

    setAccessState({ showAuth: false, showDenied: false, showShell: true });
    await loadAdminData();
  } catch (error) {
    notify('error', error.message || 'โหลดข้อมูลแอดมินไม่สำเร็จ');
  }
}

async function submitAdminLogin(event) {
  event.preventDefault();

  try {
    await loginWithEmail($('#admin-login-email').value.trim(), $('#admin-login-password').value);
    clearForm(elements.loginForm);
    notify('success', 'เข้าสู่ระบบแอดมินสำเร็จ');
  } catch (error) {
    notify('error', error.message || 'เข้าสู่ระบบไม่สำเร็จ');
  }
}

async function loginAdminWithGoogle() {
  try {
    await loginWithGoogle();
    notify('success', 'เข้าสู่ระบบด้วย Google สำเร็จ');
  } catch (error) {
    notify('error', error.message || 'Google Login ไม่สำเร็จ');
  }
}

async function submitProductForm(event) {
  event.preventDefault();

  if (!isAdmin()) {
    notify('error', 'ไม่มีสิทธิ์ใช้งานส่วนนี้');
    return;
  }

  const editingProduct = state.products.find((product) => product.id === state.editingProductId) || {};
  let imageUrl = $('#product-image-url').value.trim();
  const imageFile = $('#product-image-file').files?.[0];

  try {
    setDisabled($$('input, select, textarea, button', elements.productForm), true);

    if (imageFile) {
      const uploadResult = await uploadProductImage(imageFile);
      imageUrl = uploadResult.url;
    }

    await saveProduct(
      state.editingProductId,
      {
        name: $('#product-name').value,
        category: $('#product-category').value,
        status: $('#product-status').value,
        price: $('#product-price').value,
        stock: $('#product-stock').value,
        badge: $('#product-badge').value,
        shortDescription: $('#product-short-description').value,
        description: $('#product-description').value,
        imageUrl
      },
      editingProduct
    );

    resetProductForm();
    await loadAdminData();
    notify('success', 'บันทึกสินค้าเรียบร้อย');
  } catch (error) {
    notify('error', error.message || 'บันทึกสินค้าไม่สำเร็จ');
  } finally {
    setDisabled($$('input, select, textarea, button', elements.productForm), false);
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
    const confirmed = window.confirm(`ลบสินค้า "${product.name}" หรือไม่?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteProduct(product.id);
      await loadAdminData();
      notify('success', 'ลบสินค้าเรียบร้อย');
    } catch (error) {
      notify('error', error.message || 'ลบสินค้าไม่สำเร็จ');
    }
  }
}

async function handleTopupListClick(event) {
  const button = event.target.closest('[data-topup-action]');
  if (!button) {
    return;
  }

  const article = button.closest('[data-topup-id]');
  const note = article?.querySelector('textarea')?.value ?? '';
  const status = button.dataset.topupAction === 'approve' ? 'approved' : 'rejected';

  try {
    await reviewTopup(button.dataset.topupId, status, state.authUser.uid, note.trim());
    await loadAdminData();
    notify('success', status === 'approved' ? 'อนุมัติสลิปเรียบร้อย' : 'ปฏิเสธรายการเรียบร้อย');
  } catch (error) {
    notify('error', error.message || 'อัปเดตรายการไม่สำเร็จ');
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
    notify('success', 'อัปเดตสถานะ order เรียบร้อย');
  } catch (error) {
    notify('error', error.message || 'อัปเดตสถานะไม่สำเร็จ');
  }
}

async function handleUsersListClick(event) {
  const button = event.target.closest('[data-user-action]');
  if (!button) {
    return;
  }

  const article = button.closest('[data-user-id]');
  const role = article?.querySelector('.user-role-select')?.value;

  try {
    await setUserRole(button.dataset.userId, role);
    await loadAdminData();
    notify('success', 'อัปเดต role ผู้ใช้เรียบร้อย');
  } catch (error) {
    notify('error', error.message || 'อัปเดต role ไม่สำเร็จ');
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
  elements.productsList.addEventListener('click', handleProductListClick);
  elements.topupsList.addEventListener('click', handleTopupListClick);
  elements.ordersList.addEventListener('click', handleOrdersListClick);
  elements.usersList.addEventListener('click', handleUsersListClick);
  elements.tabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      setAdminView(tab.dataset.adminView);
    })
  );
}

function bootstrap() {
  document.title = 'NightLoot Admin';
  renderProductCategories();
  resetProductForm();
  bindEvents();
  watchAuthState(handleAuthStateChanged);
}

bootstrap();

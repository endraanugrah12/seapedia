const app = document.querySelector('#app');
const nav = document.querySelector('#nav');
const toast = document.querySelector('#toast');
const menuToggle = document.querySelector('#menu-toggle');

const state = {
  token: localStorage.getItem('seapedia_token') || '',
  me: null,
  products: [],
  reviews: []
};

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return dateFmt.format(date);
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.style.background = isError ? '#991b1b' : '#0f172a';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  let data = {};
  try { data = await response.json(); } catch (_) { data = {}; }
  if (!response.ok) {
    throw new Error(data.message || 'Terjadi kesalahan request.');
  }
  return data;
}

function setToken(token) {
  state.token = token || '';
  if (state.token) localStorage.setItem('seapedia_token', state.token);
  else localStorage.removeItem('seapedia_token');
}

async function refreshMe() {
  if (!state.token) { state.me = null; return null; }
  try {
    state.me = await api('/api/me');
    return state.me;
  } catch (err) {
    setToken('');
    state.me = null;
    return null;
  }
}

function activeHash() {
  return location.hash || '#/';
}

function setNav() {
  const loggedIn = Boolean(state.me);
  const activeRole = state.me?.activeRole;
  const route = activeHash().split('?')[0];
  const links = [
    ['#/', 'Home'],
    ['#/products', 'Produk'],
  ];
  if (loggedIn) links.push(['#/dashboard', `Dashboard${activeRole ? `: ${activeRole}` : ''}`]);
  const authLinks = loggedIn
    ? `<button id="logout-btn">Logout</button>${state.me?.roles?.length > 1 ? '<a href="#/roles">Ganti Role</a>' : ''}`
    : `<a href="#/login">Login</a><a class="btn" href="#/register">Register</a>`;
  nav.innerHTML = `${links.map(([href, label]) => `<a class="${route === href ? 'active' : ''}" href="${href}">${escapeHTML(label)}</a>`).join('')}${authLinks}`;
  document.querySelector('#logout-btn')?.addEventListener('click', async () => {
    try { if (state.token) await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
    setToken('');
    state.me = null;
    showToast('Logout berhasil.');
    location.hash = '#/';
    render();
  });
}

menuToggle.addEventListener('click', () => nav.classList.toggle('open'));
window.addEventListener('hashchange', () => { nav.classList.remove('open'); render(); });

function page(title, subtitle, body) {
  app.innerHTML = `
    <div class="section-title">
      <div>
        <h2>${escapeHTML(title)}</h2>
        ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}
      </div>
    </div>
    ${body}
  `;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function roleBanner() {
  if (!state.me) return '';
  return `<div class="role-banner">
    <div>
      <strong>${escapeHTML(state.me.user.username)}</strong>
      <small>Role dimiliki: ${state.me.roles.map(escapeHTML).join(', ')} · Active role: ${escapeHTML(state.me.activeRole || 'belum dipilih')}</small>
    </div>
    ${state.me.roles.length > 1 ? '<a class="btn secondary" href="#/roles">Pilih active role</a>' : ''}
  </div>`;
}

async function loadProducts() {
  const data = await api('/api/public/products');
  state.products = data.products;
  return state.products;
}

function productInitials(product) {
  return escapeHTML(product.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase());
}

function productPhoto(product) {
  const fallbackById = {
    prod_keyboard: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=80',
    prod_mouse: 'https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=900&q=80',
    prod_headset: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80'
  };
  if (!product.imageUrl || product.imageUrl.includes('placehold.co')) return fallbackById[product.id] || '';
  return product.imageUrl;
}

function productImage(product) {
  const imageUrl = productPhoto(product);
  if (!imageUrl) return productInitials(product);
  return `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(product.name)}" loading="lazy" onerror="this.remove(); this.parentElement.textContent='${productInitials(product)}';" />`;
}

function productCategory(product) {
  const haystack = `${product.name} ${product.description}`.toLowerCase();
  if (haystack.includes('keyboard')) return 'Work Setup';
  if (haystack.includes('mouse')) return 'Productivity';
  if (haystack.includes('headset') || haystack.includes('meeting')) return 'Audio';
  return 'Essentials';
}

function storeCount(products) {
  return new Set(products.map(product => product.store?.id || product.store?.name || 'store')).size;
}

async function renderHome() {
  const [productsData, reviewsData] = await Promise.all([api('/api/public/products'), api('/api/reviews')]);
  state.products = productsData.products;
  state.reviews = reviewsData.reviews;
  app.innerHTML = `
    <section class="hero">
      <div>
        <span class="badge green">SEAPEDIA Marketplace</span>
        <h1>Shop quality tech gear.</h1>
        <p>Find quality gear from reliable stores, compare options quickly, and checkout with clear delivery choices.</p>
        <form id="hero-search" class="hero-search">
          <input name="query" placeholder="Search Products Or Stores" aria-label="Search products" />
          <button class="btn" type="submit">Search</button>
        </form>
        <div class="trust-row">
          <span>${state.products.length} Curated Products</span>
          <span>${storeCount(state.products)} Trusted Stores</span>
          <span>Secure Checkout</span>
          <span>Flexible Delivery</span>
        </div>
        <div class="actions">
          <a class="btn" href="#/products">Browse Catalog</a>
          <a class="btn secondary" href="#/register">Create Account</a>
          <a class="btn ghost" href="/api-docs" target="_blank">API Docs</a>
        </div>
      </div>
      <div class="hero-panel">
        <span class="badge orange">Fresh Picks For Work And Study</span>
        <h3>Reliable gear for work, study, and everyday use.</h3>
        <p>Practical products, clear stock, and a smoother path from browsing to checkout.</p>
      </div>
    </section>

    <section class="commerce-band">
      <aside class="category-rail">
        <strong>Browse By Category</strong>
        <a class="category-link active" href="#/products">All Products <small>${state.products.length}</small></a>
        <a class="category-link" href="#/products">Work Setup <small>${state.products.filter(p => productCategory(p) === 'Work Setup').length}</small></a>
        <a class="category-link" href="#/products">Productivity <small>${state.products.filter(p => productCategory(p) === 'Productivity').length}</small></a>
        <a class="category-link" href="#/products">Audio <small>${state.products.filter(p => productCategory(p) === 'Audio').length}</small></a>
      </aside>
      <div>
        <div class="section-title" style="margin-top:0"><div><h2>Featured Products</h2><p>Popular picks from trusted SEAPEDIA stores.</p></div><a class="btn secondary" href="#/products">View All</a></div>
      <div class="grid three">${state.products.slice(0,3).map(productCard).join('')}</div>
      </div>
    </section>

    <section class="section grid two">
      <div class="card">
        <h3>Review The Marketplace</h3>
        <p class="meta">This review is for the SEAPEDIA app experience. Guests can submit feedback safely.</p>
        <form id="review-form" class="form">
          <div class="form-row"><label>Nama</label><input name="name" required placeholder="Nama reviewer" value="${state.me ? escapeHTML(state.me.user.username) : ''}" /></div>
          <div class="form-row"><label>Rating</label><select name="rating"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></div>
          <div class="form-row"><label>Komentar</label><textarea name="comment" required placeholder="Bagikan pengalamanmu menggunakan SEAPEDIA"></textarea></div>
          <button class="btn" type="submit">Submit Review</button>
        </form>
      </div>
      <div>
        <div class="section-title" style="margin-top:0"><div><h2>Customer Notes</h2><p>Recent feedback from marketplace visitors.</p></div></div>
        <div class="grid">${state.reviews.slice(0,5).map(reviewCard).join('') || '<div class="empty">Belum ada review.</div>'}</div>
      </div>
    </section>
  `;
  document.querySelector('#hero-search').addEventListener('submit', (event) => {
    event.preventDefault();
    const query = new FormData(event.target).get('query');
    location.hash = `#/products${query ? `?q=${encodeURIComponent(query)}` : ''}`;
  });
  document.querySelector('#review-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/reviews', { method: 'POST', body: JSON.stringify(formData(event.target)) });
      showToast('Review berhasil dikirim.');
      await renderHome();
    } catch (err) { showToast(err.message, true); }
  });
}

function productCard(product) {
  return `<article class="card product-card" data-name="${escapeHTML(product.name.toLowerCase())}" data-store="${escapeHTML((product.store?.name || '').toLowerCase())}" data-category="${escapeHTML(productCategory(product))}" data-price="${product.price}">
    <a class="product-image" href="#/products/${product.id}">${productImage(product)}</a>
    <div class="product-body">
      <span class="badge">${escapeHTML(productCategory(product))}</span>
      <h3><a href="#/products/${product.id}">${escapeHTML(product.name)}</a></h3>
      <p class="meta product-description">${escapeHTML(product.description)}</p>
      <div class="price">${rupiah.format(product.price)}</div>
      <div class="meta product-meta">${escapeHTML(product.store?.name || 'Store')} · ${product.stock} In Stock</div>
      <div class="actions">
        <a class="btn secondary" href="#/products/${product.id}">Details</a>
        ${state.me?.activeRole === 'Buyer' ? `<button class="btn add-cart" data-id="${product.id}">Add to cart</button>` : ''}
      </div>
    </div>
  </article>`;
}

function reviewCard(review) {
  return `<article class="card">
    <div class="review-head">
      <h4>${escapeHTML(review.name)}</h4>
      <span class="stars" aria-label="${review.rating} out of 5 stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span>
    </div>
    <p>${escapeHTML(review.comment)}</p>
    <p class="meta">${formatDate(review.createdAt)}</p>
  </article>`;
}

async function renderProducts() {
  await loadProducts();
  const params = new URLSearchParams(activeHash().split('?')[1] || '');
  const query = params.get('q') || '';
  page('Catalog', 'Find products, compare prices, and sign in when you are ready to add items to your cart.', `
    ${roleBanner()}
    <div class="commerce-band">
      <aside class="category-rail" id="category-filter">
        <strong>Categories</strong>
        <button class="category-link active" data-category="All">All Products <small>${state.products.length}</small></button>
        <button class="category-link" data-category="Work Setup">Work Setup <small>${state.products.filter(p => productCategory(p) === 'Work Setup').length}</small></button>
        <button class="category-link" data-category="Productivity">Productivity <small>${state.products.filter(p => productCategory(p) === 'Productivity').length}</small></button>
        <button class="category-link" data-category="Audio">Audio <small>${state.products.filter(p => productCategory(p) === 'Audio').length}</small></button>
        <button class="category-link" data-category="Essentials">Essentials <small>${state.products.filter(p => productCategory(p) === 'Essentials').length}</small></button>
      </aside>
      <div>
        <div class="catalog-toolbar">
          <label class="search-field"><span>Search</span><input id="catalog-search" value="${escapeHTML(query)}" placeholder="Search Products Or Stores" /></label>
          <select id="catalog-sort" class="sort-select" aria-label="Sort products">
            <option value="featured">Featured</option>
            <option value="price-asc">Price: Low To High</option>
            <option value="price-desc">Price: High To Low</option>
            <option value="stock-desc">Stock: Highest First</option>
          </select>
        </div>
        <div id="catalog-results" class="grid three"></div>
      </div>
    </div>
  `);
  let selectedCategory = 'All';
  const results = document.querySelector('#catalog-results');
  const search = document.querySelector('#catalog-search');
  const sort = document.querySelector('#catalog-sort');
  const attachCartHandlers = () => {
    document.querySelectorAll('.add-cart').forEach((button) => button.addEventListener('click', async () => {
      try {
        await api('/api/buyer/cart/items', { method: 'POST', body: JSON.stringify({ productId: button.dataset.id, quantity: 1 }) });
        showToast('Produk ditambahkan ke cart.');
      } catch (err) { showToast(err.message, true); }
    }));
  };
  const renderCatalogResults = () => {
    const normalized = search.value.trim().toLowerCase();
    let products = state.products.filter(product => {
      const matchesCategory = selectedCategory === 'All' || productCategory(product) === selectedCategory;
      const matchesSearch = !normalized || `${product.name} ${product.description} ${product.store?.name || ''}`.toLowerCase().includes(normalized);
      return matchesCategory && matchesSearch;
    });
    products = [...products].sort((a, b) => {
      if (sort.value === 'price-asc') return a.price - b.price;
      if (sort.value === 'price-desc') return b.price - a.price;
      if (sort.value === 'stock-desc') return b.stock - a.stock;
      return 0;
    });
    results.innerHTML = products.length ? products.map(productCard).join('') : '<div class="empty">No Products Match Your Filters.</div>';
    attachCartHandlers();
  };
  document.querySelectorAll('#category-filter .category-link').forEach((button) => button.addEventListener('click', () => {
    selectedCategory = button.dataset.category;
    document.querySelectorAll('#category-filter .category-link').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    renderCatalogResults();
  }));
  search.addEventListener('input', renderCatalogResults);
  sort.addEventListener('change', renderCatalogResults);
  renderCatalogResults();
}

async function renderProductDetail(id) {
  const { product } = await api(`/api/public/products/${id}`);
  page(product.name, `Dijual oleh ${product.store?.name || 'Store'}`, `
    ${roleBanner()}
    <div class="grid two">
      <div class="card"><div class="product-image" style="border-radius:8px; min-height:360px">${productImage(product)}</div></div>
      <div class="card">
        <span class="badge">${escapeHTML(productCategory(product))}</span>
        <h3>${escapeHTML(product.name)}</h3>
        <p>${escapeHTML(product.description)}</p>
        <p class="price">${rupiah.format(product.price)}</p>
        <p class="meta">${escapeHTML(product.store?.name || 'Store')} · Stok tersedia: ${product.stock}</p>
        <div class="alert">Sign in to add this item to your cart and continue to checkout.</div>
        ${state.me?.activeRole === 'Buyer' ? `<form id="add-detail-cart" class="form"><div class="form-row"><label>Quantity</label><input name="quantity" type="number" min="1" value="1"></div><button class="btn">Tambah ke Cart</button></form>` : ''}
      </div>
    </div>
  `);
  document.querySelector('#add-detail-cart')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/buyer/cart/items', { method: 'POST', body: JSON.stringify({ productId: id, quantity: Number(formData(event.target).quantity) }) });
      showToast('Produk ditambahkan ke cart.');
    } catch (err) { showToast(err.message, true); }
  });
}

function renderLogin() {
  page('Login', 'Gunakan demo account atau akun yang baru diregistrasi.', `
    <div class="grid two">
      <div class="card">
        <form id="login-form" class="form">
          <div class="form-row"><label>Username / Email</label><input name="identity" required placeholder="buyer atau buyer@seapedia.test" /></div>
          <div class="form-row"><label>Password</label><input name="password" type="password" required value="password123" /></div>
          <button class="btn" type="submit">Login</button>
        </form>
      </div>
      <div class="card">
        <h3>Demo Accounts</h3>
        <p class="meta">Semua password: <strong>password123</strong></p>
        <ul>
          <li>admin@seapedia.test — Admin</li>
          <li>seller@seapedia.test — Seller</li>
          <li>buyer@seapedia.test — Buyer</li>
          <li>driver@seapedia.test — Driver</li>
          <li>multi@seapedia.test — Buyer + Seller + Driver</li>
        </ul>
      </div>
    </div>
  `);
  document.querySelector('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(formData(event.target)) });
      setToken(data.token);
      await refreshMe();
      showToast(data.message);
      location.hash = data.activeRole ? '#/dashboard' : '#/roles';
    } catch (err) { showToast(err.message, true); }
  });
}

function renderRegister() {
  page('Register', 'Akun non-admin boleh memiliki lebih dari satu role.', `
    <div class="card">
      <form id="register-form" class="form">
        <div class="grid two">
          <div class="form-row"><label>Username</label><input name="username" required minlength="3" /></div>
          <div class="form-row"><label>Email</label><input name="email" type="email" required /></div>
        </div>
        <div class="form-row"><label>Password</label><input name="password" type="password" minlength="8" required /></div>
        <div class="form-row"><label>Role</label><div class="checkbox-row">
          <label><input type="checkbox" name="roles" value="Buyer" checked> Buyer</label>
          <label><input type="checkbox" name="roles" value="Seller"> Seller</label>
          <label><input type="checkbox" name="roles" value="Driver"> Driver</label>
        </div></div>
        <button class="btn" type="submit">Daftar</button>
      </form>
    </div>
  `);
  document.querySelector('#register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const payload = {
      username: fd.get('username'),
      email: fd.get('email'),
      password: fd.get('password'),
      roles: fd.getAll('roles')
    };
    try {
      await api('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Registrasi berhasil. Silakan login.');
      location.hash = '#/login';
    } catch (err) { showToast(err.message, true); }
  });
}

function renderRoles() {
  if (!state.me) { location.hash = '#/login'; return; }
  const roleButtons = state.me.roles.map(role => `<button class="btn choose-role" data-role="${role}">${escapeHTML(role)}</button>`).join('');
  page('Pilih Active Role', 'Authorization backend mengikuti active role di token, bukan sekadar daftar role yang dimiliki.', `
    ${roleBanner()}
    <div class="card">
      <h3>Role tersedia</h3>
      <div class="actions">${roleButtons}</div>
    </div>
  `);
  document.querySelectorAll('.choose-role').forEach((button) => button.addEventListener('click', async () => {
    try {
      const data = await api('/api/auth/role', { method: 'POST', body: JSON.stringify({ role: button.dataset.role }) });
      setToken(data.token);
      await refreshMe();
      showToast(`Active role: ${data.activeRole}`);
      location.hash = '#/dashboard';
    } catch (err) { showToast(err.message, true); }
  }));
}

async function renderDashboard() {
  if (!state.me) { location.hash = '#/login'; return; }
  if (!state.me.activeRole) { location.hash = '#/roles'; return; }
  if (state.me.activeRole === 'Seller') return renderSellerDashboard();
  if (state.me.activeRole === 'Buyer') return renderBuyerDashboard();
  if (state.me.activeRole === 'Driver') return renderDriverDashboard();
  if (state.me.activeRole === 'Admin') return renderAdminDashboard();
}

async function renderSellerDashboard() {
  const [storeRes, productsRes, ordersRes, reportsRes] = await Promise.all([
    api('/api/seller/store'), api('/api/seller/products'), api('/api/seller/orders'), api('/api/seller/reports')
  ]);
  const store = storeRes.store || {};
  page('Seller Dashboard', 'Kelola store unik, product CRUD, incoming orders, dan income report.', `
    ${roleBanner()}
    <div class="grid two">
      <div class="card">
        <h3>Store Management</h3>
        <form id="store-form" class="form">
          <div class="form-row"><label>Nama Store</label><input name="name" required value="${escapeHTML(store.name || '')}" placeholder="Nama store unik" /></div>
          <div class="form-row"><label>Deskripsi</label><textarea name="description">${escapeHTML(store.description || '')}</textarea></div>
          <button class="btn">Simpan Store</button>
        </form>
      </div>
      <div class="card stat"><span>Total Income</span><strong>${rupiah.format(reportsRes.summary.grossIncome)}</strong><p class="meta">${escapeHTML(reportsRes.summary.grossIncomeRule)}</p></div>
    </div>
    <div class="section card">
      <h3>Tambah Produk</h3>
      <form id="product-form" class="form">
        <div class="grid four">
          <div class="form-row"><label>Nama</label><input name="name" required /></div>
          <div class="form-row"><label>Harga</label><input name="price" type="number" min="1" required /></div>
          <div class="form-row"><label>Stok</label><input name="stock" type="number" min="0" required /></div>
          <div class="form-row"><label>Image URL</label><input name="imageUrl" /></div>
        </div>
        <div class="form-row"><label>Deskripsi</label><textarea name="description" required></textarea></div>
        <button class="btn">Tambah Produk</button>
      </form>
    </div>
    <div class="section">
      <div class="section-title"><div><h2>Produk Milik Seller</h2><p>Seller hanya dapat update/delete produk miliknya.</p></div></div>
      ${productsTable(productsRes.products)}
    </div>
    <div class="section">
      <div class="section-title"><div><h2>Incoming Orders</h2><p>Process mengubah status dari Sedang Dikemas ke Menunggu Pengirim.</p></div></div>
      ${ordersTable(ordersRes.orders, 'seller')}
    </div>
  `);
  document.querySelector('#store-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await api('/api/seller/store', { method: 'POST', body: JSON.stringify(formData(event.target)) }); showToast('Store disimpan.'); renderSellerDashboard(); }
    catch (err) { showToast(err.message, true); }
  });
  document.querySelector('#product-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = formData(event.target);
    fd.price = Number(fd.price); fd.stock = Number(fd.stock);
    try { await api('/api/seller/products', { method: 'POST', body: JSON.stringify(fd) }); showToast('Produk ditambahkan.'); renderSellerDashboard(); }
    catch (err) { showToast(err.message, true); }
  });
  document.querySelectorAll('.update-product-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = formData(event.target);
    fd.price = Number(fd.price); fd.stock = Number(fd.stock);
    try { await api(`/api/seller/products/${event.target.dataset.id}`, { method: 'PUT', body: JSON.stringify(fd) }); showToast('Produk diperbarui.'); renderSellerDashboard(); }
    catch (err) { showToast(err.message, true); }
  }));
  document.querySelectorAll('.delete-product').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Hapus produk ini?')) return;
    try { await api(`/api/seller/products/${button.dataset.id}`, { method: 'DELETE' }); showToast('Produk dihapus.'); renderSellerDashboard(); }
    catch (err) { showToast(err.message, true); }
  }));
  document.querySelectorAll('.process-order').forEach((button) => button.addEventListener('click', async () => {
    try { await api(`/api/seller/orders/${button.dataset.id}/process`, { method: 'POST', body: '{}' }); showToast('Order diproses dan tersedia untuk Driver.'); renderSellerDashboard(); }
    catch (err) { showToast(err.message, true); }
  }));
}

function productsTable(products) {
  if (!products.length) return '<div class="empty">Belum ada produk.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Produk</th><th>Store</th><th>Harga</th><th>Stok</th><th>Aksi</th></tr></thead><tbody>${products.map(p => `
    <tr>
      <td>
        <form id="product-update-${p.id}" class="form update-product-form compact-form" data-id="${p.id}">
          <div class="form-row"><label>Nama</label><input name="name" required value="${escapeHTML(p.name)}" /></div>
          <div class="form-row"><label>Deskripsi</label><textarea name="description" required>${escapeHTML(p.description)}</textarea></div>
          <input name="imageUrl" type="hidden" value="${escapeHTML(p.imageUrl || '')}" />
        </form>
      </td>
      <td>${escapeHTML(p.store?.name || '-')}</td>
      <td><input class="input table-input" form="product-update-${p.id}" name="price" type="number" min="1" value="${p.price}" /></td>
      <td><input class="input table-input" form="product-update-${p.id}" name="stock" type="number" min="0" value="${p.stock}" /></td>
      <td>
        <div class="actions table-actions">
          <button class="btn update-product-submit" type="submit" form="product-update-${p.id}">Update</button>
          <button class="btn danger delete-product" data-id="${p.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('')}</tbody></table></div>`;
}

async function renderBuyerDashboard() {
  const [walletRes, addressRes, cartRes, ordersRes, reportsRes, discountsRes] = await Promise.all([
    api('/api/buyer/wallet'), api('/api/buyer/addresses'), api('/api/buyer/cart'), api('/api/buyer/orders'), api('/api/buyer/reports'), api('/api/discounts')
  ]);
  page('Buyer Dashboard', 'Top-up, alamat, cart single-store, checkout, dan order history.', `
    ${roleBanner()}
    <div class="grid three">
      <div class="card stat"><span>Saldo Wallet</span><strong>${rupiah.format(walletRes.wallet.balance)}</strong></div>
      <div class="card stat"><span>Total Spending</span><strong>${rupiah.format(reportsRes.summary.totalSpending)}</strong></div>
      <div class="card stat"><span>Total Diskon</span><strong>${rupiah.format(reportsRes.summary.totalDiscount)}</strong></div>
    </div>
    <div class="grid two section">
      <div class="card">
        <h3>Dummy Top-up</h3>
        <form id="topup-form" class="form"><div class="form-row"><label>Jumlah</label><input name="amount" type="number" min="1000" value="500000" /></div><button class="btn">Top-up</button></form>
        <div class="section">
          <h4>Wallet Transaction History</h4>
          ${walletTransactions(walletRes.transactions)}
        </div>
      </div>
      <div class="card">
        <h3>Alamat Pengiriman</h3>
        <form id="address-form" class="form">
          <div class="grid two"><div class="form-row"><label>Label</label><input name="label" placeholder="Rumah" required /></div><div class="form-row"><label>Penerima</label><input name="recipient" required /></div></div>
          <div class="form-row"><label>HP</label><input name="phone" placeholder="081234567890" required /></div>
          <div class="form-row"><label>Alamat</label><textarea name="address" required></textarea></div>
          <button class="btn">Tambah Alamat</button>
        </form>
        <div class="section"><h4>Alamat tersimpan</h4>${addressRes.addresses.map(a => `<p class="meta"><strong>${escapeHTML(a.label)}</strong> — ${escapeHTML(a.recipient)} — ${escapeHTML(a.address)}</p>`).join('') || '<p class="meta">Belum ada alamat.</p>'}</div>
      </div>
    </div>
    <div class="grid two section">
      <div class="card">
        <h3>Cart Summary</h3>
        <div class="alert">${escapeHTML(cartRes.singleStoreRule)}</div>
        ${cartSummary(cartRes.cart)}
      </div>
      <div class="card">
        <h3>Checkout</h3>
        <p class="meta">Kode demo: SEAHEMAT25K atau PROMO10. Kombinasi diskon: satu checkout hanya menerima satu kode.</p>
        <form id="checkout-form" class="form">
          <div class="form-row"><label>Alamat</label><select name="addressId">${addressRes.addresses.map(a => `<option value="${a.id}">${escapeHTML(a.label)} - ${escapeHTML(a.recipient)}</option>`).join('')}</select></div>
          <div class="form-row"><label>Delivery Method</label><select name="deliveryMethod"><option>Instant</option><option>Next Day</option><option>Regular</option></select></div>
          <div class="form-row"><label>Voucher / Promo</label><input name="discountCode" placeholder="PROMO10" /></div>
          <div class="actions"><button class="btn secondary" id="summary-btn" type="button">Lihat Summary</button><button class="btn" type="submit">Confirm Checkout</button></div>
        </form>
        <div id="checkout-preview" class="section"></div>
      </div>
    </div>
    <div class="section">
      <div class="section-title"><div><h2>Order History</h2><p>Status history dengan timestamp.</p></div></div>
      ${ordersTable(ordersRes.orders, 'buyer')}
    </div>
    <div class="section card">
      <h3>Kode Diskon Tersedia</h3>
      <p class="meta">Voucher: ${discountsRes.vouchers.map(v => `${escapeHTML(v.code)} (${v.remainingUsage}x)`).join(', ') || '-'} · Promo: ${discountsRes.promos.map(p => escapeHTML(p.code)).join(', ') || '-'}</p>
    </div>
  `);
  document.querySelector('#topup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await api('/api/buyer/wallet/topup', { method: 'POST', body: JSON.stringify({ amount: Number(formData(event.target).amount) }) }); showToast('Top-up berhasil.'); renderBuyerDashboard(); }
    catch (err) { showToast(err.message, true); }
  });
  document.querySelector('#address-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await api('/api/buyer/addresses', { method: 'POST', body: JSON.stringify(formData(event.target)) }); showToast('Alamat ditambahkan.'); renderBuyerDashboard(); }
    catch (err) { showToast(err.message, true); }
  });
  document.querySelector('#summary-btn').addEventListener('click', async () => {
    const fd = formData(document.querySelector('#checkout-form'));
    try {
      const { summary, ppnRule } = await api('/api/buyer/checkout/summary', { method: 'POST', body: JSON.stringify(fd) });
      document.querySelector('#checkout-preview').innerHTML = checkoutPreview(summary, ppnRule);
    } catch (err) { showToast(err.message, true); }
  });
  document.querySelector('#checkout-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await api('/api/buyer/checkout', { method: 'POST', body: JSON.stringify(formData(event.target)) }); showToast('Checkout berhasil.'); renderBuyerDashboard(); }
    catch (err) { showToast(err.message, true); }
  });
  document.querySelectorAll('.remove-cart').forEach((button) => button.addEventListener('click', async () => {
    try { await api(`/api/buyer/cart/items/${button.dataset.id}`, { method: 'PUT', body: JSON.stringify({ quantity: 0 }) }); showToast('Item dihapus dari cart.'); renderBuyerDashboard(); }
    catch (err) { showToast(err.message, true); }
  }));
  document.querySelectorAll('.cart-qty-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(`/api/buyer/cart/items/${event.target.dataset.id}`, { method: 'PUT', body: JSON.stringify({ quantity: Number(formData(event.target).quantity) }) });
      showToast('Quantity cart diperbarui.');
      renderBuyerDashboard();
    } catch (err) { showToast(err.message, true); }
  }));
  document.querySelector('#clear-cart')?.addEventListener('click', async () => {
    try { await api('/api/buyer/cart', { method: 'DELETE' }); showToast('Cart dikosongkan.'); renderBuyerDashboard(); }
    catch (err) { showToast(err.message, true); }
  });
}

function walletTransactions(transactions = []) {
  if (!transactions.length) return '<p class="meta">Belum ada transaksi wallet.</p>';
  return `<div class="table-wrap compact-table"><table><thead><tr><th>Tipe</th><th>Jumlah</th><th>Waktu</th></tr></thead><tbody>${transactions.slice(0, 6).map((transaction) => `
    <tr>
      <td><strong>${escapeHTML(transaction.type)}</strong><br><span class="meta">${escapeHTML(transaction.note || '')}</span></td>
      <td>${rupiah.format(transaction.amount)}</td>
      <td>${formatDate(transaction.createdAt)}</td>
    </tr>
  `).join('')}</tbody></table></div>`;
}

function cartSummary(cart) {
  if (!cart.items.length) return '<div class="empty">Cart kosong. Buka katalog produk untuk menambah item.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Produk</th><th>Qty</th><th>Total</th><th>Aksi</th></tr></thead><tbody>${cart.items.map(item => `
    <tr>
      <td><strong>${escapeHTML(item.product.name)}</strong><br><span class="meta">${escapeHTML(cart.store?.name || '')}</span></td>
      <td>
        <form class="cart-qty-form qty-control" data-id="${item.productId}">
          <input class="input table-input" name="quantity" type="number" min="1" value="${item.quantity}" />
          <button class="btn secondary">Update</button>
        </form>
      </td>
      <td>${rupiah.format(item.lineTotal)}</td>
      <td><button class="btn danger remove-cart" data-id="${item.productId}">Remove</button></td>
    </tr>
  `).join('')}<tr><td colspan="2"><strong>Subtotal</strong></td><td colspan="2"><strong>${rupiah.format(cart.subtotal)}</strong></td></tr></tbody></table></div><div class="actions"><button id="clear-cart" class="btn secondary">Clear Cart</button></div>`;
}

function checkoutPreview(summary, rule) {
  return `<div class="card" style="box-shadow:none">
    <h4>Checkout Summary</h4>
    <p class="meta">${escapeHTML(rule)}</p>
    <p>Subtotal: <strong>${rupiah.format(summary.subtotal)}</strong></p>
    <p>Discount (${escapeHTML(summary.discountType || '-')}${summary.discountCode ? ` ${escapeHTML(summary.discountCode)}` : ''}): <strong>${rupiah.format(summary.discount)}</strong></p>
    <p>Delivery Fee (${escapeHTML(summary.deliveryMethod)}): <strong>${rupiah.format(summary.deliveryFee)}</strong></p>
    <p>PPN 12%: <strong>${rupiah.format(summary.ppn)}</strong></p>
    <p class="price">Final Total: ${rupiah.format(summary.finalTotal)}</p>
  </div>`;
}

function ordersTable(orders, mode) {
  if (!orders.length) return '<div class="empty">Belum ada order.</div>';
  return `<div class="grid">${orders.map(order => `<div class="card">
    <div class="section-title" style="margin:0 0 1rem"><div><h3>Order ${escapeHTML(order.id)}</h3><p>${escapeHTML(order.store?.name || '-')} · ${escapeHTML(order.deliveryMethod)} · Due ${formatDate(order.dueAt)}</p></div><span class="badge ${order.status === 'Dikembalikan' ? 'red' : order.status === 'Pesanan Selesai' ? 'green' : 'orange'}">${escapeHTML(order.status)}</span></div>
    <div class="grid three">
      <p><strong>Subtotal</strong><br>${rupiah.format(order.subtotal)}</p>
      <p><strong>Diskon</strong><br>${rupiah.format(order.discount)} ${escapeHTML(order.discountType || '')}</p>
      <p><strong>Total</strong><br>${rupiah.format(order.finalTotal)}</p>
    </div>
    <p class="meta">Items: ${order.items.map(i => `${escapeHTML(i.name)} x${i.quantity}`).join(', ')}</p>
    <ul class="timeline">${order.statusHistory.map(h => `<li><div><strong>${escapeHTML(h.status)}</strong><br><span class="meta">${formatDate(h.timestamp)} — ${escapeHTML(h.note || '')}</span></div></li>`).join('')}</ul>
    ${mode === 'seller' && order.status === 'Sedang Dikemas' ? `<div class="actions"><button class="btn process-order" data-id="${order.id}">Process Order</button></div>` : ''}
  </div>`).join('')}</div>`;
}

async function renderDriverDashboard() {
  const [jobsRes, reportsRes] = await Promise.all([api('/api/driver/jobs'), api('/api/driver/reports')]);
  page('Driver Dashboard', 'Ambil job yang sudah Menunggu Pengirim, selesaikan delivery, dan lihat earnings.', `
    ${roleBanner()}
    <div class="grid three">
      <div class="card stat"><span>Active Jobs</span><strong>${reportsRes.summary.activeJobs}</strong></div>
      <div class="card stat"><span>Completed Jobs</span><strong>${reportsRes.summary.completedJobs}</strong></div>
      <div class="card stat"><span>Total Earnings</span><strong>${rupiah.format(reportsRes.summary.totalEarnings)}</strong></div>
    </div>
    <div class="section card"><h3>Earning Rule</h3><p class="meta">${escapeHTML(reportsRes.summary.earningRule)}</p></div>
    <div class="grid two section">
      <div>
        <div class="section-title"><div><h2>Available Jobs</h2><p>Hanya job dari order Menunggu Pengirim.</p></div></div>
        ${jobsList(jobsRes.available, 'available')}
      </div>
      <div>
        <div class="section-title"><div><h2>My Jobs</h2><p>Active, completed, dan returned.</p></div></div>
        ${jobsList(jobsRes.mine, 'mine')}
      </div>
    </div>
  `);
  document.querySelectorAll('.take-job').forEach(button => button.addEventListener('click', async () => {
    try { await api(`/api/driver/jobs/${button.dataset.id}/take`, { method: 'POST', body: '{}' }); showToast('Job berhasil diambil.'); renderDriverDashboard(); }
    catch (err) { showToast(err.message, true); }
  }));
  document.querySelectorAll('.complete-job').forEach(button => button.addEventListener('click', async () => {
    try { await api(`/api/driver/jobs/${button.dataset.id}/complete`, { method: 'POST', body: '{}' }); showToast('Job selesai.'); renderDriverDashboard(); }
    catch (err) { showToast(err.message, true); }
  }));
}

function jobsList(jobs, mode) {
  if (!jobs.length) return '<div class="empty">Tidak ada job.</div>';
  return `<div class="grid">${jobs.map(job => `<div class="card">
    <span class="badge">${escapeHTML(job.status)}</span>
    <h3>Job ${escapeHTML(job.id)}</h3>
    <p class="meta">Order ${escapeHTML(job.order?.id || '-')} · ${escapeHTML(job.order?.store?.name || '-')} · ${escapeHTML(job.order?.deliveryMethod || '-')}</p>
    <p>Fee Driver: <strong>${rupiah.format(job.earning)}</strong></p>
    <p>Status order: <strong>${escapeHTML(job.order?.status || '-')}</strong></p>
    ${mode === 'available' ? `<button class="btn take-job" data-id="${job.id}">Take Job</button>` : ''}
    ${job.status === 'active' ? `<button class="btn success complete-job" data-id="${job.id}">Confirm Completed</button>` : ''}
  </div>`).join('')}</div>`;
}

async function renderAdminDashboard() {
  const data = await api('/api/admin/monitoring');
  page('Admin Dashboard', 'Monitoring marketplace, voucher/promo management, dan overdue simulation.', `
    ${roleBanner()}
    <div class="grid four">
      ${Object.entries(data.counts).map(([key, value]) => `<div class="card stat"><span>${escapeHTML(key)}</span><strong>${value}</strong></div>`).join('')}
    </div>
    <div class="section card"><h3>System Time</h3><p>${formatDate(data.currentDate)}</p><div class="actions"><button class="btn warning" id="simulate-day">Simulate Next Day</button><button class="btn secondary" id="run-overdue">Run Overdue Now</button></div></div>
    <div class="grid two section">
      <div class="card">
        <h3>Generate Voucher</h3>
        <form id="voucher-form" class="form discount-form">
          ${discountFields('VOUCHERSEA')}
          <div class="form-row"><label>Remaining Usage</label><input name="remainingUsage" type="number" min="1" value="10" /></div>
          <button class="btn">Create Voucher</button>
        </form>
      </div>
      <div class="card">
        <h3>Generate Promo</h3>
        <form id="promo-form" class="form discount-form">
          ${discountFields('PROMOSEA')}
          <button class="btn">Create Promo</button>
        </form>
      </div>
    </div>
    <div class="grid two section">
      <div class="card"><h3>Vouchers</h3>${discountTable(data.vouchers, 'voucher')}</div>
      <div class="card"><h3>Promos</h3>${discountTable(data.promos, 'promo')}</div>
    </div>
    <div class="section"><div class="section-title"><div><h2>Orders</h2><p>Termasuk overdue/final status.</p></div></div>${ordersTable(data.orders, 'admin')}</div>
  `);
  document.querySelector('#simulate-day').addEventListener('click', async () => {
    try { const res = await api('/api/admin/simulate-next-day', { method: 'POST', body: '{}' }); showToast(`${res.returnedOrderIds.length} order auto return/refund.`); renderAdminDashboard(); }
    catch (err) { showToast(err.message, true); }
  });
  document.querySelector('#run-overdue').addEventListener('click', async () => {
    try { const res = await api('/api/admin/run-overdue', { method: 'POST', body: '{}' }); showToast(`${res.returnedOrderIds.length} order diproses overdue.`); renderAdminDashboard(); }
    catch (err) { showToast(err.message, true); }
  });
  document.querySelector('#voucher-form').addEventListener('submit', async (event) => submitDiscount(event, '/api/admin/vouchers'));
  document.querySelector('#promo-form').addEventListener('submit', async (event) => submitDiscount(event, '/api/admin/promos'));
}

function discountFields(code) {
  const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1);
  return `
    <div class="form-row"><label>Code</label><input name="code" value="${code}${Math.floor(Math.random()*90+10)}" required /></div>
    <div class="form-row"><label>Description</label><input name="description" value="Diskon demo SEAPEDIA" required /></div>
    <div class="grid two"><div class="form-row"><label>Amount Type</label><select name="amountType"><option value="fixed">fixed</option><option value="percent">percent</option></select></div><div class="form-row"><label>Amount</label><input name="amount" type="number" min="1" value="25000" /></div></div>
    <div class="form-row"><label>Expiry Date</label><input name="expiryDate" value="${nextYear.toISOString()}" /></div>
  `;
}

function discountTable(items, kind) {
  if (!items.length) return '<div class="empty">Belum ada data.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Kode</th><th>Nilai</th><th>Expiry</th><th>${kind === 'voucher' ? 'Usage' : 'Tipe'}</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHTML(item.code)}</strong><br><span class="meta">${escapeHTML(item.description)}</span></td><td>${item.amountType === 'percent' ? `${item.amount}%` : rupiah.format(item.amount)}</td><td>${formatDate(item.expiryDate)}</td><td>${kind === 'voucher' ? item.remainingUsage : 'Promo'}</td></tr>`).join('')}</tbody></table></div>`;
}

async function submitDiscount(event, endpoint) {
  event.preventDefault();
  const fd = formData(event.target);
  fd.amount = Number(fd.amount);
  if (fd.remainingUsage) fd.remainingUsage = Number(fd.remainingUsage);
  try { await api(endpoint, { method: 'POST', body: JSON.stringify(fd) }); showToast('Diskon dibuat.'); renderAdminDashboard(); }
  catch (err) { showToast(err.message, true); }
}

async function render() {
  await refreshMe();
  setNav();
  const hash = activeHash();
  const route = hash.split('?')[0];
  try {
    if (route === '#/' || route === '') return renderHome();
    if (route === '#/products') return renderProducts();
    if (route.startsWith('#/products/')) return renderProductDetail(route.split('/')[2]);
    if (route === '#/login') return renderLogin();
    if (route === '#/register') return renderRegister();
    if (route === '#/roles') return renderRoles();
    if (route === '#/dashboard') return renderDashboard();
    page('404', 'Halaman tidak ditemukan.', '<a class="btn" href="#/">Kembali Home</a>');
  } catch (err) {
    page('Error', err.message, '<a class="btn" href="#/">Kembali Home</a>');
    showToast(err.message, true);
  } finally {
    setNav();
  }
}

render();

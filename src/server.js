const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const { readDb, writeDb, createId, nowISO } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const TOKEN_EXPIRES_IN = process.env.TOKEN_EXPIRES_IN || '6h';

const ROLES = ['Admin', 'Seller', 'Buyer', 'Driver'];
const NON_ADMIN_ROLES = ['Seller', 'Buyer', 'Driver'];
const ORDER_STATUS = {
  PACKING: 'Sedang Dikemas',
  WAITING_DRIVER: 'Menunggu Pengirim',
  SHIPPING: 'Sedang Dikirim',
  DONE: 'Pesanan Selesai',
  RETURNED: 'Dikembalikan'
};
const DELIVERY_METHODS = {
  Instant: { fee: 15000, slaHours: 4, label: 'Instant' },
  'Next Day': { fee: 10000, slaHours: 24, label: 'Next Day' },
  Regular: { fee: 7000, slaHours: 72, label: 'Regular' }
};
const PPN_RATE = 0.12;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function error(res, status, message, details = undefined) {
  return res.status(status).json({ message, details });
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function sanitizeText(value, maxLength = 1000) {
  // Keep text display-safe and layout-safe. Frontend still renders with textContent/escaping.
  return normalizeString(value).replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maxLength);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function assertPositiveNumber(value, fieldName, opts = {}) {
  const number = Number(value);
  const min = opts.min ?? 0;
  const integer = opts.integer ?? false;
  if (!Number.isFinite(number) || number < min || (integer && !Number.isInteger(number))) {
    throw new Error(`${fieldName} harus berupa angka ${integer ? 'bulat ' : ''}minimal ${min}.`);
  }
  return number;
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, email: user.email, roles: user.roles, createdAt: user.createdAt };
}

function signToken(user, activeRole = null) {
  return jwt.sign({ userId: user.id, activeRole }, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return error(res, 401, 'Token tidak ditemukan. Silakan login.');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = readDb();
    const user = db.users.find((item) => item.id === payload.userId);
    if (!user) return error(res, 401, 'User tidak valid.');
    req.user = user;
    req.activeRole = payload.activeRole || null;
    next();
  } catch (err) {
    return error(res, 401, 'Token tidak valid atau sudah kedaluwarsa.');
  }
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = readDb();
    const user = db.users.find((item) => item.id === payload.userId);
    if (user) {
      req.user = user;
      req.activeRole = payload.activeRole || null;
    }
  } catch (err) {
    // public route: ignore invalid token
  }
  next();
}

function requireActiveRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return error(res, 401, 'Silakan login terlebih dahulu.');
    if (!req.activeRole) return error(res, 403, 'Pilih active role terlebih dahulu.');
    if (!req.user.roles.includes(req.activeRole)) return error(res, 403, 'Active role tidak dimiliki user ini.');
    if (!roles.includes(req.activeRole)) return error(res, 403, `Endpoint ini hanya untuk role: ${roles.join(', ')}.`);
    next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.user) return error(res, 401, 'Silakan login terlebih dahulu.');
  if (req.activeRole !== 'Admin' || !req.user.roles.includes('Admin')) {
    return error(res, 403, 'Endpoint ini hanya untuk Admin.');
  }
  next();
}

function getWallet(db, userId) {
  let wallet = db.wallets.find((item) => item.userId === userId);
  if (!wallet) {
    wallet = { userId, balance: 0 };
    db.wallets.push(wallet);
  }
  return wallet;
}

function getCart(db, buyerUserId) {
  let cart = db.carts.find((item) => item.buyerUserId === buyerUserId);
  if (!cart) {
    cart = { buyerUserId, storeId: null, items: [] };
    db.carts.push(cart);
  }
  return cart;
}

function getStoreForSeller(db, sellerUserId) {
  return db.stores.find((store) => store.sellerUserId === sellerUserId) || null;
}

function decorateProduct(db, product) {
  const store = db.stores.find((item) => item.id === product.storeId);
  return {
    ...product,
    store: store ? { id: store.id, name: store.name, description: store.description } : null
  };
}

function decorateCart(db, cart) {
  const store = cart.storeId ? db.stores.find((item) => item.id === cart.storeId) : null;
  const items = cart.items.map((item) => {
    const product = db.products.find((productItem) => productItem.id === item.productId);
    return { ...item, product: product ? decorateProduct(db, product) : null, lineTotal: product ? product.price * item.quantity : 0 };
  }).filter((item) => item.product);
  return {
    buyerUserId: cart.buyerUserId,
    storeId: cart.storeId,
    store: store ? { id: store.id, name: store.name } : null,
    items,
    subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0)
  };
}

function statusPush(order, status, note = '') {
  const timestamp = nowISO(readDb());
  order.status = status;
  order.updatedAt = timestamp;
  order.statusHistory.push({ status, timestamp, note });
}

function statusPushWithDb(db, order, status, note = '') {
  const timestamp = nowISO(db);
  order.status = status;
  order.updatedAt = timestamp;
  order.statusHistory.push({ status, timestamp, note });
}

function addHours(iso, hours) {
  const date = new Date(iso);
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);
  return date.toISOString();
}

function calculateDiscount(db, subtotal, discountCode) {
  const code = normalizeString(discountCode).toUpperCase();
  if (!code) return { code: null, type: null, amount: 0, resource: null };
  const now = new Date(nowISO(db));
  const voucher = db.vouchers.find((item) => item.code.toUpperCase() === code);
  if (voucher) {
    if (new Date(voucher.expiryDate) < now) throw new Error('Voucher sudah kedaluwarsa.');
    if (voucher.remainingUsage <= 0) throw new Error('Voucher sudah habis digunakan.');
    const amount = voucher.amountType === 'percent'
      ? Math.floor(subtotal * (Number(voucher.amount) / 100))
      : Number(voucher.amount);
    return { code: voucher.code, type: 'Voucher', amount: Math.min(amount, subtotal), resource: voucher };
  }
  const promo = db.promos.find((item) => item.code.toUpperCase() === code);
  if (promo) {
    if (new Date(promo.expiryDate) < now) throw new Error('Promo sudah kedaluwarsa.');
    const amount = promo.amountType === 'percent'
      ? Math.floor(subtotal * (Number(promo.amount) / 100))
      : Number(promo.amount);
    return { code: promo.code, type: 'Promo', amount: Math.min(amount, subtotal), resource: promo };
  }
  throw new Error('Kode diskon tidak ditemukan.');
}

function buildCheckoutSummary(db, buyerUserId, { deliveryMethod, discountCode }) {
  const cart = getCart(db, buyerUserId);
  const decorated = decorateCart(db, cart);
  if (!decorated.items.length) throw new Error('Cart masih kosong.');
  if (!DELIVERY_METHODS[deliveryMethod]) throw new Error('Delivery method tidak valid. Gunakan Instant, Next Day, atau Regular.');
  const subtotal = decorated.subtotal;
  const deliveryFee = DELIVERY_METHODS[deliveryMethod].fee;
  const discount = calculateDiscount(db, subtotal, discountCode);
  // Documented rule: PPN is 12% of taxable goods after discount, before delivery fee.
  const taxableBase = Math.max(subtotal - discount.amount, 0);
  const ppn = Math.floor(taxableBase * PPN_RATE);
  const finalTotal = taxableBase + deliveryFee + ppn;
  return {
    store: decorated.store,
    items: decorated.items,
    subtotal,
    discount: discount.amount,
    discountType: discount.type,
    discountCode: discount.code,
    deliveryMethod,
    deliveryFee,
    ppnRate: PPN_RATE,
    ppn,
    finalTotal,
    discountResource: discount.resource
  };
}

function exposeOrder(db, order) {
  const buyer = db.users.find((item) => item.id === order.buyerUserId);
  const seller = db.users.find((item) => item.id === order.sellerUserId);
  const store = db.stores.find((item) => item.id === order.storeId);
  const driver = order.driverUserId ? db.users.find((item) => item.id === order.driverUserId) : null;
  const address = db.addresses.find((item) => item.id === order.addressId);
  return {
    ...order,
    buyer: buyer ? publicUser(buyer) : null,
    seller: seller ? publicUser(seller) : null,
    driver: driver ? publicUser(driver) : null,
    store: store ? { id: store.id, name: store.name } : null,
    address: address || null
  };
}

function runOverdueHandling(db) {
  const now = new Date(nowISO(db));
  const results = [];
  for (const order of db.orders) {
    const finalStatuses = [ORDER_STATUS.DONE, ORDER_STATUS.RETURNED];
    if (finalStatuses.includes(order.status)) continue;
    if (!order.dueAt || new Date(order.dueAt) >= now) continue;
    statusPushWithDb(db, order, ORDER_STATUS.RETURNED, `Auto refund/return karena melewati SLA ${order.deliveryMethod}.`);
    const wallet = getWallet(db, order.buyerUserId);
    wallet.balance += order.finalTotal;
    db.walletTransactions.push({
      id: createId('trx'), userId: order.buyerUserId, type: 'auto_refund', amount: order.finalTotal,
      note: `Refund otomatis untuk order ${order.id}`, createdAt: nowISO(db)
    });
    const job = db.deliveryJobs.find((item) => item.orderId === order.id);
    if (job && job.status !== 'completed') {
      job.status = 'returned';
      job.updatedAt = nowISO(db);
    }
    results.push(order.id);
  }
  return results;
}

// OpenAPI docs
const openApiDocument = require('../docs/openapi.json');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.get('/api/health', (_req, res) => {
  const db = readDb();
  res.json({ ok: true, app: 'SEAPEDIA', currentDate: db.system.currentDate, deliveryMethods: DELIVERY_METHODS });
});

// Authentication and role awareness
app.post('/api/auth/register', async (req, res) => {
  try {
    const db = readDb();
    const username = sanitizeText(req.body.username, 30).toLowerCase();
    const email = sanitizeText(req.body.email, 120).toLowerCase();
    const password = String(req.body.password || '');
    let roles = Array.isArray(req.body.roles) ? req.body.roles : ['Buyer'];
    roles = [...new Set(roles.map((role) => sanitizeText(role, 20)).filter(Boolean))];
    if (!username || username.length < 3) return error(res, 400, 'Username minimal 3 karakter.');
    if (!isEmail(email)) return error(res, 400, 'Format email tidak valid.');
    if (password.length < 8) return error(res, 400, 'Password minimal 8 karakter.');
    if (!roles.length || roles.some((role) => !NON_ADMIN_ROLES.includes(role))) {
      return error(res, 400, 'Registrasi publik hanya boleh memilih role Buyer, Seller, dan/atau Driver.');
    }
    if (db.users.some((user) => user.username === username || user.email === email)) {
      return error(res, 409, 'Username atau email sudah terdaftar.');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = { id: createId('u'), username, email, passwordHash, roles, createdAt: nowISO(db) };
    db.users.push(user);
    if (roles.includes('Buyer')) getWallet(db, user.id);
    writeDb(db);
    res.status(201).json({ user: publicUser(user), roles: user.roles, message: 'Registrasi berhasil. Silakan login.' });
  } catch (err) {
    return error(res, 500, 'Gagal registrasi.', err.message);
  }
});

app.post('/api/auth/login', async (req, res) => {
  const db = readDb();
  const identity = sanitizeText(req.body.identity || req.body.email || req.body.username, 120).toLowerCase();
  const password = String(req.body.password || '');
  const user = db.users.find((item) => item.email.toLowerCase() === identity || item.username.toLowerCase() === identity);
  if (!user) return error(res, 401, 'Username/email atau password salah.');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return error(res, 401, 'Username/email atau password salah.');
  const autoRole = user.roles.length === 1 ? user.roles[0] : null;
  res.json({
    token: signToken(user, autoRole),
    user: publicUser(user),
    roles: user.roles,
    activeRole: autoRole,
    mustChooseRole: user.roles.filter((role) => role !== 'Admin').length > 1 && !autoRole,
    message: autoRole ? `Login berhasil sebagai ${autoRole}.` : 'Login berhasil. Pilih active role.'
  });
});

app.post('/api/auth/role', authRequired, (req, res) => {
  const requestedRole = sanitizeText(req.body.role, 20);
  if (!ROLES.includes(requestedRole)) return error(res, 400, 'Role tidak valid.');
  if (!req.user.roles.includes(requestedRole)) return error(res, 403, 'User tidak memiliki role tersebut.');
  if (requestedRole === 'Admin' && req.user.roles.length > 1) return error(res, 403, 'Role Admin dipisahkan dari multi-role non-admin.');
  res.json({ token: signToken(req.user, requestedRole), activeRole: requestedRole, user: publicUser(req.user) });
});

app.post('/api/auth/logout', authRequired, (_req, res) => {
  // JWT is stateless; client must delete token. Expiration is documented in README/security notes.
  res.json({ message: 'Logout berhasil. Hapus token di client.' });
});

app.get('/api/me', authRequired, (req, res) => {
  const db = readDb();
  const wallet = req.user.roles.includes('Buyer') ? getWallet(db, req.user.id) : null;
  const sellerStore = req.user.roles.includes('Seller') ? getStoreForSeller(db, req.user.id) : null;
  const driverJobs = req.user.roles.includes('Driver') ? db.deliveryJobs.filter((job) => job.driverUserId === req.user.id) : [];
  writeDb(db);
  res.json({ user: publicUser(req.user), roles: req.user.roles, activeRole: req.activeRole, summaries: { wallet, sellerStore, driverJobsCount: driverJobs.length } });
});

// Public marketplace and reviews
app.get('/api/public/products', optionalAuth, (_req, res) => {
  const db = readDb();
  res.json({ products: db.products.map((product) => decorateProduct(db, product)) });
});

app.get('/api/public/products/:id', optionalAuth, (req, res) => {
  const db = readDb();
  const product = db.products.find((item) => item.id === req.params.id);
  if (!product) return error(res, 404, 'Produk tidak ditemukan.');
  res.json({ product: decorateProduct(db, product) });
});

app.get('/api/public/stores/:id', (req, res) => {
  const db = readDb();
  const store = db.stores.find((item) => item.id === req.params.id);
  if (!store) return error(res, 404, 'Store tidak ditemukan.');
  const products = db.products.filter((product) => product.storeId === store.id).map((product) => decorateProduct(db, product));
  res.json({ store, products });
});

app.get('/api/reviews', (_req, res) => {
  const db = readDb();
  res.json({ reviews: db.reviews.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

app.post('/api/reviews', optionalAuth, (req, res) => {
  const db = readDb();
  const name = sanitizeText(req.body.name || req.user?.username || 'Guest', 60);
  const rating = Number(req.body.rating);
  const comment = sanitizeText(req.body.comment, 500);
  if (!name) return error(res, 400, 'Nama reviewer wajib diisi.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return error(res, 400, 'Rating harus berupa angka 1 sampai 5.');
  if (!comment || comment.length < 3) return error(res, 400, 'Komentar minimal 3 karakter.');
  const review = { id: createId('rev'), name, rating, comment, createdAt: nowISO(db) };
  db.reviews.push(review);
  writeDb(db);
  res.status(201).json({ review });
});

// Seller store and product management
app.get('/api/seller/store', authRequired, requireActiveRole('Seller'), (req, res) => {
  const db = readDb();
  res.json({ store: getStoreForSeller(db, req.user.id) });
});

app.post('/api/seller/store', authRequired, requireActiveRole('Seller'), (req, res) => {
  const db = readDb();
  const name = sanitizeText(req.body.name, 80);
  const description = sanitizeText(req.body.description, 500);
  if (!name || name.length < 3) return error(res, 400, 'Nama store minimal 3 karakter.');
  const existingByName = db.stores.find((store) => store.name.toLowerCase() === name.toLowerCase() && store.sellerUserId !== req.user.id);
  if (existingByName) return error(res, 409, 'Nama store sudah digunakan.');
  let store = getStoreForSeller(db, req.user.id);
  if (store) {
    store.name = name;
    store.description = description;
  } else {
    store = { id: createId('store'), sellerUserId: req.user.id, name, description };
    db.stores.push(store);
  }
  writeDb(db);
  res.json({ store });
});

app.get('/api/seller/products', authRequired, requireActiveRole('Seller'), (req, res) => {
  const db = readDb();
  const products = db.products.filter((product) => product.sellerUserId === req.user.id).map((product) => decorateProduct(db, product));
  res.json({ products });
});

app.post('/api/seller/products', authRequired, requireActiveRole('Seller'), (req, res) => {
  try {
    const db = readDb();
    const store = getStoreForSeller(db, req.user.id);
    if (!store) return error(res, 400, 'Buat store terlebih dahulu sebelum menambah produk.');
    const name = sanitizeText(req.body.name, 120);
    const description = sanitizeText(req.body.description, 1000);
    const price = assertPositiveNumber(req.body.price, 'Harga', { min: 1, integer: true });
    const stock = assertPositiveNumber(req.body.stock, 'Stok', { min: 0, integer: true });
    const imageUrl = sanitizeText(req.body.imageUrl || `https://placehold.co/800x500?text=${encodeURIComponent(name || 'Product')}`, 500);
    if (!name || name.length < 3) return error(res, 400, 'Nama produk minimal 3 karakter.');
    const product = { id: createId('prod'), storeId: store.id, sellerUserId: req.user.id, name, description, price, stock, imageUrl, createdAt: nowISO(db) };
    db.products.push(product);
    writeDb(db);
    res.status(201).json({ product: decorateProduct(db, product) });
  } catch (err) {
    return error(res, 400, err.message);
  }
});

app.put('/api/seller/products/:id', authRequired, requireActiveRole('Seller'), (req, res) => {
  try {
    const db = readDb();
    const product = db.products.find((item) => item.id === req.params.id);
    if (!product) return error(res, 404, 'Produk tidak ditemukan.');
    if (product.sellerUserId !== req.user.id) return error(res, 403, 'Seller hanya boleh mengubah produk miliknya sendiri.');
    if (req.body.name !== undefined) product.name = sanitizeText(req.body.name, 120);
    if (req.body.description !== undefined) product.description = sanitizeText(req.body.description, 1000);
    if (req.body.price !== undefined) product.price = assertPositiveNumber(req.body.price, 'Harga', { min: 1, integer: true });
    if (req.body.stock !== undefined) product.stock = assertPositiveNumber(req.body.stock, 'Stok', { min: 0, integer: true });
    if (req.body.imageUrl !== undefined) product.imageUrl = sanitizeText(req.body.imageUrl, 500);
    writeDb(db);
    res.json({ product: decorateProduct(db, product) });
  } catch (err) {
    return error(res, 400, err.message);
  }
});

app.delete('/api/seller/products/:id', authRequired, requireActiveRole('Seller'), (req, res) => {
  const db = readDb();
  const product = db.products.find((item) => item.id === req.params.id);
  if (!product) return error(res, 404, 'Produk tidak ditemukan.');
  if (product.sellerUserId !== req.user.id) return error(res, 403, 'Seller hanya boleh menghapus produk miliknya sendiri.');
  db.products = db.products.filter((item) => item.id !== req.params.id);
  writeDb(db);
  res.json({ message: 'Produk berhasil dihapus.' });
});

app.get('/api/seller/orders', authRequired, requireActiveRole('Seller'), (req, res) => {
  const db = readDb();
  const orders = db.orders.filter((order) => order.sellerUserId === req.user.id).map((order) => exposeOrder(db, order));
  res.json({ orders });
});

app.post('/api/seller/orders/:id/process', authRequired, requireActiveRole('Seller'), (req, res) => {
  const db = readDb();
  const order = db.orders.find((item) => item.id === req.params.id);
  if (!order) return error(res, 404, 'Order tidak ditemukan.');
  if (order.sellerUserId !== req.user.id) return error(res, 403, 'Seller hanya boleh memproses order miliknya.');
  if (order.status !== ORDER_STATUS.PACKING) return error(res, 400, 'Order hanya dapat diproses dari status Sedang Dikemas.');
  statusPushWithDb(db, order, ORDER_STATUS.WAITING_DRIVER, 'Seller selesai mengemas dan menunggu Driver.');
  if (!db.deliveryJobs.some((job) => job.orderId === order.id)) {
    db.deliveryJobs.push({ id: createId('job'), orderId: order.id, driverUserId: null, status: 'available', earning: Math.floor(order.deliveryFee * 0.8), createdAt: nowISO(db), updatedAt: nowISO(db) });
  }
  writeDb(db);
  res.json({ order: exposeOrder(db, order) });
});

app.get('/api/seller/reports', authRequired, requireActiveRole('Seller'), (req, res) => {
  const db = readDb();
  const sellerOrders = db.orders.filter((order) => order.sellerUserId === req.user.id);
  const completed = sellerOrders.filter((order) => order.status === ORDER_STATUS.DONE);
  const grossIncome = completed.reduce((sum, order) => sum + Math.max(order.subtotal - order.discount, 0), 0);
  res.json({
    summary: {
      totalOrders: sellerOrders.length,
      processedOrders: sellerOrders.filter((order) => order.status !== ORDER_STATUS.PACKING).length,
      completedOrders: completed.length,
      grossIncomeRule: 'Pendapatan seller = subtotal produk - diskon untuk order Pesanan Selesai.',
      grossIncome
    },
    orders: sellerOrders.map((order) => exposeOrder(db, order))
  });
});

// Buyer wallet, address, cart, checkout, orders
app.get('/api/buyer/wallet', authRequired, requireActiveRole('Buyer'), (req, res) => {
  const db = readDb();
  const wallet = getWallet(db, req.user.id);
  const transactions = db.walletTransactions.filter((item) => item.userId === req.user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  writeDb(db);
  res.json({ wallet, transactions });
});

app.post('/api/buyer/wallet/topup', authRequired, requireActiveRole('Buyer'), (req, res) => {
  try {
    const db = readDb();
    const amount = assertPositiveNumber(req.body.amount, 'Jumlah top-up', { min: 1000, integer: true });
    const wallet = getWallet(db, req.user.id);
    wallet.balance += amount;
    const trx = { id: createId('trx'), userId: req.user.id, type: 'topup', amount, note: 'Dummy top-up', createdAt: nowISO(db) };
    db.walletTransactions.push(trx);
    writeDb(db);
    res.json({ wallet, transaction: trx });
  } catch (err) {
    return error(res, 400, err.message);
  }
});

app.get('/api/buyer/addresses', authRequired, requireActiveRole('Buyer'), (req, res) => {
  const db = readDb();
  res.json({ addresses: db.addresses.filter((item) => item.buyerUserId === req.user.id) });
});

app.post('/api/buyer/addresses', authRequired, requireActiveRole('Buyer'), (req, res) => {
  const db = readDb();
  const label = sanitizeText(req.body.label, 60);
  const recipient = sanitizeText(req.body.recipient, 80);
  const phone = sanitizeText(req.body.phone, 20);
  const addressText = sanitizeText(req.body.address, 500);
  if (!label || !recipient || !phone || !addressText) return error(res, 400, 'Label, penerima, nomor HP, dan alamat wajib diisi.');
  if (!/^\+?[0-9]{8,15}$/.test(phone)) return error(res, 400, 'Format nomor HP tidak valid.');
  const existing = db.addresses.filter((item) => item.buyerUserId === req.user.id);
  const address = { id: createId('addr'), buyerUserId: req.user.id, label, recipient, phone, address: addressText, isDefault: existing.length === 0 };
  db.addresses.push(address);
  writeDb(db);
  res.status(201).json({ address });
});

app.get('/api/buyer/cart', authRequired, requireActiveRole('Buyer'), (req, res) => {
  const db = readDb();
  const cart = getCart(db, req.user.id);
  writeDb(db);
  res.json({ cart: decorateCart(db, cart), singleStoreRule: 'Satu cart hanya boleh berisi produk dari satu toko.' });
});

app.post('/api/buyer/cart/items', authRequired, requireActiveRole('Buyer'), (req, res) => {
  try {
    const db = readDb();
    const productId = sanitizeText(req.body.productId, 80);
    const quantity = assertPositiveNumber(req.body.quantity || 1, 'Quantity', { min: 1, integer: true });
    const product = db.products.find((item) => item.id === productId);
    if (!product) return error(res, 404, 'Produk tidak ditemukan.');
    if (product.stock < quantity) return error(res, 400, 'Stok produk tidak mencukupi.');
    const cart = getCart(db, req.user.id);
    if (cart.storeId && cart.storeId !== product.storeId) {
      return error(res, 409, 'Single-store checkout: cart hanya boleh berisi produk dari satu toko. Kosongkan cart sebelum menambah produk dari toko lain.');
    }
    cart.storeId = product.storeId;
    const item = cart.items.find((cartItem) => cartItem.productId === product.id);
    if (item) item.quantity += quantity;
    else cart.items.push({ productId: product.id, quantity });
    writeDb(db);
    res.status(201).json({ cart: decorateCart(db, cart) });
  } catch (err) {
    return error(res, 400, err.message);
  }
});

app.put('/api/buyer/cart/items/:productId', authRequired, requireActiveRole('Buyer'), (req, res) => {
  try {
    const db = readDb();
    const quantity = assertPositiveNumber(req.body.quantity, 'Quantity', { min: 0, integer: true });
    const cart = getCart(db, req.user.id);
    const item = cart.items.find((cartItem) => cartItem.productId === req.params.productId);
    if (!item) return error(res, 404, 'Item cart tidak ditemukan.');
    if (quantity === 0) cart.items = cart.items.filter((cartItem) => cartItem.productId !== req.params.productId);
    else item.quantity = quantity;
    if (!cart.items.length) cart.storeId = null;
    writeDb(db);
    res.json({ cart: decorateCart(db, cart) });
  } catch (err) {
    return error(res, 400, err.message);
  }
});

app.delete('/api/buyer/cart', authRequired, requireActiveRole('Buyer'), (req, res) => {
  const db = readDb();
  const cart = getCart(db, req.user.id);
  cart.storeId = null;
  cart.items = [];
  writeDb(db);
  res.json({ cart: decorateCart(db, cart), message: 'Cart dikosongkan.' });
});

app.post('/api/buyer/checkout/summary', authRequired, requireActiveRole('Buyer'), (req, res) => {
  try {
    const db = readDb();
    const summary = buildCheckoutSummary(db, req.user.id, { deliveryMethod: req.body.deliveryMethod, discountCode: req.body.discountCode });
    delete summary.discountResource;
    res.json({ summary, ppnRule: 'PPN 12% dihitung dari subtotal produk setelah diskon, sebelum delivery fee.' });
  } catch (err) {
    return error(res, 400, err.message);
  }
});

app.post('/api/buyer/checkout', authRequired, requireActiveRole('Buyer'), (req, res) => {
  try {
    const db = readDb();
    const addressId = sanitizeText(req.body.addressId, 80);
    let address = db.addresses.find((item) => item.id === addressId && item.buyerUserId === req.user.id);
    if (!address) address = db.addresses.find((item) => item.buyerUserId === req.user.id && item.isDefault);
    if (!address) return error(res, 400, 'Alamat pengiriman belum tersedia.');
    const summary = buildCheckoutSummary(db, req.user.id, { deliveryMethod: req.body.deliveryMethod, discountCode: req.body.discountCode });
    for (const item of summary.items) {
      const product = db.products.find((productItem) => productItem.id === item.productId);
      if (!product || product.stock < item.quantity) return error(res, 400, `Stok ${item.product?.name || item.productId} tidak mencukupi.`);
    }
    const wallet = getWallet(db, req.user.id);
    if (wallet.balance < summary.finalTotal) return error(res, 400, 'Saldo wallet tidak mencukupi untuk checkout.');
    wallet.balance -= summary.finalTotal;
    db.walletTransactions.push({ id: createId('trx'), userId: req.user.id, type: 'checkout', amount: -summary.finalTotal, note: 'Pembayaran order SEAPEDIA', createdAt: nowISO(db) });
    for (const item of summary.items) {
      const product = db.products.find((productItem) => productItem.id === item.productId);
      product.stock -= item.quantity;
    }
    if (summary.discountType === 'Voucher' && summary.discountResource) {
      summary.discountResource.remainingUsage -= 1;
    }
    const createdAt = nowISO(db);
    const deliveryRule = DELIVERY_METHODS[summary.deliveryMethod];
    const order = {
      id: createId('ord'),
      buyerUserId: req.user.id,
      sellerUserId: summary.items[0].product.sellerUserId,
      storeId: summary.store.id,
      addressId: address.id,
      deliveryMethod: summary.deliveryMethod,
      deliveryFee: summary.deliveryFee,
      subtotal: summary.subtotal,
      discount: summary.discount,
      discountType: summary.discountType,
      discountCode: summary.discountCode,
      ppn: summary.ppn,
      finalTotal: summary.finalTotal,
      status: ORDER_STATUS.PACKING,
      statusHistory: [{ status: ORDER_STATUS.PACKING, timestamp: createdAt, note: 'Order dibuat setelah checkout berhasil.' }],
      items: summary.items.map((item) => ({ productId: item.productId, name: item.product.name, price: item.product.price, quantity: item.quantity, storeId: item.product.storeId })),
      driverUserId: null,
      createdAt,
      updatedAt: createdAt,
      dueAt: addHours(createdAt, deliveryRule.slaHours),
      completedAt: null
    };
    db.orders.push(order);
    const cart = getCart(db, req.user.id);
    cart.storeId = null;
    cart.items = [];
    writeDb(db);
    res.status(201).json({ order: exposeOrder(db, order) });
  } catch (err) {
    return error(res, 400, err.message);
  }
});

app.get('/api/buyer/orders', authRequired, requireActiveRole('Buyer'), (req, res) => {
  const db = readDb();
  const orders = db.orders.filter((order) => order.buyerUserId === req.user.id).map((order) => exposeOrder(db, order));
  res.json({ orders });
});

app.get('/api/buyer/reports', authRequired, requireActiveRole('Buyer'), (req, res) => {
  const db = readDb();
  const orders = db.orders.filter((order) => order.buyerUserId === req.user.id);
  const completedOrActive = orders.filter((order) => order.status !== ORDER_STATUS.RETURNED);
  res.json({
    summary: {
      totalOrders: orders.length,
      totalSpending: completedOrActive.reduce((sum, order) => sum + order.finalTotal, 0),
      totalDiscount: orders.reduce((sum, order) => sum + order.discount, 0),
      totalDeliveryFee: orders.reduce((sum, order) => sum + order.deliveryFee, 0),
      totalPPN: orders.reduce((sum, order) => sum + order.ppn, 0)
    },
    orders: orders.map((order) => exposeOrder(db, order))
  });
});

// Discounts visible to checkout and admin
app.get('/api/discounts', (_req, res) => {
  const db = readDb();
  res.json({ vouchers: db.vouchers, promos: db.promos, combinationRule: 'Satu checkout hanya menerima satu kode: Voucher atau Promo.' });
});

// Driver flow
app.get('/api/driver/jobs', authRequired, requireActiveRole('Driver'), (req, res) => {
  const db = readDb();
  const available = db.deliveryJobs.filter((job) => job.status === 'available').map((job) => ({ ...job, order: exposeOrder(db, db.orders.find((order) => order.id === job.orderId)) }));
  const mine = db.deliveryJobs.filter((job) => job.driverUserId === req.user.id).map((job) => ({ ...job, order: exposeOrder(db, db.orders.find((order) => order.id === job.orderId)) }));
  res.json({ available, mine });
});

app.post('/api/driver/jobs/:id/take', authRequired, requireActiveRole('Driver'), (req, res) => {
  const db = readDb();
  const job = db.deliveryJobs.find((item) => item.id === req.params.id);
  if (!job) return error(res, 404, 'Job tidak ditemukan.');
  if (job.status !== 'available' || job.driverUserId) return error(res, 409, 'Job sudah diambil Driver lain.');
  const order = db.orders.find((item) => item.id === job.orderId);
  if (!order || order.status !== ORDER_STATUS.WAITING_DRIVER) return error(res, 400, 'Job hanya bisa diambil saat order Menunggu Pengirim.');
  job.driverUserId = req.user.id;
  job.status = 'active';
  job.updatedAt = nowISO(db);
  order.driverUserId = req.user.id;
  statusPushWithDb(db, order, ORDER_STATUS.SHIPPING, 'Driver mengambil job dan mulai mengirim.');
  writeDb(db);
  res.json({ job: { ...job, order: exposeOrder(db, order) } });
});

app.post('/api/driver/jobs/:id/complete', authRequired, requireActiveRole('Driver'), (req, res) => {
  const db = readDb();
  const job = db.deliveryJobs.find((item) => item.id === req.params.id);
  if (!job) return error(res, 404, 'Job tidak ditemukan.');
  if (job.driverUserId !== req.user.id) return error(res, 403, 'Driver hanya boleh menyelesaikan job miliknya.');
  if (job.status !== 'active') return error(res, 400, 'Job tidak sedang aktif.');
  const order = db.orders.find((item) => item.id === job.orderId);
  if (!order || order.status !== ORDER_STATUS.SHIPPING) return error(res, 400, 'Order harus berstatus Sedang Dikirim.');
  job.status = 'completed';
  job.updatedAt = nowISO(db);
  order.completedAt = nowISO(db);
  statusPushWithDb(db, order, ORDER_STATUS.DONE, 'Driver mengonfirmasi pesanan selesai.');
  writeDb(db);
  res.json({ job: { ...job, order: exposeOrder(db, order) } });
});

app.get('/api/driver/reports', authRequired, requireActiveRole('Driver'), (req, res) => {
  const db = readDb();
  const jobs = db.deliveryJobs.filter((job) => job.driverUserId === req.user.id);
  const completed = jobs.filter((job) => job.status === 'completed');
  res.json({
    summary: {
      activeJobs: jobs.filter((job) => job.status === 'active').length,
      completedJobs: completed.length,
      earningRule: 'Pendapatan Driver = 80% dari delivery fee untuk job yang selesai.',
      totalEarnings: completed.reduce((sum, job) => sum + job.earning, 0)
    },
    jobs: jobs.map((job) => ({ ...job, order: exposeOrder(db, db.orders.find((order) => order.id === job.orderId)) }))
  });
});

// Admin monitoring, discounts, overdue
app.get('/api/admin/monitoring', authRequired, requireAdmin, (req, res) => {
  const db = readDb();
  const now = new Date(nowISO(db));
  const overdue = db.orders.filter((order) => ![ORDER_STATUS.DONE, ORDER_STATUS.RETURNED].includes(order.status) && order.dueAt && new Date(order.dueAt) < now);
  res.json({
    currentDate: db.system.currentDate,
    counts: {
      users: db.users.length,
      stores: db.stores.length,
      products: db.products.length,
      orders: db.orders.length,
      vouchers: db.vouchers.length,
      promos: db.promos.length,
      deliveryJobs: db.deliveryJobs.length,
      overdueOrders: overdue.length
    },
    users: db.users.map(publicUser),
    stores: db.stores,
    products: db.products.map((product) => decorateProduct(db, product)),
    orders: db.orders.map((order) => exposeOrder(db, order)),
    vouchers: db.vouchers,
    promos: db.promos,
    deliveryJobs: db.deliveryJobs,
    overdueOrders: overdue.map((order) => exposeOrder(db, order))
  });
});

function createDiscount(req, res, kind) {
  try {
    const db = readDb();
    const code = sanitizeText(req.body.code, 30).toUpperCase();
    const description = sanitizeText(req.body.description, 300);
    const amountType = sanitizeText(req.body.amountType || 'fixed', 20);
    const amount = assertPositiveNumber(req.body.amount, 'Nilai diskon', { min: 1, integer: true });
    const expiryDate = sanitizeText(req.body.expiryDate, 80);
    if (!code || !/^[A-Z0-9_-]{3,30}$/.test(code)) return error(res, 400, 'Kode diskon hanya boleh huruf besar, angka, underscore, atau dash, minimal 3 karakter.');
    if (!['fixed', 'percent'].includes(amountType)) return error(res, 400, 'amountType harus fixed atau percent.');
    if (amountType === 'percent' && amount > 100) return error(res, 400, 'Diskon persen maksimal 100.');
    if (!expiryDate || Number.isNaN(new Date(expiryDate).getTime())) return error(res, 400, 'expiryDate harus format tanggal valid.');
    if (db.vouchers.some((item) => item.code === code) || db.promos.some((item) => item.code === code)) return error(res, 409, 'Kode diskon sudah digunakan.');
    if (kind === 'voucher') {
      const remainingUsage = assertPositiveNumber(req.body.remainingUsage, 'Sisa penggunaan voucher', { min: 1, integer: true });
      const voucher = { id: createId('voucher'), code, description, amountType, amount, expiryDate: new Date(expiryDate).toISOString(), remainingUsage, createdAt: nowISO(db) };
      db.vouchers.push(voucher);
      writeDb(db);
      return res.status(201).json({ voucher });
    }
    const promo = { id: createId('promo'), code, description, amountType, amount, expiryDate: new Date(expiryDate).toISOString(), createdAt: nowISO(db) };
    db.promos.push(promo);
    writeDb(db);
    return res.status(201).json({ promo });
  } catch (err) {
    return error(res, 400, err.message);
  }
}

app.post('/api/admin/vouchers', authRequired, requireAdmin, (req, res) => createDiscount(req, res, 'voucher'));
app.post('/api/admin/promos', authRequired, requireAdmin, (req, res) => createDiscount(req, res, 'promo'));

app.get('/api/admin/vouchers', authRequired, requireAdmin, (_req, res) => {
  const db = readDb();
  res.json({ vouchers: db.vouchers });
});

app.get('/api/admin/promos', authRequired, requireAdmin, (_req, res) => {
  const db = readDb();
  res.json({ promos: db.promos });
});

app.post('/api/admin/simulate-next-day', authRequired, requireAdmin, (_req, res) => {
  const db = readDb();
  const date = new Date(nowISO(db));
  date.setDate(date.getDate() + 1);
  db.system.currentDate = date.toISOString();
  const returnedOrderIds = runOverdueHandling(db);
  writeDb(db);
  res.json({ currentDate: db.system.currentDate, returnedOrderIds, message: 'Simulasi next day berhasil dan overdue handling dijalankan.' });
});

app.post('/api/admin/run-overdue', authRequired, requireAdmin, (_req, res) => {
  const db = readDb();
  const returnedOrderIds = runOverdueHandling(db);
  writeDb(db);
  res.json({ currentDate: db.system.currentDate, returnedOrderIds });
});

app.get('/api/*', (_req, res) => error(res, 404, 'Endpoint API tidak ditemukan.'));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`SEAPEDIA running on http://localhost:${PORT}`);
  console.log(`Swagger API docs: http://localhost:${PORT}/api-docs`);
});

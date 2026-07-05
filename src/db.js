const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function nowISO(db) {
  return db?.system?.currentDate || new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function seedDatabase() {
  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync('password123', 10);
  const users = [
    { id: 'u_admin', username: 'admin', email: 'admin@seapedia.test', passwordHash, roles: ['Admin'], createdAt: now },
    { id: 'u_seller', username: 'seller', email: 'seller@seapedia.test', passwordHash, roles: ['Seller'], createdAt: now },
    { id: 'u_buyer', username: 'buyer', email: 'buyer@seapedia.test', passwordHash, roles: ['Buyer'], createdAt: now },
    { id: 'u_driver', username: 'driver', email: 'driver@seapedia.test', passwordHash, roles: ['Driver'], createdAt: now },
    { id: 'u_multirole', username: 'multi', email: 'multi@seapedia.test', passwordHash, roles: ['Buyer', 'Seller', 'Driver'], createdAt: now }
  ];

  const stores = [
    { id: 'store_tech', sellerUserId: 'u_seller', name: 'Nusantara Tech Store', description: 'Toko gadget dan aksesoris teknologi lokal.' },
    { id: 'store_multi', sellerUserId: 'u_multirole', name: 'Multi Role Mart', description: 'Toko demo milik akun multi-role.' }
  ];

  const products = [
    {
      id: 'prod_keyboard', storeId: 'store_tech', sellerUserId: 'u_seller',
      name: 'Mechanical Keyboard SEA Blue', description: 'Keyboard mechanical ringkas dengan switch tactile dan layout produktif.',
      price: 480000, stock: 20, imageUrl: 'https://placehold.co/800x500?text=Keyboard', createdAt: now
    },
    {
      id: 'prod_mouse', storeId: 'store_tech', sellerUserId: 'u_seller',
      name: 'Wireless Mouse Swift', description: 'Mouse wireless ringan untuk belajar, coding, dan desain.',
      price: 175000, stock: 35, imageUrl: 'https://placehold.co/800x500?text=Mouse', createdAt: now
    },
    {
      id: 'prod_headset', storeId: 'store_multi', sellerUserId: 'u_multirole',
      name: 'Headset Focus Pro', description: 'Headset nyaman dengan mikrofon noise reduction untuk meeting dan kelas online.',
      price: 325000, stock: 18, imageUrl: 'https://placehold.co/800x500?text=Headset', createdAt: now
    }
  ];

  return {
    system: { currentDate: now },
    users,
    stores,
    products,
    reviews: [
      { id: 'rev_1', name: 'Alya', rating: 5, comment: 'Marketplace-nya mudah dipahami dan tampilannya rapi.', createdAt: now },
      { id: 'rev_2', name: 'Bima', rating: 4, comment: 'Katalognya mudah dipakai dan proses checkout terasa jelas.', createdAt: now }
    ],
    wallets: [
      { userId: 'u_buyer', balance: 1500000 },
      { userId: 'u_multirole', balance: 1000000 }
    ],
    walletTransactions: [
      { id: 'trx_seed_buyer', userId: 'u_buyer', type: 'topup', amount: 1500000, note: 'Seed balance', createdAt: now },
      { id: 'trx_seed_multi', userId: 'u_multirole', type: 'topup', amount: 1000000, note: 'Seed balance', createdAt: now }
    ],
    addresses: [
      { id: 'addr_buyer_home', buyerUserId: 'u_buyer', label: 'Rumah', recipient: 'Buyer Demo', phone: '081234567890', address: 'Jl. Demo SEAPEDIA No. 18, Jakarta', isDefault: true }
    ],
    carts: [],
    orders: [],
    deliveryJobs: [],
    vouchers: [
      { id: 'voucher_seed', code: 'SEAHEMAT25K', description: 'Potongan voucher Rp25.000', amountType: 'fixed', amount: 25000, expiryDate: '2030-12-31T23:59:59.999Z', remainingUsage: 50, createdAt: now }
    ],
    promos: [
      { id: 'promo_seed', code: 'PROMO10', description: 'Promo diskon 10%', amountType: 'percent', amount: 10, expiryDate: '2030-12-31T23:59:59.999Z', createdAt: now }
    ]
  };
}

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(seedDatabase(), null, 2));
  }
}

function readDb() {
  ensureDatabase();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
  ensureDatabase();
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2));
  fs.renameSync(tempPath, DB_PATH);
}

function resetDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(seedDatabase(), null, 2));
}

module.exports = { readDb, writeDb, resetDb, createId, nowISO, DB_PATH };

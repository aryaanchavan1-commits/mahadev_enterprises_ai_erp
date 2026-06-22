const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'mahadev_erp.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let db = null;
let SQL = null;

async function getDb() {
  if (db) return db;

  const wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const wasmBinary = fs.readFileSync(wasmPath);
  SQL = await initSqlJs({ wasmBinary });

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_editable INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image TEXT DEFAULT '',
      quantity INTEGER DEFAULT 0,
      description TEXT DEFAULT '',
      hsn_code TEXT DEFAULT '',
      sell_price REAL DEFAULT 0,
      inward_price REAL DEFAULT 0,
      serial_number TEXT UNIQUE,
      discount_percent REAL DEFAULT 0,
      barcode TEXT UNIQUE,
      barcode_image TEXT DEFAULT '',
      category_id INTEGER,
      subcategory_id INTEGER,
      gst_rate REAL DEFAULT 18,
      supplier_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      party_type TEXT DEFAULT 'customer',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      gstin TEXT DEFAULT '',
      address TEXT DEFAULT '',
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
      pincode TEXT DEFAULT '',
      opening_balance REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      sale_date TEXT NOT NULL,
      customer_id INTEGER,
      customer_name TEXT DEFAULT 'Walk-in Customer',
      customer_phone TEXT DEFAULT '',
      customer_gstin TEXT DEFAULT '',
      customer_address TEXT DEFAULT '',
      items TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      discount_total REAL DEFAULT 0,
      cgst_total REAL DEFAULT 0,
      sgst_total REAL DEFAULT 0,
      igst_total REAL DEFAULT 0,
      cess_total REAL DEFAULT 0,
      grand_total REAL DEFAULT 0,
      payment_mode TEXT DEFAULT 'cash',
      is_barcode_scan INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      purchase_date TEXT NOT NULL,
      supplier_id INTEGER,
      supplier_name TEXT DEFAULT '',
      items TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      gst_total REAL DEFAULT 0,
      grand_total REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'paid',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      type TEXT,
      quantity_change INTEGER,
      reference TEXT,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(party_type)`);

  saveDb();

  // Seed default data
  const catCount = db.exec('SELECT COUNT(*) as c FROM categories');
  const count = catCount.length > 0 ? catCount[0].values[0][0] : 0;

  if (count === 0) {
    const settingsSeed = [
      ['company_name', 'Mahadev Enterprises'], ['company_address', ''],
      ['company_state', 'Maharashtra'], ['company_pincode', ''],
      ['company_gstin', ''], ['company_phone', ''], ['company_phone2', ''],
      ['company_email', ''], ['company_website', ''], ['company_pan', ''],
      ['company_logo', ''], ['gst_enabled', '1'],
      ['place_of_supply', 'Maharashtra'], ['reverse_charge', '0'],
      ['invoice_prefix', 'INV-'], ['gst_rate', '18'], ['cgst_rate', '9'],
      ['sgst_rate', '9'], ['igst_rate', '18'],
      ['printer_type', 'thermal'], ['printer_port', 'USB001'], ['scanner_mode', 'keyboard_wedge'],
      ['groq_api_key', ''], ['groq_model', 'llama-3.3-70b-versatile'],
      ['bank_name', ''], ['bank_account', ''], ['bank_ifsc', ''], ['bank_branch', ''], ['upi_id', ''],
      ['terms_conditions', ''], ['signature_text', 'Authorized Signatory'],
    ];
    for (const [k, v] of settingsSeed) {
      db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]);
    }
    saveDb();
  }

  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Convert sql.js result to array of objects
function toRows(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

// Helper: run a query and return rows
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

let lastId = 0;

// Helper: run a SQL and auto-save, returns lastInsertRowid
function run(sql, params = []) {
  db.run(sql, params);
  // Get rowid BEFORE saveDb (export) - sql.js export resets it
  const res = db.exec('SELECT last_insert_rowid()');
  lastId = (res.length > 0 && res[0].values.length > 0) ? res[0].values[0][0] : 0;
  saveDb();
  return lastId;
}

// Helper: get a single row
function get(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Helper: get all rows
function all(sql, params = []) {
  return query(sql, params);
}

// Helper: get last insert rowid (cached from last run())
function lastInsertRowid() {
  return lastId;
}

module.exports = { getDb, saveDb, query, run, get, all, lastInsertRowid, dataDir: DB_DIR };

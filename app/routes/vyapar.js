const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const { getDb, get, all, run, lastInsertRowid, saveDb, query } = require('../db');
const initSqlJs = require('sql.js');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const VYAPAR_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'vyapar_data');
try { fs.mkdirSync(VYAPAR_DIR, { recursive: true }); } catch (e) {}

const COMPANY_FIELDS = {
  firm_name: 'company_name',
  firm_address: 'company_address',
  firm_gstin_number: 'company_gstin',
  firm_phone: 'company_phone',
  firm_email: 'company_email',
  firm_pan: 'company_pan',
  firm_bank_name: 'bank_name',
  firm_bank_account_number: 'bank_account',
  firm_bank_ifsc_code: 'bank_ifsc',
  firm_upi_bank_account_number: 'upi_id',
};

const TXN_TYPE_MAP = { 1: 'sale', 2: 'purchase', 4: 'sales_return', 5: 'purchase_return', 7: 'payment_in', 8: 'payment_out' };
const ADJ_TYPE_MAP = { 1: 'in', 2: 'out', 3: 'adjustment' };

function safeStr(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s.toLowerCase() === 'nan' || s === 'none' ? '' : s;
}

function safeNum(v, def = 0) {
  if (v == null) return def;
  const n = parseFloat(v);
  return isNaN(n) || !isFinite(n) ? def : n;
}

function safeInt(v, def = 0) {
  return Math.round(safeNum(v, def));
}

function parseDate(v) {
  if (!v) return new Date().toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

async function loadVypFromVyb(vybPath) {
  if (!fs.existsSync(vybPath)) throw new Error('File not found: ' + vybPath);
  const stat = fs.statSync(vybPath);
  if (stat.size < 4) throw new Error('File too small to be valid');
  const fd = fs.openSync(vybPath, 'r');
  const headBuf = Buffer.alloc(4);
  fs.readSync(fd, headBuf, 0, 4, 0);
  fs.closeSync(fd);
  if (headBuf[0] !== 0x50 || headBuf[1] !== 0x4B) throw new Error('Not a valid .vyb (zip) file');

  const zip = new AdmZip(vybPath);
  const entries = zip.getEntries();
  const vypEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.vyp'));
  if (!vypEntry) throw new Error('No .vyp database found inside .vyb file');

  const tmpDir = path.join(VYAPAR_DIR, 'extracted');
  fs.mkdirSync(tmpDir, { recursive: true });
  const vypPath = path.join(tmpDir, 'data.vyp');
  fs.writeFileSync(vypPath, vypEntry.getData());
  return vypPath;
}

async function openVypDb(vypPath) {
  const wasmPath = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const wasmBinary = fs.readFileSync(wasmPath);
  const SQL = await initSqlJs({ wasmBinary });
  const buffer = fs.readFileSync(vypPath);
  return new SQL.Database(buffer);
}

function vypQuery(vypDb, sql, params = []) {
  try {
    const stmt = vypDb.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch (e) {
    return [];
  }
}

async function importFromVyp(vypDb, opts) {
  const result = {
    products: 0, categories: 0, customers: 0, suppliers: 0,
    sales: 0, purchases: 0, adjustments: 0, firm: false, errors: [],
  };

  try {
    // === FIRM ===
    if (opts.importFirm !== false) {
      try {
        const firms = vypQuery(vypDb, "SELECT * FROM kb_firms LIMIT 1");
        if (firms.length) {
          const f = firms[0];
          for (const [src, dst] of Object.entries(COMPANY_FIELDS)) {
            const val = safeStr(f[src]);
            if (!val) continue;
            run(
              "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
              [dst, val]
            );
          }
          result.firm = true;
        }
      } catch (e) { result.errors.push('Firm: ' + e.message); }

      // payment_terms, prefix, custom fields, etc.
      try {
        const kbs = vypQuery(vypDb, "SELECT * FROM kb_settings");
        const map = {};
        for (const r of kbs) {
          const k = safeStr(r.setting_key || r.key || r.name);
          const v = safeStr(r.setting_value || r.value);
          if (k && v && !map[k]) map[k] = v;
        }
        if (map.invoice_prefix) {
          run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", ['invoice_prefix', map.invoice_prefix]);
        }
      } catch (e) {}
    }

    // === CATEGORIES ===
    const catMap = {};
    try {
      const cats = vypQuery(vypDb, "SELECT * FROM kb_item_categories ORDER BY item_category_id");
      const existing = new Set(all("SELECT LOWER(name) as n FROM categories").map(r => r.n));
      for (const c of cats) {
        const name = safeStr(c.item_category_name);
        if (!name) continue;
        const key = name.toLowerCase();
        if (existing.has(key)) {
          const row = get("SELECT id FROM categories WHERE LOWER(name) = ?", [key]);
          if (row) catMap[safeInt(c.item_category_id)] = row.id;
          continue;
        }
        run("INSERT INTO categories (name) VALUES (?)", [name]);
        catMap[safeInt(c.item_category_id)] = lastInsertRowid();
        existing.add(key);
        result.categories++;
      }
    } catch (e) { result.errors.push('Categories: ' + e.message); }

    // === CATEGORY MAPPING (item -> category) ===
    const itemCategory = {};
    try {
      const maps = vypQuery(vypDb, "SELECT * FROM kb_item_categories_mapping");
      for (const m of maps) {
        const iid = safeInt(m.item_id);
        const cid = safeInt(m.category_id);
        if (iid && catMap[cid]) itemCategory[iid] = catMap[cid];
      }
    } catch (e) {}

    // === TAX MAP ===
    const taxMap = {};
    try {
      const tax = vypQuery(vypDb, "SELECT * FROM kb_tax_code");
      for (const t of tax) taxMap[safeInt(t.tax_code_id)] = safeNum(t.tax_rate, 18);
    } catch (e) {}

    // === PARTIES (customers + suppliers) ===
    const partyMap = {};
    try {
      const names = vypQuery(vypDb, "SELECT * FROM kb_names");
      const existingMobiles = new Set(all("SELECT phone FROM parties WHERE phone IS NOT NULL AND phone != ''").map(r => r.phone));
      for (const n of names) {
        const name = safeStr(n.full_name);
        if (!name) continue;
        const ntype = safeInt(n.name_type);
        const isSupplier = (ntype === 2 || ntype === 3);
        const partyType = isSupplier ? 'supplier' : 'customer';
        const phone = safeStr(n.phone_number) || '';
        if (phone && existingMobiles.has(phone)) {
          const row = get("SELECT id FROM parties WHERE phone = ?", [phone]);
          if (row) { partyMap[safeInt(n.name_id)] = row.id; continue; }
        }
        const existingByName = get("SELECT id FROM parties WHERE LOWER(name) = ? AND party_type = ?", [name.toLowerCase(), partyType]);
        if (existingByName) { partyMap[safeInt(n.name_id)] = existingByName.id; continue; }
        run(`INSERT INTO parties (name, party_type, phone, email, gstin, address, city, state, pincode)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            name, partyType, phone,
            safeStr(n.email),
            safeStr(n.name_gstin_number),
            safeStr(n.address),
            '',
            safeStr(n.name_state),
            safeStr(n.pincode),
          ]
        );
        const pid = lastInsertRowid();
        partyMap[safeInt(n.name_id)] = pid;
        if (phone) existingMobiles.add(phone);
        if (isSupplier) result.suppliers++; else result.customers++;
      }
    } catch (e) { result.errors.push('Parties: ' + e.message); }

    // === PRODUCTS ===
    const productMap = {};
    const productName = {};
    try {
      const items = vypQuery(vypDb, "SELECT * FROM kb_items WHERE item_is_active = 1");
      const existingNames = new Set(all("SELECT LOWER(name) as n FROM products").map(r => r.n));
      const existingBarcodes = new Set(all("SELECT barcode FROM products WHERE barcode IS NOT NULL AND barcode != ''").map(r => r.barcode));
      for (const it of items) {
        const name = safeStr(it.item_name);
        if (!name) continue;
        const iid = safeInt(it.item_id);
        productName[iid] = name;
        if (existingNames.has(name.toLowerCase())) {
          const row = get("SELECT id FROM products WHERE LOWER(name) = ?", [name.toLowerCase()]);
          if (row) { productMap[iid] = row.id; continue; }
        }
        let barcode = safeStr(it.item_code);
        if (barcode && existingBarcodes.has(barcode)) barcode = '';
        if (!barcode) barcode = `ME${Date.now()}${Math.floor(Math.random() * 999)}`;
        let sp = safeNum(it.item_sale_unit_price);
        const mrp = safeNum(it.item_mrp), wp = safeNum(it.item_wholesale_price), pp = safeNum(it.item_purchase_unit_price);
        if (sp <= 0) sp = mrp || wp || pp;
        const wholesale = wp || sp * 0.9;
        const gst = taxMap[safeInt(it.item_tax_id)] || 18;
        const cat = itemCategory[iid] || null;
        const qty = safeInt(it.item_stock_quantity);
        const ms = Math.max(1, safeInt(it.item_min_stock_quantity, 5));
        const hsn = safeStr(it.item_hsn_sac_code);
        const desc = safeStr(it.item_description);
        run(`INSERT INTO products (name, quantity, description, hsn_code, sell_price, wholesale_price, inward_price,
             serial_number, barcode, category_id, gst_rate, discount_percent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [name, qty, desc, hsn, sp, wholesale, pp, `ME-SN-${iid}-${Date.now()}`, barcode, cat, gst, 0]
        );
        productMap[iid] = lastInsertRowid();
        existingNames.add(name.toLowerCase());
        if (barcode) existingBarcodes.add(barcode);
        result.products++;
      }
    } catch (e) { result.errors.push('Products: ' + e.message); }

    // === TRANSACTIONS (sales + purchases) ===
    try {
      const txns = vypQuery(vypDb, "SELECT * FROM kb_transactions ORDER BY txn_date");
      const lineitems = vypQuery(vypDb, "SELECT * FROM kb_lineitems");
      const liMap = {};
      for (const li of lineitems) {
        const tid = safeInt(li.lineitem_txn_id);
        if (!liMap[tid]) liMap[tid] = [];
        liMap[tid].push(li);
      }
      const existingInv = new Set(all("SELECT invoice_number FROM sales").map(r => r.invoice_number));
      const existingPurchaseInv = new Set(all("SELECT invoice_number FROM purchases").map(r => r.invoice_number));

      for (const t of txns) {
        const ttype = safeInt(t.txn_type);
        if (ttype !== 1 && ttype !== 2) continue;
        const tid = safeInt(t.txn_id);
        const cash = safeNum(t.txn_cash_amount);
        const disc = safeNum(t.txn_discount_amount);
        const tax = safeNum(t.txn_tax_amount);
        const ref = safeStr(t.txn_ref_number_char);
        const prefix = safeStr(t.txn_invoice_prefix);
        const inv = `VYP-${prefix}${ref || tid}`;
        const nid = safeInt(t.txn_name_id);
        const customerId = partyMap[nid] || null;
        const date = parseDate(t.txn_date);
        const lines = liMap[tid] || [];
        const items = lines.map(li => ({
          product_id: productMap[safeInt(li.item_id)] || null,
          product_name: productName[safeInt(li.item_id)] || safeStr(li.item_name) || `Item #${li.item_id}`,
          quantity: safeInt(li.quantity, 1),
          unit_price: safeNum(li.priceperunit),
          gst_percentage: 18,
          hsn_code: safeStr(li.hsn_sac_code),
        }));
        const itemsJson = JSON.stringify(items);
        const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);

        if (ttype === 1) {
          if (existingInv.has(inv)) continue;
          run(`INSERT INTO sales (invoice_number, sale_date, customer_id, customer_name, customer_phone,
               customer_gstin, customer_address, items, subtotal, discount_total, cgst_total, sgst_total,
               grand_total, payment_mode, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [inv, date, customerId, '', '', '', '', itemsJson, subtotal, disc, tax / 2, tax / 2, cash, 'cash', 'Imported from Vyapar']
          );
          result.sales++;

          // stock movements
          for (const it of items) {
            if (it.product_id) {
              try {
                run("UPDATE products SET quantity = MAX(0, quantity - ?) WHERE id = ?", [it.quantity, it.product_id]);
                run("INSERT INTO stock_movements (product_id, type, quantity_change, reference, notes) VALUES (?, ?, ?, ?, ?)",
                  [it.product_id, 'sale', -it.quantity, inv, 'Imported from Vyapar']);
              } catch (e) {}
            }
          }
        } else if (ttype === 2) {
          if (existingPurchaseInv.has(inv)) continue;
          run(`INSERT INTO purchases (invoice_number, purchase_date, supplier_id, supplier_name, items,
               subtotal, gst_total, grand_total, payment_status, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [inv, date, customerId, '', itemsJson, subtotal, tax, cash, 'paid', 'Imported from Vyapar']
          );
          result.purchases++;

          for (const it of items) {
            if (it.product_id) {
              try {
                run("UPDATE products SET quantity = quantity + ? WHERE id = ?", [it.quantity, it.product_id]);
                run("INSERT INTO stock_movements (product_id, type, quantity_change, reference, notes) VALUES (?, ?, ?, ?, ?)",
                  [it.product_id, 'purchase', it.quantity, inv, 'Imported from Vyapar']);
              } catch (e) {}
            }
          }
        }
      }
    } catch (e) { result.errors.push('Transactions: ' + e.message); }

    // === STOCK ADJUSTMENTS ===
    try {
      const adjs = vypQuery(vypDb, "SELECT * FROM kb_item_adjustments");
      for (const a of adjs) {
        const iid = safeInt(a.item_adj_item_id);
        const pid = productMap[iid];
        if (!pid) continue;
        const atype = safeInt(a.item_adj_type);
        const qty = Math.abs(safeInt(a.item_adj_quantity));
        const t = ADJ_TYPE_MAP[atype] || 'adjustment';
        const sign = (atype === 2) ? -1 : 1;
        try {
          run("INSERT INTO stock_movements (product_id, type, quantity_change, reference, notes) VALUES (?, ?, ?, ?, ?)",
            [pid, t, sign * qty, `VYP-ADJ-${safeInt(a.item_adj_id)}`, safeStr(a.item_adj_description) || 'Vyapar adjustment']);
          if (atype !== 2) {
            run("UPDATE products SET quantity = MAX(0, quantity + ?) WHERE id = ?", [qty, pid]);
          } else {
            run("UPDATE products SET quantity = MAX(0, quantity - ?) WHERE id = ?", [qty, pid]);
          }
          result.adjustments++;
        } catch (e) {}
      }
    } catch (e) { result.errors.push('Adjustments: ' + e.message); }

    saveDb();
  } catch (e) {
    result.errors.push('General: ' + e.message);
  }
  return result;
}

router.get('/scan', async (req, res) => {
  try {
    const result = { found: false, files: [], xlsx: false, vyb: false, message: '' };
    if (fs.existsSync(VYAPAR_DIR)) {
      const files = fs.readdirSync(VYAPAR_DIR);
      for (const f of files) {
        if (f.endsWith('.vyb')) { result.found = true; result.vyb = true; result.files.push(f); }
      }
    }
    if (!result.found) {
      result.message = `No .vyb files found. Place Vyapar backup in ${VYAPAR_DIR}`;
    } else {
      // Get counts from first .vyb
      try {
        const vybPath = path.join(VYAPAR_DIR, result.files[0]);
        const vypPath = await loadVypFromVyb(vybPath);
        const vypDb = await openVypDb(vypPath);
        result.summary = {
          products: (vypQuery(vypDb, "SELECT COUNT(*) as c FROM kb_items WHERE item_is_active=1")[0] || {}).c || 0,
          categories: (vypQuery(vypDb, "SELECT COUNT(*) as c FROM kb_item_categories")[0] || {}).c || 0,
          parties: (vypQuery(vypDb, "SELECT COUNT(*) as c FROM kb_names")[0] || {}).c || 0,
          transactions: (vypQuery(vypDb, "SELECT COUNT(*) as c FROM kb_transactions")[0] || {}).c || 0,
          adjustments: (vypQuery(vypDb, "SELECT COUNT(*) as c FROM kb_item_adjustments")[0] || {}).c || 0,
          firm_name: ((vypQuery(vypDb, "SELECT firm_name FROM kb_firms LIMIT 1")[0]) || {}).firm_name || 'Unknown',
        };
        vypDb.close();
      } catch (e) { result.message = 'Found file but could not parse: ' + e.message; }
    }
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    await getDb();
    if (!fs.existsSync(VYAPAR_DIR)) return res.status(400).json({ success: false, error: 'No vyapar_data folder' });
    const vybFiles = fs.readdirSync(VYAPAR_DIR).filter(f => f.endsWith('.vyb'));
    if (!vybFiles.length) return res.status(400).json({ success: false, error: 'No .vyb file found' });
    const vybPath = path.join(VYAPAR_DIR, vybFiles[0]);
    const vypPath = await loadVypFromVyb(vybPath);
    const vypDb = await openVypDb(vypPath);
    const result = await importFromVyp(vypDb, { importFirm: true });
    vypDb.close();
    res.json({ success: true, message: 'Import complete', data: result, file: vybFiles[0] });
  } catch (e) {
    console.error('Vyapar import error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    if (!req.file.originalname.toLowerCase().endsWith('.vyb')) {
      return res.status(400).json({ success: false, error: 'Only .vyb files are supported' });
    }
    if (req.file.size > 200 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'File too large (max 200 MB)' });
    }
    if (req.file.size < 4 || req.file.buffer[0] !== 0x50 || req.file.buffer[1] !== 0x4B) {
      return res.status(400).json({ success: false, error: 'Invalid file (not a valid .vyb/zip)' });
    }
    await getDb();
    const safeName = req.file.originalname.replace(/[^A-Za-z0-9._-]/g, '_');
    const filePath = path.join(VYAPAR_DIR, safeName);
    fs.writeFileSync(filePath, req.file.buffer);
    const vypPath = await loadVypFromVyb(filePath);
    const vypDb = await openVypDb(vypPath);
    const result = await importFromVyp(vypDb, { importFirm: true });
    vypDb.close();
    res.json({ success: true, message: 'Import complete', data: result, file: safeName });
  } catch (e) {
    console.error('Vyapar upload import error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;

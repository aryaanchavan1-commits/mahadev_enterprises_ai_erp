const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

process.env.DATA_DIR = path.join(__dirname, 'app', 'data');

const server = spawn('node', ['server.js'], {
  cwd: path.join(__dirname, 'app'),
  stdio: 'pipe',
  env: process.env
});

server.stderr.on('data', (d) => { const s = d.toString(); if (s.toLowerCase().includes('error')) console.error('[ERR]', s.trim()); });

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', reject);
  });
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const d = JSON.stringify(body);
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    req.write(d);
    req.end();
  });
}

let ok = 0, fail = 0;
function check(name, pass, detail) { if (pass) { ok++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}: ${detail}`); } }

setTimeout(async () => {
  try {
    console.log('=== FULL END-TO-END TEST ===\n');

    // 1. SERVER
    console.log('--- SERVER ---');
    const h = await get('http://127.0.0.1:3000/api/health');
    check('Health check', h.name === 'Mahadev Enterprises ERP');

    // 1b. IMPORT VYAPAR DATA
    console.log('\n--- VYAPAR IMPORT ---');
    const vyScan = await get('http://127.0.0.1:3000/api/vyapar/scan');
    check('Vyapar scan', vyScan.success);
    if (vyScan.data?.found) {
      const importResult = await post('http://127.0.0.1:3000/api/vyapar/import', {});
      check('Vyapar import', importResult.success !== false, `products=${importResult.data?.products}`);
    }

    // 2. PRODUCTS
    console.log('\n--- PRODUCTS ---');
    const p1 = await get('http://127.0.0.1:3000/api/products?page=1&limit=50');
    check('Products load (paginated)', p1.data?.length === 50, `got=${p1.data?.length}`);
    check('Products total', p1.total > 2000, `total=${p1.total}`);
    const p2 = await get('http://127.0.0.1:3000/api/products?page=2&limit=50');
    check('Page 2 works', p2.data?.length === 50);
    const ps = await get('http://127.0.0.1:3000/api/products?search=WAGON&limit=10');
    check('Search works', ps.data?.length > 0);

    // 3. BARCODE
    console.log('\n--- BARCODE ---');
    const bc = await get(`http://127.0.0.1:3000/api/products/barcode/${p1.data[0].barcode}`);
    check('Barcode lookup', bc.success && bc.data?.barcode === p1.data[0].barcode);

    // 4. CATEGORIES
    console.log('\n--- CATEGORIES ---');
    const cats = await get('http://127.0.0.1:3000/api/categories');
    check('Categories list', cats.data?.length > 80);
    const newCat = await post('http://127.0.0.1:3000/api/categories', { name: 'TEST_CAT_' + Date.now() });
    check('Add category', newCat.success);
    if (newCat.success) {
      const newSub = await post(`http://127.0.0.1:3000/api/categories/${newCat.data.id}/subcategories`, { name: 'Test Sub' });
      check('Add subcategory', newSub.success);
      // Cleanup
      await new Promise(r => { const req = http.request({ hostname: '127.0.0.1', port: 3000, path: `/api/categories/${newCat.data.id}`, method: 'DELETE' }, res => { res.on('data', () => {}); res.on('end', r); }); req.end(); });
    }

    // 5. PARTIES
    console.log('\n--- PARTIES ---');
    const parties = await get('http://127.0.0.1:3000/api/parties');
    check('Parties loaded', parties.data?.length > 100);
    const newParty = await post('http://127.0.0.1:3000/api/parties', { name: 'Test Customer', party_type: 'customer', phone: '9999999999' });
    check('Add party', newParty.success);

    // 6. SETTINGS
    console.log('\n--- SETTINGS ---');
    const settings = await get('http://127.0.0.1:3000/api/settings');
    check('Settings company', settings.company_name === 'MAHADEV ENTERPRISES' || settings.data?.company_name === 'MAHADEV ENTERPRISES');
    check('Settings gst_enabled', settings.gst_enabled !== undefined || settings.data?.gst_enabled !== undefined);
    check('Settings bank fields', settings.bank_name !== undefined || settings.data?.bank_name !== undefined);

    // 7. SALES FLOW
    console.log('\n--- SALES FLOW ---');
    const prod = p1.data.find(x => x.quantity >= 10);
    if (prod) {
      // Non-GST sale
      const ngSale = await post('http://127.0.0.1:3000/api/sales', {
        items: [{ product_id: prod.id, product_name: prod.name, quantity: 2, sell_price: prod.sell_price, gst_percentage: 18 }],
        customer_name: 'Test Customer', customer_phone: '9999999999', payment_mode: 'cash', gst_enabled: false
      });
      check('Non-GST sale', ngSale.success && ngSale.data?.cgst_total === 0);

      // GST sale
      const gstSale = await post('http://127.0.0.1:3000/api/sales', {
        items: [{ product_id: prod.id, product_name: prod.name, quantity: 1, sell_price: prod.sell_price, gst_percentage: 18 }],
        customer_name: 'GST Customer', customer_gstin: '27AAAAA0000A1Z5', payment_mode: 'upi', gst_enabled: true
      });
      check('GST sale', gstSale.success, JSON.stringify(gstSale).substring(0, 100));
      check('Invoice number', !!gstSale.data?.invoice_number || !!gstSale.invoice_number);

      // Stock deducted
      const updated = await get(`http://127.0.0.1:3000/api/products/${prod.id}`);
      check('Stock deducted', updated.data?.quantity === prod.quantity - 3, `was=${prod.quantity} now=${updated.data?.quantity}`);

      // Receipt PDF
      const receiptUrl = `http://127.0.0.1:3000/api/sales/${gstSale.data?.id || 1}/receipt`;
      const receipt = await new Promise((resolve, reject) => {
        http.get(receiptUrl, (res) => {
          let data = '';
          res.on('data', (c) => data += c);
          res.on('end', () => resolve({ status: res.statusCode, isPdf: data.startsWith('%PDF') }));
        }).on('error', reject);
      });
      check('Receipt PDF', receipt.status === 200 && receipt.isPdf);

      // GST Bill PDF
      const gstBillUrl = `http://127.0.0.1:3000/api/gst/bill/${gstSale.data?.id || 1}`;
      const gstBill = await new Promise((resolve, reject) => {
        http.get(gstBillUrl, (res) => {
          let data = '';
          res.on('data', (c) => data += c);
          res.on('end', () => resolve({ status: res.statusCode, isPdf: data.startsWith('%PDF') }));
        }).on('error', reject);
      });
      check('GST Bill PDF', gstBill.status === 200 && gstBill.isPdf);
    }

    // 8. ACCOUNTING
    console.log('\n--- ACCOUNTING ---');
    const accounts = await get('http://127.0.0.1:3000/api/accounting/accounts');
    check('Chart of accounts', (accounts.data?.length || 0) >= 40, `count=${accounts.data?.length || 0}`);

    // Journal entry
    if (accounts.data?.length >= 2) {
      const je = await post('http://127.0.0.1:3000/api/accounting/journal', {
        entry_date: '2026-06-23', description: 'Test journal',
        lines: [
          { account_id: accounts.data.find(a => a.code === '1110')?.id, debit: 1000, credit: 0 },
          { account_id: accounts.data.find(a => a.code === '3110')?.id, debit: 0, credit: 1000 }
        ]
      });
      check('Journal entry', je.success);
    } else {
      check('Journal entry', false, 'No accounts found');
    }

    // Credit note
    const cn = await post('http://127.0.0.1:3000/api/accounting/credit-notes', {
      customer_name: 'Test', reason: 'Return', items: [{ product_id: prod?.id, product_name: 'Test', quantity: 1, unit_price: 100 }]
    });
    check('Credit note', cn.success);

    // Debit note
    const dn = await post('http://127.0.0.1:3000/api/accounting/debit-notes', {
      supplier_name: 'Test', reason: 'Return', items: [{ product_id: prod?.id, product_name: 'Test', quantity: 1, unit_price: 100 }]
    });
    check('Debit note', dn.success);

    // Trial balance
    const tb = await get('http://127.0.0.1:3000/api/accounting/trial-balance');
    check('Trial balance', tb.success);

    // P&L
    const pl = await get('http://127.0.0.1:3000/api/accounting/profit-loss');
    check('Profit & Loss', pl.success && pl.data?.netProfit !== undefined);

    // Balance sheet
    const bs = await get('http://127.0.0.1:3000/api/accounting/balance-sheet');
    check('Balance sheet', bs.success && bs.data?.totalAssets !== undefined);

    // Ledger
    const cashAcc = accounts.data.find(a => a.code === '1110');
    if (cashAcc) {
      const ledger = await get(`http://127.0.0.1:3000/api/accounting/ledger/${cashAcc.id}`);
      check('Ledger', ledger.success && ledger.data?.account?.code === '1110');
    }

    // 9. GST
    console.log('\n--- GST ---');
    const gstr1 = await get('http://127.0.0.1:3000/api/gst/gstr1');
    check('GSTR-1 data', gstr1.success && gstr1.data?.summary);

    const hsn = await get('http://127.0.0.1:3000/api/gst/hsn-summary');
    check('HSN summary', hsn.success && hsn.data?.hsn);

    // 10. AI
    console.log('\n--- AI ---');
    const aiStatus = await get('http://127.0.0.1:3000/api/ai/settings/api-key-status');
    check('AI status endpoint', typeof aiStatus === 'object');

    // 11. REPORTS
    console.log('\n--- REPORTS ---');
    const sales = await get('http://127.0.0.1:3000/api/sales');
    check('Sales list', sales.data?.length >= 23);

    // SUMMARY
    console.log('\n========================================');
    console.log(`  RESULT: ${ok} passed, ${fail} failed`);
    console.log('========================================');

    server.kill();
    process.exit(fail > 0 ? 1 : 0);
  } catch (e) {
    console.error('Error:', e.message);
    server.kill();
    process.exit(1);
  }
}, 5000);

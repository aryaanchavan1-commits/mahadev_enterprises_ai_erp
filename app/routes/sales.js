const express = require('express');
const router = express.Router();
const { get, all, run, lastInsertRowid } = require('../db');

router.get('/', (req, res) => {
  try {
    const { search, start_date, end_date } = req.query;
    let sql = 'SELECT * FROM sales WHERE 1=1'; const params = [];
    if (search) { sql += ' AND (invoice_number LIKE ? OR customer_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (start_date) { sql += ' AND sale_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND sale_date <= ?'; params.push(end_date); }
    sql += ' ORDER BY created_at DESC';
    const sales = all(sql, params);
    res.json({ success: true, data: sales.map(s => ({ ...s, items: JSON.parse(s.items || '[]') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const data = req.body;
    const items = data.items || [];
    if (items.length === 0) return res.status(400).json({ success: false, error: 'No items' });

    const prefix = get("SELECT value FROM settings WHERE key='invoice_prefix'")?.value || 'INV-';
    const invoiceNum = `${prefix}${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`;
    const saleDate = new Date().toISOString().split('T')[0];

    const gstEnabled = data.gst_enabled !== false && data.gst_enabled !== 'false' && data.gst_enabled !== '0';
    const gstRate = parseFloat(get("SELECT value FROM settings WHERE key='gst_rate'")?.value) || 18;
    const cgstRate = parseFloat(get("SELECT value FROM settings WHERE key='cgst_rate'")?.value) || gstRate / 2;
    const sgstRate = parseFloat(get("SELECT value FROM settings WHERE key='sgst_rate'")?.value) || gstRate / 2;
    const igstRate = parseFloat(get("SELECT value FROM settings WHERE key='igst_rate'")?.value) || gstRate;
    const companyGstin = get("SELECT value FROM settings WHERE key='company_gstin'")?.value || '';
    const companyState = (get("SELECT value FROM settings WHERE key='company_state'")?.value || '').toLowerCase();

    let subtotal = 0, discountTotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0, grandTotal = 0;

    for (const item of items) {
      const product = get('SELECT * FROM products WHERE id = ?', [item.product_id]);
      if (!product) continue;
      if (product.quantity < item.quantity) {
        return res.status(400).json({ success: false, error: `Insufficient stock for ${product.name}. Available: ${product.quantity}` });
      }
      const price = item.sell_price || item.unit_price || 0;
      const lineTotal = price * item.quantity;
      const lineDiscount = lineTotal * (item.discount_percent || 0) / 100;
      const afterDiscount = lineTotal - lineDiscount;

      let cgst = 0, sgst = 0, igst = 0;
      if (gstEnabled) {
        const custState = (data.customer_gstin || '').substring(0, 2);
        const compState = companyGstin.substring(0, 2);
        const isInterState = data.customer_gstin && custState !== compState;
        cgst = isInterState ? 0 : afterDiscount * (cgstRate / 100);
        sgst = isInterState ? 0 : afterDiscount * (sgstRate / 100);
        igst = isInterState ? afterDiscount * (igstRate / 100) : 0;
      }

      subtotal += lineTotal;
      discountTotal += lineDiscount;
      cgstTotal += cgst;
      sgstTotal += sgst;
      igstTotal += igst;
      grandTotal += afterDiscount + cgst + sgst + igst;
    }
    grandTotal = Math.round(grandTotal * 100) / 100;

    const enrichedItems = items.map(item => {
      const p = get('SELECT name, hsn_code FROM products WHERE id = ?', [item.product_id]);
      return { ...item, product_name: p?.name || '', hsn_code: p?.hsn_code || '' };
    });

    run(`INSERT INTO sales (invoice_number, sale_date, customer_name, customer_phone, customer_gstin, customer_address, items, subtotal, discount_total, cgst_total, sgst_total, igst_total, grand_total, payment_mode, billing_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [invoiceNum, saleDate, data.customer_name || 'Walk-in Customer', data.customer_phone || '', data.customer_gstin || '', data.customer_address || '', JSON.stringify(enrichedItems), subtotal, discountTotal, cgstTotal, sgstTotal, igstTotal, grandTotal, data.payment_mode || 'cash', data.billing_type || 'b2c']);

    for (const item of items) {
      run('UPDATE products SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.quantity, item.product_id]);
      run('INSERT INTO stock_movements (product_id, type, quantity_change, reference) VALUES (?, ?, ?, ?)', [item.product_id, 'sale', -item.quantity, invoiceNum]);
    }

    const sale = get('SELECT * FROM sales WHERE invoice_number = ?', [invoiceNum]);
    sale.items = JSON.parse(sale.items || '[]');
    res.json({ success: true, data: sale, message: 'Sale completed' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/:id/receipt', (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const sale = get('SELECT * FROM sales WHERE id = ?', [req.params.id]);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    sale.items = JSON.parse(sale.items || '[]');

    const s = {};
    const settingsRows = require('../db').all("SELECT key, value FROM settings");
    settingsRows.forEach(r => { s[r.key] = r.value; });

    const gstEnabled = sale.cgst_total > 0 || sale.sgst_total > 0 || sale.igst_total > 0;
    const isInvoice = gstEnabled && s.company_gstin;
    const billingType = sale.billing_type || 'b2c';
    const billingLabel = billingType === 'b2d' ? 'DISTRIBUTOR BILL' : billingType === 'b2b' ? 'BUSINESS BILL' : 'RETAIL BILL';

    // A4 for GST invoice, thermal for receipt
    const pageSize = isInvoice ? 'A4' : [226, 800];
    const margin = isInvoice ? 40 : 5;
    const doc = new PDFDocument({ size: pageSize, margin });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${isInvoice ? 'Invoice' : 'Receipt'}_${sale.invoice_number.replace(/\//g, '_')}.pdf"`);
      res.send(Buffer.concat(chunks));
    });

    const f = isInvoice ? 10 : 7;
    const fs = isInvoice ? 8 : 6;
    const fst = isInvoice ? 7 : 5;

    // HEADER - Company details
    doc.fontSize(isInvoice ? 14 : 9).font('Helvetica-Bold').text(s.company_name || 'Mahadev Enterprises', { align: 'center' });
    doc.font('Helvetica').fontSize(fs);
    if (s.company_address) doc.text(s.company_address, { align: 'center' });
    const phoneLine = [s.company_phone, s.company_phone2].filter(Boolean).join(' / ');
    if (phoneLine) doc.text(`Ph: ${phoneLine}`, { align: 'center' });
    if (s.company_email) doc.text(s.company_email, { align: 'center' });

    if (isInvoice) {
      doc.fontSize(10).font('Helvetica-Bold').text(`GSTIN: ${s.company_gstin}`, { align: 'center' });
      if (s.company_state) doc.fontSize(8).font('Helvetica').text(`State: ${s.company_state}`, { align: 'center' });
    } else if (!gstEnabled) {
      doc.fontSize(fs).text('Non-GST Invoice', { align: 'center' });
    }

    doc.moveDown(0.5);
    doc.fontSize(isInvoice ? 12 : 8).font('Helvetica-Bold').text(isInvoice ? 'TAX INVOICE' : 'RECEIPT', { align: 'center' });
    doc.moveDown(0.5);

    // INVOICE DETAILS
    doc.font('Helvetica').fontSize(fst);
    const leftX = isInvoice ? 40 : 5;
    const rightX = isInvoice ? 300 : 120;

    doc.text(`Invoice No: ${sale.invoice_number}`, leftX);
    doc.text(`Date: ${sale.sale_date}`, leftX);
    if (sale.customer_name && sale.customer_name !== 'Walk-in Customer') {
      doc.text(`Customer: ${sale.customer_name}`, leftX);
      if (sale.customer_phone) doc.text(`Phone: ${sale.customer_phone}`, leftX);
      if (sale.customer_gstin) doc.text(`Customer GSTIN: ${sale.customer_gstin}`, leftX);
      if (sale.customer_address) doc.text(`Address: ${sale.customer_address}`, leftX);
    }
    if (isInvoice && s.place_of_supply) doc.text(`Place of Supply: ${s.place_of_supply}`, leftX);
    if (isInvoice && s.reverse_charge === '1') doc.text('Reverse Charge: Yes', leftX);

    doc.moveDown(0.5);

    // ITEMS TABLE
    if (isInvoice) {
      // Full GST invoice table
      const tableTop = doc.y;
      const colWidths = [20, 180, 50, 60, 60, 60, 60];
      const headers = ['#', 'Description', 'HSN', 'Qty', 'Rate', 'Taxable', 'Tax'];
      let x = 40;

      doc.fontSize(7).font('Helvetica-Bold');
      headers.forEach((h, i) => { doc.text(h, x, tableTop, { width: colWidths[i], align: i === 1 ? 'left' : 'center' }); x += colWidths[i]; });
      doc.moveDown(0.3);
      doc.text('─'.repeat(90), 40);

      doc.font('Helvetica').fontSize(7);
      sale.items.forEach((item, idx) => {
        const y = doc.y;
        const price = item.sell_price || item.unit_price || 0;
        const lineTotal = price * item.quantity;
        const taxAmt = item.gst_amount || (lineTotal * (item.gst_percentage || 18) / 100);
        x = 40;
        doc.text(String(idx + 1), x, y, { width: colWidths[0], align: 'center' }); x += colWidths[0];
        doc.text(item.product_name || 'Product', x, y, { width: colWidths[1] }); x += colWidths[1];
        doc.text(item.hsn_code || '-', x, y, { width: colWidths[2], align: 'center' }); x += colWidths[2];
        doc.text(String(item.quantity), x, y, { width: colWidths[3], align: 'center' }); x += colWidths[3];
        doc.text(`Rs.${price.toFixed(2)}`, x, y, { width: colWidths[4], align: 'right' }); x += colWidths[4];
        doc.text(`Rs.${lineTotal.toFixed(2)}`, x, y, { width: colWidths[5], align: 'right' }); x += colWidths[5];
        doc.text(`Rs.${taxAmt.toFixed(2)}`, x, y, { width: colWidths[6], align: 'right' });
        doc.moveDown(0.3);
      });

      doc.text('─'.repeat(90), 40);
      doc.moveDown(0.3);

      // TAX SUMMARY
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Tax Summary:', 40);
      doc.font('Helvetica').fontSize(7);

      // Group by rate
      const taxByRate = {};
      sale.items.forEach(item => {
        const rate = item.gst_percentage || 18;
        if (!taxByRate[rate]) taxByRate[rate] = { taxable: 0, tax: 0 };
        const price = item.sell_price || item.unit_price || 0;
        const lineTotal = price * item.quantity;
        const discAmt = lineTotal * (item.discount_percent || 0) / 100;
        const taxable = lineTotal - discAmt;
        taxByRate[rate].taxable += taxable;
        taxByRate[rate].tax += taxable * (rate / 100);
      });

      Object.entries(taxByRate).forEach(([rate, vals]) => {
        const half = vals.tax / 2;
        if (sale.igst_total > 0) {
          doc.text(`  IGST @${rate}%: Rs.${vals.tax.toFixed(2)} (on Rs.${vals.taxable.toFixed(2)})`, 40);
        } else {
          doc.text(`  CGST @${(rate/2)}%: Rs.${half.toFixed(2)} | SGST @${(rate/2)}%: Rs.${half.toFixed(2)} (on Rs.${vals.taxable.toFixed(2)})`, 40);
        }
      });

      doc.moveDown(0.5);
    } else {
      // Simple receipt table
      doc.fontSize(fst).text('Item               Qty   Rate    Total');
      doc.text('─'.repeat(40));
      for (const item of sale.items) {
        const name = (item.product_name || 'Product').substring(0, 18).padEnd(18);
        const price = item.sell_price || item.unit_price || 0;
        const qty = String(item.quantity).padStart(3);
        const rate = String(price.toFixed(0)).padStart(5);
        const total = String((price * item.quantity).toFixed(2)).padStart(7);
        doc.text(`${name}${qty}${rate}${total}`);
      }
      doc.text('─'.repeat(40));
    }

    // TOTALS
    doc.fontSize(isInvoice ? 10 : 7);
    doc.text(`Sub Total: Rs.${sale.subtotal.toFixed(2)}`, leftX);
    if (sale.discount_total > 0) doc.text(`Discount: -Rs.${sale.discount_total.toFixed(2)}`, leftX);
    if (gstEnabled) {
      if (sale.cgst_total > 0) doc.text(`CGST: Rs.${sale.cgst_total.toFixed(2)}`, leftX);
      if (sale.sgst_total > 0) doc.text(`SGST: Rs.${sale.sgst_total.toFixed(2)}`, leftX);
      if (sale.igst_total > 0) doc.text(`IGST: Rs.${sale.igst_total.toFixed(2)}`, leftX);
    }

    doc.moveDown(0.3);
    doc.fontSize(isInvoice ? 12 : 9).font('Helvetica-Bold').text(`GRAND TOTAL: Rs.${sale.grand_total.toFixed(2)}`, leftX, doc.y, { align: isInvoice ? 'right' : 'left' });
    doc.moveDown(0.5);

    // AMOUNT IN WORDS
    const rupees = Math.floor(sale.grand_total);
    const paise = Math.round((sale.grand_total - rupees) * 100);
    const amountWords = `Rupees ${rupees} only${paise > 0 ? ` and ${paise} paise` : ''}`;
    doc.font('Helvetica').fontSize(fst).text(`Amount in Words: ${amountWords}`, leftX);

    doc.moveDown(0.5);

    // BANK DETAILS
    if (s.bank_name) {
      doc.font('Helvetica-Bold').fontSize(fst).text('Bank Details:', leftX);
      doc.font('Helvetica').fontSize(fst);
      if (s.bank_name) doc.text(`Bank: ${s.bank_name}`, leftX);
      if (s.bank_account) doc.text(`A/c No: ${s.bank_account}`, leftX);
      if (s.bank_ifsc) doc.text(`IFSC: ${s.bank_ifsc}`, leftX);
      if (s.bank_branch) doc.text(`Branch: ${s.bank_branch}`, leftX);
      if (s.upi_id) doc.text(`UPI: ${s.upi_id}`, leftX);
      doc.moveDown(0.5);
    }

    // TERMS
    if (s.terms_conditions) {
      doc.font('Helvetica-Bold').fontSize(fst).text('Terms & Conditions:', leftX);
      doc.font('Helvetica').fontSize(isInvoice ? 6 : 5).text(s.terms_conditions.substring(0, 500), leftX);
      doc.moveDown(0.5);
    }

    // SIGNATURE
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(fst);
    if (isInvoice) {
      doc.text('For ' + (s.company_name || 'Mahadev Enterprises'), 350, doc.y, { align: 'right' });
      doc.moveDown(2);
      doc.text(s.signature_text || 'Authorized Signatory', 350, doc.y, { align: 'right' });
    } else {
      doc.text(s.signature_text || 'Thank you! Visit again.', { align: 'center' });
    }

    doc.end();
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const sale = get('SELECT * FROM sales WHERE id = ?', [req.params.id]);
    if (!sale) return res.status(404).json({ success: false, error: 'Not found' });
    const items = JSON.parse(sale.items || '[]');
    for (const item of items) {
      run('UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.quantity, item.product_id]);
      run('INSERT INTO stock_movements (product_id, type, quantity_change, reference) VALUES (?, ?, ?, ?)', [item.product_id, 'sale_reversal', item.quantity, `REVERSED:${sale.invoice_number}`]);
    }
    run('DELETE FROM sales WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Sale reversed' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/stats/dashboard', (req, res) => {
  try {
    const totalProducts = get('SELECT COUNT(*) as c FROM products', []).c;
    const totalQuantity = get('SELECT COALESCE(SUM(quantity),0) as c FROM products', []).c;
    const lowStock = get('SELECT COUNT(*) as c FROM products WHERE quantity <= 5', []).c;
    const today = new Date().toISOString().split('T')[0];
    const todaySales = get('SELECT COALESCE(SUM(grand_total),0) as c FROM sales WHERE sale_date = ?', [today]).c;
    const totalSales = get('SELECT COUNT(*) as c FROM sales', []).c;
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const monthlyRevenue = get('SELECT COALESCE(SUM(grand_total),0) as c FROM sales WHERE sale_date >= ?', [firstOfMonth]).c;
    const recentSales = all('SELECT * FROM sales ORDER BY created_at DESC LIMIT 10').map(s => ({ ...s, items: JSON.parse(s.items || '[]') }));
    const stockMovements = all('SELECT sm.*, p.name as product_name FROM stock_movements sm LEFT JOIN products p ON sm.product_id = p.id ORDER BY sm.created_at DESC LIMIT 20');
    res.json({ success: true, data: { totalProducts, totalQuantity, lowStock, todaySales, totalSales, monthlyRevenue, recentSales, stockMovements } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;

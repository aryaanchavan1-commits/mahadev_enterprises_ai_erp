const express = require('express');
const router = express.Router();
const { get, all } = require('../db');
const PDFDocument = require('pdfkit');

function getSettings() {
  const s = {};
  all("SELECT key, value FROM settings").forEach(r => { s[r.key] = r.value; });
  return s;
}

function numberToWords(n) {
  if (n === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const sats = ['', 'Hundred', 'Thousand', 'Lakh', 'Crore'];
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + numberToWords(n % 100) : '');
  if (n < 100000) return numberToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numberToWords(n % 1000) : '');
  if (n < 10000000) return numberToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numberToWords(n % 100000) : '');
  return numberToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numberToWords(n % 10000000) : '');
}

// Perfect GST Tax Invoice (A4)
router.get('/bill/:saleId', (req, res) => {
  try {
    const sale = get('SELECT * FROM sales WHERE id = ?', [req.params.saleId]);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    sale.items = JSON.parse(sale.items || '[]');
    const s = getSettings();
    const gstEnabled = sale.cgst_total > 0 || sale.sgst_total > 0 || sale.igst_total > 0;
    const isIGST = sale.igst_total > 0;
    const billingType = sale.billing_type || 'b2c';
    const billingLabel = billingType === 'b2d' ? 'DISTRIBUTOR INVOICE' : billingType === 'b2b' ? 'TAX INVOICE' : 'RETAIL INVOICE';

    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Invoice_${sale.invoice_number.replace(/\//g, '_')}.pdf"`);
      res.send(Buffer.concat(chunks));
    });

    const W = 535; // usable width
    const L = 30;  // left margin
    const R = L + W; // right edge
    let y = 30;

    // ===== HEADER =====
    // Company name box
    doc.rect(L, y, W, 50).fill('#1a1a2e');
    doc.fill('#ffffff').fontSize(20).font('Helvetica-Bold').text(s.company_name || 'Mahadev Enterprises', L, y + 8, { width: W, align: 'center' });
    doc.fontSize(8).font('Helvetica');
    const addrLine = [s.company_address, s.company_city, s.company_state, s.company_pincode].filter(Boolean).join(', ');
    if (addrLine) doc.text(addrLine, L, y + 30, { width: W, align: 'center' });
    doc.fill('#000000');
    y += 55;

    // Contact + GSTIN row
    doc.rect(L, y, W, 25).fill('#f0f0f0');
    doc.fill('#000000').fontSize(7).font('Helvetica');
    const phoneLine = [s.company_phone, s.company_phone2].filter(Boolean).join(' / ');
    if (phoneLine) doc.text(`Ph: ${phoneLine}`, L + 5, y + 5);
    if (s.company_email) doc.text(`Email: ${s.company_email}`, L + 200, y + 5);
    if (gstEnabled && s.company_gstin) doc.fontSize(8).font('Helvetica-Bold').text(`GSTIN: ${s.company_gstin}`, L + 5, y + 15);
    if (s.company_state) doc.fontSize(7).font('Helvetica').text(`State: ${s.company_state}`, L + 200, y + 15);
    if (s.company_pan) doc.text(`PAN: ${s.company_pan}`, L + 380, y + 15);
    y += 30;

    // Invoice title
    doc.fontSize(14).font('Helvetica-Bold').fill('#1a1a2e').text(billingLabel, L, y, { width: W, align: 'center' });
    doc.fill('#000000');
    y += 25;

    // ===== INVOICE DETAILS =====
    doc.rect(L, y, W, 70).stroke('#cccccc');
    doc.fontSize(8).font('Helvetica-Bold');

    // Left column
    doc.text('Invoice No:', L + 5, y + 5);
    doc.text('Date:', L + 5, y + 18);
    doc.text('Payment Mode:', L + 5, y + 31);
    if (gstEnabled && s.place_of_supply) doc.text('Place of Supply:', L + 5, y + 44);
    if (s.reverse_charge === '1') doc.text('Reverse Charge:', L + 5, y + 57);

    doc.font('Helvetica').fontSize(8);
    doc.text(sale.invoice_number, L + 80, y + 5);
    doc.text(sale.sale_date, L + 80, y + 18);
    doc.text((sale.payment_mode || 'cash').toUpperCase(), L + 80, y + 31);
    if (gstEnabled && s.place_of_supply) doc.text(s.place_of_supply, L + 80, y + 44);
    if (s.reverse_charge === '1') doc.text('Yes', L + 80, y + 57);

    // Right column
    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('Customer:', L + 280, y + 5);
    doc.text('Phone:', L + 280, y + 18);
    if (sale.customer_gstin) doc.text('GSTIN:', L + 280, y + 31);
    if (sale.customer_address) doc.text('Address:', L + 280, y + 44);

    doc.font('Helvetica').fontSize(8);
    doc.text(sale.customer_name || 'Walk-in Customer', L + 340, y + 5);
    doc.text(sale.customer_phone || '-', L + 340, y + 18);
    if (sale.customer_gstin) doc.text(sale.customer_gstin, L + 340, y + 31);
    if (sale.customer_address) doc.text(sale.customer_address, L + 340, y + 44, { width: 160 });
    y += 75;

    // ===== ITEMS TABLE =====
    const cols = [
      { key: 'sno', label: '#', w: 25, align: 'center' },
      { key: 'desc', label: 'Description of Goods', w: 150, align: 'left' },
      { key: 'hsn', label: 'HSN/SAC', w: 50, align: 'center' },
      { key: 'qty', label: 'Qty', w: 30, align: 'center' },
      { key: 'unit', label: 'Unit', w: 30, align: 'center' },
      { key: 'rate', label: 'Rate', w: 50, align: 'right' },
      { key: 'disc', label: 'Disc%', w: 30, align: 'center' },
      { key: 'taxable', label: 'Taxable', w: 55, align: 'right' },
    ];

    if (isIGST) {
      cols.push({ key: 'igst', label: 'IGST', w: 55, align: 'right' });
    } else {
      cols.push({ key: 'cgst', label: 'CGST', w: 45, align: 'right' });
      cols.push({ key: 'sgst', label: 'SGST', w: 45, align: 'right' });
    }
    cols.push({ key: 'total', label: 'Total', w: 55, align: 'right' });

    // Table header
    let cx = L;
    doc.rect(L, y, W, 16).fill('#2c3e50');
    doc.fill('#ffffff').fontSize(6).font('Helvetica-Bold');
    cols.forEach(col => {
      doc.text(col.label, cx + 2, y + 4, { width: col.w - 4, align: col.align });
      cx += col.w;
    });
    doc.fill('#000000');
    y += 16;

    // Table rows
    sale.items.forEach((item, i) => {
      const price = item.sell_price || item.unit_price || 0;
      const lineTotal = price * item.quantity;
      const discAmt = lineTotal * (item.discount_percent || 0) / 100;
      const taxable = lineTotal - discAmt;
      const rate = item.gst_percentage || 18;
      const cgst = taxable * (rate / 2 / 100);
      const sgst = cgst;
      const igst = taxable * (rate / 100);
      const rowTotal = taxable + (isIGST ? igst : cgst + sgst);

      cx = L;
      doc.fontSize(6).font('Helvetica');

      // Alternate row shading
      if (i % 2 === 0) doc.rect(L, y, W, 14).fill('#f9f9f9');

      const rowData = {
        sno: String(i + 1),
        desc: (item.product_name || '').substring(0, 28),
        hsn: item.hsn_code || '-',
        qty: String(item.quantity),
        unit: 'NOS',
        rate: price.toFixed(2),
        disc: (item.discount_percent || 0).toString(),
        taxable: taxable.toFixed(2),
        cgst: cgst.toFixed(2),
        sgst: sgst.toFixed(2),
        igst: igst.toFixed(2),
        total: rowTotal.toFixed(2),
      };

      cols.forEach(col => {
        doc.fill('#000000').text(rowData[col.key] || '', cx + 2, y + 3, { width: col.w - 4, align: col.align });
        cx += col.w;
      });
      y += 14;
      doc.strokeColor('#eeeeee').moveTo(L, y).lineTo(R, y).stroke();
    });

    // Table border
    doc.strokeColor('#cccccc').rect(L, y - (sale.items.length * 14) - 16, W, (sale.items.length * 14) + 16).stroke();
    doc.strokeColor('#000000');
    y += 5;

    // ===== TOTALS =====
    const totalsX = R - 200;
    const valsX = R - 80;

    doc.fontSize(8).font('Helvetica');
    doc.text('Sub Total:', totalsX, y);
    doc.text(`Rs. ${sale.subtotal.toFixed(2)}`, valsX, y, { width: 75, align: 'right' });
    y += 14;

    if (sale.discount_total > 0) {
      doc.text('Discount:', totalsX, y);
      doc.text(`- Rs. ${sale.discount_total.toFixed(2)}`, valsX, y, { width: 75, align: 'right' });
      y += 14;
    }

    if (gstEnabled) {
      if (isIGST) {
        doc.text(`IGST:`, totalsX, y);
        doc.text(`Rs. ${sale.igst_total.toFixed(2)}`, valsX, y, { width: 75, align: 'right' });
      } else {
        doc.text(`CGST:`, totalsX, y);
        doc.text(`Rs. ${sale.cgst_total.toFixed(2)}`, valsX, y, { width: 75, align: 'right' });
        y += 14;
        doc.text(`SGST:`, totalsX, y);
        doc.text(`Rs. ${sale.sgst_total.toFixed(2)}`, valsX, y, { width: 75, align: 'right' });
      }
      y += 14;
    }

    // Grand total box
    doc.rect(totalsX - 5, y - 2, 185, 22).fill('#1a1a2e');
    doc.fill('#ffffff').fontSize(10).font('Helvetica-Bold').text('GRAND TOTAL:', totalsX, y + 3);
    doc.text(`Rs. ${sale.grand_total.toFixed(2)}`, valsX, y + 3, { width: 75, align: 'right' });
    doc.fill('#000000');
    y += 30;

    // Amount in words
    const rupees = Math.floor(sale.grand_total);
    const paise = Math.round((sale.grand_total - rupees) * 100);
    const words = `Rupees ${numberToWords(rupees)} only${paise > 0 ? ` and ${numberToWords(paise)} Paise` : ''}`;
    doc.fontSize(7).font('Helvetica-Bold').text('Amount in Words:', L + 5, y);
    doc.font('Helvetica').text(words, L + 80, y, { width: 400 });
    y += 20;

    // ===== TAX SUMMARY TABLE =====
    if (gstEnabled) {
      doc.fontSize(8).font('Helvetica-Bold').text('Tax Summary:', L + 5, y);
      y += 14;

      const taxCols = isIGST
        ? [{ label: 'Rate', w: 60 }, { label: 'Taxable', w: 100 }, { label: 'IGST', w: 100 }, { label: 'Total Tax', w: 100 }]
        : [{ label: 'Rate', w: 60 }, { label: 'Taxable', w: 100 }, { label: 'CGST', w: 80 }, { label: 'SGST', w: 80 }, { label: 'Total Tax', w: 80 }];

      cx = L;
      doc.rect(L, y, W, 14).fill('#f0f0f0');
      doc.fill('#000000').fontSize(7).font('Helvetica-Bold');
      taxCols.forEach(col => { doc.text(col.label, cx + 2, y + 3, { width: col.w - 4 }); cx += col.w; });
      y += 14;

      const taxByRate = {};
      sale.items.forEach(item => {
        const rate = item.gst_percentage || 18;
        if (!taxByRate[rate]) taxByRate[rate] = { taxable: 0, cgst: 0, sgst: 0 };
        const lt = (item.sell_price || item.unit_price || 0) * item.quantity;
        const da = lt * (item.discount_percent || 0) / 100;
        const tx = lt - da;
        taxByRate[rate].taxable += tx;
        taxByRate[rate].cgst += tx * (rate / 2 / 100);
        taxByRate[rate].sgst += tx * (rate / 2 / 100);
      });

      doc.font('Helvetica').fontSize(7);
      Object.entries(taxByRate).forEach(([rate, vals]) => {
        cx = L;
        if (isIGST) {
          doc.text(`${rate}%`, cx + 2, y, { width: 56 }); cx += 60;
          doc.text(vals.taxable.toFixed(2), cx + 2, y, { width: 96 }); cx += 100;
          doc.text((vals.cgst + vals.sgst).toFixed(2), cx + 2, y, { width: 96 }); cx += 100;
          doc.text((vals.cgst + vals.sgst).toFixed(2), cx + 2, y, { width: 96 });
        } else {
          doc.text(`${rate}%`, cx + 2, y, { width: 56 }); cx += 60;
          doc.text(vals.taxable.toFixed(2), cx + 2, y, { width: 96 }); cx += 100;
          doc.text(vals.cgst.toFixed(2), cx + 2, y, { width: 76 }); cx += 80;
          doc.text(vals.sgst.toFixed(2), cx + 2, y, { width: 76 }); cx += 80;
          doc.text((vals.cgst + vals.sgst).toFixed(2), cx + 2, y, { width: 76 });
        }
        y += 12;
      });
      y += 10;
    }

    // ===== BANK DETAILS + TERMS (side by side) =====
    const halfW = W / 2 - 10;
    const rightCol = L + halfW + 20;

    if (s.bank_name) {
      doc.fontSize(7).font('Helvetica-Bold').text('Bank Details:', L + 5, y);
      y += 10;
      doc.font('Helvetica').fontSize(7);
      if (s.bank_name) { doc.text(`Bank: ${s.bank_name}`, L + 5, y); y += 10; }
      if (s.bank_account) { doc.text(`A/c No: ${s.bank_account}`, L + 5, y); y += 10; }
      if (s.bank_ifsc) { doc.text(`IFSC: ${s.bank_ifsc}`, L + 5, y); y += 10; }
      if (s.bank_branch) { doc.text(`Branch: ${s.bank_branch}`, L + 5, y); y += 10; }
      if (s.upi_id) { doc.text(`UPI: ${s.upi_id}`, L + 5, y); y += 10; }
    }

    if (s.terms_conditions) {
      y += 5;
      doc.fontSize(7).font('Helvetica-Bold').text('Terms & Conditions:', L + 5, y);
      y += 10;
      doc.font('Helvetica').fontSize(6).text(s.terms_conditions, L + 5, y, { width: W - 10 });
      y += 30;
    }

    // ===== SIGNATURE =====
    y = Math.max(y, 720);
    doc.fontSize(8).font('Helvetica-Bold').text(`For ${s.company_name || 'Mahadev Enterprises'}`, R - 180, y, { width: 175, align: 'right' });
    y += 40;
    doc.fontSize(7).font('Helvetica').text(s.signature_text || 'Authorized Signatory', R - 180, y, { width: 175, align: 'right' });

    // Footer
    doc.fontSize(6).fillColor('#999999').text('This is a computer generated invoice', L, 800, { width: W, align: 'center' });
    doc.fillColor('#000000');

    doc.end();
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== RECEIPT (Thermal 80mm) =====
router.get('/receipt/:saleId', (req, res) => {
  try {
    const sale = get('SELECT * FROM sales WHERE id = ?', [req.params.saleId]);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    sale.items = JSON.parse(sale.items || '[]');
    const s = getSettings();
    const gstEnabled = sale.cgst_total > 0 || sale.sgst_total > 0 || sale.igst_total > 0;

    const doc = new PDFDocument({ size: [226, 800], margin: 5 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Receipt_${sale.invoice_number.replace(/\//g, '_')}.pdf"`);
      res.send(Buffer.concat(chunks));
    });

    let y = 5;

    // Shop name
    doc.fontSize(9).font('Helvetica-Bold').text(s.company_name || 'Mahadev Enterprises', 5, y, { width: 216, align: 'center' });
    y += 12;
    doc.fontSize(6).font('Helvetica');
    if (s.company_address) { doc.text(s.company_address, 5, y, { width: 216, align: 'center' }); y += 8; }
    const ph = [s.company_phone, s.company_phone2].filter(Boolean).join(' / ');
    if (ph) { doc.text(`Ph: ${ph}`, 5, y, { width: 216, align: 'center' }); y += 8; }
    if (gstEnabled && s.company_gstin) { doc.font('Helvetica-Bold').text(`GSTIN: ${s.company_gstin}`, 5, y, { width: 216, align: 'center' }); y += 8; doc.font('Helvetica'); }

    // Divider
    y += 2;
    doc.text('================================', 5, y); y += 8;

    // Invoice details
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text(`Invoice: ${sale.invoice_number}`, 5, y); y += 8;
    doc.text(`Date: ${sale.sale_date}`, 5, y); y += 8;
    if (sale.customer_name && sale.customer_name !== 'Walk-in Customer') {
      doc.text(`Customer: ${sale.customer_name}`, 5, y); y += 8;
      if (sale.customer_phone) { doc.text(`Phone: ${sale.customer_phone}`, 5, y); y += 8; }
      if (sale.customer_gstin) { doc.text(`GSTIN: ${sale.customer_gstin}`, 5, y); y += 8; }
    }
    doc.text(`Payment: ${(sale.payment_mode || 'cash').toUpperCase()}`, 5, y); y += 10;

    // Divider
    doc.text('================================', 5, y); y += 8;

    // Items header
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text('Item', 5, y);
    doc.text('Qty', 140, y, { width: 25, align: 'center' });
    doc.text('Rate', 165, y, { width: 30, align: 'right' });
    doc.text('Total', 195, y, { width: 26, align: 'right' });
    y += 8;
    doc.text('--------------------------------', 5, y); y += 8;

    // Items
    doc.font('Helvetica').fontSize(6);
    sale.items.forEach(item => {
      const name = (item.product_name || 'Item').substring(0, 22);
      const total = (item.sell_price || item.unit_price || 0) * item.quantity;
      doc.text(name, 5, y);
      doc.text(String(item.quantity), 140, y, { width: 25, align: 'center' });
      doc.text((item.sell_price || item.unit_price || 0).toFixed(0), 165, y, { width: 30, align: 'right' });
      doc.text(total.toFixed(2), 195, y, { width: 26, align: 'right' });
      y += 8;
    });

    // Divider
    doc.text('================================', 5, y); y += 8;

    // Totals
    doc.fontSize(6);
    doc.text('Subtotal:', 5, y);
    doc.text(sale.subtotal.toFixed(2), 165, y, { width: 56, align: 'right' });
    y += 8;

    if (sale.discount_total > 0) {
      doc.text('Discount:', 5, y);
      doc.text(`-${sale.discount_total.toFixed(2)}`, 165, y, { width: 56, align: 'right' });
      y += 8;
    }

    if (gstEnabled) {
      if (sale.cgst_total > 0) {
        doc.text('CGST:', 5, y);
        doc.text(sale.cgst_total.toFixed(2), 165, y, { width: 56, align: 'right' });
        y += 8;
        doc.text('SGST:', 5, y);
        doc.text(sale.sgst_total.toFixed(2), 165, y, { width: 56, align: 'right' });
        y += 8;
      }
      if (sale.igst_total > 0) {
        doc.text('IGST:', 5, y);
        doc.text(sale.igst_total.toFixed(2), 165, y, { width: 56, align: 'right' });
        y += 8;
      }
    }

    doc.text('================================', 5, y); y += 8;

    // Grand total
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('TOTAL:', 5, y);
    doc.text(`Rs.${sale.grand_total.toFixed(2)}`, 140, y, { width: 81, align: 'right' });
    y += 12;

    // Amount in words
    const rupees = Math.floor(sale.grand_total);
    const paise = Math.round((sale.grand_total - rupees) * 100);
    doc.fontSize(5).font('Helvetica').text(`Rs.${numberToWords(rupees)} only${paise > 0 ? ` ${paise}p` : ''}`, 5, y, { width: 216, align: 'center' });
    y += 10;

    // Bank details
    if (s.bank_name) {
      doc.text('================================', 5, y); y += 8;
      doc.fontSize(5).font('Helvetica-Bold').text('Bank Details:', 5, y); y += 7;
      doc.font('Helvetica').fontSize(5);
      if (s.bank_name) { doc.text(`Bank: ${s.bank_name}`, 5, y); y += 6; }
      if (s.bank_account) { doc.text(`A/c: ${s.bank_account}`, 5, y); y += 6; }
      if (s.bank_ifsc) { doc.text(`IFSC: ${s.bank_ifsc}`, 5, y); y += 6; }
      if (s.upi_id) { doc.text(`UPI: ${s.upi_id}`, 5, y); y += 6; }
    }

    // Terms
    if (s.terms_conditions) {
      y += 4;
      doc.fontSize(4).text(s.terms_conditions.substring(0, 150), 5, y, { width: 216, align: 'center' });
      y += 15;
    }

    // Footer
    y += 5;
    doc.text('================================', 5, y); y += 8;
    doc.fontSize(6).font('Helvetica-Bold').text('Thank you! Visit again.', 5, y, { width: 216, align: 'center' }); y += 8;
    doc.fontSize(5).font('Helvetica').text(s.company_name || 'Mahadev Enterprises', 5, y, { width: 216, align: 'center' });

    doc.end();
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== GSTR-1 =====
router.get('/gstr1', (req, res) => {
  try {
    const { month } = req.query;
    const today = new Date();
    const [y, m] = month ? month.split('-') : [today.getFullYear(), today.getMonth() + 1];
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
    const sales = all('SELECT * FROM sales WHERE sale_date >= ? AND sale_date <= ? ORDER BY sale_date', [startDate, endDate]);
    const s = getSettings();
    let b2b = [], b2c = [], hsnSummary = {};

    sales.forEach(sale => {
      const items = JSON.parse(sale.items || '[]');
      const entry = {
        invoice_number: sale.invoice_number, invoice_date: sale.sale_date,
        customer_name: sale.customer_name, customer_gstin: sale.customer_gstin || '',
        place_of_supply: s.place_of_supply || 'Maharashtra',
        reverse_charge: s.reverse_charge === '1' ? 'Y' : 'N', invoice_type: 'Regular',
        taxable_value: Math.round((sale.subtotal - sale.discount_total) * 100) / 100,
        cgst: Math.round(sale.cgst_total * 100) / 100, sgst: Math.round(sale.sgst_total * 100) / 100,
        igst: Math.round(sale.igst_total * 100) / 100, total: Math.round(sale.grand_total * 100) / 100,
      };
      if (sale.customer_gstin) b2b.push(entry); else b2c.push(entry);

      items.forEach(item => {
        const hsn = item.hsn_code || 'NA';
        if (!hsnSummary[hsn]) hsnSummary[hsn] = { hsn_code: hsn, description: item.product_name, qty: 0, taxable: 0, cgst: 0, sgst: 0, total: 0 };
        const lt = (item.sell_price || item.unit_price || 0) * item.quantity;
        const da = lt * (item.discount_percent || 0) / 100;
        const tx = lt - da;
        const rate = item.gst_percentage || 18;
        hsnSummary[hsn].qty += item.quantity;
        hsnSummary[hsn].taxable += tx;
        hsnSummary[hsn].cgst += tx * (rate / 2 / 100);
        hsnSummary[hsn].sgst += tx * (rate / 2 / 100);
        hsnSummary[hsn].total += tx + tx * (rate / 100);
      });
    });

    Object.values(hsnSummary).forEach(h => {
      h.taxable = Math.round(h.taxable * 100) / 100;
      h.cgst = Math.round(h.cgst * 100) / 100;
      h.sgst = Math.round(h.sgst * 100) / 100;
      h.total = Math.round(h.total * 100) / 100;
    });

    const summary = {
      period: `${startDate} to ${endDate}`, total_sales: sales.length,
      total_taxable: Math.round(sales.reduce((a, s) => a + s.subtotal - s.discount_total, 0) * 100) / 100,
      total_cgst: Math.round(sales.reduce((a, s) => a + s.cgst_total, 0) * 100) / 100,
      total_sgst: Math.round(sales.reduce((a, s) => a + s.sgst_total, 0) * 100) / 100,
      total_igst: Math.round(sales.reduce((a, s) => a + s.igst_total, 0) * 100) / 100,
    };

    res.json({ success: true, data: { summary, b2b, b2c, hsn_summary: Object.values(hsnSummary) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== GSTR-1 JSON Export =====
router.get('/gstr1/export', (req, res) => {
  try {
    const { month } = req.query;
    const today = new Date();
    const [y, m] = month ? month.split('-') : [today.getFullYear(), today.getMonth() + 1];
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
    const sales = all('SELECT * FROM sales WHERE sale_date >= ? AND sale_date <= ? ORDER BY sale_date', [startDate, endDate]);
    const s = getSettings();

    const gstr1 = { gstin: s.company_gstin || '', fp: `${String(m).padStart(2, '0')}${y}`, gt: 0, cur_gt: 0, b2b: [], b2cl: [], b2cs: [], hsn: { data: [] } };
    const b2bMap = {};

    sales.forEach(sale => {
      const items = JSON.parse(sale.items || '[]');
      const custGstin = (sale.customer_gstin || '').trim();
      const taxable = sale.subtotal - sale.discount_total;

      if (custGstin) {
        if (!b2bMap[custGstin]) b2bMap[custGstin] = { ctin: custGstin, inv: [] };
        b2bMap[custGstin].inv.push({
          inum: sale.invoice_number, idt: sale.sale_date, val: Math.round(sale.grand_total * 100) / 100,
          pos: (s.place_of_supply || 'Maharashtra').substring(0, 2), rchrg: s.reverse_charge === '1' ? 'Y' : 'N', inv_typ: 'R',
          itms: items.map((item, idx) => {
            const lt = (item.sell_price || item.unit_price || 0) * item.quantity;
            const da = lt * (item.discount_percent || 0) / 100;
            const tx = lt - da;
            const rate = item.gst_percentage || 18;
            return { num: idx + 1, itm_det: { rt: rate, txval: Math.round(tx * 100) / 100, iamt: Math.round(tx * rate / 100 * 100) / 100, camt: Math.round(tx * rate / 2 / 100 * 100) / 100, samt: Math.round(tx * rate / 2 / 100 * 100) / 100, csamt: 0 } };
          })
        });
      }
    });

    gstr1.b2b = Object.values(b2bMap);
    gstr1.gt = Math.round(sales.reduce((a, s) => a + s.grand_total, 0) * 100) / 100;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="GSTR1_${y}_${String(m).padStart(2, '0')}.json"`);
    res.json(gstr1);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== HSN Summary =====
router.get('/hsn-summary', (req, res) => {
  try {
    const { month } = req.query;
    const today = new Date();
    const [y, m] = month ? month.split('-') : [today.getFullYear(), today.getMonth() + 1];
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
    const sales = all('SELECT * FROM sales WHERE sale_date >= ? AND sale_date <= ?', [startDate, endDate]);

    const hsnMap = {};
    sales.forEach(sale => {
      const items = JSON.parse(sale.items || '[]');
      items.forEach(item => {
        const hsn = item.hsn_code || 'NA';
        if (!hsnMap[hsn]) hsnMap[hsn] = { hsn_code: hsn, description: item.product_name, qty: 0, taxable: 0, cgst: 0, sgst: 0, total: 0 };
        const lt = (item.sell_price || item.unit_price || 0) * item.quantity;
        const da = lt * (item.discount_percent || 0) / 100;
        const tx = lt - da;
        const rate = item.gst_percentage || 18;
        hsnMap[hsn].qty += item.quantity;
        hsnMap[hsn].taxable += tx;
        hsnMap[hsn].cgst += tx * (rate / 2 / 100);
        hsnMap[hsn].sgst += tx * (rate / 2 / 100);
        hsnMap[hsn].total += tx + tx * (rate / 100);
      });
    });

    const hsnData = Object.values(hsnMap).map(h => ({
      ...h, taxable: Math.round(h.taxable * 100) / 100, cgst: Math.round(h.cgst * 100) / 100,
      sgst: Math.round(h.sgst * 100) / 100, total: Math.round(h.total * 100) / 100,
    })).sort((a, b) => b.total - a.total);

    res.json({ success: true, data: { period: `${startDate} to ${endDate}`, hsn: hsnData } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== GST Report =====
router.get('/report', (req, res) => {
  try {
    const { start_date, end_date, month } = req.query;
    let where = '1=1'; const params = [];
    if (start_date) { where += ' AND sale_date >= ?'; params.push(start_date); }
    if (end_date) { where += ' AND sale_date <= ?'; params.push(end_date); }
    if (month) {
      const [y, m] = month.split('-');
      where += ' AND sale_date >= ? AND sale_date <= ?';
      params.push(`${y}-${String(m).padStart(2, '0')}-01`);
      params.push(`${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`);
    }
    const sales = all(`SELECT * FROM sales WHERE ${where} ORDER BY created_at DESC`, params);
    res.json({ success: true, data: { totalSales: sales.length, totalRevenue: sales.reduce((s, sa) => s + sa.grand_total, 0), sales: sales.map(s => ({ ...s, items: JSON.parse(s.items || '[]') })) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;

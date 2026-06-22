const express = require('express');
const router = express.Router();
const { get, all } = require('../db');
const PDFDocument = require('pdfkit');

function getSettings() {
  const s = {};
  all("SELECT key, value FROM settings").forEach(r => { s[r.key] = r.value; });
  return s;
}

// GST Invoice PDF (A4 format)
router.get('/bill/:saleId', (req, res) => {
  try {
    const sale = get('SELECT * FROM sales WHERE id = ?', [req.params.saleId]);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    sale.items = JSON.parse(sale.items || '[]');

    const s = getSettings();
    const gstEnabled = sale.cgst_total > 0 || sale.sgst_total > 0 || sale.igst_total > 0;

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="GST_Invoice_${sale.invoice_number.replace(/\//g, '_')}.pdf"`);
      res.send(Buffer.concat(chunks));
    });

    // HEADER
    doc.fontSize(16).font('Helvetica-Bold').text(s.company_name || 'Mahadev Enterprises', { align: 'center' });
    doc.fontSize(8).font('Helvetica');
    if (s.company_address) doc.text(s.company_address, { align: 'center' });
    const phoneLine = [s.company_phone, s.company_phone2].filter(Boolean).join(' / ');
    if (phoneLine) doc.text(`Ph: ${phoneLine}`, { align: 'center' });
    if (s.company_email) doc.text(s.company_email, { align: 'center' });

    if (gstEnabled && s.company_gstin) {
      doc.fontSize(10).font('Helvetica-Bold').text(`GSTIN: ${s.company_gstin}`, { align: 'center' });
      if (s.company_state) doc.fontSize(8).font('Helvetica').text(`State: ${s.company_state}`, { align: 'center' });
    }

    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' });
    doc.moveDown(0.5);

    // INVOICE DETAILS BOX
    const boxY = doc.y;
    doc.rect(40, boxY, 515, 80).stroke();
    doc.fontSize(8).font('Helvetica-Bold');

    doc.text(`Invoice No: ${sale.invoice_number}`, 50, boxY + 5);
    doc.text(`Date: ${sale.sale_date}`, 50, boxY + 18);
    doc.text(`Payment: ${(sale.payment_mode || 'cash').toUpperCase()}`, 50, boxY + 31);
    if (s.place_of_supply) doc.text(`Place of Supply: ${s.place_of_supply}`, 50, boxY + 44);
    if (s.reverse_charge === '1') doc.text('Reverse Charge: Yes', 50, boxY + 57);

    doc.text(`Customer: ${sale.customer_name}`, 320, boxY + 5);
    if (sale.customer_gstin) doc.text(`GSTIN: ${sale.customer_gstin}`, 320, boxY + 18);
    if (sale.customer_phone) doc.text(`Phone: ${sale.customer_phone}`, 320, boxY + 31);
    if (sale.customer_address) doc.text(`Address: ${sale.customer_address}`, 320, boxY + 44);

    doc.moveDown(4);

    // ITEMS TABLE
    const tableTop = doc.y;
    const cols = { sno: 30, desc: 150, hsn: 55, qty: 35, rate: 55, disc: 35, taxable: 60, cgst: 45, sgst: 45, total: 55 };
    let cx = 40;
    const colX = {};
    for (const [k, w] of Object.entries(cols)) { colX[k] = cx; cx += w; }

    doc.rect(40, tableTop, cx - 40, 18).fill('#2c3e50');
    doc.fill('#ffffff').fontSize(7).font('Helvetica-Bold');
    doc.text('#', colX.sno + 2, tableTop + 4);
    doc.text('Description', colX.desc + 2, tableTop + 4);
    doc.text('HSN/SAC', colX.hsn + 2, tableTop + 4);
    doc.text('Qty', colX.qty + 2, tableTop + 4);
    doc.text('Rate', colX.rate + 2, tableTop + 4);
    doc.text('Disc%', colX.disc + 2, tableTop + 4);
    doc.text('Taxable', colX.taxable + 2, tableTop + 4);
    doc.text('CGST', colX.cgst + 2, tableTop + 4);
    doc.text('SGST', colX.sgst + 2, tableTop + 4);
    doc.text('Total', colX.total + 2, tableTop + 4);
    doc.fill('#000000').font('Helvetica');

    let y = tableTop + 20;
    sale.items.forEach((item, i) => {
      const lineTotal = item.sell_price * item.quantity;
      const discAmt = lineTotal * (item.discount_percent || 0) / 100;
      const taxable = lineTotal - discAmt;
      const cgst = taxable * ((item.gst_percentage || 18) / 2 / 100);
      const sgst = cgst;
      doc.fontSize(7);
      doc.text(String(i + 1), colX.sno + 2, y + 2);
      doc.text((item.product_name || '').substring(0, 22), colX.desc + 2, y + 2);
      doc.text(item.hsn_code || '-', colX.hsn + 2, y + 2);
      doc.text(String(item.quantity), colX.qty + 2, y + 2);
      doc.text(item.sell_price.toFixed(2), colX.rate + 2, y + 2);
      doc.text((item.discount_percent || 0).toFixed(0), colX.disc + 2, y + 2);
      doc.text(taxable.toFixed(2), colX.taxable + 2, y + 2);
      doc.text(cgst.toFixed(2), colX.cgst + 2, y + 2);
      doc.text(sgst.toFixed(2), colX.sgst + 2, y + 2);
      doc.text((taxable + cgst + sgst).toFixed(2), colX.total + 2, y + 2);
      y += 16;
      doc.moveTo(40, y).lineTo(cx, y).stroke('#cccccc');
      if (y > 700) { doc.addPage(); y = 50; }
    });

    y += 10;

    // TAX SUMMARY
    doc.fontSize(8).font('Helvetica-Bold').text('Tax Breakup:', 40, y);
    y += 14;
    doc.font('Helvetica').fontSize(7);

    const taxByRate = {};
    sale.items.forEach(item => {
      const rate = item.gst_percentage || 18;
      if (!taxByRate[rate]) taxByRate[rate] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      const lineTotal = item.sell_price * item.quantity;
      const discAmt = lineTotal * (item.discount_percent || 0) / 100;
      const taxable = lineTotal - discAmt;
      taxByRate[rate].taxable += taxable;
      taxByRate[rate].cgst += taxable * (rate / 2 / 100);
      taxByRate[rate].sgst += taxable * (rate / 2 / 100);
    });

    Object.entries(taxByRate).forEach(([rate, vals]) => {
      if (sale.igst_total > 0) {
        doc.text(`  IGST @${rate}%: Rs.${(vals.cgst + vals.sgst).toFixed(2)} on Rs.${vals.taxable.toFixed(2)}`, 40, y);
      } else {
        doc.text(`  CGST @${rate/2}%: Rs.${vals.cgst.toFixed(2)} | SGST @${rate/2}%: Rs.${vals.sgst.toFixed(2)} on Rs.${vals.taxable.toFixed(2)}`, 40, y);
      }
      y += 12;
    });

    y += 10;

    // TOTALS
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Sub Total:', 330, y); doc.text(`Rs. ${sale.subtotal.toFixed(2)}`, 450, y); y += 14;
    if (sale.discount_total > 0) { doc.text('Discount:', 330, y); doc.text(`- Rs. ${sale.discount_total.toFixed(2)}`, 450, y); y += 14; }
    if (sale.cgst_total > 0) { doc.text('CGST:', 330, y); doc.text(`Rs. ${sale.cgst_total.toFixed(2)}`, 450, y); y += 14; }
    if (sale.sgst_total > 0) { doc.text('SGST:', 330, y); doc.text(`Rs. ${sale.sgst_total.toFixed(2)}`, 450, y); y += 14; }
    if (sale.igst_total > 0) { doc.text('IGST:', 330, y); doc.text(`Rs. ${sale.igst_total.toFixed(2)}`, 450, y); y += 14; }

    doc.rect(320, y, 240, 22).fill('#2c3e50');
    doc.fill('#ffffff').text('GRAND TOTAL:', 330, y + 5); doc.text(`Rs. ${sale.grand_total.toFixed(2)}`, 450, y + 5);
    doc.fill('#000000');
    y += 35;

    // AMOUNT IN WORDS
    const rupees = Math.floor(sale.grand_total);
    const paise = Math.round((sale.grand_total - rupees) * 100);
    doc.fontSize(7).font('Helvetica').text(`Amount in Words: Rupees ${rupees} only${paise > 0 ? ` and ${paise} paise` : ''}`, 40, y);
    y += 20;

    // BANK DETAILS
    if (s.bank_name) {
      doc.fontSize(8).font('Helvetica-Bold').text('Bank Details:', 40, y); y += 12;
      doc.font('Helvetica').fontSize(7);
      if (s.bank_name) { doc.text(`Bank: ${s.bank_name}`, 40, y); y += 10; }
      if (s.bank_account) { doc.text(`A/c No: ${s.bank_account}`, 40, y); y += 10; }
      if (s.bank_ifsc) { doc.text(`IFSC: ${s.bank_ifsc}`, 40, y); y += 10; }
      if (s.upi_id) { doc.text(`UPI: ${s.upi_id}`, 40, y); y += 10; }
    }

    // TERMS
    if (s.terms_conditions) {
      y += 10;
      doc.fontSize(7).font('Helvetica-Bold').text('Terms & Conditions:', 40, y); y += 10;
      doc.font('Helvetica').fontSize(6).text(s.terms_conditions, 40, y, { width: 300 });
    }

    // SIGNATURE
    doc.fontSize(8).font('Helvetica-Bold').text(`For ${s.company_name || 'Mahadev Enterprises'}`, 370, 700);
    doc.moveDown(2);
    doc.text(s.signature_text || 'Authorized Signatory', 370, doc.y);

    doc.end();
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GST Report
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
    const totalRevenue = sales.reduce((s, sa) => s + sa.grand_total, 0);
    const totalCgst = sales.reduce((s, sa) => s + sa.cgst_total, 0);
    const totalSgst = sales.reduce((s, sa) => s + sa.sgst_total, 0);
    const totalIgst = sales.reduce((s, sa) => s + sa.igst_total, 0);
    res.json({ success: true, data: { totalSales: sales.length, totalRevenue, totalCgst, totalSgst, totalIgst, totalGst: totalCgst + totalSgst + totalIgst, sales: sales.map(s => ({ ...s, items: JSON.parse(s.items || '[]') })) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GSTR-1 Data (B2B + B2C)
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
        invoice_number: sale.invoice_number,
        invoice_date: sale.sale_date,
        customer_name: sale.customer_name,
        customer_gstin: sale.customer_gstin || '',
        place_of_supply: s.place_of_supply || 'Maharashtra',
        reverse_charge: s.reverse_charge === '1' ? 'Y' : 'N',
        invoice_type: 'Regular',
        taxable_value: Math.round((sale.subtotal - sale.discount_total) * 100) / 100,
        cgst: Math.round(sale.cgst_total * 100) / 100,
        sgst: Math.round(sale.sgst_total * 100) / 100,
        igst: Math.round(sale.igst_total * 100) / 100,
        total: Math.round(sale.grand_total * 100) / 100,
      };

      if (sale.customer_gstin) b2b.push(entry); else b2c.push(entry);

      // HSN summary
      items.forEach(item => {
        const hsn = item.hsn_code || 'NA';
        if (!hsnSummary[hsn]) hsnSummary[hsn] = { hsn_code: hsn, description: item.product_name, uom: 'NOS', qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        const lineTotal = item.sell_price * item.quantity;
        const discAmt = lineTotal * (item.discount_percent || 0) / 100;
        const taxable = lineTotal - discAmt;
        hsnSummary[hsn].qty += item.quantity;
        hsnSummary[hsn].taxable += taxable;
        hsnSummary[hsn].cgst += taxable * ((item.gst_percentage || 18) / 2 / 100);
        hsnSummary[hsn].sgst += taxable * ((item.gst_percentage || 18) / 2 / 100);
        hsnSummary[hsn].total += taxable + taxable * ((item.gst_percentage || 18) / 100);
      });
    });

    // Round HSN values
    Object.values(hsnSummary).forEach(h => {
      h.taxable = Math.round(h.taxable * 100) / 100;
      h.cgst = Math.round(h.cgst * 100) / 100;
      h.sgst = Math.round(h.sgst * 100) / 100;
      h.igst = Math.round(h.igst * 100) / 100;
      h.total = Math.round(h.total * 100) / 100;
    });

    const summary = {
      period: `${startDate} to ${endDate}`,
      total_sales: sales.length,
      total_taxable: Math.round(sales.reduce((a, s) => a + s.subtotal - s.discount_total, 0) * 100) / 100,
      total_cgst: Math.round(sales.reduce((a, s) => a + s.cgst_total, 0) * 100) / 100,
      total_sgst: Math.round(sales.reduce((a, s) => a + s.sgst_total, 0) * 100) / 100,
      total_igst: Math.round(sales.reduce((a, s) => a + s.igst_total, 0) * 100) / 100,
    };

    res.json({ success: true, data: { summary, b2b, b2c, hsn_summary: Object.values(hsnSummary) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GSTR-1 JSON Export (for GST portal upload)
router.get('/gstr1/export', (req, res) => {
  try {
    const { month } = req.query;
    const today = new Date();
    const [y, m] = month ? month.split('-') : [today.getFullYear(), today.getMonth() + 1];
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
    const sales = all('SELECT * FROM sales WHERE sale_date >= ? AND sale_date <= ? ORDER BY sale_date', [startDate, endDate]);

    const s = getSettings();
    const gstin = s.company_gstin || '';

    // GSTR-1 JSON format
    const gstr1 = {
      gstin: gstin,
      fp: `${String(m).padStart(2, '0')}${y}`,
      gt: 0,
      cur_gt: 0,
      b2b: [],
      b2cl: [],
      b2cs: [],
      hsn: { data: [] }
    };

    const b2bMap = {};
    const b2csList = [];
    const hsnMap = {};

    sales.forEach(sale => {
      const items = JSON.parse(sale.items || '[]');
      const custGstin = (sale.customer_gstin || '').trim();
      const taxable = sale.subtotal - sale.discount_total;

      if (custGstin) {
        // B2B (registered buyer)
        if (!b2bMap[custGstin]) b2bMap[custGstin] = { ctin: custGstin, inv: [] };
        b2bMap[custGstin].inv.push({
          inum: sale.invoice_number,
          idt: sale.sale_date,
          val: Math.round(sale.grand_total * 100) / 100,
          pos: (s.place_of_supply || 'Maharashtra').substring(0, 2),
          rchrg: s.reverse_charge === '1' ? 'Y' : 'N',
          inv_typ: 'R',
          itms: items.map((item, idx) => {
            const lt = item.sell_price * item.quantity;
            const da = lt * (item.discount_percent || 0) / 100;
            const tx = lt - da;
            const rate = item.gst_percentage || 18;
            return {
              num: idx + 1,
              itm_det: {
                rt: rate,
                txval: Math.round(tx * 100) / 100,
                iamt: Math.round(tx * (rate / 100) * 100) / 100,
                camt: Math.round(tx * (rate / 2 / 100) * 100) / 100,
                samt: Math.round(tx * (rate / 2 / 100) * 100) / 100,
                csamt: 0
              }
            };
          })
        });
      } else if (taxable > 250000) {
        // B2CL (large unregistered)
        gstr1.b2cl.push({
          pos: (s.place_of_supply || 'Maharashtra').substring(0, 2),
          inv: [{
            inum: sale.invoice_number,
            idt: sale.sale_date,
            val: Math.round(sale.grand_total * 100) / 100,
            itms: items.map((item, idx) => {
              const lt = item.sell_price * item.quantity;
              const da = lt * (item.discount_percent || 0) / 100;
              const tx = lt - da;
              const rate = item.gst_percentage || 18;
              return {
                num: idx + 1,
                itm_det: { rt: rate, txval: Math.round(tx * 100) / 100, iamt: Math.round(tx * rate / 100 * 100) / 100 }
              };
            })
          }]
        });
      } else {
        // B2CS (small unregistered)
        items.forEach(item => {
          const lt = item.sell_price * item.quantity;
          const da = lt * (item.discount_percent || 0) / 100;
          const tx = lt - da;
          const rate = item.gst_percentage || 18;
          b2csList.push({
            sply_ty: 'INTRA',
            pos: (s.place_of_supply || 'Maharashtra').substring(0, 2),
            typ: 'OE',
            rt: rate,
            txval: Math.round(tx * 100) / 100,
            camt: Math.round(tx * (rate / 2 / 100) * 100) / 100,
            samt: Math.round(tx * (rate / 2 / 100) * 100) / 100,
            csamt: 0
          });
        });
      }

      // HSN
      items.forEach(item => {
        const hsn = item.hsn_code || 'NA';
        if (!hsnMap[hsn]) hsnMap[hsn] = { num: Object.keys(hsnMap).length + 1, hsn_sc: hsn, desc: item.product_name, uqc: 'NOS', qty: 0, val: 0, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
        const lt = item.sell_price * item.quantity;
        const da = lt * (item.discount_percent || 0) / 100;
        const tx = lt - da;
        hsnMap[hsn].qty += item.quantity;
        hsnMap[hsn].val += Math.round(sale.grand_total * 100) / 100;
        hsnMap[hsn].txval += tx;
        const rate = item.gst_percentage || 18;
        hsnMap[hsn].camt += tx * (rate / 2 / 100);
        hsnMap[hsn].samt += tx * (rate / 2 / 100);
        hsnMap[hsn].iamt += tx * (rate / 100);
      });
    });

    gstr1.b2b = Object.values(b2bMap);
    gstr1.b2cs = b2csList;
    gstr1.hsn.data = Object.values(hsnMap).map(h => ({
      ...h,
      txval: Math.round(h.txval * 100) / 100,
      camt: Math.round(h.camt * 100) / 100,
      samt: Math.round(h.samt * 100) / 100,
      iamt: Math.round(h.iamt * 100) / 100,
      csamt: 0
    }));

    gstr1.gt = Math.round(sales.reduce((a, s) => a + s.grand_total, 0) * 100) / 100;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="GSTR1_${y}_${String(m).padStart(2, '0')}.json"`);
    res.json(gstr1);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// HSN Summary Report
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
        if (!hsnMap[hsn]) hsnMap[hsn] = { hsn_code: hsn, description: item.product_name, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0, count: 0 };
        const lt = item.sell_price * item.quantity;
        const da = lt * (item.discount_percent || 0) / 100;
        const tx = lt - da;
        const rate = item.gst_percentage || 18;
        hsnMap[hsn].qty += item.quantity;
        hsnMap[hsn].taxable += tx;
        hsnMap[hsn].cgst += tx * (rate / 2 / 100);
        hsnMap[hsn].sgst += tx * (rate / 2 / 100);
        hsnMap[hsn].total += tx + tx * (rate / 100);
        hsnMap[hsn].count++;
      });
    });

    const hsnData = Object.values(hsnMap).map(h => ({
      ...h,
      taxable: Math.round(h.taxable * 100) / 100,
      cgst: Math.round(h.cgst * 100) / 100,
      sgst: Math.round(h.sgst * 100) / 100,
      total: Math.round(h.total * 100) / 100,
    })).sort((a, b) => b.total - a.total);

    res.json({ success: true, data: { period: `${startDate} to ${endDate}`, hsn: hsnData } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;

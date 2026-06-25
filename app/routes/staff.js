const express = require('express');
const router = express.Router();
const { get, all, run, lastInsertRowid, saveDb } = require('../db');

// Get all staff
router.get('/', (req, res) => {
  try {
    const staff = all('SELECT * FROM staff WHERE is_active = 1 ORDER BY name');
    const result = staff.map(s => {
      const sales = all('SELECT * FROM staff_sales WHERE staff_id = ?', [s.id]);
      const totalSales = sales.length;
      const totalAmount = sales.reduce((sum, sale) => sum + (sale.unit_price * sale.quantity), 0);
      const totalCommission = sales.reduce((sum, sale) => sum + sale.commission_amount, 0);
      const today = new Date().toISOString().split('T')[0];
      const todaySales = sales.filter(sale => sale.sale_date === today);
      return {
        ...s,
        total_sales: totalSales,
        total_amount: Math.round(totalAmount),
        total_commission: Math.round(totalCommission),
        today_sales: todaySales.length,
        today_amount: Math.round(todaySales.reduce((sum, sale) => sum + (sale.unit_price * sale.quantity), 0)),
        today_commission: Math.round(todaySales.reduce((sum, sale) => sum + sale.commission_amount, 0))
      };
    });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get staff by ID
router.get('/:id', (req, res) => {
  try {
    const staff = get('SELECT * FROM staff WHERE id = ?', [req.params.id]);
    if (!staff) return res.status(404).json({ success: false, error: 'Staff not found' });
    const sales = all('SELECT * FROM staff_sales WHERE staff_id = ? ORDER BY sale_date DESC', [staff.id]);
    res.json({ success: true, data: { ...staff, sales } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create staff
router.post('/', (req, res) => {
  try {
    const { name, phone, commission_rate, daily_target } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    run('INSERT INTO staff (name, phone, commission_rate, daily_target) VALUES (?, ?, ?, ?)',
      [name, phone || '', commission_rate || 0, daily_target || 0]);
    saveDb();
    res.json({ success: true, data: { id: lastInsertRowid(), name, phone, commission_rate, daily_target } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update staff
router.put('/:id', (req, res) => {
  try {
    const { name, phone, commission_rate, daily_target } = req.body;
    run('UPDATE staff SET name=?, phone=?, commission_rate=?, daily_target=? WHERE id=?',
      [name, phone || '', commission_rate || 0, daily_target || 0, req.params.id]);
    saveDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete staff
router.delete('/:id', (req, res) => {
  try {
    run('UPDATE staff SET is_active = 0 WHERE id = ?', [req.params.id]);
    saveDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Add sale for staff (by barcode scan)
router.post('/:id/sales', (req, res) => {
  try {
    const staff = get('SELECT * FROM staff WHERE id = ?', [req.params.id]);
    if (!staff) return res.status(404).json({ success: false, error: 'Staff not found' });

    const { barcode, product_id, product_name, quantity, unit_price, sale_date, notes } = req.body;
    let productName = product_name;
    let productId = product_id;
    let price = unit_price || 0;
    let barcodeValue = barcode || '';

    // If barcode provided, look up product
    if (barcode && !product_id) {
      const product = get('SELECT * FROM products WHERE barcode = ?', [barcode]);
      if (product) {
        productName = productName || product.name;
        productId = product.id;
        if (!price || price <= 0) price = product.sell_price;
        barcodeValue = product.barcode;
      } else {
        return res.status(404).json({ success: false, error: `Product with barcode ${barcode} not found` });
      }
    }

    if (!productName) return res.status(400).json({ success: false, error: 'Product name required' });

    const commissionAmount = (price * (quantity || 1)) * (staff.commission_rate / 100);

    run('INSERT INTO staff_sales (staff_id, product_id, product_name, barcode, quantity, unit_price, commission_amount, sale_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [staff.id, productId, productName, barcodeValue, quantity || 1, price, Math.round(commissionAmount * 100) / 100, sale_date || new Date().toISOString().split('T')[0], notes || '']);
    saveDb();

    res.json({
      success: true,
      data: {
        id: lastInsertRowid(),
        product_name: productName,
        quantity: quantity || 1,
        unit_price: price,
        commission_amount: Math.round(commissionAmount * 100) / 100,
        commission_rate: staff.commission_rate
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get staff sales
router.get('/:id/sales', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let where = 'staff_id = ?';
    const params = [req.params.id];
    if (start_date) { where += ' AND sale_date >= ?'; params.push(start_date); }
    if (end_date) { where += ' AND sale_date <= ?'; params.push(end_date); }
    const sales = all(`SELECT * FROM staff_sales WHERE ${where} ORDER BY sale_date DESC`, params);
    const totalAmount = sales.reduce((sum, sale) => sum + (sale.unit_price * sale.quantity), 0);
    const totalCommission = sales.reduce((sum, sale) => sum + sale.commission_amount, 0);
    res.json({ success: true, data: { sales, total_amount: Math.round(totalAmount), total_commission: Math.round(totalCommission), total_sales: sales.length } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete staff sale
router.delete('/sales/:saleId', (req, res) => {
  try {
    run('DELETE FROM staff_sales WHERE id = ?', [req.params.saleId]);
    saveDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get staff summary (all staff with totals)
router.get('/summary/report', (req, res) => {
  try {
    const staff = all('SELECT * FROM staff WHERE is_active = 1 ORDER BY name');
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const result = staff.map(s => {
      const allSales = all('SELECT * FROM staff_sales WHERE staff_id = ?', [s.id]);
      const todaySales = allSales.filter(sale => sale.sale_date === today);
      const monthSales = allSales.filter(sale => sale.sale_date >= thisMonth);

      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        commission_rate: s.commission_rate,
        daily_target: s.daily_target,
        today: {
          sales: todaySales.length,
          amount: Math.round(todaySales.reduce((sum, sale) => sum + (sale.unit_price * sale.quantity), 0)),
          commission: Math.round(todaySales.reduce((sum, sale) => sum + sale.commission_amount, 0))
        },
        month: {
          sales: monthSales.length,
          amount: Math.round(monthSales.reduce((sum, sale) => sum + (sale.unit_price * sale.quantity), 0)),
          commission: Math.round(monthSales.reduce((sum, sale) => sum + sale.commission_amount, 0))
        },
        total: {
          sales: allSales.length,
          amount: Math.round(allSales.reduce((sum, sale) => sum + (sale.unit_price * sale.quantity), 0)),
          commission: Math.round(allSales.reduce((sum, sale) => sum + sale.commission_amount, 0))
        }
      };
    });

    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;

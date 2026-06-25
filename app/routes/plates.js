const express = require('express');
const router = express.Router();
const { get, all, run, lastInsertRowid, saveDb } = require('../db');

// Get all number plates
router.get('/', (req, res) => {
  try {
    const { status, search } = req.query;
    let where = '1=1';
    const params = [];
    if (status) { where += ' AND status = ?'; params.push(status); }
    if (search) { where += ' AND (customer_name LIKE ? OR plate_number LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const plates = all(`SELECT * FROM number_plates WHERE ${where} ORDER BY created_at DESC`, params);
    res.json({ success: true, data: plates });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get number plate by ID
router.get('/:id', (req, res) => {
  try {
    const plate = get('SELECT * FROM number_plates WHERE id = ?', [req.params.id]);
    if (!plate) return res.status(404).json({ success: false, error: 'Number plate not found' });
    res.json({ success: true, data: plate });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create number plate order
router.post('/', (req, res) => {
  try {
    const { customer_name, phone, plate_number, hsn_code, plate_type, order_date, fitting_date, challan_date, delivery_date, amount, notes } = req.body;
    if (!customer_name) return res.status(400).json({ success: false, error: 'Customer name required' });
    if (!plate_number) return res.status(400).json({ success: false, error: 'Plate number required' });

    run('INSERT INTO number_plates (customer_name, phone, plate_number, hsn_code, plate_type, order_date, fitting_date, challan_date, delivery_date, status, amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [customer_name, phone || '', plate_number.toUpperCase(), hsn_code || '', plate_type || 'standard', order_date || new Date().toISOString().split('T')[0], fitting_date || '', challan_date || '', delivery_date || '', 'pending', amount || 0, notes || '']);
    saveDb();

    res.json({ success: true, data: { id: lastInsertRowid(), customer_name, plate_number: plate_number.toUpperCase(), status: 'pending' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update number plate
router.put('/:id', (req, res) => {
  try {
    const { customer_name, phone, plate_number, plate_type, order_date, delivery_date, status, amount, notes } = req.body;
    run('UPDATE number_plates SET customer_name=?, phone=?, plate_number=?, plate_type=?, order_date=?, delivery_date=?, status=?, amount=?, notes=? WHERE id=?',
      [customer_name, phone || '', plate_number.toUpperCase(), plate_type || 'standard', order_date, delivery_date || '', status || 'pending', amount || 0, notes || '', req.params.id]);
    saveDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update status
router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'in_progress', 'ready', 'delivered', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    run('UPDATE number_plates SET status = ? WHERE id = ?', [status, req.params.id]);
    saveDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete number plate
router.delete('/:id', (req, res) => {
  try {
    run('DELETE FROM number_plates WHERE id = ?', [req.params.id]);
    saveDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get summary
router.get('/summary/report', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const allPlates = all('SELECT * FROM number_plates');
    const todayOrders = allPlates.filter(p => p.order_date === today);
    const monthOrders = allPlates.filter(p => p.order_date >= thisMonth);
    const pending = allPlates.filter(p => p.status === 'pending');
    const inProgress = allPlates.filter(p => p.status === 'in_progress');
    const ready = allPlates.filter(p => p.status === 'ready');

    res.json({
      success: true,
      data: {
        total: allPlates.length,
        today: todayOrders.length,
        month: monthOrders.length,
        pending: pending.length,
        in_progress: inProgress.length,
        ready: ready.length,
        total_revenue: Math.round(allPlates.reduce((sum, p) => sum + (p.amount || 0), 0)),
        month_revenue: Math.round(monthOrders.reduce((sum, p) => sum + (p.amount || 0), 0))
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;

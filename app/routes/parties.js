const express = require('express');
const router = express.Router();
const { get, all, run, lastInsertRowid, saveDb } = require('../db');

router.get('/', (req, res) => {
  try {
    const { type, search } = req.query;
    let sql = 'SELECT * FROM parties WHERE 1=1';
    const params = [];
    if (type) { sql += ' AND party_type = ?'; params.push(type); }
    if (search) { sql += ' AND (name LIKE ? OR phone LIKE ? OR gstin LIKE ?)'; const s = `%${search}%`; params.push(s, s, s); }
    sql += ' ORDER BY name';
    res.json({ success: true, data: all(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const p = get('SELECT * FROM parties WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: p });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/', (req, res) => {
  try {
    const d = req.body || {};
    if (!d.name) return res.status(400).json({ success: false, error: 'Name required' });
    run(`INSERT INTO parties (name, party_type, phone, email, gstin, address, city, state, pincode, opening_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.name, d.party_type || 'customer', d.phone || '', d.email || '', d.gstin || '',
       d.address || '', d.city || '', d.state || '', d.pincode || '', d.opening_balance || 0]);
    res.json({ success: true, data: get('SELECT * FROM parties WHERE id = ?', [lastInsertRowid()]) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const d = req.body || {};
    const existing = get('SELECT * FROM parties WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });
    run(`UPDATE parties SET name=?, party_type=?, phone=?, email=?, gstin=?, address=?, city=?, state=?, pincode=?, opening_balance=?, is_active=? WHERE id=?`,
      [d.name ?? existing.name, d.party_type ?? existing.party_type, d.phone ?? existing.phone, d.email ?? existing.email,
       d.gstin ?? existing.gstin, d.address ?? existing.address, d.city ?? existing.city, d.state ?? existing.state,
       d.pincode ?? existing.pincode, d.opening_balance ?? existing.opening_balance, d.is_active ?? existing.is_active,
       req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM parties WHERE id = ?', [req.params.id]) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    run('UPDATE parties SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;

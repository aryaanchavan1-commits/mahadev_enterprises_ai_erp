const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { get, all, run, saveDb, dataDir } = require('../db');

router.get('/', (req, res) => {
  try {
    const settings = all('SELECT * FROM settings');
    const result = {};
    settings.forEach(s => { result[s.key] = s.value; });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/:key', (req, res) => {
  try {
    const setting = get('SELECT * FROM settings WHERE key = ?', [req.params.key]);
    if (!setting) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: setting });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/', (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
    }
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Backup - returns database file path
router.get('/backup/info', (req, res) => {
  try {
    const dbPath = path.join(dataDir, 'mahadev_erp.db');
    const exists = fs.existsSync(dbPath);
    const size = exists ? fs.statSync(dbPath).size : 0;
    const uploadsDir = path.join(dataDir, 'uploads');
    const barcodesDir = path.join(dataDir, 'barcodes');
    let uploadsCount = 0, barcodesCount = 0;
    try { uploadsCount = fs.readdirSync(uploadsDir).filter(f => !f.startsWith('.')).length; } catch {}
    try { barcodesCount = fs.readdirSync(barcodesDir).filter(f => !f.startsWith('.')).length; } catch {}
    res.json({
      success: true,
      data: {
        dbPath,
        dbSize: size,
        dbSizeFormatted: size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`,
        uploadsCount,
        barcodesCount,
        dataDir,
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Backup - copy database to user-specified location
router.post('/backup/create', (req, res) => {
  try {
    const { backupPath } = req.body;
    if (!backupPath) return res.status(400).json({ success: false, error: 'Backup path required' });

    const dbPath = path.join(dataDir, 'mahadev_erp.db');
    if (!fs.existsSync(dbPath)) return res.status(404).json({ success: false, error: 'Database not found' });

    // Create backup folder
    const backupDir = path.join(backupPath, `Mahadev_ERP_Backup_${new Date().toISOString().slice(0, 10)}`);
    fs.mkdirSync(backupDir, { recursive: true });

    // Copy database
    const dbBackup = path.join(backupDir, 'mahadev_erp.db');
    fs.copyFileSync(dbPath, dbBackup);

    // Copy uploads
    const uploadsDir = path.join(dataDir, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const uploadsBackup = path.join(backupDir, 'uploads');
      fs.mkdirSync(uploadsBackup, { recursive: true });
      fs.readdirSync(uploadsDir).forEach(f => {
        if (!f.startsWith('.')) {
          try { fs.copyFileSync(path.join(uploadsDir, f), path.join(uploadsBackup, f)); } catch {}
        }
      });
    }

    // Copy barcodes
    const barcodesDir = path.join(dataDir, 'barcodes');
    if (fs.existsSync(barcodesDir)) {
      const barcodesBackup = path.join(backupDir, 'barcodes');
      fs.mkdirSync(barcodesBackup, { recursive: true });
      fs.readdirSync(barcodesDir).forEach(f => {
        if (!f.startsWith('.')) {
          try { fs.copyFileSync(path.join(barcodesDir, f), path.join(barcodesBackup, f)); } catch {}
        }
      });
    }

    const totalSize = fs.statSync(dbBackup).size;
    res.json({
      success: true,
      message: `Backup created at ${backupDir}`,
      data: {
        path: backupDir,
        dbSize: totalSize > 1024 * 1024 ? `${(totalSize / 1024 / 1024).toFixed(1)} MB` : `${(totalSize / 1024).toFixed(1)} KB`,
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Restore - copy database from user-specified location
router.post('/restore', (req, res) => {
  try {
    const { backupPath } = req.body;
    if (!backupPath) return res.status(400).json({ success: false, error: 'Backup path required' });

    const dbBackup = path.join(backupPath, 'mahadev_erp.db');
    if (!fs.existsSync(dbBackup)) return res.status(404).json({ success: false, error: 'Backup database not found' });

    const dbPath = path.join(dataDir, 'mahadev_erp.db');

    // Close existing connections would be needed here
    // For safety, just copy
    fs.copyFileSync(dbBackup, dbPath);

    res.json({ success: true, message: 'Database restored. Please restart the app.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete all data
router.post('/vanish', (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'YES_DELETE_ALL') return res.status(400).json({ success: false, error: 'Confirmation required' });
    
    const tables = ['staff_sales', 'staff', 'number_plates', 'journal_entry_lines', 'journal_entries', 
                    'credit_notes', 'debit_notes', 'stock_movements', 'purchases', 'sales', 
                    'products', 'parties', 'categories', 'subcategories', 'ai_conversations', 'settings'];
    for (const table of tables) {
      run(`DELETE FROM ${table}`);
    }
    saveDb();
    res.json({ success: true, message: 'All data has been deleted. App will restart with default settings.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;

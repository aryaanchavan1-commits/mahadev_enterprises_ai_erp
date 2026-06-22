const express = require('express');
const router = express.Router();
const { get, all, run, lastInsertRowid } = require('../db');

// ========== CHART OF ACCOUNTS ==========
router.get('/accounts', (req, res) => {
  try {
    const accounts = all('SELECT * FROM chart_of_accounts ORDER BY code');
    res.json({ success: true, data: accounts });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/accounts', (req, res) => {
  try {
    const { code, name, account_type, account_group, parent_id } = req.body;
    if (!code || !name || !account_type) return res.status(400).json({ success: false, error: 'Code, name, and type required' });
    const existing = get('SELECT id FROM chart_of_accounts WHERE code = ?', [code]);
    if (existing) return res.status(400).json({ success: false, error: 'Account code already exists' });
    run('INSERT INTO chart_of_accounts (code, name, account_type, account_group, parent_id) VALUES (?, ?, ?, ?, ?)',
      [code, name, account_type, account_group || code, parent_id || null]);
    res.json({ success: true, data: { id: lastInsertRowid(), code, name, account_type } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/accounts/:id', (req, res) => {
  try {
    const { name, account_type, account_group, opening_balance } = req.body;
    run('UPDATE chart_of_accounts SET name=?, account_type=?, account_group=?, opening_balance=? WHERE id=?',
      [name, account_type, account_group, opening_balance || 0, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ========== JOURNAL ENTRIES ==========
router.get('/journal', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let where = '1=1'; const params = [];
    if (start_date) { where += ' AND je.entry_date >= ?'; params.push(start_date); }
    if (end_date) { where += ' AND je.entry_date <= ?'; params.push(end_date); }
    const entries = all(`SELECT je.* FROM journal_entries je WHERE ${where} ORDER BY je.entry_date DESC, je.id DESC`, params);
    const result = entries.map(e => ({
      ...e,
      lines: all('SELECT jel.*, coa.name as account_name, coa.code as account_code FROM journal_entry_lines jel JOIN chart_of_accounts coa ON jel.account_id = coa.id WHERE jel.entry_id = ?', [e.id])
    }));
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/journal', (req, res) => {
  try {
    const { entry_date, description, lines } = req.body;
    if (!lines || lines.length < 2) return res.status(400).json({ success: false, error: 'At least 2 lines required' });
    const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) return res.status(400).json({ success: false, error: 'Debit must equal Credit' });

    const prefix = get("SELECT value FROM settings WHERE key='invoice_prefix'")?.value || 'INV-';
    const entryNumber = `JE-${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`;
    run('INSERT INTO journal_entries (entry_number, entry_date, description) VALUES (?, ?, ?)', [entryNumber, entry_date || new Date().toISOString().split('T')[0], description || '']);
    const entryId = lastInsertRowid();
    for (const line of lines) {
      run('INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)',
        [entryId, line.account_id, line.debit || 0, line.credit || 0, line.description || '']);
    }
    res.json({ success: true, data: { id: entryId, entry_number: entryNumber } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/journal/:id', (req, res) => {
  try {
    run('DELETE FROM journal_entry_lines WHERE entry_id = ?', [req.params.id]);
    run('DELETE FROM journal_entries WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ========== CREDIT NOTES (Sale Returns) ==========
router.get('/credit-notes', (req, res) => {
  try {
    const notes = all('SELECT * FROM credit_notes ORDER BY created_at DESC');
    res.json({ success: true, data: notes.map(n => ({ ...n, items: JSON.parse(n.items || '[]') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/credit-notes', (req, res) => {
  try {
    const { sale_id, customer_id, customer_name, reason, items } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ success: false, error: 'No items' });

    const prefix = get("SELECT value FROM settings WHERE key='invoice_prefix'")?.value || 'INV-';
    const cnNumber = `CN-${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`;
    const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
    const gstAmount = items.reduce((s, i) => s + (i.gst_amount || (i.quantity * i.unit_price * (i.gst_percentage || 18) / 100)), 0);
    const total = subtotal + gstAmount;

    run('INSERT INTO credit_notes (credit_note_number, sale_id, customer_id, customer_name, credit_date, reason, items, subtotal, gst_amount, total) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [cnNumber, sale_id || null, customer_id || null, customer_name || '', new Date().toISOString().split('T')[0], reason || '', JSON.stringify(items), subtotal, gstAmount, total]);

    // Restore stock
    for (const item of items) {
      if (item.product_id) {
        run('UPDATE products SET quantity = quantity + ? WHERE id = ?', [item.quantity, item.product_id]);
        run('INSERT INTO stock_movements (product_id, type, quantity_change, reference, notes) VALUES (?, ?, ?, ?, ?)',
          [item.product_id, 'credit_note', item.quantity, cnNumber, reason || 'Sale return']);
      }
    }

    // Create journal entry for credit note
    const salesAccount = get("SELECT id FROM chart_of_accounts WHERE code = '3110'");
    const receivableAccount = get("SELECT id FROM chart_of_accounts WHERE code = '1130'");
    const gstInputAccount = get("SELECT id FROM chart_of_accounts WHERE code = '1150'");
    if (salesAccount && receivableAccount) {
      run('INSERT INTO journal_entries (entry_number, entry_date, description, reference_type, reference_id) VALUES (?,?,?,?,?)',
        [cnNumber + '-JE', new Date().toISOString().split('T')[0], `Credit note: ${reason}`, 'credit_note', lastInsertRowid()]);
      const jeId = lastInsertRowid();
      run('INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit) VALUES (?,?,?,?)', [jeId, salesAccount.id, subtotal, 0]);
      if (gstInputAccount && gstAmount > 0) run('INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit) VALUES (?,?,?,?)', [jeId, gstInputAccount.id, gstAmount, 0]);
      run('INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit) VALUES (?,?,?,?)', [jeId, receivableAccount.id, 0, total]);
    }

    res.json({ success: true, data: { id: lastInsertRowid(), credit_note_number: cnNumber, total } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ========== DEBIT NOTES (Purchase Returns) ==========
router.get('/debit-notes', (req, res) => {
  try {
    const notes = all('SELECT * FROM debit_notes ORDER BY created_at DESC');
    res.json({ success: true, data: notes.map(n => ({ ...n, items: JSON.parse(n.items || '[]') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/debit-notes', (req, res) => {
  try {
    const { purchase_id, supplier_id, supplier_name, reason, items } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ success: false, error: 'No items' });

    const dnNumber = `DN-${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`;
    const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
    const gstAmount = items.reduce((s, i) => s + (i.gst_amount || (i.quantity * i.unit_price * (i.gst_percentage || 18) / 100)), 0);
    const total = subtotal + gstAmount;

    run('INSERT INTO debit_notes (debit_note_number, purchase_id, supplier_id, supplier_name, debit_date, reason, items, subtotal, gst_amount, total) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [dnNumber, purchase_id || null, supplier_id || null, supplier_name || '', new Date().toISOString().split('T')[0], reason || '', JSON.stringify(items), subtotal, gstAmount, total]);

    // Reduce stock
    for (const item of items) {
      if (item.product_id) {
        run('UPDATE products SET quantity = MAX(0, quantity - ?) WHERE id = ?', [item.quantity, item.product_id]);
        run('INSERT INTO stock_movements (product_id, type, quantity_change, reference, notes) VALUES (?, ?, ?, ?, ?)',
          [item.product_id, 'debit_note', -item.quantity, dnNumber, reason || 'Purchase return']);
      }
    }

    // Create journal entry
    const purchaseAccount = get("SELECT id FROM chart_of_accounts WHERE code = '4110'");
    const payableAccount = get("SELECT id FROM chart_of_accounts WHERE code = '2110'");
    const gstOutputAccount = get("SELECT id FROM chart_of_accounts WHERE code = '2120'");
    if (purchaseAccount && payableAccount) {
      run('INSERT INTO journal_entries (entry_number, entry_date, description, reference_type, reference_id) VALUES (?,?,?,?,?)',
        [dnNumber + '-JE', new Date().toISOString().split('T')[0], `Debit note: ${reason}`, 'debit_note', lastInsertRowid()]);
      const jeId = lastInsertRowid();
      run('INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit) VALUES (?,?,?,?)', [jeId, payableAccount.id, total, 0]);
      run('INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit) VALUES (?,?,?,?)', [jeId, purchaseAccount.id, 0, subtotal]);
      if (gstOutputAccount && gstAmount > 0) run('INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit) VALUES (?,?,?,?)', [jeId, gstOutputAccount.id, 0, gstAmount]);
    }

    res.json({ success: true, data: { id: lastInsertRowid(), debit_note_number: dnNumber, total } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ========== TRIAL BALANCE ==========
router.get('/trial-balance', (req, res) => {
  try {
    const { as_on } = req.query;
    const dateFilter = as_on ? 'AND je.entry_date <= ?' : '';
    const params = as_on ? [as_on] : [];

    const accounts = all('SELECT * FROM chart_of_accounts WHERE is_active = 1 ORDER BY code');
    const result = accounts.map(acc => {
      const debit = get(`SELECT COALESCE(SUM(jel.debit), 0) as total FROM journal_entry_lines jel JOIN journal_entries je ON jel.entry_id = je.id WHERE jel.account_id = ? ${dateFilter}`, [acc.id, ...params]).total;
      const credit = get(`SELECT COALESCE(SUM(jel.credit), 0) as total FROM journal_entry_lines jel JOIN journal_entries je ON jel.entry_id = je.id WHERE jel.account_id = ? ${dateFilter}`, [acc.id, ...params]).total;
      return { ...acc, debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100, balance: Math.round((debit - credit) * 100) / 100 };
    }).filter(a => a.debit !== 0 || a.credit !== 0);

    const totalDebit = Math.round(result.reduce((s, a) => s + a.debit, 0) * 100) / 100;
    const totalCredit = Math.round(result.reduce((s, a) => s + a.credit, 0) * 100) / 100;

    res.json({ success: true, data: { accounts: result, totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ========== PROFIT & LOSS ==========
router.get('/profit-loss', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const today = new Date();
    const startDate = start_date || `${today.getFullYear()}-04-01`;
    const endDate = end_date || today.toISOString().split('T')[0];

    let dateFilter = 'AND je.entry_date >= ? AND je.entry_date <= ?';
    let params = [startDate, endDate];

    // Sales from journal
    const salesAccounts = all("SELECT * FROM chart_of_accounts WHERE account_type = 'Income' AND is_active = 1");
    const income = salesAccounts.map(acc => {
      const debit = get(`SELECT COALESCE(SUM(jel.debit), 0) as t FROM journal_entry_lines jel JOIN journal_entries je ON jel.entry_id = je.id WHERE jel.account_id = ? ${dateFilter}`, [acc.id, ...params]).t;
      const credit = get(`SELECT COALESCE(SUM(jel.credit), 0) as t FROM journal_entry_lines jel JOIN journal_entries je ON jel.entry_id = je.id WHERE jel.account_id = ? ${dateFilter}`, [acc.id, ...params]).t;
      return { ...acc, debit, credit, net: credit - debit };
    });

    // Also include actual sales data (not from journal)
    const actualSales = get(`SELECT COALESCE(SUM(grand_total), 0) as t FROM sales WHERE sale_date >= ? AND sale_date <= ?`, [startDate, endDate]).t;
    const actualCgst = get(`SELECT COALESCE(SUM(cgst_total), 0) as t FROM sales WHERE sale_date >= ? AND sale_date <= ?`, [startDate, endDate]).t;
    const actualSgst = get(`SELECT COALESCE(SUM(sgst_total), 0) as t FROM sales WHERE sale_date >= ? AND sale_date <= ?`, [startDate, endDate]).t;

    // Credit notes
    const creditNoteTotal = get(`SELECT COALESCE(SUM(total), 0) as t FROM credit_notes WHERE credit_date >= ? AND credit_date <= ? AND status = 'active'`, [startDate, endDate]).t;

    // Expenses from journal
    const expenseAccounts = all("SELECT * FROM chart_of_accounts WHERE account_type = 'Expenses' AND is_active = 1");
    const expenses = expenseAccounts.map(acc => {
      const debit = get(`SELECT COALESCE(SUM(jel.debit), 0) as t FROM journal_entry_lines jel JOIN journal_entries je ON jel.entry_id = je.id WHERE jel.account_id = ? ${dateFilter}`, [acc.id, ...params]).t;
      const credit = get(`SELECT COALESCE(SUM(jel.credit), 0) as t FROM journal_entry_lines jel JOIN journal_entries je ON jel.entry_id = je.id WHERE jel.account_id = ? ${dateFilter}`, [acc.id, ...params]).t;
      return { ...acc, debit, credit, net: debit - credit };
    });

    // Actual purchases
    const actualPurchases = get(`SELECT COALESCE(SUM(grand_total), 0) as t FROM purchases WHERE purchase_date >= ? AND purchase_date <= ?`, [startDate, endDate]).t;
    const debitNoteTotal = get(`SELECT COALESCE(SUM(total), 0) as t FROM debit_notes WHERE debit_date >= ? AND debit_date <= ? AND status = 'active'`, [startDate, endDate]).t;

    const totalIncome = Math.round((income.reduce((s, a) => s + a.net, 0) + actualSales - creditNoteTotal) * 100) / 100;
    const totalExpenses = Math.round((expenses.reduce((s, a) => s + a.net, 0) + actualPurchases - debitNoteTotal) * 100) / 100;
    const netProfit = Math.round((totalIncome - totalExpenses) * 100) / 100;

    res.json({
      success: true,
      data: {
        period: { start: startDate, end: endDate },
        income: { items: income.filter(a => a.net !== 0), sales: actualSales, creditNotes: creditNoteTotal, total: totalIncome },
        expenses: { items: expenses.filter(a => a.net !== 0), purchases: actualPurchases, debitNotes: debitNoteTotal, total: totalExpenses },
        netProfit,
        isProfit: netProfit >= 0
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ========== BALANCE SHEET ==========
router.get('/balance-sheet', (req, res) => {
  try {
    const { as_on } = req.query;
    const asOn = as_on || new Date().toISOString().split('T')[0];
    const dateFilter = 'AND je.entry_date <= ?';
    const params = [asOn];

    function getAccountBalance(code) {
      const acc = get('SELECT id FROM chart_of_accounts WHERE code = ?', [code]);
      if (!acc) return 0;
      const debit = get(`SELECT COALESCE(SUM(jel.debit), 0) as t FROM journal_entry_lines jel JOIN journal_entries je ON jel.entry_id = je.id WHERE jel.account_id = ? ${dateFilter}`, [acc.id, ...params]).t;
      const credit = get(`SELECT COALESCE(SUM(jel.credit), 0) as t FROM journal_entry_lines jel JOIN journal_entries je ON jel.entry_id = je.id WHERE jel.account_id = ? ${dateFilter}`, [acc.id, ...params]).t;
      return Math.round((debit - credit) * 100) / 100;
    }

    // Assets
    const assets = {
      current: {
        cash: getAccountBalance('1110'),
        bank: getAccountBalance('1120'),
        receivable: getAccountBalance('1130'),
        stock: getAccountBalance('1140'),
        gstInput: getAccountBalance('1150'),
        prepaid: getAccountBalance('1160'),
      },
      fixed: {
        furniture: getAccountBalance('1210'),
        computer: getAccountBalance('1220'),
      }
    };
    assets.current.total = Object.values(assets.current).reduce((s, v) => s + v, 0);
    assets.fixed.total = Object.values(assets.fixed).reduce((s, v) => s + v, 0);
    assets.total = assets.current.total + assets.fixed.total;

    // Liabilities
    const liabilities = {
      current: {
        payable: getAccountBalance('2110'),
        gstOutput: getAccountBalance('2120'),
        tdsPayable: getAccountBalance('2130'),
        other: getAccountBalance('2140'),
      },
      capital: {
        ownerCapital: getAccountBalance('2210'),
        ownerDrawings: getAccountBalance('2220'),
      }
    };
    liabilities.current.total = Object.values(liabilities.current).reduce((s, v) => s + v, 0);
    liabilities.capital.total = liabilities.capital.ownerCapital - liabilities.capital.ownerDrawings;
    liabilities.total = liabilities.current.total + liabilities.capital.total;

    // Retained earnings (net profit from P&L)
    const salesTotal = get(`SELECT COALESCE(SUM(grand_total), 0) as t FROM sales WHERE sale_date <= ?`, [asOn]).t;
    const purchaseTotal = get(`SELECT COALESCE(SUM(grand_total), 0) as t FROM purchases WHERE purchase_date <= ?`, [asOn]).t;
    const retainedEarnings = salesTotal - purchaseTotal;

    res.json({
      success: true,
      data: {
        as_on: asOn,
        assets,
        liabilities,
        retainedEarnings: Math.round(retainedEarnings * 100) / 100,
        totalAssets: Math.round(assets.total * 100) / 100,
        totalLiabilities: Math.round((liabilities.total + retainedEarnings) * 100) / 100,
        isBalanced: Math.abs(assets.total - (liabilities.total + retainedEarnings)) < 1
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ========== LEDGER ==========
router.get('/ledger/:accountId', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const account = get('SELECT * FROM chart_of_accounts WHERE id = ?', [req.params.accountId]);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });

    let where = 'jel.account_id = ?'; const params = [req.params.accountId];
    if (start_date) { where += ' AND je.entry_date >= ?'; params.push(start_date); }
    if (end_date) { where += ' AND je.entry_date <= ?'; params.push(end_date); }

    const entries = all(`SELECT je.entry_number, je.entry_date, je.description as entry_desc, jel.debit, jel.credit, jel.description as line_desc FROM journal_entry_lines jel JOIN journal_entries je ON jel.entry_id = je.id WHERE ${where} ORDER BY je.entry_date, je.id`, params);

    let runningBalance = account.opening_balance || 0;
    const ledger = entries.map(e => {
      runningBalance = runningBalance + e.debit - e.credit;
      return { ...e, balance: Math.round(runningBalance * 100) / 100 };
    });

    res.json({ success: true, data: { account, opening_balance: account.opening_balance || 0, entries: ledger, closing_balance: Math.round(runningBalance * 100) / 100 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ========== AUTO-JOURNAL for sales ==========
router.post('/auto-journal/sale/:saleId', (req, res) => {
  try {
    const sale = get('SELECT * FROM sales WHERE id = ?', [req.params.saleId]);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });

    const existingJe = get("SELECT id FROM journal_entries WHERE reference_type = 'sale' AND reference_id = ?", [sale.id]);
    if (existingJe) return res.json({ success: true, message: 'Journal entry already exists' });

    const receivable = get("SELECT id FROM chart_of_accounts WHERE code = '1130'");
    const salesAcc = get("SELECT id FROM chart_of_accounts WHERE code = '3110'");
    const gstOutput = get("SELECT id FROM chart_of_accounts WHERE code = '2120'");

    if (!receivable || !salesAcc) return res.status(400).json({ success: false, error: 'Required accounts not found' });

    const entryNumber = `JE-SALE-${sale.invoice_number}`;
    run('INSERT INTO journal_entries (entry_number, entry_date, description, reference_type, reference_id) VALUES (?,?,?,?,?)',
      [entryNumber, sale.sale_date, `Sale: ${sale.invoice_number}`, 'sale', sale.id]);
    const jeId = lastInsertRowid();

    const taxable = sale.subtotal - sale.discount_total;
    run('INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit) VALUES (?,?,?,?)', [jeId, receivable.id, sale.grand_total, 0]);
    run('INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit) VALUES (?,?,?,?)', [jeId, salesAcc.id, 0, taxable]);
    if (gstOutput && (sale.cgst_total + sale.sgst_total + sale.igst_total) > 0) {
      run('INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit) VALUES (?,?,?,?)', [jeId, gstOutput.id, 0, sale.cgst_total + sale.sgst_total + sale.igst_total]);
    }

    res.json({ success: true, data: { entry_number: entryNumber } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;

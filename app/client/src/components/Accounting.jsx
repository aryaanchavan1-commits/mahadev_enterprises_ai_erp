import React, { useState, useEffect } from 'react';

const API = '/api';

export default function Accounting() {
  const [tab, setTab] = useState('journal');
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const tabs = [
    { key: 'journal', label: 'Journal Entries', icon: '📓' },
    { key: 'credit', label: 'Credit Notes', icon: '↩️' },
    { key: 'debit', label: 'Debit Notes', icon: '↪️' },
    { key: 'ledger', label: 'Ledger', icon: '📒' },
    { key: 'trial', label: 'Trial Balance', icon: '⚖️' },
    { key: 'pl', label: 'Profit & Loss', icon: '📊' },
    { key: 'balance', label: 'Balance Sheet', icon: '📋' },
    { key: 'accounts', label: 'Chart of Accounts', icon: '🏷️' },
  ];

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      <h2 style={{ marginBottom: 16 }}>Accounting</h2>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`btn ${tab === t.key ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 12 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'journal' && <JournalEntries showToast={showToast} />}
      {tab === 'credit' && <CreditNotes showToast={showToast} />}
      {tab === 'debit' && <DebitNotes showToast={showToast} />}
      {tab === 'ledger' && <Ledger showToast={showToast} />}
      {tab === 'trial' && <TrialBalance />}
      {tab === 'pl' && <ProfitLoss />}
      {tab === 'balance' && <BalanceSheet />}
      {tab === 'accounts' && <ChartOfAccounts showToast={showToast} />}
    </div>
  );
}

// ========== CHART OF ACCOUNTS ==========
function ChartOfAccounts({ showToast }) {
  const [accounts, setAccounts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', account_type: 'Assets', account_group: '', parent_id: '' });

  const load = () => fetch(`${API}/accounting/accounts`).then(r => r.json()).then(d => { if (d.success) setAccounts(d.data); });
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.code || !form.name) return showToast('Code and name required', 'error');
    const r = await fetch(`${API}/accounting/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json();
    if (d.success) { showToast('Account added'); load(); setShowAdd(false); setForm({ code: '', name: '', account_type: 'Assets', account_group: '', parent_id: '' }); }
    else showToast(d.error, 'error');
  };

  const grouped = {};
  accounts.forEach(a => { if (!grouped[a.account_type]) grouped[a.account_type] = []; grouped[a.account_type].push(a); });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3>Chart of Accounts ({accounts.length})</h3>
        <button className="btn btn-success" onClick={() => setShowAdd(true)}>+ Add Account</button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #27ae60' }}>
          <div className="form-row">
            <div className="form-group"><label>Code</label><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="1110" /></div>
            <div className="form-group"><label>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Cash in Hand" /></div>
            <div className="form-group">
              <label>Type</label>
              <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })}>
                <option>Assets</option><option>Liabilities</option><option>Income</option><option>Expenses</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" onClick={handleAdd}>Add</button>
            <button className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {Object.entries(grouped).map(([type, accs]) => (
        <div key={type} className="card" style={{ marginBottom: 12 }}>
          <h4 style={{ marginBottom: 8 }}>{type}</h4>
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Group</th></tr></thead>
            <tbody>
              {accs.map(a => (
                <tr key={a.id}><td style={{ fontFamily: 'monospace' }}>{a.code}</td><td>{a.name}</td><td style={{ fontSize: 11, color: '#999' }}>{a.account_group}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ========== JOURNAL ENTRIES ==========
function JournalEntries({ showToast }) {
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ entry_date: new Date().toISOString().split('T')[0], description: '', lines: [{ account_id: '', debit: 0, credit: 0, description: '' }, { account_id: '', debit: 0, credit: 0, description: '' }] });

  const load = () => fetch(`${API}/accounting/journal`).then(r => r.json()).then(d => { if (d.success) setEntries(d.data); });
  useEffect(() => { load(); fetch(`${API}/accounting/accounts`).then(r => r.json()).then(d => { if (d.success) setAccounts(d.data); }); }, []);

  const addLine = () => setForm({ ...form, lines: [...form.lines, { account_id: '', debit: 0, credit: 0, description: '' }] });
  const removeLine = (i) => setForm({ ...form, lines: form.lines.filter((_, idx) => idx !== i) });
  const updateLine = (i, field, value) => { const lines = [...form.lines]; lines[i] = { ...lines[i], [field]: value }; setForm({ ...form, lines }); };

  const totalDebit = form.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = form.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

  const handleSave = async () => {
    if (Math.abs(totalDebit - totalCredit) > 0.01) return showToast('Debit must equal Credit', 'error');
    const r = await fetch(`${API}/accounting/journal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json();
    if (d.success) { showToast('Journal entry created'); load(); setShowAdd(false); }
    else showToast(d.error, 'error');
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this journal entry?')) return;
    const r = await fetch(`${API}/accounting/journal/${id}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.success) { showToast('Deleted'); load(); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3>Journal Entries ({entries.length})</h3>
        <button className="btn btn-success" onClick={() => setShowAdd(true)}>+ New Entry</button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #3498db' }}>
          <div className="form-row">
            <div className="form-group"><label>Date</label><input type="date" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} /></div>
            <div className="form-group"><label>Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Journal entry description" /></div>
          </div>

          <table style={{ marginBottom: 8 }}>
            <thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th>Description</th><th></th></tr></thead>
            <tbody>
              {form.lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <select value={line.account_id} onChange={e => updateLine(i, 'account_id', Number(e.target.value))} style={{ width: '100%' }}>
                      <option value="">-- Select --</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                    </select>
                  </td>
                  <td><input type="number" value={line.debit} onChange={e => updateLine(i, 'debit', Number(e.target.value))} style={{ width: 80 }} /></td>
                  <td><input type="number" value={line.credit} onChange={e => updateLine(i, 'credit', Number(e.target.value))} style={{ width: 80 }} /></td>
                  <td><input value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} style={{ width: 120 }} /></td>
                  <td>{form.lines.length > 2 && <button className="btn btn-sm btn-outline" onClick={() => removeLine(i)} style={{ color: '#e74c3c' }}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-sm btn-outline" onClick={addLine}>+ Add Line</button>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: Math.abs(totalDebit - totalCredit) > 0.01 ? '#e74c3c' : '#27ae60', fontWeight: 700 }}>
                Debit: ₹{totalDebit.toFixed(2)} | Credit: ₹{totalCredit.toFixed(2)} | Diff: ₹{Math.abs(totalDebit - totalCredit).toFixed(2)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-success" onClick={handleSave} disabled={Math.abs(totalDebit - totalCredit) > 0.01}>Save Entry</button>
            <button className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Number</th><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Actions</th></tr></thead>
          <tbody>
            {entries.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: '#999' }}>No journal entries yet</td></tr> :
              entries.map(e => (
                <tr key={e.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{e.entry_number}</td>
                  <td>{e.entry_date}</td>
                  <td>{e.description}</td>
                  <td>₹{e.lines?.reduce((s, l) => s + l.debit, 0).toFixed(2)}</td>
                  <td>₹{e.lines?.reduce((s, l) => s + l.credit, 0).toFixed(2)}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(e.id)}>Del</button></td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ========== CREDIT NOTES ==========
function CreditNotes({ showToast }) {
  const [notes, setNotes] = useState([]);
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ sale_id: '', customer_name: '', reason: '', items: [{ product_id: '', product_name: '', quantity: 1, unit_price: 0, gst_percentage: 18 }] });

  const load = () => fetch(`${API}/accounting/credit-notes`).then(r => r.json()).then(d => { if (d.success) setNotes(d.data); });
  useEffect(() => {
    load();
    fetch(`${API}/sales`).then(r => r.json()).then(d => { if (d.success) setSales(d.data); });
    fetch(`${API}/products?limit=200`).then(r => r.json()).then(d => { if (d.success) setProducts(d.data); });
  }, []);

  const handleSaleSelect = (saleId) => {
    const sale = sales.find(s => s.id === Number(saleId));
    if (!sale) return;
    setForm({
      ...form,
      sale_id: saleId,
      customer_name: sale.customer_name || '',
      items: (sale.items || []).map(i => ({ product_id: i.product_id, product_name: i.product_name, quantity: i.quantity, unit_price: i.sell_price || i.unit_price, gst_percentage: i.gst_percentage || 18 }))
    });
  };

  const handleSave = async () => {
    if (!form.items.length) return showToast('Add items', 'error');
    const r = await fetch(`${API}/accounting/credit-notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json();
    if (d.success) { showToast(`Credit note ${d.data.credit_note_number} created`); load(); setShowAdd(false); }
    else showToast(d.error, 'error');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3>Credit Notes / Sale Returns ({notes.length})</h3>
        <button className="btn btn-success" onClick={() => setShowAdd(true)}>+ New Credit Note</button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #e74c3c' }}>
          <div className="form-row">
            <div className="form-group">
              <label>Against Sale (optional)</label>
              <select value={form.sale_id} onChange={e => handleSaleSelect(e.target.value)}>
                <option value="">-- Select Sale --</option>
                {sales.map(s => <option key={s.id} value={s.id}>{s.invoice_number} - {s.customer_name} - ₹{s.grand_total}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Customer Name</label><input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div className="form-group"><label>Reason</label><input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Return reason" /></div>
          </div>
          <table style={{ marginBottom: 8 }}>
            <thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th>Total</th><th></th></tr></thead>
            <tbody>
              {form.items.map((item, i) => (
                <tr key={i}>
                  <td><input value={item.product_name} onChange={e => { const items = [...form.items]; items[i].product_name = e.target.value; setForm({ ...form, items }); }} style={{ width: 200 }} /></td>
                  <td><input type="number" value={item.quantity} onChange={e => { const items = [...form.items]; items[i].quantity = Number(e.target.value); setForm({ ...form, items }); }} style={{ width: 60 }} /></td>
                  <td><input type="number" value={item.unit_price} onChange={e => { const items = [...form.items]; items[i].unit_price = Number(e.target.value); setForm({ ...form, items }); }} style={{ width: 80 }} /></td>
                  <td>₹{(item.quantity * item.unit_price).toFixed(2)}</td>
                  <td><button className="btn btn-sm btn-outline" onClick={() => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) })} style={{ color: '#e74c3c' }}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-outline" onClick={() => setForm({ ...form, items: [...form.items, { product_id: '', product_name: '', quantity: 1, unit_price: 0, gst_percentage: 18 }] })}>+ Add Item</button>
            <button className="btn btn-success" onClick={handleSave}>Create Credit Note</button>
            <button className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead><tr><th>CN Number</th><th>Date</th><th>Customer</th><th>Reason</th><th>Amount</th></tr></thead>
          <tbody>
            {notes.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: '#999' }}>No credit notes</td></tr> :
              notes.map(n => (
                <tr key={n.id}>
                  <td style={{ fontFamily: 'monospace' }}>{n.credit_note_number}</td>
                  <td>{n.credit_date}</td>
                  <td>{n.customer_name}</td>
                  <td>{n.reason}</td>
                  <td style={{ fontWeight: 700 }}>₹{n.total.toFixed(2)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ========== DEBIT NOTES ==========
function DebitNotes({ showToast }) {
  const [notes, setNotes] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ purchase_id: '', supplier_name: '', reason: '', items: [{ product_id: '', product_name: '', quantity: 1, unit_price: 0, gst_percentage: 18 }] });

  const load = () => fetch(`${API}/accounting/debit-notes`).then(r => r.json()).then(d => { if (d.success) setNotes(d.data); });
  useEffect(() => {
    load();
    fetch(`${API}/purchases`).then(r => r.json()).then(d => { if (d.success) setPurchases(d.data); }).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!form.items.length) return showToast('Add items', 'error');
    const r = await fetch(`${API}/accounting/debit-notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json();
    if (d.success) { showToast(`Debit note ${d.data.debit_note_number} created`); load(); setShowAdd(false); }
    else showToast(d.error, 'error');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3>Debit Notes / Purchase Returns ({notes.length})</h3>
        <button className="btn btn-success" onClick={() => setShowAdd(true)}>+ New Debit Note</button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #f39c12' }}>
          <div className="form-row">
            <div className="form-group"><label>Supplier Name</label><input value={form.supplier_name} onChange={e => setForm({ ...form, supplier_name: e.target.value })} /></div>
            <div className="form-group"><label>Reason</label><input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Return reason" /></div>
          </div>
          <table style={{ marginBottom: 8 }}>
            <thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th>Total</th><th></th></tr></thead>
            <tbody>
              {form.items.map((item, i) => (
                <tr key={i}>
                  <td><input value={item.product_name} onChange={e => { const items = [...form.items]; items[i].product_name = e.target.value; setForm({ ...form, items }); }} style={{ width: 200 }} /></td>
                  <td><input type="number" value={item.quantity} onChange={e => { const items = [...form.items]; items[i].quantity = Number(e.target.value); setForm({ ...form, items }); }} style={{ width: 60 }} /></td>
                  <td><input type="number" value={item.unit_price} onChange={e => { const items = [...form.items]; items[i].unit_price = Number(e.target.value); setForm({ ...form, items }); }} style={{ width: 80 }} /></td>
                  <td>₹{(item.quantity * item.unit_price).toFixed(2)}</td>
                  <td><button className="btn btn-sm btn-outline" onClick={() => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) })} style={{ color: '#e74c3c' }}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-outline" onClick={() => setForm({ ...form, items: [...form.items, { product_id: '', product_name: '', quantity: 1, unit_price: 0, gst_percentage: 18 }] })}>+ Add Item</button>
            <button className="btn btn-success" onClick={handleSave}>Create Debit Note</button>
            <button className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead><tr><th>DN Number</th><th>Date</th><th>Supplier</th><th>Reason</th><th>Amount</th></tr></thead>
          <tbody>
            {notes.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: '#999' }}>No debit notes</td></tr> :
              notes.map(n => (
                <tr key={n.id}>
                  <td style={{ fontFamily: 'monospace' }}>{n.debit_note_number}</td>
                  <td>{n.debit_date}</td>
                  <td>{n.supplier_name}</td>
                  <td>{n.reason}</td>
                  <td style={{ fontWeight: 700 }}>₹{n.total.toFixed(2)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ========== LEDGER ==========
function Ledger({ showToast }) {
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => { fetch(`${API}/accounting/accounts`).then(r => r.json()).then(d => { if (d.success) setAccounts(d.data); }); }, []);

  const loadLedger = (accId) => {
    setSelected(accId);
    if (!accId) { setData(null); return; }
    fetch(`${API}/accounting/ledger/${accId}`).then(r => r.json()).then(d => { if (d.success) setData(d.data); });
  };

  return (
    <div>
      <h3 style={{ marginBottom: 16 }}>General Ledger</h3>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Select Account</label>
            <select value={selected} onChange={e => loadLedger(e.target.value)}>
              <option value="">-- Select Account --</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {data && (
        <div className="card">
          <h4 style={{ marginBottom: 12 }}>{data.account.code} - {data.account.name}</h4>
          <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>Opening Balance: ₹{data.opening_balance.toFixed(2)}</p>
          <table>
            <thead><tr><th>Date</th><th>Voucher</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
            <tbody>
              {data.entries.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: '#999' }}>No entries</td></tr> :
                data.entries.map((e, i) => (
                  <tr key={i}>
                    <td>{e.entry_date}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{e.entry_number}</td>
                    <td>{e.line_desc || e.entry_desc}</td>
                    <td>{e.debit > 0 ? `₹${e.debit.toFixed(2)}` : '-'}</td>
                    <td>{e.credit > 0 ? `₹${e.credit.toFixed(2)}` : '-'}</td>
                    <td style={{ fontWeight: 700 }}>₹{e.balance.toFixed(2)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
          <div style={{ marginTop: 12, padding: 12, background: '#f0f9ff', borderRadius: 8, fontWeight: 700 }}>
            Closing Balance: ₹{data.closing_balance.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}

// ========== TRIAL BALANCE ==========
function TrialBalance() {
  const [data, setData] = useState(null);
  const [asOn, setAsOn] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { fetch(`${API}/accounting/trial-balance?as_on=${asOn}`).then(r => r.json()).then(d => { if (d.success) setData(d.data); }); }, [asOn]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3>Trial Balance</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12 }}>As on:</label>
          <input type="date" value={asOn} onChange={e => setAsOn(e.target.value)} style={{ width: 150 }} />
        </div>
      </div>

      {data && (
        <div className="card">
          <table>
            <thead><tr><th>Code</th><th>Account Name</th><th>Type</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th></tr></thead>
            <tbody>
              {data.accounts.map(a => (
                <tr key={a.id}>
                  <td style={{ fontFamily: 'monospace' }}>{a.code}</td>
                  <td>{a.name}</td>
                  <td style={{ fontSize: 11, color: '#999' }}>{a.account_type}</td>
                  <td style={{ textAlign: 'right' }}>{a.debit > 0 ? `₹${a.debit.toFixed(2)}` : '-'}</td>
                  <td style={{ textAlign: 'right' }}>{a.credit > 0 ? `₹${a.credit.toFixed(2)}` : '-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid #2c3e50' }}>
                <td colSpan={3}>TOTAL</td>
                <td style={{ textAlign: 'right' }}>₹{data.totalDebit.toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>₹{data.totalCredit.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          <div style={{ marginTop: 12, padding: 12, background: data.isBalanced ? '#f0fdf4' : '#fef2f2', borderRadius: 8, fontWeight: 700, color: data.isBalanced ? '#166534' : '#991b1b' }}>
            {data.isBalanced ? '✅ Trial Balance is balanced' : '⚠️ Trial Balance is NOT balanced'}
          </div>
        </div>
      )}
    </div>
  );
}

// ========== PROFIT & LOSS ==========
function ProfitLoss() {
  const [data, setData] = useState(null);
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-04-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { fetch(`${API}/accounting/profit-loss?start_date=${startDate}&end_date=${endDate}`).then(r => r.json()).then(d => { if (d.success) setData(d.data); }); }, [startDate, endDate]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3>Profit & Loss Statement</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12 }}>From:</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: 150 }} />
          <label style={{ fontSize: 12 }}>To:</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: 150 }} />
        </div>
      </div>

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <h4 style={{ color: '#27ae60', marginBottom: 12 }}>📈 Income</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span>Sales Revenue</span><strong>₹{data.income.sales.toLocaleString('en-IN')}</strong>
            </div>
            {data.income.creditNotes > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0', color: '#e74c3c' }}>
              <span>Less: Credit Notes</span><strong>-₹{data.income.creditNotes.toLocaleString('en-IN')}</strong>
            </div>}
            {data.income.items.filter(i => i.net > 0).map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span>{a.name}</span><span>₹{a.net.toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 700, fontSize: 16, borderTop: '2px solid #27ae60' }}>
              <span>Total Income</span><span>₹{data.income.total.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="card">
            <h4 style={{ color: '#e74c3c', marginBottom: 12 }}>📉 Expenses</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span>Purchases</span><strong>₹{data.expenses.purchases.toLocaleString('en-IN')}</strong>
            </div>
            {data.expenses.debitNotes > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0', color: '#27ae60' }}>
              <span>Less: Debit Notes</span><strong>-₹{data.expenses.debitNotes.toLocaleString('en-IN')}</strong>
            </div>}
            {data.expenses.items.filter(i => i.net > 0).map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span>{a.name}</span><span>₹{a.net.toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 700, fontSize: 16, borderTop: '2px solid #e74c3c' }}>
              <span>Total Expenses</span><span>₹{data.expenses.total.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', background: data.isProfit ? '#f0fdf4' : '#fef2f2', borderRadius: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{data.isProfit ? '🟢 Net Profit' : '🔴 Net Loss'}</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: data.isProfit ? '#16a34a' : '#dc2626' }}>₹{Math.abs(data.netProfit).toLocaleString('en-IN')}</span>
            </div>
            <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>Period: {data.period.start} to {data.period.end}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== BALANCE SHEET ==========
function BalanceSheet() {
  const [data, setData] = useState(null);
  const [asOn, setAsOn] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { fetch(`${API}/accounting/balance-sheet?as_on=${asOn}`).then(r => r.json()).then(d => { if (d.success) setData(d.data); }); }, [asOn]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3>Balance Sheet</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12 }}>As on:</label>
          <input type="date" value={asOn} onChange={e => setAsOn(e.target.value)} style={{ width: 150 }} />
        </div>
      </div>

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <h4 style={{ marginBottom: 12 }}>ASSETS</h4>
            <h5 style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Current Assets</h5>
            {Object.entries(data.assets.current).filter(([k, v]) => k !== 'total' && v !== 0).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</span><span>₹{v.toLocaleString('en-IN')}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 600 }}>
              <span>Current Assets Total</span><span>₹{data.assets.current.total.toLocaleString('en-IN')}</span>
            </div>

            <h5 style={{ fontSize: 12, color: '#666', marginTop: 12, marginBottom: 8 }}>Fixed Assets</h5>
            {Object.entries(data.assets.fixed).filter(([k, v]) => k !== 'total' && v !== 0).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</span><span>₹{v.toLocaleString('en-IN')}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 600 }}>
              <span>Fixed Assets Total</span><span>₹{data.assets.fixed.total.toLocaleString('en-IN')}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#f0f9ff', borderRadius: 8, fontWeight: 700, fontSize: 16, marginTop: 12 }}>
              <span>TOTAL ASSETS</span><span>₹{data.totalAssets.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="card">
            <h4 style={{ marginBottom: 12 }}>LIABILITIES & CAPITAL</h4>
            <h5 style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Current Liabilities</h5>
            {Object.entries(data.liabilities.current).filter(([k, v]) => k !== 'total' && v !== 0).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</span><span>₹{v.toLocaleString('en-IN')}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 600 }}>
              <span>Current Liabilities Total</span><span>₹{data.liabilities.current.total.toLocaleString('en-IN')}</span>
            </div>

            <h5 style={{ fontSize: 12, color: '#666', marginTop: 12, marginBottom: 8 }}>Capital</h5>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span>Owner Capital</span><span>₹{data.liabilities.capital.ownerCapital.toLocaleString('en-IN')}</span>
            </div>
            {data.liabilities.capital.ownerDrawings !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span>Owner Drawings</span><span>-₹{data.liabilities.capital.ownerDrawings.toLocaleString('en-IN')}</span>
            </div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 600 }}>
              <span>Net Capital</span><span>₹{data.liabilities.capital.total.toLocaleString('en-IN')}</span>
            </div>

            <h5 style={{ fontSize: 12, color: '#666', marginTop: 12, marginBottom: 8 }}>Retained Earnings</h5>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span>Profit/Loss to date</span><span style={{ color: data.retainedEarnings >= 0 ? '#16a34a' : '#dc2626' }}>₹{data.retainedEarnings.toLocaleString('en-IN')}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: data.isBalanced ? '#f0fdf4' : '#fef2f2', borderRadius: 8, fontWeight: 700, fontSize: 16, marginTop: 12 }}>
              <span>TOTAL LIABILITIES</span><span>₹{data.totalLiabilities.toLocaleString('en-IN')}</span>
            </div>

            <div style={{ marginTop: 12, padding: 12, background: data.isBalanced ? '#f0fdf4' : '#fef2f2', borderRadius: 8, fontWeight: 700, color: data.isBalanced ? '#166534' : '#991b1b' }}>
              {data.isBalanced ? '✅ Balance Sheet is balanced' : '⚠️ Difference: ₹' + Math.abs(data.totalAssets - data.totalLiabilities).toFixed(2)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

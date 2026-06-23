import React, { useState, useEffect, useRef } from 'react';

const API = '/api';

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffSales, setStaffSales] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSale, setShowSale] = useState(false);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', commission_rate: 5, daily_target: 0 });
  const [saleForm, setSaleForm] = useState({ barcode: '', product_name: '', quantity: 1, unit_price: 0, notes: '' });
  const barcodeRef = useRef(null);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const loadStaff = () => {
    fetch(`${API}/staff`).then(r => r.json()).then(d => { if (d.success) setStaff(d.data); });
  };

  useEffect(() => { loadStaff(); }, []);

  const loadStaffSales = (staffId) => {
    fetch(`${API}/staff/${staffId}/sales`).then(r => r.json()).then(d => {
      if (d.success) {
        setSelectedStaff(staff.find(s => s.id === staffId));
        setStaffSales(d.data);
      }
    });
  };

  const handleAddStaff = async () => {
    if (!form.name) return showToast('Name required', 'error');
    const r = await fetch(`${API}/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json();
    if (d.success) { showToast('Staff added'); loadStaff(); setShowAdd(false); setForm({ name: '', phone: '', commission_rate: 5, daily_target: 0 }); }
    else showToast(d.error, 'error');
  };

  const handleBarcodeScan = async (e) => {
    if (e.key !== 'Enter') return;
    const code = saleForm.barcode.trim();
    if (!code) return;
    await lookupBarcode(code);
  };

  const lookupBarcode = async (code) => {
    try {
      const r = await fetch(`${API}/products/barcode/${encodeURIComponent(code)}`);
      if (r.ok) {
        const d = await r.json();
        if (d.success && d.data) {
          setSaleForm(prev => ({ ...prev, product_name: d.data.name, unit_price: d.data.sell_price, barcode: d.data.barcode }));
          showToast(`Found: ${d.data.name}`);
          return;
        }
      }
      // Fallback: search by name
      const r2 = await fetch(`${API}/products?search=${encodeURIComponent(code)}&limit=5`);
      if (r2.ok) {
        const d2 = await r2.json();
        if (d2.success && d2.data?.length > 0) {
          const p = d2.data[0];
          setSaleForm(prev => ({ ...prev, product_name: p.name, unit_price: p.sell_price, barcode: p.barcode || code }));
          showToast(`Found: ${p.name}`);
          return;
        }
      }
      showToast('Product not found', 'error');
    } catch { showToast('Lookup failed', 'error'); }
  };

  const handleManualLookup = async () => {
    const code = saleForm.barcode.trim();
    if (!code) return showToast('Enter barcode or product name', 'error');
    await lookupBarcode(code);
  };

  const handleAddSale = async () => {
    if (!selectedStaff || !saleForm.product_name) return showToast('Select staff and product', 'error');
    const r = await fetch(`${API}/staff/${selectedStaff.id}/sales`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...saleForm, sale_date: new Date().toISOString().split('T')[0] })
    });
    const d = await r.json();
    if (d.success) {
      showToast(`Sale added! Commission: ₹${d.data.commission_amount}`);
      setSaleForm({ barcode: '', product_name: '', quantity: 1, unit_price: 0, notes: '' });
      loadStaffSales(selectedStaff.id);
      loadStaff();
    } else showToast(d.error, 'error');
  };

  const handleDeleteStaff = async (id) => {
    if (!confirm('Delete this staff member?')) return;
    const r = await fetch(`${API}/staff/${id}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.success) { showToast('Staff deleted'); loadStaff(); if (selectedStaff?.id === id) { setSelectedStaff(null); setStaffSales(null); } }
  };

  const handleDeleteSale = async (saleId) => {
    if (!confirm('Delete this sale?')) return;
    const r = await fetch(`${API}/staff/sales/${saleId}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.success) { showToast('Sale deleted'); if (selectedStaff) loadStaffSales(selectedStaff.id); loadStaff(); }
  };

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>👥 Staff Commission</h2>
        <button className="btn btn-success" onClick={() => setShowAdd(true)}>+ Add Staff</button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #27ae60' }}>
          <h3 style={{ marginBottom: 12 }}>Add New Staff Member</h3>
          <div className="form-row">
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Staff name" /></div>
            <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" /></div>
            <div className="form-group"><label>Commission %</label><input type="number" value={form.commission_rate} onChange={e => setForm({ ...form, commission_rate: Number(e.target.value) })} min="0" max="100" /></div>
            <div className="form-group"><label>Daily Target (₹)</label><input type="number" value={form.daily_target} onChange={e => setForm({ ...form, daily_target: Number(e.target.value) })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" onClick={handleAddStaff}>Add Staff</button>
            <button className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 16 }}>
        {/* Staff List */}
        <div className="card" style={{ padding: 12, maxHeight: 600, overflowY: 'auto' }}>
          <h3 style={{ marginBottom: 12 }}>Staff Members ({staff.length})</h3>
          {staff.length === 0 ? <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>No staff added</p> :
            staff.map(s => (
              <div key={s.id} onClick={() => loadStaffSales(s.id)}
                style={{ padding: '12px', borderRadius: 8, cursor: 'pointer', marginBottom: 8, border: selectedStaff?.id === s.id ? '2px solid #3498db' : '1px solid #eee', background: selectedStaff?.id === s.id ? '#f0f7ff' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                    {s.phone && <div style={{ fontSize: 11, color: '#999' }}>{s.phone}</div>}
                    <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Commission: {s.commission_rate}% · Target: ₹{s.daily_target?.toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#27ae60' }}>₹{s.today_commission?.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: '#999' }}>Today</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 11 }}>
                  <span className="badge badge-info">Today: {s.today_sales} sales</span>
                  <span className="badge badge-success">₹{s.today_amount?.toLocaleString()}</span>
                  <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); handleDeleteStaff(s.id); }} style={{ marginLeft: 'auto', color: '#e74c3c', fontSize: 10 }}>🗑</button>
                </div>
              </div>
            ))
          }
        </div>

        {/* Staff Details */}
        <div className="card" style={{ padding: 12, maxHeight: 600, overflowY: 'auto' }}>
          {!selectedStaff ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              <p style={{ fontSize: 48, marginBottom: 8 }}>👤</p>
              <p>Select a staff member to view details and add sales</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3>{selectedStaff.name}</h3>
                  <p style={{ fontSize: 12, color: '#666' }}>Commission: {selectedStaff.commission_rate}% · Daily Target: ₹{selectedStaff.daily_target?.toLocaleString()}</p>
                </div>
                <button className="btn btn-success" onClick={() => setShowSale(true)}>+ Add Sale</button>
              </div>

              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#666' }}>Today</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>₹{staffSales?.sales?.filter(s => s.sale_date === new Date().toISOString().split('T')[0]).reduce((sum, s) => sum + s.commission_amount, 0)?.toLocaleString() || 0}</div>
                  <div style={{ fontSize: 10, color: '#999' }}>{staffSales?.sales?.filter(s => s.sale_date === new Date().toISOString().split('T')[0]).length || 0} sales</div>
                </div>
                <div style={{ padding: 12, background: '#f0f9ff', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#666' }}>Total Sales</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#2563eb' }}>₹{staffSales?.total_amount?.toLocaleString() || 0}</div>
                  <div style={{ fontSize: 10, color: '#999' }}>{staffSales?.total_sales || 0} sales</div>
                </div>
                <div style={{ padding: 12, background: '#fefce8', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#666' }}>Total Commission</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#d97706' }}>₹{staffSales?.total_commission?.toLocaleString() || 0}</div>
                  <div style={{ fontSize: 10, color: '#999' }}>{selectedStaff.commission_rate}% rate</div>
                </div>
              </div>

              {/* Add Sale Form */}
              {showSale && (
                <div style={{ marginBottom: 16, padding: 16, background: '#f0f7ff', borderRadius: 8, border: '2px solid #3498db' }}>
                  <h4 style={{ marginBottom: 12 }}>Add Sale (Scan Barcode)</h4>
                  <div className="form-row">
                  <div className="form-group">
                    <label>Barcode / Product Name</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input ref={barcodeRef} value={saleForm.barcode} onChange={e => setSaleForm({ ...saleForm, barcode: e.target.value })} onKeyDown={handleBarcodeScan} placeholder="Scan or type barcode/product name..." style={{ flex: 1 }} autoFocus />
                      <button className="btn btn-sm btn-primary" onClick={handleManualLookup}>🔍 Find</button>
                    </div>
                  </div>
                    <div className="form-group"><label>Product Name</label><input value={saleForm.product_name} onChange={e => setSaleForm({ ...saleForm, product_name: e.target.value })} /></div>
                    <div className="form-group"><label>Qty</label><input type="number" value={saleForm.quantity} onChange={e => setSaleForm({ ...saleForm, quantity: Number(e.target.value) })} min="1" /></div>
                    <div className="form-group"><label>Price (₹)</label><input type="number" value={saleForm.unit_price} onChange={e => setSaleForm({ ...saleForm, unit_price: Number(e.target.value) })} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-success" onClick={handleAddSale}>Add Sale</button>
                    <button className="btn btn-outline" onClick={() => setShowSale(false)}>Cancel</button>
                    <span style={{ fontSize: 12, color: '#666', marginLeft: 12 }}>Commission: ₹{(saleForm.unit_price * saleForm.quantity * selectedStaff.commission_rate / 100).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Sales History */}
              <h4 style={{ marginBottom: 12 }}>Sales History</h4>
              <table>
                <thead><tr><th>Date</th><th>Product</th><th>Barcode</th><th>Qty</th><th>Price</th><th>Amount</th><th>Commission</th><th></th></tr></thead>
                <tbody>
                  {staffSales?.sales?.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: '#999' }}>No sales recorded</td></tr> :
                    staffSales?.sales?.map(sale => (
                      <tr key={sale.id}>
                        <td>{sale.sale_date}</td>
                        <td><strong>{sale.product_name}</strong></td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{sale.barcode || '-'}</td>
                        <td>{sale.quantity}</td>
                        <td>₹{sale.unit_price?.toLocaleString()}</td>
                        <td>₹{(sale.unit_price * sale.quantity).toLocaleString()}</td>
                        <td style={{ fontWeight: 700, color: '#27ae60' }}>₹{sale.commission_amount?.toLocaleString()}</td>
                        <td><button className="btn btn-sm btn-outline" onClick={() => handleDeleteSale(sale.id)} style={{ color: '#e74c3c' }}>✕</button></td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

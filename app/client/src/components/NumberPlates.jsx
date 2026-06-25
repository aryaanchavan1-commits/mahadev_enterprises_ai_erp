import React, { useState, useEffect } from 'react';

const API = '/api';

export default function NumberPlates() {
  const [plates, setPlates] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editPlate, setEditPlate] = useState(null);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState({ customer_name: '', phone: '', plate_number: '', hsn_code: '', plate_type: 'standard', order_date: new Date().toISOString().split('T')[0], fitting_date: '', challan_date: '', delivery_date: '', amount: 0, notes: '' });

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const loadPlates = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (search) params.set('search', search);
    fetch(`${API}/plates?${params}`).then(r => r.json()).then(d => { if (d.success) setPlates(d.data); });
  };

  useEffect(() => { loadPlates(); }, [statusFilter, search]);

  const handleAdd = async () => {
    if (!form.customer_name || !form.plate_number) return showToast('Customer name and plate number required', 'error');
    const r = await fetch(`${API}/plates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json();
    if (d.success) { showToast('Order added'); loadPlates(); setShowAdd(false); setForm({ customer_name: '', phone: '', plate_number: '', plate_type: 'standard', order_date: new Date().toISOString().split('T')[0], delivery_date: '', amount: 0, notes: '' }); }
    else showToast(d.error, 'error');
  };

  const handleUpdate = async () => {
    if (!editPlate) return;
    const r = await fetch(`${API}/plates/${editPlate.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json();
    if (d.success) { showToast('Updated'); loadPlates(); setEditPlate(null); }
    else showToast(d.error, 'error');
  };

  const handleStatusChange = async (id, status) => {
    const r = await fetch(`${API}/plates/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const d = await r.json();
    if (d.success) { showToast(`Status: ${status}`); loadPlates(); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this order?')) return;
    const r = await fetch(`${API}/plates/${id}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.success) { showToast('Deleted'); loadPlates(); }
  };

  const openEdit = (plate) => {
    setEditPlate(plate);
    setForm({ customer_name: plate.customer_name, phone: plate.phone, plate_number: plate.plate_number, hsn_code: plate.hsn_code || '', plate_type: plate.plate_type, order_date: plate.order_date, fitting_date: plate.fitting_date || '', challan_date: plate.challan_date || '', delivery_date: plate.delivery_date, amount: plate.amount, notes: plate.notes });
  };

  const statusColors = { pending: '#f59e0b', in_progress: '#3b82f6', ready: '#10b981', delivered: '#6b7280', cancelled: '#ef4444' };
  const statusLabels = { pending: 'Pending', in_progress: 'In Progress', ready: 'Ready', delivered: 'Delivered', cancelled: 'Cancelled' };

  const summary = {
    total: plates.length,
    pending: plates.filter(p => p.status === 'pending').length,
    in_progress: plates.filter(p => p.status === 'in_progress').length,
    ready: plates.filter(p => p.status === 'ready').length,
    delivered: plates.filter(p => p.status === 'delivered').length,
  };

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>🔢 Number Plate Orders</h2>
        <button className="btn btn-success" onClick={() => { setShowAdd(true); setEditPlate(null); setForm({ customer_name: '', phone: '', plate_number: '', plate_type: 'standard', order_date: new Date().toISOString().split('T')[0], delivery_date: '', amount: 0, notes: '' }); }}>+ New Order</button>
      </div>

      {/* Summary */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-value">{summary.total}</div><div className="stat-label">Total Orders</div></div>
        <div className="stat-card warning"><div className="stat-value">{summary.pending}</div><div className="stat-label">Pending</div></div>
        <div className="stat-card accent"><div className="stat-value">{summary.in_progress}</div><div className="stat-label">In Progress</div></div>
        <div className="stat-card success"><div className="stat-value">{summary.ready}</div><div className="stat-label">Ready</div></div>
      </div>

      {/* Filters */}
      <div className="search-bar" style={{ marginBottom: 16 }}>
        <input placeholder="Search by customer name, plate number, phone..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 150 }}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="ready">Ready</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Add/Edit Form */}
      {(showAdd || editPlate) && (
        <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${editPlate ? '#3498db' : '#27ae60'}` }}>
          <h3 style={{ marginBottom: 12 }}>{editPlate ? 'Edit Order' : 'New Number Plate Order'}</h3>
          <div className="form-row">
            <div className="form-group"><label>Customer Name *</label><input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div className="form-group"><label>Phone *</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-group"><label>Plate Number *</label><input value={form.plate_number} onChange={e => setForm({ ...form, plate_number: e.target.value.toUpperCase() })} placeholder="MH 01 AB 1234" /></div>
            <div className="form-group"><label>HSN Code</label><input value={form.hsn_code} onChange={e => setForm({ ...form, hsn_code: e.target.value })} placeholder="e.g. 8708" /></div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Plate Type</label>
              <select value={form.plate_type} onChange={e => setForm({ ...form, plate_type: e.target.value })}>
                <option value="standard">Standard</option>
                <option value="fancy">Fancy</option>
                <option value="temporary">Temporary</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
            <div className="form-group"><label>Order Date</label><input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} /></div>
            <div className="form-group"><label>Fitting Date</label><input type="date" value={form.fitting_date} onChange={e => setForm({ ...form, fitting_date: e.target.value })} /></div>
            <div className="form-group"><label>Challan Date</label><input type="date" value={form.challan_date} onChange={e => setForm({ ...form, challan_date: e.target.value })} /></div>
            <div className="form-group"><label>Delivery Date</label><input type="date" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Amount (₹)</label><input value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          </div>
          <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" onClick={editPlate ? handleUpdate : handleAdd}>{editPlate ? 'Update' : 'Add Order'}</button>
            <button className="btn btn-outline" onClick={() => { setShowAdd(false); setEditPlate(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Orders Table */}
      <div className="card">
        <table>
          <thead>
            <tr><th>#</th><th>Customer</th><th>Phone</th><th>Plate Number</th><th>Type</th><th>Order Date</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {plates.length === 0 ? <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: '#999' }}>No orders</td></tr> :
              plates.map((plate, i) => (
                <tr key={plate.id}>
                  <td>{i + 1}</td>
                  <td><strong>{plate.customer_name}</strong></td>
                  <td>{plate.phone || '-'}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>{plate.plate_number}</td>
                  <td style={{ textTransform: 'capitalize' }}>{plate.plate_type}</td>
                  <td>{plate.order_date}</td>
                  <td>₹{plate.amount?.toLocaleString()}</td>
                  <td>
                    <select value={plate.status} onChange={e => handleStatusChange(plate.id, e.target.value)} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, background: statusColors[plate.status] + '20', color: statusColors[plate.status], border: `1px solid ${statusColors[plate.status]}` }}>
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="ready">Ready</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-info" style={{ marginRight: 4 }} onClick={() => openEdit(plate)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(plate.id)}>Del</button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

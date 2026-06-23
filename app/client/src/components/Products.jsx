import React, { useState, useEffect, useRef } from 'react';

const API = '/api';
const PAGE_SIZE = 50;

export default function Products() {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);
  const searchTimeout = useRef(null);

  const emptyProduct = {
    name: '', image: '', quantity: 0, description: '', hsn_code: '',
    sell_price: 0, wholesale_price: 0, inward_price: 0, serial_number: '', discount_percent: 0,
    barcode: '', category_id: ''
  };

  const [form, setForm] = useState(emptyProduct);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadProducts = (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: p, limit: PAGE_SIZE });
    if (search) params.set('search', search);
    if (categoryFilter) params.set('category_id', categoryFilter);
    fetch(`${API}/products?${params}`)
      .then(r => r.json())
      .then(d => { if (d.success) { setProducts((d.data || []).sort((a, b) => a.name.localeCompare(b.name))); setTotal(d.total || d.data.length); } })
      .catch(() => showToast('Failed to load', 'error'))
      .finally(() => setLoading(false));
  };

  const loadCategories = () => {
    fetch(`${API}/categories`).then(r => r.json()).then(d => { if (d.success) setCategories(d.data.sort((a, b) => a.name.localeCompare(b.name))); });
  };

  useEffect(() => { loadCategories(); }, []);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { setPage(1); loadProducts(1); }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [search, categoryFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const goToPage = (p) => { setPage(p); loadProducts(p); };

  const openAdd = () => { setEditProduct(null); setForm(emptyProduct); setShowModal(true); };

  const openEdit = (p) => {
    setEditProduct(p);
    setForm({ ...p, category_id: p.category_id || '' });
    setShowModal(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    try {
      const r = await fetch(`${API}/upload/image`, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.success) setForm({ ...form, image: d.data.original });
    } catch { showToast('Upload failed', 'error'); }
  };

  const handleSave = async () => {
    if (!form.name) return showToast('Product name required', 'error');
    const url = editProduct ? `${API}/products/${editProduct.id}` : `${API}/products`;
    const method = editProduct ? 'PUT' : 'POST';
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await r.json();
      if (d.success) { showToast(editProduct ? 'Updated' : 'Created'); setShowModal(false); loadProducts(); }
      else showToast(d.error, 'error');
    } catch { showToast('Save failed', 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return;
    try {
      const r = await fetch(`${API}/products/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) { showToast('Deleted'); loadProducts(); }
      else showToast(d.error, 'error');
    } catch { showToast('Delete failed', 'error'); }
  };

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Products ({total.toLocaleString()})</h2>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Product</button>
      </div>

      <div className="search-bar">
        <input type="text" placeholder="Search by name, HSN, barcode..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); }} style={{ width: 200 }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.product_count})</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Name</th><th>HSN</th><th>Sell Price</th><th>Cost</th><th>Qty</th><th>Barcode</th><th>Category</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: '#999' }}>Loading...</td></tr> :
                products.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: '#999' }}>No products found</td></tr> :
                  products.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong>{p.description && <div style={{ fontSize: 10, color: '#999' }}>{p.description.substring(0, 40)}</div>}</td>
                      <td style={{ fontSize: 11 }}>{p.hsn_code || '-'}</td>
                      <td>₹{Number(p.sell_price).toLocaleString('en-IN')}</td>
                      <td style={{ color: '#999' }}>₹{Number(p.inward_price).toLocaleString('en-IN')}</td>
                      <td><span className={`badge ${p.quantity <= 0 ? 'badge-danger' : p.quantity <= 5 ? 'badge-warning' : 'badge-success'}`}>{p.quantity}</span></td>
                      <td style={{ fontSize: 10, fontFamily: 'monospace' }}>{p.barcode || '-'}</td>
                      <td style={{ fontSize: 12 }}>{p.category_name || '-'}</td>
                      <td>
                        <button className="btn btn-sm btn-info" style={{ marginRight: 4 }} onClick={() => openEdit(p)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Del</button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid #eee' }}>
            <span style={{ fontSize: 12, color: '#666' }}>Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-sm btn-outline" onClick={() => goToPage(1)} disabled={page === 1}>«</button>
              <button className="btn btn-sm btn-outline" onClick={() => goToPage(page - 1)} disabled={page === 1}>‹</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                if (p > totalPages) return null;
                return <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-outline'}`} onClick={() => goToPage(p)}>{p}</button>;
              })}
              <button className="btn btn-sm btn-outline" onClick={() => goToPage(page + 1)} disabled={page === totalPages}>›</button>
              <button className="btn btn-sm btn-outline" onClick={() => goToPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 700 }}>
            <h3>{editProduct ? 'Edit Product' : 'Add New Product'}</h3>
            <div className="form-row">
              <div className="form-group"><label>Product Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="form-group"><label>HSN Code</label><input value={form.hsn_code} onChange={e => setForm({ ...form, hsn_code: e.target.value })} placeholder="e.g. 8708" /></div>
            </div>
            <div className="form-group"><label>Description</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="form-row">
              <div className="form-group"><label>Quantity</label><input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
              <div className="form-group"><label>Sell Price (₹)</label><input type="number" step="0.01" value={form.sell_price} onChange={e => setForm({ ...form, sell_price: Number(e.target.value) })} /></div>
              <div className="form-group"><label>Wholesale Price (₹)</label><input type="number" step="0.01" value={form.wholesale_price} onChange={e => setForm({ ...form, wholesale_price: Number(e.target.value) })} /></div>
              <div className="form-group"><label>Cost Price (₹)</label><input type="number" step="0.01" value={form.inward_price} onChange={e => setForm({ ...form, inward_price: Number(e.target.value) })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Barcode</label><input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="Auto if empty" /></div>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">-- Select --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Image</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="file" accept="image/*" ref={fileRef} onChange={handleImageUpload} style={{ display: 'none' }} />
                <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>Choose Image</button>
                {form.image && <img src={form.image} alt="" style={{ width: 50, height: 50, borderRadius: 6, objectFit: 'cover' }} />}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editProduct ? 'Update' : 'Create'} Product</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

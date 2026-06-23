import React, { useState, useEffect } from 'react';

const API = '/api';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [editCat, setEditCat] = useState(null);
  const [catName, setCatName] = useState('');
  const [toast, setToast] = useState(null);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [search, setSearch] = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = () => {
    fetch(`${API}/categories`).then(r => r.json()).then(d => { if (d.success) setCategories(d.data.sort((a, b) => a.name.localeCompare(b.name))); });
    fetch(`${API}/products?limit=5000`).then(r => r.json()).then(d => { if (d.success) setProducts(d.data.sort((a, b) => a.name.localeCompare(b.name))); });
  };

  useEffect(() => { loadData(); }, []);

  const addCategory = async () => {
    if (!newCatName.trim()) return showToast('Enter category name', 'error');
    try {
      const r = await fetch(`${API}/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCatName.trim() }) });
      const d = await r.json();
      if (d.success) { showToast('Category added'); loadData(); setNewCatName(''); setShowAddCat(false); }
      else showToast(d.error || 'Failed', 'error');
    } catch { showToast('Failed', 'error'); }
  };

  const updateCategory = async (id, name) => {
    try {
      const r = await fetch(`${API}/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const d = await r.json();
      if (d.success) { showToast('Updated'); loadData(); setEditCat(null); }
      else showToast(d.error, 'error');
    } catch { showToast('Failed', 'error'); }
  };

  const deleteCategory = async (id, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      const r = await fetch(`${API}/categories/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) { showToast('Deleted'); loadData(); if (selectedCat === id) setSelectedCat(null); }
      else showToast(d.error, 'error');
    } catch { showToast('Failed', 'error'); }
  };

  // Products in selected category, sorted A-Z
  const catProducts = selectedCat
    ? products.filter(p => p.category_id === selectedCat).sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const filteredCategories = categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Categories ({categories.length})</h2>
        <button className="btn btn-success" onClick={() => setShowAddCat(true)}>+ Add Category</button>
      </div>

      {showAddCat && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #27ae60' }}>
          <h3 style={{ marginBottom: 12 }}>Add New Category</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name (e.g. BODY PARTS)" style={{ flex: 1 }} autoFocus onKeyDown={e => e.key === 'Enter' && addCategory()} />
            <button className="btn btn-success" onClick={addCategory}>Add</button>
            <button className="btn btn-outline" onClick={() => { setShowAddCat(false); setNewCatName(''); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="search-bar" style={{ marginBottom: 16 }}>
        <input placeholder="Search categories..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
        {/* CATEGORY LIST */}
        <div className="card" style={{ padding: 12, maxHeight: 600, overflowY: 'auto' }}>
          <div
            onClick={() => setSelectedCat(null)}
            style={{ padding: '10px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4, fontWeight: selectedCat === null ? 700 : 400, background: selectedCat === null ? '#3498db' : 'transparent', color: selectedCat === null ? '#fff' : '#333' }}
          >
            📦 All Categories ({products.length} products)
          </div>
          {filteredCategories.map(cat => {
            const count = products.filter(p => p.category_id === cat.id).length;
            return (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div
                  onClick={() => setSelectedCat(cat.id)}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4, fontWeight: selectedCat === cat.id ? 700 : 400, background: selectedCat === cat.id ? '#3498db' : 'transparent', color: selectedCat === cat.id ? '#fff' : '#333' }}
                >
                  📁 {cat.name} ({count})
                </div>
                <button className="btn btn-sm btn-outline" onClick={() => { setEditCat(cat.id); setCatName(cat.name); }} style={{ padding: '4px 6px', fontSize: 10 }}>✏</button>
                <button className="btn btn-sm btn-outline" onClick={() => deleteCategory(cat.id, cat.name)} style={{ padding: '4px 6px', fontSize: 10, color: '#e74c3c' }}>🗑</button>
              </div>
            );
          })}
          {filteredCategories.length === 0 && <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>No categories</p>}
        </div>

        {/* PRODUCTS IN CATEGORY */}
        <div className="card" style={{ padding: 12, maxHeight: 600, overflowY: 'auto' }}>
          {editCat && (
            <div style={{ marginBottom: 12, padding: 12, background: '#f0f7ff', borderRadius: 8 }}>
              <h4 style={{ marginBottom: 8 }}>Edit Category</h4>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={catName} onChange={e => setCatName(e.target.value)} style={{ flex: 1 }} autoFocus onKeyDown={e => e.key === 'Enter' && updateCategory(editCat, catName)} />
                <button className="btn btn-sm btn-success" onClick={() => updateCategory(editCat, catName)}>Save</button>
                <button className="btn btn-sm btn-outline" onClick={() => setEditCat(null)}>Cancel</button>
              </div>
            </div>
          )}

          <h3 style={{ marginBottom: 12 }}>
            {selectedCat ? `📁 ${categories.find(c => c.id === selectedCat)?.name || 'Category'}` : '📦 All Products'}
            <span style={{ fontSize: 14, fontWeight: 400, color: '#999', marginLeft: 8 }}>({catProducts.length} products)</span>
          </h3>

          {catProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              <p style={{ fontSize: 48, marginBottom: 8 }}>📦</p>
              <p>{selectedCat ? 'No products in this category' : 'Select a category to view products'}</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>#</th><th>Product Name</th><th>HSN</th><th>Price</th><th>Stock</th><th>Barcode</th></tr>
              </thead>
              <tbody>
                {catProducts.map((p, i) => (
                  <tr key={p.id}>
                    <td>{i + 1}</td>
                    <td><strong>{p.name}</strong>{p.description && <div style={{ fontSize: 10, color: '#999' }}>{p.description.substring(0, 50)}</div>}</td>
                    <td style={{ fontSize: 11 }}>{p.hsn_code || '-'}</td>
                    <td>₹{Number(p.sell_price).toLocaleString('en-IN')}</td>
                    <td><span className={`badge ${p.quantity <= 0 ? 'badge-danger' : p.quantity <= 5 ? 'badge-warning' : 'badge-success'}`}>{p.quantity}</span></td>
                    <td style={{ fontSize: 10, fontFamily: 'monospace' }}>{p.barcode || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

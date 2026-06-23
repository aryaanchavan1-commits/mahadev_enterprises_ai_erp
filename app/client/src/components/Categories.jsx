import React, { useState, useEffect } from 'react';

const API = '/api';

export default function Categories() {
  const [categories, setCategories] = useState([]);
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

  const loadCategories = () => {
    fetch(`${API}/categories`).then(r => r.json()).then(d => { if (d.success) setCategories(d.data); });
  };

  useEffect(() => { loadCategories(); }, []);

  const addCategory = async () => {
    if (!newCatName.trim()) return showToast('Enter category name', 'error');
    try {
      const r = await fetch(`${API}/categories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName.trim() })
      });
      const d = await r.json();
      if (d.success) { showToast('Category added'); loadCategories(); setNewCatName(''); setShowAddCat(false); }
      else showToast(d.error || 'Failed', 'error');
    } catch { showToast('Failed', 'error'); }
  };

  const updateCategory = async (id, name) => {
    try {
      const r = await fetch(`${API}/categories/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const d = await r.json();
      if (d.success) { showToast('Category updated'); loadCategories(); setEditCat(null); }
      else showToast(d.error || 'Failed', 'error');
    } catch { showToast('Failed', 'error'); }
  };

  const deleteCategory = async (id, name) => {
    if (!confirm(`Delete "${name}"? Products in this category will be uncategorized.`)) return;
    try {
      const r = await fetch(`${API}/categories/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) { showToast('Category deleted'); loadCategories(); }
      else showToast(d.error || 'Cannot delete', 'error');
    } catch { showToast('Failed', 'error'); }
  };

  const filtered = categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Categories ({categories.length})</h2>
        <button className="btn btn-success" onClick={() => setShowAddCat(true)}>+ Add Category</button>
      </div>

      <div className="search-bar" style={{ marginBottom: 16 }}>
        <input placeholder="Search categories..." value={search} onChange={e => setSearch(e.target.value)} />
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

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Category Name</th>
              <th>Products</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 30, color: '#999' }}>No categories found</td></tr>
            ) : filtered.map((cat, i) => (
              <tr key={cat.id}>
                <td>{i + 1}</td>
                <td>
                  {editCat === cat.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={catName} onChange={e => setCatName(e.target.value)} style={{ flex: 1 }} autoFocus onKeyDown={e => e.key === 'Enter' && updateCategory(cat.id, catName)} />
                      <button className="btn btn-sm btn-success" onClick={() => updateCategory(cat.id, catName)}>Save</button>
                      <button className="btn btn-sm btn-outline" onClick={() => setEditCat(null)}>X</button>
                    </div>
                  ) : (
                    <strong style={{ cursor: 'pointer' }} onClick={() => { setEditCat(cat.id); setCatName(cat.name); }}>{cat.name}</strong>
                  )}
                </td>
                <td><span className="badge badge-info">{cat.product_count || 0}</span></td>
                <td>
                  <button className="btn btn-sm btn-info" style={{ marginRight: 4 }} onClick={() => { setEditCat(cat.id); setCatName(cat.name); }}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteCategory(cat.id, cat.name)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

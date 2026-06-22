import React, { useState, useEffect } from 'react';

const API = '/api';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [editCat, setEditCat] = useState(null);
  const [catName, setCatName] = useState('');
  const [addSubCat, setAddSubCat] = useState(null);
  const [subName, setSubName] = useState('');
  const [editSub, setEditSub] = useState(null);
  const [editSubName, setEditSubName] = useState('');
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
    if (!confirm(`Delete category "${name}"? This will also delete all its subcategories.`)) return;
    try {
      const r = await fetch(`${API}/categories/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) { showToast('Category deleted'); loadCategories(); }
      else showToast(d.error || 'Cannot delete', 'error');
    } catch { showToast('Failed', 'error'); }
  };

  const addSubcategory = async (catId, name) => {
    if (!name.trim()) return showToast('Enter subcategory name', 'error');
    try {
      const r = await fetch(`${API}/categories/${catId}/subcategories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      });
      const d = await r.json();
      if (d.success) { showToast('Subcategory added'); loadCategories(); setAddSubCat(null); setSubName(''); }
      else showToast(d.error || 'Failed', 'error');
    } catch { showToast('Failed', 'error'); }
  };

  const updateSubcategory = async (catId, subId, name) => {
    try {
      const r = await fetch(`${API}/categories/${catId}/subcategories/${subId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const d = await r.json();
      if (d.success) { showToast('Subcategory updated'); loadCategories(); setEditSub(null); }
    } catch { showToast('Failed', 'error'); }
  };

  const deleteSubcategory = async (catId, subId) => {
    if (!confirm('Delete this subcategory?')) return;
    try {
      const r = await fetch(`${API}/categories/${catId}/subcategories/${subId}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) { showToast('Subcategory deleted'); loadCategories(); }
    } catch { showToast('Failed', 'error'); }
  };

  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.subcategories?.some(s => s.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
        <h2>Categories & Subcategories</h2>
        <button className="btn btn-success" onClick={() => setShowAddCat(true)}>+ Add Category</button>
      </div>

      <div className="search-bar" style={{marginBottom:16}}>
        <input placeholder="Search categories or subcategories..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {showAddCat && (
        <div className="card" style={{marginBottom:16, borderLeft:'4px solid #27ae60'}}>
          <h3 style={{marginBottom:12}}>Add New Category</h3>
          <div style={{display:'flex', gap:8}}>
            <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name (e.g. BODY PARTS)" style={{flex:1}} autoFocus onKeyDown={e => e.key === 'Enter' && addCategory()} />
            <button className="btn btn-success" onClick={addCategory}>Add</button>
            <button className="btn btn-outline" onClick={() => { setShowAddCat(false); setNewCatName(''); }}>Cancel</button>
          </div>
        </div>
      )}

      <p style={{color:'#777', marginBottom:16, fontSize:13}}>
        {categories.length} categories · {filtered.length === categories.length ? 'All shown' : `${filtered.length} matching`}
      </p>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(350px, 1fr))', gap:16}}>
        {filtered.map(cat => (
          <div key={cat.id} className="card">
            <div className="card-header">
              {editCat === cat.id ? (
                <div style={{display:'flex', gap:6, flex:1}}>
                  <input value={catName} onChange={e => setCatName(e.target.value)} style={{flex:1}} autoFocus onKeyDown={e => e.key === 'Enter' && updateCategory(cat.id, catName)} />
                  <button className="btn btn-sm btn-success" onClick={() => updateCategory(cat.id, catName)}>Save</button>
                  <button className="btn btn-sm btn-outline" onClick={() => setEditCat(null)}>X</button>
                </div>
              ) : (
                <>
                  <h3 onClick={() => { setEditCat(cat.id); setCatName(cat.name); }} style={{cursor:'pointer', flex:1}}>
                    {cat.name} <span style={{fontSize:12, color:'#999', fontWeight:400}}>({cat.product_count} products)</span>
                  </h3>
                  <span className="badge badge-info">{cat.subcategories?.length || 0} subs</span>
                  <button className="btn btn-sm btn-outline" onClick={() => deleteCategory(cat.id, cat.name)} style={{color:'#e74c3c', marginLeft:4}}>🗑</button>
                </>
              )}
            </div>

            <div>
              {cat.subcategories?.map(sub => (
                <div key={sub.id} style={{display:'flex', alignItems:'center', gap:6, padding:'6px 0', borderBottom:'1px solid #f0f0f0'}}>
                  {editSub?.catId === cat.id && editSub?.subId === sub.id ? (
                    <div style={{display:'flex', gap:6, flex:1}}>
                      <input value={editSubName} onChange={e => setEditSubName(e.target.value)} style={{flex:1, padding:'4px 8px', fontSize:13}} autoFocus onKeyDown={e => e.key === 'Enter' && updateSubcategory(cat.id, sub.id, editSubName)} />
                      <button className="btn btn-sm btn-success" onClick={() => updateSubcategory(cat.id, sub.id, editSubName)}>OK</button>
                      <button className="btn btn-sm btn-outline" onClick={() => setEditSub(null)}>X</button>
                    </div>
                  ) : (
                    <>
                      <span style={{flex:1, fontSize:13}}>{sub.name}</span>
                      <button className="btn btn-sm btn-outline" onClick={() => { setEditSub({catId: cat.id, subId: sub.id}); setEditSubName(sub.name); }}>✏</button>
                      <button className="btn btn-sm btn-outline" onClick={() => deleteSubcategory(cat.id, sub.id)} style={{color:'#e74c3c'}}>🗑</button>
                    </>
                  )}
                </div>
              ))}

              <div style={{marginTop:8}}>
                {addSubCat === cat.id ? (
                  <div style={{display:'flex', gap:6}}>
                    <input value={subName} onChange={e => setSubName(e.target.value)} placeholder="Subcategory name" style={{flex:1}} autoFocus onKeyDown={e => e.key === 'Enter' && addSubcategory(cat.id, subName)} />
                    <button className="btn btn-sm btn-success" onClick={() => addSubcategory(cat.id, subName)}>Add</button>
                    <button className="btn btn-sm btn-outline" onClick={() => { setAddSubCat(null); setSubName(''); }}>X</button>
                  </div>
                ) : (
                  <button className="btn btn-sm btn-outline" onClick={() => { setAddSubCat(cat.id); setSubName(''); }}>
                    + Add Subcategory
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{textAlign:'center', padding:40, color:'#999'}}>
          <p style={{fontSize:48, marginBottom:12}}>📁</p>
          <p>No categories found</p>
          <button className="btn btn-success" style={{marginTop:12}} onClick={() => setShowAddCat(true)}>+ Add First Category</button>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';

const API = '';

export default function VyaparImport() {
  const [tab, setTab] = useState('upload');
  const [dragOver, setDragOver] = useState(false);
  const [scan, setScan] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const showToast = (msg, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  const handleScan = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/vyapar/scan`);
      const json = await res.json();
      if (json.success) { setScan(json.data); if (!json.data.found) setError(json.data.message || 'No files found'); }
      else setError(json.error || 'Scan failed');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleImportScan = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch(`${API}/api/vyapar/import`, { method: 'POST' });
      const json = await res.json();
      if (json.success) { setResult(json.data); showToast(`Import complete! ${json.data.products} products, ${json.data.customers} customers`); }
      else setError(json.error || 'Import failed');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleFileUpload = async (file) => {
    if (!file.name.toLowerCase().endsWith('.vyb')) {
      setError('Only .vyb files are supported'); return;
    }
    setLoading(true); setError(''); setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`${API}/api/vyapar/upload`, { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
        showToast(`Imported ${json.data.products} products, ${json.data.customers} customers from ${json.file}`);
      } else {
        setError(json.error || 'Upload failed');
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };
  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  return (
    <div>
      <div className="card-header" style={{ marginBottom: 20 }}>
        <h2>📥 Vyapar Data Import</h2>
        <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
          Import products, customers, suppliers, sales, and purchases from your Vyapar backup file.
        </p>
      </div>

      <div className="search-bar" style={{ marginBottom: 20 }}>
        <button className={`btn ${tab === 'upload' ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setTab('upload'); setResult(null); setError(''); }}>
          📤 Upload .vyb File
        </button>
        <button className={`btn ${tab === 'scan' ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setTab('scan'); setResult(null); setError(''); }}>
          📂 Scan for Existing Files
        </button>
      </div>

      {error && (
        <div className="card" style={{ borderLeft: '4px solid #e74c3c', background: '#fef2f2', marginBottom: 16 }}>
          <strong style={{ color: '#c0392b' }}>Error:</strong> <span style={{ color: '#666' }}>{error}</span>
        </div>
      )}

      {tab === 'upload' && (
        <div
          className="card"
          style={{
            border: dragOver ? '2px dashed #3498db' : '2px dashed #ccc',
            background: dragOver ? '#ebf5fb' : '#fafbfc',
            textAlign: 'center', padding: 40, cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div style={{ fontSize: 64, marginBottom: 16 }}>📥</div>
          <h3 style={{ marginBottom: 8 }}>Drop your .vyb file here</h3>
          <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
            or click the button below to browse for the file
          </p>
          <label className="btn btn-primary btn-lg" style={{ cursor: 'pointer' }}>
            {loading ? '⏳ Importing...' : '📁 Choose .vyb File'}
            <input type="file" accept=".vyb" onChange={onFileChange} style={{ display: 'none' }} disabled={loading} />
          </label>
          <div style={{ marginTop: 30, padding: 16, background: '#f8f9fa', borderRadius: 8, fontSize: 12, color: '#666', textAlign: 'left' }}>
            <strong style={{ color: '#333' }}>📌 How to export from Vyapar:</strong>
            <ol style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
              <li>Open Vyapar app on your computer</li>
              <li>Go to <strong>Settings → Backup</strong> (or <strong>Data → Backup</strong>)</li>
              <li>Click <strong>"Create Backup"</strong> - this creates a .vyb file</li>
              <li>Upload that .vyb file here</li>
            </ol>
            <p style={{ marginTop: 8 }}>
              ✅ <strong>What gets imported:</strong> Firm info, categories, products, customers, suppliers, sales, purchases, stock adjustments<br />
              ⚠️ <strong>Duplicates are skipped</strong> automatically - safe to import multiple times
            </p>
          </div>
        </div>
      )}

      {tab === 'scan' && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          {!scan && (
            <>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🔍</div>
              <h3 style={{ marginBottom: 8 }}>Scan for Vyapar Backup Files</h3>
              <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
                Look for .vyb files already in the data folder
              </p>
              <button className="btn btn-primary btn-lg" onClick={handleScan} disabled={loading}>
                {loading ? '⏳ Scanning...' : '🔍 Scan Now'}
              </button>
            </>
          )}

          {scan && (
            <div style={{ textAlign: 'left' }}>
              {scan.found ? (
                <>
                  <h3 style={{ color: '#27ae60', marginBottom: 16 }}>✅ Vyapar Backup Found</h3>
                  <div style={{ background: '#f8f9fa', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                    <p><strong>File:</strong> {scan.files.join(', ')}</p>
                    {scan.summary && (
                      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                        <div className="stat-card"><div className="stat-value" style={{ fontSize: 20 }}>{scan.summary.products || 0}</div><div className="stat-label">Products</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ fontSize: 20 }}>{scan.summary.categories || 0}</div><div className="stat-label">Categories</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ fontSize: 20 }}>{scan.summary.parties || 0}</div><div className="stat-label">Parties</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ fontSize: 20 }}>{scan.summary.transactions || 0}</div><div className="stat-label">Transactions</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ fontSize: 20 }}>{scan.summary.adjustments || 0}</div><div className="stat-label">Adjustments</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ fontSize: 14 }}>{scan.summary.firm_name || '—'}</div><div className="stat-label">Firm</div></div>
                      </div>
                    )}
                  </div>
                  <button className="btn btn-success btn-lg" style={{ width: '100%' }} onClick={handleImportScan} disabled={loading}>
                    {loading ? '⏳ Importing...' : '✅ Import All Data Now'}
                  </button>
                </>
              ) : (
                <>
                  <h3 style={{ color: '#e74c3c' }}>❌ No Files Found</h3>
                  <p style={{ color: '#666', marginTop: 8 }}>{scan.message}</p>
                  <p style={{ color: '#999', fontSize: 12, marginTop: 12 }}>
                    Place your .vyb file in: <code>app/data/vyapar_data/</code>
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="card" style={{ marginTop: 20, borderLeft: '4px solid #27ae60' }}>
          <h3 style={{ color: '#27ae60', marginBottom: 16 }}>✅ Import Complete!</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div className="stat-card success"><div className="stat-value">{result.products || 0}</div><div className="stat-label">Products</div></div>
            <div className="stat-card success"><div className="stat-value">{result.categories || 0}</div><div className="stat-label">Categories</div></div>
            <div className="stat-card success"><div className="stat-value">{result.customers || 0}</div><div className="stat-label">Customers</div></div>
            <div className="stat-card success"><div className="stat-value">{result.suppliers || 0}</div><div className="stat-label">Suppliers</div></div>
            <div className="stat-card success"><div className="stat-value">{result.sales || 0}</div><div className="stat-label">Sales</div></div>
            <div className="stat-card success"><div className="stat-value">{result.purchases || 0}</div><div className="stat-label">Purchases</div></div>
            <div className="stat-card success"><div className="stat-value">{result.adjustments || 0}</div><div className="stat-label">Adjustments</div></div>
            <div className="stat-card accent"><div className="stat-value">{result.firm ? 'Yes' : 'No'}</div><div className="stat-label">Firm Imported</div></div>
          </div>
          {result.errors && result.errors.length > 0 && (
            <div style={{ marginTop: 16, padding: 12, background: '#fff3cd', borderRadius: 6, fontSize: 12 }}>
              <strong style={{ color: '#856404' }}>⚠️ Warnings ({result.errors.length}):</strong>
              <ul style={{ marginTop: 6, paddingLeft: 20, color: '#856404' }}>
                {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <div style={{ marginTop: 16, padding: 12, background: '#d1ecf1', borderRadius: 6, fontSize: 13, color: '#0c5460' }}>
            🎉 All data is now in your Mahadev Enterprises ERP! You can view it in <strong>Products</strong>, <strong>Sales / POS</strong>, and other pages.
          </div>
        </div>
      )}
    </div>
  );
}

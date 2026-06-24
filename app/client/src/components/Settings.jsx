import React, { useState, useEffect } from 'react';

const API = '/api';

const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana',
  'Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
  'Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu',
  'Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Chandigarh',
  'Jammu & Kashmir','Ladakh','Lakshadweep','Puducherry'
];

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [backupInfo, setBackupInfo] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetch(`${API}/settings`).then(r => r.json()).then(d => {
      if (d.success) {
        setSettings(d.data);
        if (d.data.company_logo) setLogoPreview(d.data.company_logo);
      }
    });
  }, []);

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const d = await r.json();
      if (d.success) showToast('All settings saved!');
      else showToast(d.error || 'Save failed', 'error');
    } catch (err) { showToast('Save failed', 'error'); }
    setSaving(false);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Logo must be under 2 MB', 'error'); return; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`${API}/upload/logo`, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.success) {
        updateSetting('company_logo', d.path);
        setLogoPreview(d.path);
        showToast('Logo uploaded');
      } else showToast(d.error || 'Upload failed', 'error');
    } catch { showToast('Upload failed', 'error'); }
  };

  const s = settings;
  const isGST = s.gst_enabled !== '0' && s.gst_enabled !== 'false';

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
        <h2>Settings</h2>
        <button className="btn btn-success btn-lg" onClick={saveAll} disabled={saving}>
          {saving ? '⏳ Saving...' : '💾 Save All Settings'}
        </button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>

        {/* === SHOP/BUSINESS DETAILS === */}
        <div className="card">
          <div className="card-header"><h3>🏪 Shop / Business Details</h3></div>

          <div className="form-group">
            <label>Shop / Company Name *</label>
            <input value={s.company_name || ''} onChange={e => updateSetting('company_name', e.target.value)} placeholder="Mahadev Enterprises" />
          </div>

          <div className="form-group">
            <label>Address *</label>
            <textarea value={s.company_address || ''} onChange={e => updateSetting('company_address', e.target.value)} rows={2} placeholder="Shop No, Street, City, State, PIN" />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>State</label>
              <select value={s.company_state || ''} onChange={e => updateSetting('company_state', e.target.value)}>
                <option value="">-- Select State --</option>
                {STATES.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>PIN Code</label>
              <input value={s.company_pincode || ''} onChange={e => updateSetting('company_pincode', e.target.value)} placeholder="400001" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Phone *</label>
              <input value={s.company_phone || ''} onChange={e => updateSetting('company_phone', e.target.value)} placeholder="+91-9876543210" />
            </div>
            <div className="form-group">
              <label>Alt Phone</label>
              <input value={s.company_phone2 || ''} onChange={e => updateSetting('company_phone2', e.target.value)} placeholder="Optional second number" />
            </div>
          </div>

          <div className="form-group">
            <label>Email</label>
            <input value={s.company_email || ''} onChange={e => updateSetting('company_email', e.target.value)} placeholder="info@mahadev.com" />
          </div>

          <div className="form-group">
            <label>Website</label>
            <input value={s.company_website || ''} onChange={e => updateSetting('company_website', e.target.value)} placeholder="www.mahadev.com" />
          </div>

          <div className="form-group">
            <label>Shop Logo</label>
            <div style={{display:'flex', gap:12, alignItems:'center'}}>
              {logoPreview && <img src={logoPreview} alt="Logo" style={{width:60,height:60,borderRadius:8,objectFit:'cover',border:'1px solid #ddd'}} />}
              <label className="btn btn-outline btn-sm" style={{cursor:'pointer'}}>
                📷 Upload Logo
                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{display:'none'}} />
              </label>
            </div>
            <span style={{fontSize:11,color:'#777'}}>Max 2 MB. Appears on bills and receipts.</span>
          </div>
        </div>

        {/* === GST / TAX DETAILS === */}
        <div className="card">
          <div className="card-header"><h3>🧾 GST / Tax Configuration</h3></div>

          <div className="form-group">
            <label style={{display:'flex',alignItems:'center',gap:8}}>
              <input type="checkbox" checked={isGST} onChange={e => updateSetting('gst_enabled', e.target.checked ? '1' : '0')} style={{width:18,height:18}} />
              <span style={{fontWeight:700,fontSize:14}}>Enable GST Billing</span>
            </label>
            <span style={{fontSize:11,color:'#777',marginTop:4,display:'block'}}>
              {isGST ? 'GST will be added to bills. GSTIN shown on invoice.' : 'Bills will be WITHOUT GST. No tax added.'}
            </span>
          </div>

          {isGST && (
            <>
              <div className="form-group">
                <label>GSTIN *</label>
                <input value={s.company_gstin || ''} onChange={e => updateSetting('company_gstin', e.target.value)} placeholder="27AAAAA0000A1Z5" />
                <span style={{fontSize:11,color:'#777'}}>15-digit GST Identification Number</span>
              </div>

              <div className="form-group">
                <label>PAN Number</label>
                <input value={s.company_pan || ''} onChange={e => updateSetting('company_pan', e.target.value)} placeholder="ABCDE1234F" />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Default GST Rate (%)</label>
                  <input type="number" value={s.gst_rate || 18} onChange={e => updateSetting('gst_rate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>CGST (%)</label>
                  <input type="number" value={s.cgst_rate || 9} onChange={e => updateSetting('cgst_rate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>SGST (%)</label>
                  <input type="number" value={s.sgst_rate || 9} onChange={e => updateSetting('sgst_rate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>IGST (%)</label>
                  <input type="number" value={s.igst_rate || 18} onChange={e => updateSetting('igst_rate', e.target.value)} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Place of Supply (State)</label>
                  <select value={s.place_of_supply || ''} onChange={e => updateSetting('place_of_supply', e.target.value)}>
                    <option value="">-- Select --</option>
                    {STATES.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Reverse Charge</label>
                  <select value={s.reverse_charge || '0'} onChange={e => updateSetting('reverse_charge', e.target.value)}>
                    <option value="0">No</option>
                    <option value="1">Yes</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label>Invoice Prefix</label>
            <input value={s.invoice_prefix || 'INV-'} onChange={e => updateSetting('invoice_prefix', e.target.value)} placeholder="INV-" />
            <span style={{fontSize:11,color:'#777'}}>e.g. INV-2026/000001</span>
          </div>

          <div className="form-group">
            <label>Signature Text (on invoice)</label>
            <input value={s.signature_text || ''} onChange={e => updateSetting('signature_text', e.target.value)} placeholder="Authorized Signatory" />
          </div>

          <div className="form-group">
            <label>Terms & Conditions (shown on bill)</label>
            <textarea value={s.terms_conditions || ''} onChange={e => updateSetting('terms_conditions', e.target.value)} rows={3} placeholder="1. Goods once sold will not be taken back.&#10;2. Subject to local jurisdiction." />
          </div>
        </div>

        {/* === BANK / PAYMENT DETAILS === */}
        <div className="card">
          <div className="card-header"><h3>🏦 Bank / Payment Details</h3></div>
          <span style={{fontSize:11,color:'#777',marginBottom:12,display:'block'}}>Shown on GST invoices for payment transfer.</span>

          <div className="form-group">
            <label>Bank Name</label>
            <input value={s.bank_name || ''} onChange={e => updateSetting('bank_name', e.target.value)} placeholder="State Bank of India" />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Account Number</label>
              <input value={s.bank_account || ''} onChange={e => updateSetting('bank_account', e.target.value)} placeholder="1234567890" />
            </div>
            <div className="form-group">
              <label>IFSC Code</label>
              <input value={s.bank_ifsc || ''} onChange={e => updateSetting('bank_ifsc', e.target.value)} placeholder="SBIN0001234" />
            </div>
          </div>

          <div className="form-group">
            <label>Branch</label>
            <input value={s.bank_branch || ''} onChange={e => updateSetting('bank_branch', e.target.value)} placeholder="Main Branch" />
          </div>

          <div className="form-group">
            <label>UPI ID</label>
            <input value={s.upi_id || ''} onChange={e => updateSetting('upi_id', e.target.value)} placeholder="merchant@upi" />
            <span style={{fontSize:11,color:'#777'}}>For QR code on receipts</span>
          </div>
        </div>

        {/* === AI / API SETTINGS === */}
        <div className="card">
          <div className="card-header"><h3>🤖 AI / Groq API</h3></div>

          <div className="form-group">
            <label>Groq API Key</label>
            <input type="password" value={s.groq_api_key || ''} onChange={e => updateSetting('groq_api_key', e.target.value)} placeholder="gsk_your_api_key..." />
            <span style={{fontSize:11,color:'#777'}}>Free tier at <a href="https://console.groq.com" target="_blank" rel="noopener">console.groq.com</a></span>
          </div>

          <div className="form-group">
            <label>Default AI Model</label>
            <select value={s.groq_model || 'llama-3.3-70b-versatile'} onChange={e => updateSetting('groq_model', e.target.value)}>
              <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Recommended)</option>
              <option value="deepseek-r1-distill-llama-70b">DeepSeek R1 70B</option>
              <option value="qwen-2.5-32b">Qwen 2.5 32B</option>
              <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
              <option value="gemma2-9b-it">Gemma 2 9B</option>
              <option value="llama-3.1-8b-instant">Llama 3.1 8B (Fast)</option>
            </select>
          </div>
        </div>

        {/* === DATA MANAGEMENT === */}
        <div className="card" style={{borderLeft:'4px solid #e74c3c'}}>
          <div className="card-header"><h3>💾 Data Management</h3></div>
          <p style={{fontSize:13, color:'#777', marginBottom:12}}>
            All data stored at: <code>app\data\mahadev_erp.db</code>
          </p>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <button className="btn btn-sm btn-outline" onClick={() => {
              showToast('Backup: Copy app/data/mahadev_erp.db to a safe location');
            }}>📋 Backup Instructions</button>
            <button className="btn btn-sm btn-outline" onClick={async () => {
              await fetch(`${API}/ai/history`, { method: 'DELETE' });
              showToast('AI chat history cleared');
            }}>🗑️ Clear AI History</button>
            <button className="btn btn-sm btn-info" onClick={() => {
              if (window.electronAPI?.checkForUpdates) {
                window.electronAPI.checkForUpdates();
                showToast('Checking for updates...');
              } else {
                window.open('https://github.com/aryaanchavan1-commits/mahadev_enterprises_ai_erp/releases', '_blank');
              }
            }}>🔄 Check for Updates</button>
          </div>
        </div>

      </div>

      {/* SAVE BUTTON (bottom) */}
      <div style={{marginTop:20, textAlign:'center'}}>
        <button className="btn btn-success btn-lg" onClick={saveAll} disabled={saving} style={{padding:'14px 60px',fontSize:16}}>
          {saving ? '⏳ Saving...' : '💾 Save All Settings'}
        </button>
      </div>
    </div>
  );
}

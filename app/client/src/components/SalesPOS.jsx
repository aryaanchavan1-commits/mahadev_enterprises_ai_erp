import React, { useState, useEffect, useRef, useCallback } from 'react';

const API = '/api';

export default function SalesPOS() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [customer, setCustomer] = useState({ name: 'Walk-in Customer', phone: '', gstin: '', address: '' });
  const [paymentMode, setPaymentMode] = useState('cash');
  const [toast, setToast] = useState(null);
  const [lastInvoice, setLastInvoice] = useState(null);
  const [shopSettings, setShopSettings] = useState({});
  const [gstEnabled, setGstEnabled] = useState(true);
  const [billingType, setBillingType] = useState('b2c');
  const [showCheckout, setShowCheckout] = useState(false);
  const [customDiscount, setCustomDiscount] = useState(0);
  const [customGst, setCustomGst] = useState(18);
  const [totalEditMode, setTotalEditMode] = useState(false);
  const [editedTotal, setEditedTotal] = useState(0);
  const printRef = useRef(null);
  const barcodeRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetch(`${API}/settings`).then(r => r.json()).then(d => {
      const s = d.data || d;
      setShopSettings(s);
      setGstEnabled(s.gst_enabled !== '0' && s.gst_enabled !== 'false');
      setCustomGst(parseFloat(s.gst_rate) || 18);
    });
    barcodeRef.current?.focus();
  }, []);

  const fetchProducts = () => {
    fetch(`${API}/products?limit=5000`).then(r => r.json()).then(d => { if (d.success) setProducts(d.data); });
  };

  const fetchCategories = () => {
    fetch(`${API}/categories`).then(r => r.json()).then(d => { if (d.success) setCategories(d.data.sort((a, b) => a.name.localeCompare(b.name))); });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F2') { e.preventDefault(); barcodeRef.current?.focus(); }
      if (e.key === 'F8' && cart.length > 0) { e.preventDefault(); setShowCheckout(true); }
      if (e.key === 'F9' && showCheckout) { e.preventDefault(); handleCheckout(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, customer, paymentMode, gstEnabled, showCheckout]);

  const lookupBarcode = async (code) => {
    try {
      const bcRes = await fetch(`${API}/products/barcode/${encodeURIComponent(code)}`);
      if (bcRes.ok) {
        const bcData = await bcRes.json();
        if (bcData.success && bcData.data) {
          addToCart(bcData.data);
          showToast(`Added: ${bcData.data.name}`);
          setBarcodeInput('');
          return;
        }
      }
      const res = await fetch(`${API}/products?search=${encodeURIComponent(code)}&limit=5`);
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        const exact = data.data.find(p => p.barcode === code) || data.data[0];
        addToCart(exact);
        showToast(`Added: ${exact.name}`);
      } else {
        showToast(`"${code}" not found`, 'error');
      }
    } catch { showToast('Lookup failed', 'error'); }
    setBarcodeInput('');
  };

  const handleBarcodeScan = useCallback(async (e) => {
    if (e.key !== 'Enter') return;
    const code = barcodeInput.trim();
    if (!code) return;
    await lookupBarcode(code);
  }, [barcodeInput, cart]);

  const addToCart = (product) => {
    if (product.quantity <= 0) { showToast(`${product.name} is out of stock!`, 'error'); return; }
    let basePrice = product.sell_price;
    if (billingType === 'b2b') basePrice = product.wholesale_price || product.sell_price;
    if (billingType === 'b2d') basePrice = product.wholesale_price ? product.wholesale_price * 0.9 : product.sell_price * 0.85;
    const existing = cart.find(i => i.product_id === product.id);
    if (existing) {
      if (existing.quantity >= product.quantity) { showToast(`Only ${product.quantity} left!`, 'error'); return; }
      setCart(cart.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([...cart, {
        product_id: product.id,
        product_name: product.name,
        hsn_code: product.hsn_code,
        sell_price: product.sell_price,
        wholesale_price: product.wholesale_price || product.sell_price,
        custom_price: basePrice,
        gst_percentage: product.gst_rate || customGst || 18,
        quantity: 1,
        max_quantity: product.quantity,
        barcode: product.barcode,
        discount_percent: 0
      }]);
    }
    setSearch('');
  };

  const removeFromCart = (id) => setCart(cart.filter(i => i.product_id !== id));
  const updateQty = (id, qty) => setCart(cart.map(i => i.product_id === id ? { ...i, quantity: Math.max(1, Math.min(qty, i.max_quantity)) } : i));
  const updateCustomPrice = (id, price) => setCart(cart.map(i => i.product_id === id ? { ...i, custom_price: Math.max(0, price) } : i));
  const updateItemDiscount = (id, disc) => setCart(cart.map(i => i.product_id === id ? { ...i, discount_percent: Math.min(100, Math.max(0, disc)) } : i));
  const updateItemGst = (id, gst) => setCart(cart.map(i => i.product_id === id ? { ...i, gst_percentage: Math.min(100, Math.max(0, gst)) } : i));

  // Calculate totals
  const cartSubtotal = cart.reduce((s, i) => s + ((i.custom_price || i.sell_price) * i.quantity), 0);
  const totalGstPercent = customGst || 0;
  const totalDiscount = customDiscount || 0;
  const afterDiscount = Math.max(0, cartSubtotal - totalDiscount);
  const totalGstAmount = gstEnabled ? afterDiscount * (totalGstPercent / 100) : 0;
  const isInterState = customer.gstin && customer.gstin.substring(0, 2) !== (shopSettings.company_gstin || '27').substring(0, 2);
  const cgstTotal = gstEnabled ? (isInterState ? 0 : totalGstAmount / 2) : 0;
  const sgstTotal = gstEnabled ? (isInterState ? 0 : totalGstAmount / 2) : 0;
  const igstTotal = gstEnabled ? (isInterState ? totalGstAmount : 0) : 0;
  const calculatedTotal = afterDiscount + cgstTotal + sgstTotal + igstTotal;
  const grandTotal = totalEditMode ? (editedTotal || calculatedTotal) : calculatedTotal;

  const handleCheckout = async () => {
    if (cart.length === 0) return showToast('Cart is empty', 'error');
    try {
      const r = await fetch(`${API}/sales`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(i => ({
            product_id: i.product_id,
            product_name: i.product_name,
            hsn_code: i.hsn_code,
            quantity: i.quantity,
            sell_price: i.custom_price || i.sell_price,
            gst_percentage: totalGstPercent,
            discount_percent: 0
          })),
          customer_name: customer.name || 'Walk-in Customer',
          customer_phone: customer.phone,
          customer_gstin: customer.gstin,
          customer_address: customer.address,
          payment_mode: paymentMode,
          gst_enabled: gstEnabled,
          billing_type: billingType,
          discount_amount: totalDiscount
        })
      });
      const d = await r.json();
      if (d.success) {
        setLastInvoice(d.data);
        showToast(`Sale completed! ${d.data.invoice_number}`);
        setCart([]);
        setCustomer({ name: 'Walk-in Customer', phone: '', gstin: '', address: '' });
        setPaymentMode('cash');
        setCustomDiscount(0);
        setShowCheckout(false);
        fetchProducts();
      } else { showToast(d.error, 'error'); }
    } catch { showToast('Checkout failed', 'error'); }
  };

  const categoryProducts = selectedCat
    ? products.filter(p => p.category_id === selectedCat).sort((a, b) => a.name.localeCompare(b.name))
    : products.slice().sort((a, b) => a.name.localeCompare(b.name));

  const filteredProducts = search.length >= 2
    ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search) || p.hsn_code?.includes(search)).sort((a, b) => a.name.localeCompare(b.name))
    : categoryProducts;

  const catCounts = {};
  products.forEach(p => { if (p.category_id) catCounts[p.category_id] = (catCounts[p.category_id] || 0) + 1; });

  const billingTypeLabel = { b2c: '👤 B2C (Customer)', b2b: '🏢 B2B (Business)', b2d: '🏭 B2D (Distributor)' };

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>🛒 Sales / POS</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#999' }}>F2: Scan | F8: Checkout | F9: Confirm</span>
          <span className="badge badge-info">{cart.length} items · ₹{grandTotal.toFixed(0)}</span>
        </div>
      </div>

      {/* CONTROLS BAR */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Billing Type */}
          <div style={{ display: 'flex', gap: 4, background: '#f8fafc', padding: 4, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            {['b2c', 'b2b', 'b2d'].map(type => (
              <button key={type} onClick={() => setBillingType(type)}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: billingType === type ? (type === 'b2c' ? '#2563eb' : type === 'b2b' ? '#7c3aed' : '#059669') : 'transparent',
                  color: billingType === type ? '#fff' : '#64748b',
                  transition: 'all 0.15s' }}>
                {type === 'b2c' ? '👤 B2C' : type === 'b2b' ? '🏢 B2B' : '🏭 B2D'}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 24, background: '#ddd' }} />
          {/* GST Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, background: gstEnabled ? '#f0fdf4' : '#fef2f2', padding: '8px 14px', borderRadius: 8, border: `2px solid ${gstEnabled ? '#86efac' : '#fca5a5'}`, transition: 'all 0.15s' }}>
            <input type="checkbox" checked={gstEnabled} onChange={e => setGstEnabled(e.target.checked)} style={{ width: 20, height: 20, accentColor: '#16a34a' }} />
            <span style={{ fontWeight: 600, color: gstEnabled ? '#166534' : '#991b1b' }}>GST {gstEnabled ? 'ON' : 'OFF'}</span>
          </label>
          <div style={{ width: 1, height: 24, background: '#ddd' }} />
          {/* Payment Mode */}
          <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} style={{ width: 110, fontSize: 12, padding: '8px 12px', borderRadius: 8, border: '2px solid #cbd5e1', background: '#fff', fontWeight: 600 }}>
            <option value="cash">💵 Cash</option>
            <option value="upi">📱 UPI</option>
            <option value="card">💳 Card</option>
            <option value="credit">📝 Credit</option>
            <option value="bank">🏦 Bank</option>
          </select>
          <div style={{ width: 1, height: 24, background: '#ddd' }} />
          <span style={{ fontSize: 12, color: '#666' }}>Mode: <strong>{billingTypeLabel[billingType]}</strong></span>
        </div>
      </div>

      {/* BARCODE SCANNER */}
      <div className="card" style={{ marginBottom: 16, padding: 12, background: '#f0f7ff', border: '2px solid #3498db' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 24 }}>📷</span>
          <input ref={barcodeRef} placeholder="SCAN BARCODE or TYPE BARCODE then press Enter" value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)} onKeyDown={handleBarcodeScan} style={{ flex: 1, fontSize: 16, padding: '12px 16px', border: '2px dashed #3498db', background: '#fff', letterSpacing: 1 }} />
          <button className="btn btn-primary" onClick={() => { if (barcodeInput.trim()) lookupBarcode(barcodeInput.trim()); }}>🔍 Find</button>
          <button className="btn btn-primary" onClick={() => barcodeRef.current?.focus()}>📷 F2</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 420px', gap: 16 }}>

        {/* CATEGORY SIDEBAR */}
        <div className="card" style={{ padding: 12, maxHeight: 500, overflowY: 'auto' }}>
          <h4 style={{ marginBottom: 12, fontSize: 13 }}>Categories</h4>
          <div onClick={() => { setSelectedCat(null); setSearch(''); }}
            style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4, fontSize: 13, fontWeight: selectedCat === null ? 700 : 400, background: selectedCat === null ? '#3498db' : 'transparent', color: selectedCat === null ? '#fff' : '#333' }}>
            📦 All ({products.length})
          </div>
          {categories.map(cat => (
            <div key={cat.id} onClick={() => { setSelectedCat(cat.id); setSearch(''); }}
              style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4, fontSize: 13, fontWeight: selectedCat === cat.id ? 700 : 400, background: selectedCat === cat.id ? '#3498db' : 'transparent', color: selectedCat === cat.id ? '#fff' : '#333' }}>
              📁 {cat.name} ({catCounts[cat.id] || 0})
            </div>
          ))}
        </div>

        {/* PRODUCTS GRID */}
        <div className="card" style={{ padding: 12, maxHeight: 500, overflowY: 'auto' }}>
          <div style={{ marginBottom: 12 }}>
            <input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} />
          </div>
          {selectedCat && !search && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f0f7ff', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
              📁 {categories.find(c => c.id === selectedCat)?.name} — {filteredProducts.length} products
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {filteredProducts.map(p => {
              let displayPrice = p.sell_price;
              if (billingType === 'b2b') displayPrice = p.wholesale_price || p.sell_price;
              if (billingType === 'b2d') displayPrice = p.wholesale_price ? p.wholesale_price * 0.9 : p.sell_price * 0.85;
              return (
                <div key={p.id} onClick={() => addToCart(p)}
                  style={{ padding: 10, border: '1px solid #eee', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s', opacity: p.quantity <= 0 ? 0.5 : 1, background: '#fff' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#3498db'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#eee'}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: '#999', marginBottom: 4 }}>HSN: {p.hsn_code || '-'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#2c3e50' }}>₹{Number(displayPrice).toLocaleString('en-IN')}</span>
                    <span className={`badge ${p.quantity <= 0 ? 'badge-danger' : p.quantity <= 5 ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: 10 }}>{p.quantity}</span>
                  </div>
                  {billingType !== 'b2c' && p.sell_price !== displayPrice && (
                    <div style={{ fontSize: 10, color: '#999', textDecoration: 'line-through' }}>₹{p.sell_price}</div>
                  )}
                </div>
              );
            })}
          </div>
          {filteredProducts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              <p style={{ fontSize: 48, marginBottom: 8 }}>📦</p>
              <p>No products</p>
            </div>
          )}
        </div>

        {/* CART & CHECKOUT */}
        <div>
          <div className="card" style={{ padding: 12 }}>
            <h3 style={{ marginBottom: 12 }}>🛒 Cart ({cart.length})</h3>

            {/* Customer */}
            <div style={{ marginBottom: 12 }}>
              <input placeholder="Customer name" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} style={{ marginBottom: 6 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <input placeholder="Phone" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} style={{ flex: 1 }} />
                {gstEnabled && <input placeholder="GSTIN" value={customer.gstin} onChange={e => setCustomer({ ...customer, gstin: e.target.value })} style={{ flex: 1 }} />}
              </div>
            </div>

            {/* Cart Items */}
            <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
              {cart.map(item => {
                const price = item.custom_price || item.sell_price;
                const lineTotal = price * item.quantity;
                const discAmt = lineTotal * (item.discount_percent || 0) / 100;
                const finalPrice = lineTotal - discAmt;
                return (
                  <div key={item.product_id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</div>
                      </div>
                      <span style={{ width: 70, textAlign: 'right', fontSize: 12, fontWeight: 600 }}>₹{finalPrice.toFixed(0)}</span>
                      <button onClick={() => removeFromCart(item.product_id)} style={{ width: 20, height: 20, border: 'none', background: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14 }}>✕</button>
                    </div>
                    {/* Per-item controls - MANUAL ONLY */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 11, alignItems: 'center' }}>
                      <span style={{ color: '#666' }}>Qty</span>
                      <input value={item.quantity} onChange={e => updateQty(item.product_id, Number(e.target.value))} style={{ width: 40, padding: '2px 4px', fontSize: 11 }} />
                      <span style={{ color: '#666' }}>₹</span>
                      <input value={price} onChange={e => updateCustomPrice(item.product_id, Number(e.target.value))} style={{ width: 60, padding: '2px 4px', fontSize: 11 }} />
                    </div>
                  </div>
                );
              })}
              {cart.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 12 }}>Scan barcode or click products</div>}
            </div>

            {/* Totals */}
            <div style={{ borderTop: '2px solid #eee', paddingTop: 10 }}>
              {/* Subtotal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, padding: '8px', background: '#f8fafc', borderRadius: 6 }}>
                <span>Subtotal</span><span style={{ fontWeight: 700 }}>₹{cartSubtotal.toFixed(2)}</span>
              </div>

              {/* Discount - RED HIGHLIGHT */}
              <div style={{ background: '#fef2f2', padding: '10px', borderRadius: 8, border: '2px solid #fca5a5', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: '#dc2626', fontSize: 12 }}>📉 Discount</span>
                  <span style={{ fontWeight: 700, color: '#dc2626', fontSize: 14 }}>-₹{totalDiscount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input value={totalDiscount} onChange={e => setCustomDiscount(Number(e.target.value))} style={{ width: 100, padding: '4px 6px', fontSize: 12, textAlign: 'center' }} placeholder="₹ Amount" />
                </div>
              </div>

              {/* GST - BLUE HIGHLIGHT */}
              {gstEnabled && (
                <div style={{ background: '#f0f9ff', padding: '10px', borderRadius: 8, border: '2px solid #93c5fd', marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: '#2563eb', fontSize: 12 }}>📋 GST</span>
                    <span style={{ fontWeight: 700, color: '#2563eb', fontSize: 14 }}>₹{totalGstAmount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <input value={customGst} onChange={e => setCustomGst(Number(e.target.value))} style={{ width: 50, padding: '4px 6px', fontSize: 12, textAlign: 'center' }} placeholder="%" />
                    <span style={{ fontSize: 11, color: '#666' }}>% = {(cartSubtotal - totalDiscount) * (customGst || 0) / 100} </span>
                  </div>
                  {cgstTotal > 0 && <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>CGST ₹{cgstTotal.toFixed(2)} + SGST ₹{sgstTotal.toFixed(2)}</div>}
                  {igstTotal > 0 && <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>IGST ₹{igstTotal.toFixed(2)}</div>}
                </div>
              )}

              {/* GRAND TOTAL - GREEN HIGHLIGHT */}
              <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: 8, border: '2px solid #86efac' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>💰 TOTAL</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input value={grandTotal} onChange={e => { setEditedTotal(Number(e.target.value)); setTotalEditMode(true); }} style={{ width: 130, fontSize: 18, fontWeight: 700, textAlign: 'right', background: '#fff', border: '2px solid #86efac', borderRadius: 6, padding: '4px 8px' }} />
                  </div>
                </div>
              </div>

              {!gstEnabled && <div style={{ fontSize: 11, color: '#e74c3c', textAlign: 'center', marginTop: 4 }}>Non-GST Bill</div>}
            </div>

            <button onClick={() => { if (cart.length === 0) return showToast('Cart is empty', 'error'); setShowCheckout(true); }} disabled={cart.length === 0} className="btn btn-success" style={{ width: '100%', marginTop: 12, padding: '14px', fontSize: 16 }}>
              ✅ Proceed to Checkout — ₹{grandTotal.toFixed(0)} <span style={{ fontSize: 11, opacity: 0.7 }}>F8</span>
            </button>
          </div>
        </div>
      </div>

      {/* CHECKOUT MODAL */}
      {showCheckout && (
        <div className="modal-overlay" onClick={() => setShowCheckout(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>✅ Confirm Sale</h3>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Customer:</span><strong>{customer.name || 'Walk-in'}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Payment:</span><strong>{paymentMode.toUpperCase()}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Billing:</span><strong>{billingTypeLabel[billingType]}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Items:</span><strong>{cart.length}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>GST:</span><strong>{gstEnabled ? 'Yes' : 'No'}</strong></div>
            </div>
            <div style={{ borderTop: '2px solid #eee', paddingTop: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>Subtotal:</span><span>₹{cartSubtotal.toFixed(2)}</span></div>
              {totalDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4, color: '#27ae60' }}><span>Discount:</span><span>-₹{totalDiscount.toFixed(2)}</span></div>}
              {gstEnabled && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>GST ({customGst}%):</span><span>₹{totalGstAmount.toFixed(2)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700, marginTop: 8 }}><span>TOTAL:</span><span>₹{grandTotal.toFixed(2)}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-success" style={{ flex: 1, padding: '12px' }} onClick={handleCheckout}>✅ Confirm Sale (F9)</button>
              <button className="btn btn-outline" onClick={() => setShowCheckout(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* INVOICE */}
      {lastInvoice && (
        <div className="card" style={{ marginTop: 16, borderLeft: '4px solid #27ae60' }} ref={printRef}>
          <div style={{ textAlign: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid #2c3e50' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{shopSettings.company_name || 'Mahadev Enterprises'}</h2>
            {shopSettings.company_address && <p style={{ fontSize: 11, color: '#666', margin: '4px 0' }}>{shopSettings.company_address}</p>}
            {shopSettings.company_phone && <p style={{ fontSize: 11, color: '#666' }}>Ph: {shopSettings.company_phone}</p>}
            {gstEnabled && shopSettings.company_gstin && <p style={{ fontSize: 12, fontWeight: 700 }}>GSTIN: {shopSettings.company_gstin}</p>}
            {!gstEnabled && <p style={{ fontSize: 11, color: '#e74c3c' }}>Non-GST Invoice</p>}
            <p style={{ fontSize: 11, color: '#666' }}>{billingTypeLabel[lastInvoice.billing_type || billingType]}</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div><p style={{ fontSize: 12 }}><strong>Invoice:</strong> {lastInvoice.invoice_number}</p><p style={{ fontSize: 12 }}><strong>Date:</strong> {lastInvoice.sale_date}</p></div>
            <div style={{ textAlign: 'right' }}><p style={{ fontSize: 12 }}><strong>Customer:</strong> {lastInvoice.customer_name || 'Walk-in'}</p>{lastInvoice.customer_phone && <p style={{ fontSize: 12 }}><strong>Phone:</strong> {lastInvoice.customer_phone}</p>}</div>
          </div>
          <table>
            <thead><tr><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>GST%</th><th>Total</th></tr></thead>
            <tbody>
              {lastInvoice.items?.map((item, i) => {
                const p = item.sell_price || item.unit_price || 0;
                return <tr key={i}><td>{item.product_name}</td><td>{item.hsn_code || '-'}</td><td>{item.quantity}</td><td>₹{p.toFixed(2)}</td><td>{item.gst_percentage || 0}%</td><td>₹{(p * item.quantity).toFixed(2)}</td></tr>;
              })}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', marginTop: 12 }}>
            <p><strong>Subtotal:</strong> ₹{Number(lastInvoice.subtotal).toFixed(2)}</p>
            {lastInvoice.discount_total > 0 && <p><strong>Discount:</strong> -₹{Number(lastInvoice.discount_total).toFixed(2)}</p>}
            {lastInvoice.cgst_total > 0 && <p><strong>CGST:</strong> ₹{Number(lastInvoice.cgst_total).toFixed(2)}</p>}
            {lastInvoice.sgst_total > 0 && <p><strong>SGST:</strong> ₹{Number(lastInvoice.sgst_total).toFixed(2)}</p>}
            {lastInvoice.igst_total > 0 && <p><strong>IGST:</strong> ₹{Number(lastInvoice.igst_total).toFixed(2)}</p>}
            <h3 style={{ fontSize: 18, marginTop: 8 }}>Grand Total: ₹{Number(lastInvoice.grand_total).toFixed(2)}</h3>
          </div>
          {shopSettings.bank_name && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #ccc', fontSize: 11, color: '#666' }}>
              <strong>Bank:</strong> {shopSettings.bank_name} | A/c: {shopSettings.bank_account} | IFSC: {shopSettings.bank_ifsc}
              {shopSettings.upi_id && <span> | UPI: {shopSettings.upi_id}</span>}
            </div>
          )}
          {shopSettings.upi_id && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Scan to Pay via UPI</p>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=${shopSettings.upi_id}&pn=${encodeURIComponent(shopSettings.company_name||'Shop')}&am=${Number(lastInvoice.grand_total).toFixed(2)}&tn=INV-${lastInvoice.invoice_number}`} alt="UPI QR" style={{ width: 120, height: 120 }} />
              <p style={{ fontSize: 10, color: '#999' }}>₹{Number(lastInvoice.grand_total).toFixed(2)} via {shopSettings.upi_id}</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-success" onClick={() => {
              const r = lastInvoice;
              const w = window.open('', '_blank', 'width=400');
              w.document.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>body{font-family:monospace;font-size:11px;padding:10px;max-width:80mm}.c{text-align:center}.b{font-weight:bold}.l{border-top:1px dashed #000;margin:5px 0}.f{display:flex;justify-content:space-between}table{width:100%;font-size:10px;border-collapse:collapse}</style></head><body><div class="c"><h3>${shopSettings.company_name||'Shop'}</h3><p>${shopSettings.company_address||''}</p><p>Ph: ${shopSettings.company_phone||''}</p>${gstEnabled&&shopSettings.company_gstin?`<p class="b">GSTIN: ${shopSettings.company_gstin}</p>`:''}${!gstEnabled?'<p>Non-GST Invoice</p>':''}</div><div class="l"></div><p>Invoice: ${r.invoice_number} | ${r.sale_date}</p><p>Customer: ${r.customer_name||'Walk-in'}</p><div class="l"></div><table>${r.items.map(i=>{const p=i.sell_price||i.unit_price||0;return `<tr><td>${i.product_name}</td><td align="center">${i.quantity}</td><td align="right">₹${p.toFixed(2)}</td><td align="right">₹${(p*i.quantity).toFixed(2)}</td></tr>`}).join('')}</table><div class="l"></div><div class="f"><span>Subtotal</span><span>₹${r.subtotal.toFixed(2)}</span></div>${r.discount_total>0?`<div class="f"><span>Discount</span><span>-₹${r.discount_total.toFixed(2)}</span></div>`:''}${r.cgst_total>0?`<div class="f"><span>CGST</span><span>₹${r.cgst_total.toFixed(2)}</span></div><div class="f"><span>SGST</span><span>₹${r.sgst_total.toFixed(2)}</span></div>`:''}<div class="l"></div><div class="f b" style="font-size:14px"><span>TOTAL</span><span>₹${r.grand_total.toFixed(2)}</span></div><div class="l"></div><p class="c">Thank you!</p><script>window.print();setTimeout(()=>window.close(),500)</script></body></html>`);
              w.document.close();
            }}>🖨️ Print</button>
            <button className="btn btn-info" onClick={() => window.open(`${API}/gst/bill/${lastInvoice.id}`, '_blank')}>📄 GST Invoice</button>
            {lastInvoice.customer_phone && (
              <button className="btn" style={{ background: '#25D366', color: '#fff' }} onClick={() => {
                const phone = lastInvoice.customer_phone.replace(/[^0-9]/g, '');
                const items = (lastInvoice.items || []).map(i => { const p = i.sell_price || i.unit_price || 0; return `${i.product_name} x${i.quantity} = ₹${(p * i.quantity).toFixed(2)}`; }).join('%0A');
                const msg = `*${shopSettings.company_name || 'Shop'}*%0A%0AInvoice: ${lastInvoice.invoice_number}%0A%0A*Items:*%0A${items}%0A%0A*Total: ₹${lastInvoice.grand_total.toFixed(2)}*%0A${shopSettings.upi_id ? `%0AUPI: ${shopSettings.upi_id}` : ''}`;
                window.open(`https://wa.me/91${phone}?text=${msg}`, '_blank');
              }}>📱 WhatsApp</button>
            )}
            <button className="btn btn-outline" onClick={() => setLastInvoice(null)}>✕ Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

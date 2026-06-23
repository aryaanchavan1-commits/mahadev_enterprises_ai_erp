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
  const printRef = useRef(null);
  const barcodeRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetch(`${API}/settings`).then(r => r.json()).then(d => { if (d.data) setShopSettings(d.data || d); });
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
      if (e.key === 'F8' && cart.length > 0) { e.preventDefault(); handleCheckout(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, customer, paymentMode]);

  const handleBarcodeScan = useCallback(async (e) => {
    if (e.key !== 'Enter') return;
    const code = barcodeInput.trim();
    if (!code) return;
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
        addToCart(data.data[0]);
        showToast(`Added: ${data.data[0].name}`);
      } else {
        showToast(`"${code}" not found`, 'error');
      }
    } catch { showToast('Lookup failed', 'error'); }
    setBarcodeInput('');
  }, [barcodeInput, cart]);

  const addToCart = (product) => {
    if (product.quantity <= 0) { showToast(`${product.name} is out of stock!`, 'error'); return; }
    const existing = cart.find(i => i.product_id === product.id);
    if (existing) {
      if (existing.quantity >= product.quantity) { showToast(`Only ${product.quantity} left!`, 'error'); return; }
      setCart(cart.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([...cart, { product_id: product.id, product_name: product.name, hsn_code: product.hsn_code, sell_price: product.sell_price, gst_percentage: product.gst_percentage || 18, quantity: 1, max_quantity: product.quantity, barcode: product.barcode }]);
    }
    setSearch('');
  };

  const removeFromCart = (id) => setCart(cart.filter(i => i.product_id !== id));
  const updateQty = (id, qty) => setCart(cart.map(i => i.product_id === id ? { ...i, quantity: Math.max(1, Math.min(qty, i.max_quantity)) } : i));

  const cartSubtotal = cart.reduce((s, i) => s + (i.sell_price * i.quantity), 0);
  const cartDiscount = cart.reduce((s, i) => s + ((i.sell_price * i.quantity) * (i.discount_percent || 0) / 100), 0);
  const afterDiscount = cartSubtotal - cartDiscount;
  const gstEnabled = shopSettings.gst_enabled !== '0' && shopSettings.gst_enabled !== 'false';
  const gstRate = parseFloat(shopSettings.gst_rate) || 18;
  const cgstRate = parseFloat(shopSettings.cgst_rate) || gstRate / 2;
  const sgstRate = parseFloat(shopSettings.sgst_rate) || gstRate / 2;
  const igstRate = parseFloat(shopSettings.igst_rate) || gstRate;
  const isInterState = customer.gstin && customer.gstin.substring(0, 2) !== (shopSettings.company_gstin || '27').substring(0, 2);
  const cgstTotal = gstEnabled ? (isInterState ? 0 : afterDiscount * (cgstRate / 100)) : 0;
  const sgstTotal = gstEnabled ? (isInterState ? 0 : afterDiscount * (sgstRate / 100)) : 0;
  const igstTotal = gstEnabled ? (isInterState ? afterDiscount * (igstRate / 100) : 0) : 0;
  const grandTotal = afterDiscount + cgstTotal + sgstTotal + igstTotal;

  const handleCheckout = async () => {
    if (cart.length === 0) return showToast('Cart is empty', 'error');
    try {
      let finalCustomerId = null;
      let finalCustomerName = customer.name || 'Walk-in Customer';
      if (customer.name && customer.name !== 'Walk-in Customer' && customer.phone) {
        try {
          const { data: c } = await fetch(`${API}/customers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: customer.name, phone: customer.phone }) }).then(r => r.json());
          if (c?.id) { finalCustomerId = c.id; finalCustomerName = c.name; }
        } catch {}
      }
      const r = await fetch(`${API}/sales`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart.map(i => ({ product_id: i.product_id, product_name: i.product_name, hsn_code: i.hsn_code, quantity: i.quantity, sell_price: i.sell_price, gst_percentage: i.gst_percentage })), customer_name: finalCustomerName, customer_phone: customer.phone, customer_gstin: customer.gstin, payment_mode: paymentMode, gst_enabled: gstEnabled })
      });
      const d = await r.json();
      if (d.success) {
        setLastInvoice(d.data);
        showToast(`Sale completed! ${d.data.invoice_number}`);
        setCart([]);
        setCustomer({ name: 'Walk-in Customer', phone: '', gstin: '', address: '' });
        setPaymentMode('cash');
        fetchProducts();
      } else { showToast(d.error, 'error'); }
    } catch { showToast('Checkout failed', 'error'); }
  };

  // Filter products by selected category, sorted A-Z
  const categoryProducts = selectedCat
    ? products.filter(p => p.category_id === selectedCat).sort((a, b) => a.name.localeCompare(b.name))
    : products.slice().sort((a, b) => a.name.localeCompare(b.name));

  // Search filter, sorted A-Z
  const filteredProducts = search.length >= 2
    ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search) || p.hsn_code?.includes(search)).sort((a, b) => a.name.localeCompare(b.name))
    : categoryProducts;

  // Category with product counts
  const catCounts = {};
  products.forEach(p => { if (p.category_id) catCounts[p.category_id] = (catCounts[p.category_id] || 0) + 1; });

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>🛒 Sales / POS</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#999' }}>F2: Barcode | F8: Checkout</span>
          <span className="badge badge-info">{cart.length} items · ₹{grandTotal.toFixed(0)}</span>
        </div>
      </div>

      {/* BARCODE SCANNER */}
      <div className="card" style={{ marginBottom: 16, padding: 12, background: '#f0f7ff', border: '2px solid #3498db' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 24 }}>📷</span>
          <input ref={barcodeRef} placeholder="SCAN BARCODE HERE — Press F2 to focus" value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)} onKeyDown={handleBarcodeScan} autoFocus style={{ flex: 1, fontSize: 16, padding: '12px 16px', border: '2px dashed #3498db', background: '#fff', letterSpacing: 1 }} />
          <button className="btn btn-primary" onClick={() => barcodeRef.current?.focus()}>📷 F2</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 380px', gap: 16 }}>

        {/* CATEGORY SIDEBAR */}
        <div className="card" style={{ padding: 12, maxHeight: 500, overflowY: 'auto' }}>
          <h4 style={{ marginBottom: 12, fontSize: 13 }}>Categories</h4>
          <div
            onClick={() => { setSelectedCat(null); setSearch(''); }}
            style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4, fontSize: 13, fontWeight: selectedCat === null ? 700 : 400, background: selectedCat === null ? '#3498db' : 'transparent', color: selectedCat === null ? '#fff' : '#333' }}
          >
            📦 All ({products.length})
          </div>
          {categories.map(cat => (
            <div
              key={cat.id}
              onClick={() => { setSelectedCat(cat.id); setSearch(''); }}
              style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4, fontSize: 13, fontWeight: selectedCat === cat.id ? 700 : 400, background: selectedCat === cat.id ? '#3498db' : 'transparent', color: selectedCat === cat.id ? '#fff' : '#333' }}
            >
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
            {filteredProducts.map(p => (
              <div
                key={p.id}
                onClick={() => addToCart(p)}
                style={{ padding: 10, border: '1px solid #eee', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s', opacity: p.quantity <= 0 ? 0.5 : 1, background: '#fff' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#3498db'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#eee'}
              >
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: 10, color: '#999', marginBottom: 4 }}>HSN: {p.hsn_code || '-'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#2c3e50' }}>₹{Number(p.sell_price).toLocaleString('en-IN')}</span>
                  <span className={`badge ${p.quantity <= 0 ? 'badge-danger' : p.quantity <= 5 ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: 10 }}>{p.quantity}</span>
                </div>
                {p.barcode && <div style={{ fontSize: 9, color: '#aaa', marginTop: 2, fontFamily: 'monospace' }}>{p.barcode}</div>}
              </div>
            ))}
          </div>
          {filteredProducts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              <p style={{ fontSize: 48, marginBottom: 8 }}>📦</p>
              <p>No products in this category</p>
            </div>
          )}
        </div>

        {/* CART & CHECKOUT */}
        <div>
          <div className="card" style={{ padding: 12 }}>
            <h3 style={{ marginBottom: 12 }}>🛒 Cart ({cart.length})</h3>

            <div style={{ marginBottom: 12 }}>
              <input placeholder="Customer name" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} style={{ marginBottom: 6 }} />
              <input placeholder="Phone (optional)" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} style={{ marginBottom: 6 }} />
              <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                <option value="cash">💵 Cash</option>
                <option value="upi">📱 UPI</option>
                <option value="card">💳 Card</option>
                <option value="credit">📝 Credit</option>
              </select>
            </div>

            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
              {cart.map(item => (
                <div key={item.product_id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</div>
                    <div style={{ fontSize: 10, color: '#999' }}>₹{item.sell_price} × {item.quantity}</div>
                  </div>
                  <button onClick={() => updateQty(item.product_id, item.quantity - 1)} style={{ width: 24, height: 24, border: '1px solid #ddd', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 12 }}>-</button>
                  <span style={{ width: 24, textAlign: 'center', fontSize: 12, fontWeight: 700 }}>{item.quantity}</span>
                  <button onClick={() => updateQty(item.product_id, item.quantity + 1)} style={{ width: 24, height: 24, border: '1px solid #ddd', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 12 }}>+</button>
                  <span style={{ width: 60, textAlign: 'right', fontSize: 12, fontWeight: 600 }}>₹{(item.sell_price * item.quantity).toFixed(0)}</span>
                  <button onClick={() => removeFromCart(item.product_id)} style={{ width: 20, height: 20, border: 'none', background: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
              ))}
              {cart.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 12 }}>Scan barcode or click products</div>}
            </div>

            <div style={{ borderTop: '2px solid #eee', paddingTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span>Subtotal</span><span>₹{cartSubtotal.toFixed(2)}</span></div>
              {cartDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: '#27ae60' }}><span>Discount</span><span>-₹{cartDiscount.toFixed(2)}</span></div>}
              {gstEnabled && cgstTotal > 0 && <><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666' }}><span>CGST @{cgstRate}%</span><span>₹{cgstTotal.toFixed(2)}</span></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666' }}><span>SGST @{sgstRate}%</span><span>₹{sgstTotal.toFixed(2)}</span></div></>}
              {gstEnabled && igstTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666' }}><span>IGST @{igstRate}%</span><span>₹{igstTotal.toFixed(2)}</span></div>}
              <hr />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, marginTop: 8 }}><span>Total</span><span>₹{grandTotal.toFixed(2)}</span></div>
            </div>

            <button onClick={handleCheckout} disabled={cart.length === 0} className="btn btn-success" style={{ width: '100%', marginTop: 12, padding: '14px', fontSize: 16 }}>
              ✅ Complete Sale — ₹{grandTotal.toFixed(0)} <span style={{ fontSize: 11, opacity: 0.7 }}>F8</span>
            </button>
          </div>
        </div>
      </div>

      {/* INVOICE */}
      {lastInvoice && (
        <div className="card" style={{ marginTop: 16, borderLeft: '4px solid #27ae60' }} ref={printRef}>
          <div style={{ textAlign: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid #2c3e50' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{shopSettings.company_name || 'Mahadev Enterprises'}</h2>
            {shopSettings.company_address && <p style={{ fontSize: 11, color: '#666', margin: '4px 0' }}>{shopSettings.company_address}</p>}
            {shopSettings.company_phone && <p style={{ fontSize: 11, color: '#666' }}>Ph: {shopSettings.company_phone}{shopSettings.company_phone2 ? ' / ' + shopSettings.company_phone2 : ''}</p>}
            {gstEnabled && shopSettings.company_gstin && <p style={{ fontSize: 12, fontWeight: 700, margin: '4px 0' }}>GSTIN: {shopSettings.company_gstin}</p>}
            {!gstEnabled && <p style={{ fontSize: 11, color: '#e74c3c' }}>Non-GST Invoice</p>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 12 }}><strong>Invoice:</strong> {lastInvoice.invoice_number}</p>
              <p style={{ fontSize: 12 }}><strong>Date:</strong> {lastInvoice.sale_date}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 12 }}><strong>Customer:</strong> {lastInvoice.customer_name || 'Walk-in'}</p>
              {lastInvoice.customer_phone && <p style={{ fontSize: 12 }}><strong>Phone:</strong> {lastInvoice.customer_phone}</p>}
            </div>
          </div>
          <table>
            <thead><tr><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead>
            <tbody>
              {lastInvoice.items?.map((item, i) => (
                <tr key={i}><td>{item.product_name}</td><td>{item.hsn_code || '-'}</td><td>{item.quantity}</td><td>₹{item.sell_price}</td><td>₹{(item.sell_price * item.quantity).toFixed(2)}</td></tr>
              ))}
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
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-success" onClick={() => { const r = lastInvoice; const w = window.open('', '_blank', 'width=400'); w.document.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>body{font-family:monospace;font-size:11px;padding:10px;max-width:80mm}.c{text-align:center}.b{font-weight:bold}.l{border-top:1px dashed #000;margin:5px 0}.f{display:flex;justify-content:space-between}table{width:100%;font-size:10px;border-collapse:collapse}</style></head><body><div class="c"><h3>${shopSettings.company_name||'Shop'}</h3><p>${shopSettings.company_address||''}</p><p>Ph: ${shopSettings.company_phone||''}</p>${gstEnabled&&shopSettings.company_gstin?`<p class="b">GSTIN: ${shopSettings.company_gstin}</p>`:''}</div><div class="l"></div><p>Invoice: ${r.invoice_number} | ${r.sale_date}</p><p>Customer: ${r.customer_name||'Walk-in'}</p><div class="l"></div><table>${r.items.map(i=>`<tr><td>${i.product_name}</td><td align="center">${i.quantity}</td><td align="right">₹${i.sell_price}</td><td align="right">₹${(i.sell_price*i.quantity).toFixed(2)}</td></tr>`).join('')}</table><div class="l"></div><div class="f"><span>Subtotal</span><span>₹${r.subtotal.toFixed(2)}</span></div>${r.discount_total>0?`<div class="f"><span>Discount</span><span>-₹${r.discount_total.toFixed(2)}</span></div>`:''}${r.cgst_total>0?`<div class="f"><span>CGST</span><span>₹${r.cgst_total.toFixed(2)}</span></div><div class="f"><span>SGST</span><span>₹${r.sgst_total.toFixed(2)}</span></div>`:''}<div class="l"></div><div class="f b" style="font-size:14px"><span>TOTAL</span><span>₹${r.grand_total.toFixed(2)}</span></div><div class="l"></div><p class="c">Thank you!</p><script>window.print();setTimeout(()=>window.close(),500)</script></body></html>`); w.document.close(); }}>🖨️ Print</button>
            <button className="btn btn-info" onClick={() => window.open(`${API}/gst/bill/${lastInvoice.id}`, '_blank')}>📄 GST Invoice PDF</button>
            {lastInvoice.customer_phone && (
              <button className="btn" style={{ background: '#25D366', color: '#fff' }} onClick={() => {
                const phone = lastInvoice.customer_phone.replace(/[^0-9]/g, '');
                const items = (lastInvoice.items || []).map(i => `${i.product_name} x${i.quantity} = ₹${(i.sell_price * i.quantity).toFixed(2)}`).join('%0A');
                const msg = `*${shopSettings.company_name || 'Shop'}*%0A%0AInvoice: ${lastInvoice.invoice_number}%0ADate: ${lastInvoice.sale_date}%0A%0A*Items:*%0A${items}%0A%0ASubtotal: ₹${lastInvoice.subtotal.toFixed(2)}%0A${lastInvoice.cgst_total > 0 ? `CGST: ₹${lastInvoice.cgst_total.toFixed(2)}%0ASGST: ₹${lastInvoice.sgst_total.toFixed(2)}%0A` : ''}*Total: ₹${lastInvoice.grand_total.toFixed(2)}*%0A%0APayment: ${(lastInvoice.payment_mode || 'cash').toUpperCase()}${shopSettings.upi_id ? `%0AUPI: ${shopSettings.upi_id}` : ''}`;
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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useReactToPrint } from 'react-to-print';

const API = '/api';

export default function SalesPOS() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [customer, setCustomer] = useState({ name: 'Walk-in Customer', phone: '', gstin: '', address: '' });
  const [paymentMode, setPaymentMode] = useState('cash');
  const [toast, setToast] = useState(null);
  const [lastInvoice, setLastInvoice] = useState(null);
  const [scannerMode, setScannerMode] = useState(true);
  const [shopSettings, setShopSettings] = useState({});
  const printRef = useRef(null);
  const barcodeRef = useRef(null);
  const searchRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchProducts();
    fetch(`${API}/settings`).then(r => r.json()).then(d => { if (d.success) setShopSettings(d.data); });
    if (barcodeRef.current && scannerMode) barcodeRef.current.focus();
  }, []);

  const fetchProducts = () => {
    fetch(`${API}/products`).then(r => r.json()).then(d => { if (d.success) setProducts(d.data); });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F2') { e.preventDefault(); barcodeRef.current?.focus(); }
      if (e.key === 'F3') { e.preventDefault(); searchRef.current?.focus(); }
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
      const res = await fetch(`${API}/products?search=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        const exact = data.data.find(p => p.barcode === code) || data.data[0];
        addToCart(exact);
        showToast(`Added: ${exact.name}`, 'success');
      } else {
        showToast(`Barcode "${code}" not found`, 'error');
      }
    } catch (err) {
      showToast('Lookup failed', 'error');
    }
    setBarcodeInput('');
  }, [barcodeInput, cart]);

  const addToCart = (product) => {
    if (product.quantity <= 0) {
      showToast(`${product.name} is out of stock!`, 'error');
      return;
    }
    const existing = cart.find(item => item.product_id === product.id);
    if (existing) {
      if (existing.quantity >= product.quantity) {
        showToast(`Only ${product.quantity} left in stock!`, 'error');
        return;
      }
      setCart(cart.map(item =>
        item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart([...cart, {
        product_id: product.id,
        product_name: product.name,
        hsn_code: product.hsn_code,
        sell_price: product.sell_price,
        gst_rate: product.gst_rate || 18,
        discount_percent: product.discount_percent || 0,
        quantity: 1,
        max_quantity: product.quantity,
        image: product.image,
        barcode: product.barcode
      }]);
    }
    setSearch('');
    setBarcodeInput('');
  };

  const updateCartItem = (productId, field, value) => {
    setCart(cart.map(item =>
      item.product_id === productId ? { ...item, [field]: value } : item
    ));
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.product_id !== productId));
  };

  const cartSubtotal = cart.reduce((sum, item) => sum + (item.sell_price * item.quantity), 0);
  const cartDiscount = cart.reduce((sum, item) => sum + ((item.sell_price * item.quantity) * (item.discount_percent / 100)), 0);
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
      const r = await fetch(`${API}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(item => ({
            product_id: item.product_id,
            product_name: item.product_name,
            hsn_code: item.hsn_code,
            quantity: item.quantity,
            sell_price: item.sell_price,
            discount_percent: item.discount_percent
          })),
          customer_name: customer.name,
          customer_phone: customer.phone,
          customer_gstin: customer.gstin,
          customer_address: customer.address,
          payment_mode: paymentMode,
          gst_enabled: gstEnabled
        })
      });
      const d = await r.json();
      if (d.success) {
        setLastInvoice(d.data);
        showToast(`Sale completed! Invoice: ${d.data.invoice_number} | Stock deducted for ${cart.length} items`);
        setCart([]);
        fetchProducts();
      } else {
        showToast(d.error, 'error');
      }
    } catch (err) {
      showToast('Checkout failed', 'error');
    }
  };

  const handlePrintReceipt = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Receipt_${lastInvoice?.invoice_number || 'receipt'}`,
  });

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.hsn_code?.includes(search) ||
    p.barcode?.includes(search) ||
    p.serial_number?.includes(search)
  );

  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
        <h2>Sales / POS</h2>
        <div style={{display:'flex', gap:12, alignItems:'center'}}>
          <span style={{fontSize:11, color:'#999'}}>F2: Barcode | F3: Search | F8: Checkout</span>
          <span className="badge badge-info">{cart.length} items · Rs.{grandTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* BARCODE SCANNER INPUT */}
      <div className="card" style={{marginBottom:16, padding:12, background:'#f0f7ff', border:'2px solid #3498db'}}>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <span style={{fontSize:24}}>📷</span>
          <input
            ref={barcodeRef}
            className="barcode-scanner-input"
            placeholder="SCAN BARCODE HERE — Press F2 to focus"
            value={barcodeInput}
            onChange={e => setBarcodeInput(e.target.value)}
            onKeyDown={handleBarcodeScan}
            autoFocus
            style={{flex:1, fontSize:16, padding:'12px 16px', border:'2px dashed #3498db', background:'#fff', letterSpacing:1}}
          />
          <button className="btn btn-primary" onClick={() => barcodeRef.current?.focus()} style={{whiteSpace:'nowrap'}}>
            📷 Scan (F2)
          </button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 420px', gap:16}}>
        {/* Product selection */}
        <div>
          <div className="card">
            <div className="card-header">
              <h3>Products ({products.length})</h3>
            </div>
            <div className="search-bar">
              <span style={{position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:16, color:'#999'}}>🔍</span>
              <input
                ref={searchRef}
                placeholder="Search by name, HSN, barcode, or serial number... (F3)"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{paddingLeft:36}}
              />
            </div>
            <div style={{maxHeight:400, overflowY:'auto'}}>
              <table>
                <thead><tr><th>Product</th><th>Barcode</th><th>HSN</th><th>Price</th><th>Stock</th><th>Action</th></tr></thead>
                <tbody>
                  {filteredProducts.slice(0, 30).map(p => (
                    <tr key={p.id} style={{opacity: p.quantity <= 0 ? 0.5 : 1}}>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          {p.image ? <img src={p.image} alt="" style={{width:30,height:30,borderRadius:4,objectFit:'cover'}} /> : <span>📦</span>}
                          <div>
                            <strong style={{fontSize:13}}>{p.name}</strong>
                            {p.description && <div style={{fontSize:10,color:'#999',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{fontSize:11, fontFamily:'monospace', color:'#666'}}>{p.barcode || '—'}</td>
                      <td style={{fontSize:11}}>{p.hsn_code || '—'}</td>
                      <td>Rs.{Number(p.sell_price).toLocaleString('en-IN')}</td>
                      <td>
                        <span className={`badge ${p.quantity <= 0 ? 'badge-danger' : p.quantity <= 5 ? 'badge-warning' : 'badge-success'}`}>
                          {p.quantity}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => addToCart(p)}
                          disabled={p.quantity <= 0}
                        >
                          + Add
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredProducts.length === 0 && <tr><td colSpan={6} style={{textAlign:'center',padding:20,color:'#999'}}>No products found</td></tr>}
                </tbody>
              </table>
            </div>
            {search && filteredProducts.length > 30 && (
              <div style={{textAlign:'center',padding:8,fontSize:12,color:'#999'}}>Showing 30 of {filteredProducts.length} results. Refine your search.</div>
            )}
          </div>
        </div>

        {/* Cart & Checkout */}
        <div>
          <div className="card">
            <div className="card-header">
              <h3>🛒 Cart ({cart.length} items · {totalItems} qty)</h3>
            </div>

            <div className="form-row" style={{marginBottom:12}}>
              <div className="form-group" style={{marginBottom:0}}>
                <label>Customer Name</label>
                <input value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} />
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label>Phone</label>
                <input value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} placeholder="+91..." />
              </div>
            </div>
            <div className="form-row" style={{marginBottom:12}}>
              <div className="form-group" style={{marginBottom:0}}>
                <label>GSTIN</label>
                <input value={customer.gstin} onChange={e => setCustomer({...customer, gstin: e.target.value})} placeholder="e.g. 27XXXXX1234Z1" />
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label>Payment Mode</label>
                <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                  <option value="cash">💵 Cash</option>
                  <option value="upi">📱 UPI</option>
                  <option value="card">💳 Card</option>
                  <option value="credit">📝 Credit</option>
                </select>
              </div>
            </div>

            <div style={{maxHeight:300, overflowY:'auto', marginBottom:12}}>
              {cart.map(item => (
                <div key={item.product_id} style={{display:'flex',gap:6,alignItems:'center',padding:'8px 0',borderBottom:'1px solid #eee'}}>
                  <div style={{flex:1,fontSize:13,minWidth:0}}>
                    <strong style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.product_name}</strong>
                    <div style={{fontSize:10,color:'#777'}}>Rs.{item.sell_price} × {item.quantity} {item.barcode && `· ${item.barcode}`}</div>
                  </div>
                  <input type="number" min="1" max={item.max_quantity} value={item.quantity}
                    onChange={e => updateCartItem(item.product_id, 'quantity', Math.min(Number(e.target.value), item.max_quantity))}
                    style={{width:45,textAlign:'center',padding:4}} />
                  <input type="number" min="0" max="100" value={item.discount_percent}
                    onChange={e => updateCartItem(item.product_id, 'discount_percent', Number(e.target.value))}
                    style={{width:40,textAlign:'center',padding:4}} placeholder="%" />
                  <span style={{fontWeight:600,fontSize:12,width:70,textAlign:'right'}}>
                    Rs.{((item.sell_price * item.quantity) * (1 - item.discount_percent / 100)).toFixed(2)}
                  </span>
                  <button className="btn btn-sm btn-outline" onClick={() => removeFromCart(item.product_id)} style={{color:'#e74c3c',padding:'4px 8px'}}>✕</button>
                </div>
              ))}
              {cart.length === 0 && <div style={{textAlign:'center',color:'#999',padding:30}}>Scan barcode or click products to add</div>}
            </div>

            <div style={{borderTop:'2px solid #eee',paddingTop:12}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:4}}>
                <span>Subtotal:</span><span>Rs.{cartSubtotal.toFixed(2)}</span>
              </div>
              {cartDiscount > 0 && (
                <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:4}}>
                  <span>Discount:</span><span style={{color:'#27ae60'}}>-Rs.{cartDiscount.toFixed(2)}</span>
                </div>
              )}
              {!isInterState && cgstTotal > 0 && (
                <>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#666'}}>
                    <span>CGST @9%:</span><span>Rs.{cgstTotal.toFixed(2)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#666'}}>
                    <span>SGST @9%:</span><span>Rs.{sgstTotal.toFixed(2)}</span>
                  </div>
                </>
              )}
              {isInterState && igstTotal > 0 && (
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#666'}}>
                  <span>IGST @18%:</span><span>Rs.{igstTotal.toFixed(2)}</span>
                </div>
              )}
              <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:18,marginTop:8,paddingTop:8,borderTop:'2px solid #2c3e50'}}>
                <span>Grand Total:</span><span>Rs.{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              className="btn btn-success btn-lg"
              style={{width:'100%',marginTop:12,fontSize:16,padding:'14px'}}
              onClick={handleCheckout}
              disabled={cart.length === 0}
            >
              ✅ Complete Sale — Rs.{grandTotal.toFixed(2)} <span style={{fontSize:11,opacity:0.7}}>F8</span>
            </button>
          </div>
        </div>
      </div>

      {/* Last invoice */}
      {lastInvoice && (
        <div className="card" style={{marginTop:16, borderLeft:'4px solid #27ae60'}} ref={printRef}>
          <div style={{textAlign:'center',marginBottom:16,paddingBottom:12,borderBottom:'2px solid #2c3e50'}}>
            {shopSettings.company_logo && <img src={shopSettings.company_logo} alt="Logo" style={{height:50,marginBottom:8}} />}
            <h2 style={{margin:0,fontSize:20}}>{shopSettings.company_name || 'Mahadev Enterprises'}</h2>
            {shopSettings.company_address && <p style={{fontSize:12,color:'#666',margin:'4px 0'}}>{shopSettings.company_address}</p>}
            <div style={{fontSize:12,color:'#666'}}>
              {shopSettings.company_phone && <span>Ph: {shopSettings.company_phone}</span>}
              {shopSettings.company_phone2 && <span> / {shopSettings.company_phone2}</span>}
              {shopSettings.company_email && <span> | {shopSettings.company_email}</span>}
            </div>
            {gstEnabled && shopSettings.company_gstin && <p style={{fontSize:13,fontWeight:700,margin:'4px 0'}}>GSTIN: {shopSettings.company_gstin}</p>}
            {!gstEnabled && <p style={{fontSize:12,color:'#e74c3c',margin:'4px 0'}}>Non-GST Invoice</p>}
          </div>

          <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
            <div>
              <p style={{fontSize:12}}><strong>Invoice:</strong> {lastInvoice.invoice_number}</p>
              <p style={{fontSize:12}}><strong>Date:</strong> {lastInvoice.sale_date || new Date().toLocaleDateString('en-IN')}</p>
            </div>
            <div style={{textAlign:'right'}}>
              <p style={{fontSize:12}}><strong>Customer:</strong> {lastInvoice.customer_name || 'Walk-in'}</p>
              {lastInvoice.customer_phone && <p style={{fontSize:12}}><strong>Phone:</strong> {lastInvoice.customer_phone}</p>}
              {lastInvoice.customer_gstin && <p style={{fontSize:12}}><strong>GSTIN:</strong> {lastInvoice.customer_gstin}</p>}
            </div>
          </div>

          <table>
            <thead><tr><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Disc%</th><th>Total</th></tr></thead>
            <tbody>
              {lastInvoice.items?.map((item, i) => (
                <tr key={i}>
                  <td>{item.product_name}</td>
                  <td>{item.hsn_code}</td>
                  <td>{item.quantity}</td>
                  <td>Rs.{item.sell_price}</td>
                  <td>{item.discount_percent}%</td>
                  <td>Rs.{((item.sell_price * item.quantity) * (1 - (item.discount_percent || 0) / 100)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{textAlign:'right', marginTop:12}}>
            <p><strong>Subtotal:</strong> Rs.{Number(lastInvoice.subtotal).toLocaleString('en-IN', {minimumFractionDigits:2})}</p>
            {lastInvoice.discount_total > 0 && <p><strong>Discount:</strong> -Rs.{Number(lastInvoice.discount_total).toLocaleString('en-IN', {minimumFractionDigits:2})}</p>}
            {lastInvoice.cgst_total > 0 && <p><strong>CGST @{cgstRate}%:</strong> Rs.{Number(lastInvoice.cgst_total).toLocaleString('en-IN', {minimumFractionDigits:2})}</p>}
            {lastInvoice.sgst_total > 0 && <p><strong>SGST @{sgstRate}%:</strong> Rs.{Number(lastInvoice.sgst_total).toLocaleString('en-IN', {minimumFractionDigits:2})}</p>}
            {lastInvoice.igst_total > 0 && <p><strong>IGST @{igstRate}%:</strong> Rs.{Number(lastInvoice.igst_total).toLocaleString('en-IN', {minimumFractionDigits:2})}</p>}
            {!gstEnabled && <p style={{fontSize:12,color:'#666'}}>(Non-GST Bill - No tax applied)</p>}
            <h3 style={{fontSize:20,marginTop:8}}>Grand Total: Rs.{Number(lastInvoice.grand_total).toLocaleString('en-IN', {minimumFractionDigits:2})}</h3>
          </div>

          {shopSettings.bank_name && (
            <div style={{marginTop:12,paddingTop:12,borderTop:'1px dashed #ccc',fontSize:11,color:'#666'}}>
              <strong>Bank:</strong> {shopSettings.bank_name} | A/c: {shopSettings.bank_account} | IFSC: {shopSettings.bank_ifsc}
              {shopSettings.upi_id && <span> | UPI: {shopSettings.upi_id}</span>}
            </div>
          )}
          {shopSettings.terms_conditions && (
            <div style={{marginTop:8,fontSize:10,color:'#999',whiteSpace:'pre-wrap'}}>{shopSettings.terms_conditions}</div>
          )}
          <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
            <button className="btn btn-success" onClick={handlePrintReceipt}>🖨️ Print Receipt</button>
            <button className="btn btn-info" onClick={() => window.open(`${API}/sales/${lastInvoice.id}/receipt`, '_blank')}>📄 Receipt PDF</button>
            <button className="btn btn-warning" onClick={() => window.open(`${API}/gst/bill/${lastInvoice.id}`, '_blank')}>🧾 GST Bill</button>
            {lastInvoice.customer_phone && (
              <button className="btn" style={{background:'#25D366',color:'#fff'}} onClick={() => {
                const phone = lastInvoice.customer_phone.replace(/[^0-9]/g, '');
                const items = (lastInvoice.items || []).map(i => `${i.product_name} x${i.quantity} = Rs.${(i.sell_price * i.quantity).toFixed(2)}`).join('%0A');
                const msg = `*${shopSettings.company_name || 'Mahadev Enterprises'}*%0A%0A` +
                  `Invoice: ${lastInvoice.invoice_number}%0A` +
                  `Date: ${lastInvoice.sale_date || new Date().toLocaleDateString('en-IN')}%0A%0A` +
                  `*Items:*%0A${items}%0A%0A` +
                  `Subtotal: Rs.${Number(lastInvoice.subtotal).toFixed(2)}%0A` +
                  (lastInvoice.discount_total > 0 ? `Discount: -Rs.${Number(lastInvoice.discount_total).toFixed(2)}%0A` : '') +
                  (lastInvoice.cgst_total > 0 ? `CGST: Rs.${Number(lastInvoice.cgst_total).toFixed(2)}%0ASGST: Rs.${Number(lastInvoice.sgst_total).toFixed(2)}%0A` : '') +
                  `*Total: Rs.${Number(lastInvoice.grand_total).toFixed(2)}*%0A%0A` +
                  `Payment: ${(lastInvoice.payment_mode || 'cash').toUpperCase()}%0A` +
                  (shopSettings.upi_id ? `UPI: ${shopSettings.upi_id}` : '');
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

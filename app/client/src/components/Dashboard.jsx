import React, { useState, useEffect } from 'react';

const API = '/api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/products?limit=1`).then(r => r.json()),
      fetch(`${API}/categories`).then(r => r.json()),
      fetch(`${API}/parties`).then(r => r.json()),
      fetch(`${API}/sales`).then(r => r.json()),
      fetch(`${API}/settings`).then(r => r.json()),
    ]).then(([productsRes, catsRes, partiesRes, salesRes, settingsRes]) => {
      const products = productsRes.data || [];
      const totalProducts = productsRes.total || products.length;
      const categories = catsRes.data || [];
      const parties = partiesRes.data || [];
      const sales = salesRes.data || [];
      const settings = settingsRes.data || settingsRes || {};

      // Fetch all products for analytics
      fetch(`${API}/products?limit=200`).then(r => r.json()).then(allProds => {
        const ap = allProds.data || [];

        // Stock analytics
        const inStock = ap.filter(p => p.quantity > 0).length;
        const outOfStock = ap.filter(p => p.quantity <= 0).length;
        const lowStock = ap.filter(p => p.quantity > 0 && p.quantity <= 5).length;
        const criticalStock = ap.filter(p => p.quantity > 0 && p.quantity <= 2).length;
        const totalStockValue = ap.reduce((s, p) => s + (p.quantity * p.sell_price), 0);
        const totalCostValue = ap.reduce((s, p) => s + (p.quantity * p.inward_price), 0);

        // Low stock items with names
        const lowStockItems = ap
          .filter(p => p.quantity > 0 && p.quantity <= 5)
          .sort((a, b) => a.quantity - b.quantity)
          .slice(0, 20);

        const outOfStockItems = ap
          .filter(p => p.quantity <= 0)
          .slice(0, 20);

        // Sales analytics
        const today = new Date().toISOString().split('T')[0];
        const todaySales = sales.filter(s => s.sale_date === today);
        const todayRevenue = todaySales.reduce((s, inv) => s + (inv.grand_total || 0), 0);

        // Last 7 days
        const last7 = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          const ds = d.toISOString().split('T')[0];
          const daySales = sales.filter(s => s.sale_date === ds);
          last7.push({
            date: ds,
            label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
            count: daySales.length,
            revenue: daySales.reduce((s, inv) => s + (inv.grand_total || 0), 0)
          });
        }

        // Top selling items (from sale items)
        const itemCounts = {};
        sales.forEach(s => {
          try {
            const items = typeof s.items === 'string' ? JSON.parse(s.items) : s.items || [];
            items.forEach(item => {
              const key = item.product_name || 'Unknown';
              if (!itemCounts[key]) itemCounts[key] = { name: key, qty: 0, revenue: 0 };
              itemCounts[key].qty += item.quantity || 0;
              itemCounts[key].revenue += (item.sell_price || 0) * (item.quantity || 0);
            });
          } catch {}
        });
        const topItems = Object.values(itemCounts).sort((a, b) => b.qty - a.qty).slice(0, 10);

        // Customer analytics
        const customers = parties.filter(p => p.party_type === 'customer');
        const suppliers = parties.filter(p => p.party_type === 'supplier');

        // Repeating customers (from sales)
        const customerPurchaseCounts = {};
        sales.forEach(s => {
          const key = s.customer_name || 'Walk-in Customer';
          if (!customerPurchaseCounts[key]) customerPurchaseCounts[key] = { name: key, count: 0, total: 0, phone: s.customer_phone };
          customerPurchaseCounts[key].count++;
          customerPurchaseCounts[key].total += s.grand_total || 0;
        });
        const repeatingCustomers = Object.values(customerPurchaseCounts)
          .filter(c => c.count > 1 && c.name !== 'Walk-in Customer')
          .sort((a, b) => b.count - a.count)
          .slice(0, 15);

        const totalRevenue = sales.reduce((s, inv) => s + (inv.grand_total || 0), 0);

        // Category breakdown
        const catBreakdown = categories.map(c => ({
          name: c.name,
          products: c.product_count || 0,
          subs: c.subcategories?.length || 0
        })).sort((a, b) => b.products - a.products).slice(0, 10);

        setData({
          totalProducts, totalCategories: categories.length,
          totalCustomers: customers.length, totalSuppliers: suppliers.length,
          inStock, outOfStock, lowStock, criticalStock,
          totalStockValue, totalCostValue,
          lowStockItems, outOfStockItems,
          todaySales: todaySales.length, todayRevenue,
          totalSales: sales.length, totalRevenue,
          last7, topItems,
          repeatingCustomers, catBreakdown,
          settings
        });
        setLoading(false);
      });
    }).catch(e => { console.error(e); setLoading(false); });
  }, []);

  if (loading) return <div style={{textAlign:'center',padding:60}}><div className="spinner" style={{margin:'0 auto 16px'}} /><p>Loading dashboard...</p></div>;
  if (!data) return <div style={{textAlign:'center',padding:60,color:'#999'}}>No data available</div>;

  const d = data;
  const maxRevenue = Math.max(...d.last7.map(d => d.revenue), 1);

  return (
    <div>
      <h2 style={{marginBottom:20}}>Dashboard</h2>

      {/* TOP STATS */}
      <div className="stats-grid">
        <div className="stat-card accent"><div className="stat-value">{d.totalProducts.toLocaleString()}</div><div className="stat-label">Total Products</div></div>
        <div className="stat-card success"><div className="stat-value">₹{d.todayRevenue.toLocaleString('en-IN')}</div><div className="stat-label">Today's Sales ({d.todaySales})</div></div>
        <div className="stat-card"><div className="stat-value">₹{d.totalRevenue.toLocaleString('en-IN')}</div><div className="stat-label">Total Revenue</div></div>
        <div className="stat-card warning"><div className="stat-value">{d.totalCustomers}</div><div className="stat-label">Customers</div></div>
        <div className="stat-card"><div className="stat-value">₹{(d.totalStockValue/100000).toFixed(1)}L</div><div className="stat-label">Stock Value</div></div>
        <div className="stat-card danger"><div className="stat-value">{d.outOfStock}</div><div className="stat-label">Out of Stock</div></div>
        <div className="stat-card warning"><div className="stat-value">{d.lowStock}</div><div className="stat-label">Low Stock (≤5)</div></div>
        <div className="stat-card"><div className="stat-value">{d.totalCategories}</div><div className="stat-label">Categories</div></div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16}}>

        {/* LAST 7 DAYS CHART */}
        <div className="card">
          <h3 style={{marginBottom:16}}>📊 Sales - Last 7 Days</h3>
          <div style={{display:'flex', alignItems:'flex-end', gap:8, height:160}}>
            {d.last7.map((day, i) => (
              <div key={i} style={{flex:1, textAlign:'center'}}>
                <div style={{
                  height: Math.max(4, (day.revenue / maxRevenue) * 140),
                  background: day.revenue > 0 ? 'linear-gradient(180deg, #3b82f6, #1d4ed8)' : '#e5e7eb',
                  borderRadius: '6px 6px 0 0',
                  marginBottom: 4,
                  transition: 'height 0.3s'
                }} />
                <div style={{fontSize:10, color:'#666'}}>{day.label}</div>
                <div style={{fontSize:11, fontWeight:700}}>{day.count > 0 ? `₹${(day.revenue/1000).toFixed(1)}k` : '-'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* TOP SELLING ITEMS */}
        <div className="card">
          <h3 style={{marginBottom:16}}>🏆 Top Selling Items</h3>
          {d.topItems.length === 0 ? (
            <p style={{color:'#999', textAlign:'center', padding:20}}>No sales data yet</p>
          ) : (
            <div style={{maxHeight:180, overflowY:'auto'}}>
              {d.topItems.map((item, i) => (
                <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:'1px solid #f0f0f0'}}>
                  <span style={{width:20, fontSize:12, color:'#999', textAlign:'center'}}>{i+1}</span>
                  <span style={{flex:1, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.name}</span>
                  <span className="badge badge-success">{item.qty} sold</span>
                  <span style={{fontSize:12, color:'#666', width:80, textAlign:'right'}}>₹{item.revenue.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16}}>

        {/* REPEATING CUSTOMERS */}
        <div className="card">
          <h3 style={{marginBottom:16}}>👥 Repeating Customers</h3>
          {d.repeatingCustomers.length === 0 ? (
            <p style={{color:'#999', textAlign:'center', padding:20}}>No repeating customers yet</p>
          ) : (
            <div style={{maxHeight:200, overflowY:'auto'}}>
              {d.repeatingCustomers.map((c, i) => (
                <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:'1px solid #f0f0f0'}}>
                  <span style={{width:20, fontSize:12, color:'#999', textAlign:'center'}}>{i+1}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13, fontWeight:600}}>{c.name}</div>
                    {c.phone && <div style={{fontSize:10, color:'#999'}}>{c.phone}</div>}
                  </div>
                  <span className="badge badge-info">{c.count} orders</span>
                  <span style={{fontSize:12, fontWeight:600, width:80, textAlign:'right'}}>₹{c.total.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* LOW STOCK ALERTS */}
        <div className="card">
          <h3 style={{marginBottom:16}}>⚠️ Low Stock Alerts (≤5 units)</h3>
          {d.lowStockItems.length === 0 ? (
            <p style={{color:'#27ae60', textAlign:'center', padding:20}}>All products well stocked!</p>
          ) : (
            <div style={{maxHeight:200, overflowY:'auto'}}>
              {d.lowStockItems.map((p, i) => (
                <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:'1px solid #f0f0f0'}}>
                  <span style={{width:20, fontSize:12, color:'#999', textAlign:'center'}}>{i+1}</span>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name}</div>
                    <div style={{fontSize:10, color:'#999'}}>{p.barcode || ''}</div>
                  </div>
                  <span className={`badge ${p.quantity <= 2 ? 'badge-danger' : 'badge-warning'}`}>
                    {p.quantity} left
                  </span>
                  <span style={{fontSize:11, color:'#666'}}>₹{p.sell_price}</span>
                </div>
              ))}
            </div>
          )}
          {d.outOfStockItems.length > 0 && (
            <div style={{marginTop:12, padding:8, background:'#fef2f2', borderRadius:6}}>
              <strong style={{fontSize:12, color:'#dc2626'}}>Out of Stock ({d.outOfStockItems.length}):</strong>
              <div style={{fontSize:11, color:'#991b1b', marginTop:4}}>
                {d.outOfStockItems.slice(0, 5).map(p => p.name).join(', ')}
                {d.outOfStockItems.length > 5 && ` +${d.outOfStockItems.length - 5} more`}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>

        {/* CATEGORY BREAKDOWN */}
        <div className="card">
          <h3 style={{marginBottom:16}}>📁 Top Categories</h3>
          <div style={{maxHeight:200, overflowY:'auto'}}>
            {d.catBreakdown.map((c, i) => (
              <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:'1px solid #f0f0f0'}}>
                <span style={{width:20, fontSize:12, color:'#999', textAlign:'center'}}>{i+1}</span>
                <span style={{flex:1, fontSize:13}}>{c.name}</span>
                <span className="badge badge-info">{c.products} products</span>
                <span style={{fontSize:11, color:'#999'}}>{c.subs} subs</span>
              </div>
            ))}
          </div>
        </div>

        {/* FINANCIAL SUMMARY */}
        <div className="card">
          <h3 style={{marginBottom:16}}>💰 Financial Summary</h3>
          <div style={{display:'grid', gap:10}}>
            <div style={{display:'flex', justifyContent:'space-between', padding:'10px 12px', background:'#f0fdf4', borderRadius:8}}>
              <span>Total Revenue</span><strong>₹{d.totalRevenue.toLocaleString('en-IN')}</strong>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', padding:'10px 12px', background:'#f0f9ff', borderRadius:8}}>
              <span>Stock Value (Selling)</span><strong>₹{d.totalStockValue.toLocaleString('en-IN')}</strong>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', padding:'10px 12px', background:'#fefce8', borderRadius:8}}>
              <span>Stock Value (Cost)</span><strong>₹{d.totalCostValue.toLocaleString('en-IN')}</strong>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', padding:'10px 12px', background:'#f5f3ff', borderRadius:8}}>
              <span>Potential Profit</span><strong>₹{(d.totalStockValue - d.totalCostValue).toLocaleString('en-IN')}</strong>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', padding:'10px 12px', background:'#fff1f2', borderRadius:8}}>
              <span>Total Sales</span><strong>{d.totalSales}</strong>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', padding:'10px 12px', background:'#f0f9ff', borderRadius:8}}>
              <span>Avg Sale Value</span><strong>₹{d.totalSales > 0 ? (d.totalRevenue / d.totalSales).toLocaleString('en-IN', {maximumFractionDigits:0}) : 0}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

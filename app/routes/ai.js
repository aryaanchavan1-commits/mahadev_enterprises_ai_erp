const express = require('express');
const router = express.Router();
const { get, all, run, lastInsertRowid, saveDb } = require('../db');

function getGroqClient() {
  const apiKey = get("SELECT value FROM settings WHERE key='groq_api_key'")?.value;
  if (!apiKey) return null;
  try { const Groq = require('groq-sdk'); return new Groq({ apiKey }); } catch (e) { return null; }
}

const defaultModels = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
  { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
  { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 70B' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' },
  { id: 'qwen-2.5-32b', name: 'Qwen 2.5 32B' },
];

// Agent tools
const agentTools = [
  {
    type: 'function',
    function: {
      name: 'create_category',
      description: 'Create a new product category',
      parameters: { type: 'object', properties: { name: { type: 'string', description: 'Category name' } }, required: ['name'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_product',
      description: 'Create a new product in inventory',
      parameters: { type: 'object', properties: {
        name: { type: 'string', description: 'Product name' },
        category_name: { type: 'string', description: 'Category name (will be created if not exists)' },
        quantity: { type: 'number', description: 'Initial stock quantity' },
        sell_price: { type: 'number', description: 'Selling price in rupees' },
        purchase_price: { type: 'number', description: 'Purchase/cost price in rupees' },
        hsn_code: { type: 'string', description: 'HSN code for GST' },
        barcode: { type: 'string', description: 'Barcode (auto-generated if empty)' },
        description: { type: 'string', description: 'Product description' },
        gst_rate: { type: 'number', description: 'GST rate percentage (default 18)' }
      }, required: ['name', 'sell_price'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_stock',
      description: 'Update stock quantity for a product',
      parameters: { type: 'object', properties: {
        product_name: { type: 'string', description: 'Product name to search' },
        quantity: { type: 'number', description: 'New quantity (absolute value)' },
        reason: { type: 'string', description: 'Reason for adjustment' }
      }, required: ['product_name', 'quantity'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_inventory_status',
      description: 'Get current inventory status with low stock alerts',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sales_report',
      description: 'Get sales report for a period',
      parameters: { type: 'object', properties: {
        period: { type: 'string', enum: ['today', 'this_week', 'this_month', 'last_month', 'this_year'] }
      }, required: ['period'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_analysis',
      description: 'Get customer analysis with top customers',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Search products by name, barcode, or HSN',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'Search term' }
      }, required: ['query'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_low_stock',
      description: 'Get products with low stock that need restocking',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_customer',
      description: 'Create a new customer',
      parameters: { type: 'object', properties: {
        name: { type: 'string', description: 'Customer name' },
        phone: { type: 'string', description: 'Phone number' },
        gstin: { type: 'string', description: 'GSTIN number' },
        address: { type: 'string', description: 'Address' }
      }, required: ['name'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_profit_analysis',
      description: 'Get profit analysis for a period',
      parameters: { type: 'object', properties: {
        period: { type: 'string', enum: ['this_month', 'last_month', 'this_year'] }
      }, required: ['period'] }
    }
  },
];

// Execute tool calls
async function executeToolCall(name, args) {
  switch (name) {
    case 'create_category': {
      const existing = get('SELECT id FROM categories WHERE LOWER(name) = ?', [args.name.toLowerCase()]);
      if (existing) return { success: false, message: `Category "${args.name}" already exists` };
      run('INSERT INTO categories (name) VALUES (?)', [args.name]);
      saveDb();
      return { success: true, message: `Category "${args.name}" created successfully`, id: lastInsertRowid() };
    }

    case 'create_product': {
      let categoryId = null;
      if (args.category_name) {
        let cat = get('SELECT id FROM categories WHERE LOWER(name) = ?', [args.category_name.toLowerCase()]);
        if (!cat) {
          run('INSERT INTO categories (name) VALUES (?)', [args.category_name]);
          cat = { id: lastInsertRowid() };
        }
        categoryId = cat.id;
      }
      const barcode = args.barcode || `ME${Date.now()}${Math.floor(Math.random() * 999)}`;
      run(`INSERT INTO products (name, quantity, sell_price, inward_price, hsn_code, description, barcode, category_id, gst_rate, discount_percent) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [args.name, args.quantity || 0, args.sell_price || 0, args.purchase_price || 0, args.hsn_code || '', args.description || '', barcode, categoryId, args.gst_rate || 18, 0]);
      saveDb();
      return { success: true, message: `Product "${args.name}" created with barcode ${barcode}`, id: lastInsertRowid(), barcode };
    }

    case 'update_stock': {
      const products = all('SELECT id, name, quantity FROM products WHERE LOWER(name) LIKE ?', [`%${args.product_name.toLowerCase()}%`]);
      if (products.length === 0) return { success: false, message: `No product found matching "${args.product_name}"` };
      const product = products[0];
      const oldQty = product.quantity;
      run('UPDATE products SET quantity = ? WHERE id = ?', [args.quantity, product.id]);
      run('INSERT INTO stock_movements (product_id, type, quantity_change, reference, notes) VALUES (?, ?, ?, ?, ?)',
        [product.id, 'adjustment', args.quantity - oldQty, 'AI Agent', args.reason || 'Stock adjustment by AI']);
      saveDb();
      return { success: true, message: `Stock updated for "${product.name}": ${oldQty} → ${args.quantity}`, product: product.name, old_quantity: oldQty, new_quantity: args.quantity };
    }

    case 'get_inventory_status': {
      const total = get('SELECT COUNT(*) as c FROM products WHERE is_active != 0').c || get('SELECT COUNT(*) as c FROM products').c;
      const totalQty = get('SELECT COALESCE(SUM(quantity),0) as c FROM products').c;
      const lowStock = all('SELECT name, quantity, sell_price FROM products WHERE quantity > 0 AND quantity <= 5 ORDER BY quantity ASC LIMIT 20');
      const outOfStock = all('SELECT name, quantity FROM products WHERE quantity = 0 LIMIT 20');
      const totalValue = get('SELECT COALESCE(SUM(quantity * sell_price),0) as c FROM products').c;
      return { totalProducts: total, totalQuantity: totalQty, totalValue: Math.round(totalValue), lowStockCount: lowStock.length, outOfStockCount: outOfStock.length, lowStockItems: lowStock, outOfStockItems: outOfStock };
    }

    case 'get_sales_report': {
      const today = new Date().toISOString().split('T')[0];
      const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0];
      const lastMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0];
      const thisYear = `${new Date().getFullYear()}-01-01`;
      let startDate, endDate, periodName;
      if (args.period === 'today') { startDate = today; endDate = today; periodName = 'Today'; }
      else if (args.period === 'this_week') { const d = new Date(); d.setDate(d.getDate() - d.getDay()); startDate = d.toISOString().split('T')[0]; endDate = today; periodName = 'This Week'; }
      else if (args.period === 'this_month') { startDate = thisMonth; endDate = today; periodName = 'This Month'; }
      else if (args.period === 'last_month') { startDate = lastMonth; endDate = lastMonthEnd; periodName = 'Last Month'; }
      else if (args.period === 'this_year') { startDate = thisYear; endDate = today; periodName = 'This Year'; }
      else { startDate = today; endDate = today; periodName = 'Today'; }
      const sales = all('SELECT * FROM sales WHERE sale_date >= ? AND sale_date <= ?', [startDate, endDate]);
      const totalRevenue = sales.reduce((s, x) => s + (x.grand_total || 0), 0);
      const totalTax = sales.reduce((s, x) => s + (x.cgst_total || 0) + (x.sgst_total || 0) + (x.igst_total || 0), 0);
      return { period: periodName, startDate, endDate, totalSales: sales.length, totalRevenue: Math.round(totalRevenue * 100) / 100, totalTax: Math.round(totalTax * 100) / 100, averageSale: sales.length > 0 ? Math.round(totalRevenue / sales.length) : 0 };
    }

    case 'get_customer_analysis': {
      const sales = all('SELECT * FROM sales ORDER BY sale_date');
      const custMap = {};
      sales.forEach(s => {
        const n = s.customer_name || 'Walk-in';
        if (!custMap[n]) custMap[n] = { name: n, visits: 0, spent: 0, phone: s.customer_phone };
        custMap[n].visits++; custMap[n].spent += (s.grand_total || 0);
      });
      const customers = Object.values(custMap).sort((a, b) => b.spent - a.spent);
      const repeat = customers.filter(c => c.visits > 1);
      return { totalCustomers: customers.length, repeatCustomers: repeat.length, topCustomers: customers.slice(0, 10).map(c => ({ name: c.name, visits: c.visits, spent: Math.round(c.spent) })) };
    }

    case 'search_products': {
      const products = all('SELECT id, name, barcode, sell_price, quantity, hsn_code FROM products WHERE LOWER(name) LIKE ? OR barcode LIKE ? OR hsn_code LIKE ? LIMIT 20',
        [`%${args.query}%`, `%${args.query}%`, `%${args.query}%`]);
      return { count: products.length, products };
    }

    case 'get_low_stock': {
      const lowStock = all('SELECT name, quantity, sell_price, barcode FROM products WHERE quantity > 0 AND quantity <= 5 ORDER BY quantity ASC');
      const outOfStock = all('SELECT name, quantity, sell_price, barcode FROM products WHERE quantity = 0 ORDER BY name');
      return { lowStock: lowStock.length, outOfStock: outOfStock.length, lowStockItems: lowStock, outOfStockItems: outOfStock };
    }

    case 'create_customer': {
      if (args.phone) {
        const existing = get('SELECT id FROM parties WHERE phone = ?', [args.phone]);
        if (existing) return { success: false, message: `Customer with phone ${args.phone} already exists` };
      }
      run('INSERT INTO parties (name, party_type, phone, gstin, address) VALUES (?, ?, ?, ?, ?)',
        [args.name, 'customer', args.phone || '', args.gstin || '', args.address || '']);
      saveDb();
      return { success: true, message: `Customer "${args.name}" created`, id: lastInsertRowid() };
    }

    case 'get_profit_analysis': {
      const today = new Date();
      let startDate, endDate, periodName;
      if (args.period === 'this_month') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        endDate = today.toISOString().split('T')[0];
        periodName = 'This Month';
      } else if (args.period === 'last_month') {
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0];
        endDate = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];
        periodName = 'Last Month';
      } else {
        startDate = `${today.getFullYear()}-01-01`;
        endDate = today.toISOString().split('T')[0];
        periodName = 'This Year';
      }
      const sales = all('SELECT * FROM sales WHERE sale_date >= ? AND sale_date <= ?', [startDate, endDate]);
      const totalRevenue = sales.reduce((s, x) => s + (x.grand_total || 0), 0);
      const totalCost = sales.reduce((s, x) => {
        const items = JSON.parse(x.items || '[]');
        return s + items.reduce((is, i) => is + ((i.purchase_price || i.unit_price * 0.7 || 0) * (i.quantity || 1)), 0);
      }, 0);
      const profit = totalRevenue - totalCost;
      return { period: periodName, revenue: Math.round(totalRevenue), estimatedCost: Math.round(totalCost), estimatedProfit: Math.round(profit), margin: totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0 };
    }

    default: return { success: false, message: `Unknown tool: ${name}` };
  }
}

const CHAT_SYSTEM = `You are the AI assistant for Mahadev Enterprises ERP. You help with:
- Inventory management, stock levels, low stock alerts
- Sales analysis, revenue tracking
- GST billing (CGST 9%, SGST 9% for intra-state, IGST 18% for inter-state)
- Customer analysis
- Product management (create, update, search)
- Business insights and recommendations

Be concise, helpful, and data-driven. The year is 2026. If asked to perform an action, use the available functions.`;

const AGENT_SYSTEM = `You are an AUTONOMOUS AI AGENT for Mahadev Enterprises ERP. You CAN and SHOULD execute tasks immediately when asked.

IMPORTANT RULES:
- When asked to CREATE something (category, product, customer), EXECUTE IT IMMEDIATELY using the tools
- Do NOT ask for confirmation - just do it
- When asked to find/search something, use the search tools
- When asked for reports/analysis, use the report tools
- Always show the results clearly
- If a tool returns success:true, the action was completed

You have these tools available:
- create_category: Create a new product category
- create_product: Create a new product (auto-creates category if needed)
- create_customer: Create a new customer
- update_stock: Update stock quantity for a product
- get_inventory_status: Get inventory overview
- get_sales_report: Get sales report
- get_customer_analysis: Get customer analysis
- search_products: Search products
- get_low_stock: Get low stock alerts
- get_profit_analysis: Get profit analysis

EXECUTE TASKS IMMEDIATELY. DO NOT ASK FOR PERMISSION.`;

// POST chat
router.post('/chat', async (req, res) => {
  try {
    const { message, model, mode } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Message required' });

    const client = getGroqClient();
    if (!client) return res.status(400).json({ success: false, error: 'Groq API key not configured. Add API key in Settings > AI.' });

    const selectedModel = model || get("SELECT value FROM settings WHERE key='groq_model'")?.value || 'llama-3.3-70b-versatile';
    const isAgentMode = mode === 'agent';

    run('INSERT INTO ai_conversations (role, content) VALUES (?, ?)', ['user', message]);
    const history = all('SELECT role, content FROM ai_conversations ORDER BY id DESC LIMIT 20').reverse();

    const messages = [
      { role: 'system', content: isAgentMode ? AGENT_SYSTEM : CHAT_SYSTEM },
      ...history.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
    ];

    const completionOpts = { model: selectedModel, messages, temperature: 0.7, max_tokens: 2000 };
    if (isAgentMode) { completionOpts.tools = agentTools; completionOpts.tool_choice = 'auto'; }

    const completion = await client.chat.completions.create(completionOpts);
    const responseMsg = completion.choices[0]?.message;
    let replyText = responseMsg?.content || '';
    const toolCalls = responseMsg?.tool_calls || [];
    const toolResults = [];

    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const fnName = tc.function.name;
        const fnArgs = JSON.parse(tc.function.arguments || '{}');
        try {
          const result = await executeToolCall(fnName, fnArgs);
          toolResults.push({ tool: fnName, args: fnArgs, result });
          replyText += `\n\n✅ **${fnName}** executed:\n${JSON.stringify(result, null, 2)}`;
        } catch (e) {
          toolResults.push({ tool: fnName, args: fnArgs, error: e.message });
          replyText += `\n\n❌ **${fnName}** failed: ${e.message}`;
        }
      }
    }

    if (!replyText) replyText = isAgentMode ? 'I understand. What would you like me to do?' : 'How can I help with your ERP?';

    run('INSERT INTO ai_conversations (role, content) VALUES (?, ?)', ['assistant', replyText]);
    res.json({ success: true, data: { role: 'assistant', content: replyText, model: selectedModel, mode: isAgentMode ? 'agent' : 'chat', toolResults } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/models', async (req, res) => {
  try {
    const client = getGroqClient();
    if (!client) return res.json({ success: true, data: defaultModels });
    const models = await client.models.list();
    res.json({ success: true, data: models.data || defaultModels });
  } catch (err) { res.json({ success: true, data: defaultModels }); }
});

router.get('/history', (req, res) => {
  try { res.json({ success: true, data: all('SELECT * FROM ai_conversations ORDER BY id ASC') }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/history', (req, res) => {
  try { run('DELETE FROM ai_conversations'); res.json({ success: true, message: 'Cleared' }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/settings/api-key-status', (req, res) => {
  try {
    const key = get("SELECT value FROM settings WHERE key='groq_api_key'")?.value;
    res.json({ success: true, configured: !!key });
  } catch (err) { res.json({ success: true, configured: false }); }
});

router.post('/settings/api-key', (req, res) => {
  try {
    const { api_key } = req.body;
    if (!api_key) return res.status(400).json({ success: false, error: 'API key required' });
    run("INSERT INTO settings (key, value) VALUES ('groq_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = ?", [api_key, api_key]);
    saveDb();
    res.json({ success: true, message: 'API key saved' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;

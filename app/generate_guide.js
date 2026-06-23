const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, 'Mahadev_Enterprises_ERP_User_Guide.pdf');

const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: 'Mahadev Enterprises ERP - User Guide', Author: 'Mahadev Enterprises', Subject: 'Complete User Guide' } });

const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

let y = 50;
const W = 495;
const L = 50;

function header() {
  doc.rect(0, 0, 595, 80).fill('#1a1a2e');
  doc.fill('#ffffff').fontSize(24).font('Helvetica-Bold').text('Mahadev Enterprises ERP', L, 25, { width: W, align: 'center' });
  doc.fontSize(10).font('Helvetica').text('Complete User Guide', L, 55, { width: W, align: 'center' });
  doc.fill('#000000');
  y = 100;
}

function footer() {
  doc.fill('#999999').fontSize(8).text('Mahadev Enterprises ERP - User Guide | Confidential', L, 780, { width: W, align: 'center' });
  doc.fill('#000000');
}

function newPage() {
  doc.addPage();
  footer();
  y = 50;
}

function title(text) {
  if (y > 720) newPage();
  doc.fontSize(18).font('Helvetica-Bold').fill('#1a1a2e').text(text, L, y, { width: W });
  doc.fill('#000000');
  y += 30;
}

function subtitle(text) {
  if (y > 720) newPage();
  doc.fontSize(14).font('Helvetica-Bold').fill('#2563eb').text(text, L, y, { width: W });
  doc.fill('#000000');
  y += 22;
}

function body(text) {
  if (y > 740) newPage();
  doc.fontSize(10).font('Helvetica').text(text, L, y, { width: W, lineGap: 4 });
  y = doc.y + 8;
}

function bullet(text) {
  if (y > 740) newPage();
  doc.fontSize(10).font('Helvetica').text('• ' + text, L + 10, y, { width: W - 10, lineGap: 4 });
  y = doc.y + 4;
}

function separator() {
  if (y > 740) newPage();
  doc.strokeColor('#e5e7eb').moveTo(L, y).lineTo(L + W, y).stroke();
  doc.strokeColor('#000000');
  y += 12;
}

// === COVER PAGE ===
doc.rect(0, 0, 595, 842).fill('#0f172a');
doc.fill('#ffffff').fontSize(40).font('Helvetica-Bold').text('MAHADEV', L, 200, { width: W, align: 'center' });
doc.text('ENTERPRISES', L, 250, { width: W, align: 'center' });
doc.fontSize(24).font('Helvetica').text('ERP Management System', L, 320, { width: W, align: 'center' });
doc.moveDown(2);
doc.fontSize(16).text('Complete User Guide', L, 380, { width: W, align: 'center' });
doc.moveDown(2);
doc.fontSize(12).fill('#94a3b8').text('Version 1.0.0', L, 450, { width: W, align: 'center' });
doc.text('2026', L, 470, { width: W, align: 'center' });
doc.fill('#000000');

// === TABLE OF CONTENTS ===
newPage();
header();
title('Table of Contents');
separator();

const toc = [
  '1. Getting Started',
  '2. Dashboard',
  '3. Products Management',
  '4. Categories',
  '5. Sales / POS Billing',
  '6. Customers',
  '7. Suppliers',
  '8. Inventory Management',
  '9. Barcode Management',
  '10. GST & Invoices',
  '11. Reports',
  '12. AI Assistant',
  '13. Accounting',
  '14. Staff Commission',
  '15. Number Plate Registration',
  '16. Vyapar Data Import',
  '17. Settings',
  '18. Backup & Restore',
  '19. Keyboard Shortcuts',
  '20. Troubleshooting',
];

toc.forEach((item, i) => {
  body(item);
});

// === 1. GETTING STARTED ===
newPage();
header();
title('1. Getting Started');
separator();
subtitle('Installation');
body('1. Double-click "Mahadev Enterprises ERP Setup 1.0.0.exe"');
body('2. Click "Install" and wait for installation to complete');
body('3. The app will launch automatically after installation');
body('4. A desktop shortcut will be created');
separator();
subtitle('First Launch');
body('When you first open the app, it will be empty. You need to import your data from Vyapar:');
bullet('Go to "Vyapar Import" in the sidebar');
bullet('Click "Upload .vyb File" or drag-drop your .vyb file');
bullet('All your products, categories, customers, suppliers, and sales will be imported');
bullet('The app is now ready to use');
separator();
subtitle('System Requirements');
bullet('Windows 10 or later (64-bit)');
bullet('4 GB RAM minimum');
bullet('500 MB free disk space');
bullet('Any USB barcode scanner (optional)');
bullet('Thermal or regular printer (optional)');

// === 2. DASHBOARD ===
newPage();
header();
title('2. Dashboard');
separator();
body('The Dashboard gives you a complete overview of your business at a glance.');
separator();
subtitle('Statistics Cards');
bullet('Total Products - Number of products in inventory');
bullet('Today\'s Sales - Revenue earned today');
bullet('Total Revenue - All-time revenue');
bullet('Customers - Total registered customers');
bullet('Stock Value - Total value of current inventory');
bullet('Out of Stock - Products with zero quantity');
bullet('Low Stock - Products with quantity ≤ 5');
bullet('Categories - Number of product categories');
separator();
subtitle('Charts & Analytics');
bullet('Sales Last 7 Days - Bar chart showing daily revenue');
bullet('Top Selling Items - Products ranked by quantity sold');
bullet('Repeating Customers - Customers with multiple purchases');
bullet('Category Breakdown - Products per category');
bullet('Financial Summary - Revenue, profit, stock value');
separator();
subtitle('Staff Sales');
body('Shows each staff member\'s sales for today with commission earned.');
separator();
subtitle('Number Plate Orders');
body('Shows today\'s and monthly number plate orders with status counts.');

// === 3. PRODUCTS ===
newPage();
header();
title('3. Products Management');
separator();
subtitle('Adding a Product');
body('1. Go to Products page');
body('2. Click "+ Add Product"');
body('3. Fill in the details:');
bullet('Product Name (required)');
bullet('HSN Code (for GST)');
bullet('Description');
bullet('Quantity (initial stock)');
bullet('Sell Price (retail price)');
bullet('Wholesale Price (B2B price)');
bullet('Cost Price (purchase price)');
bullet('Barcode (auto-generated if empty)');
bullet('Category');
bullet('Product Image');
body('4. Click "Create Product"');
separator();
subtitle('Editing a Product');
body('Click "Edit" on any product row to modify its details. Changes are saved immediately.');
separator();
subtitle('Deleting a Product');
body('Click "Del" on any product row. Products are soft-deleted (hidden but not removed from database).');
separator();
subtitle('Search & Filter');
bullet('Search by name, HSN code, barcode, or description');
bullet('Filter by category using the dropdown');
bullet('Paginated view (50 products per page)');

// === 4. CATEGORIES ===
newPage();
header();
title('4. Categories');
separator();
body('Categories help organize your products for easy browsing in POS.');
separator();
subtitle('Adding a Category');
body('1. Go to Categories page');
body('2. Click "+ Add Category"');
body('3. Enter category name (e.g., "Wiper Blades", "Engine Oil")');
body('4. Click "Add"');
separator();
subtitle('Editing a Category');
body('Click the edit (✏) button next to any category name to rename it.');
separator();
subtitle('Deleting a Category');
body('Click the delete (🗑) button. Products in that category will become uncategorized.');
separator();
subtitle('Viewing Products in Category');
body('Click any category name in the left panel to see all products in that category, sorted A-Z.');

// === 5. SALES / POS ===
newPage();
header();
title('5. Sales / POS Billing');
separator();
body('The POS (Point of Sale) page is where you create bills and process sales.');
separator();
subtitle('Barcode Scanning');
body('1. Focus on the barcode input field (press F2)');
body('2. Scan a barcode with your scanner');
body('3. The product auto-adds to cart');
body('4. If product not found, an error is shown');
separator();
subtitle('Manual Product Selection');
body('1. Click a category in the left sidebar');
body('2. Browse products in that category');
body('3. Click any product to add it to cart');
separator();
subtitle('Billing Types');
bullet('B2C - Retail customer (uses sell price)');
bullet('B2B - Business/wholesale (uses wholesale price)');
bullet('B2D - Distributor (lowest price)');
separator();
subtitle('GST Toggle');
body('Toggle GST on/off in the cart. When GST is ON, CGST and SGST are added. When OFF, it\'s a non-GST bill.');
separator();
subtitle('Cart Features');
bullet('Edit price per item (give custom discount)');
bullet('Edit discount percentage per item');
bullet('Change quantity with +/- buttons');
bullet('Remove items with ✕ button');
separator();
subtitle('Completing a Sale');
body('1. Enter customer name and phone (optional)');
body('2. Select payment mode (Cash/UPI/Card/Credit)');
body('3. Click "Complete Sale" or press F8');
body('4. Invoice is generated');
body('5. Print receipt or share via WhatsApp');
separator();
subtitle('Invoice Types');
bullet('Print - Thermal receipt (80mm)');
bullet('GST Invoice - Full A4 PDF with tax details');
bullet('WhatsApp - Share invoice via WhatsApp');

// === 6. CUSTOMERS ===
newPage();
header();
title('6. Customers');
separator();
body('Manage your customer database.');
separator();
subtitle('Adding a Customer');
body('1. Go to Customers page');
body('2. Click "+ Add Customer"');
body('3. Fill in name, phone, email, address, GSTIN');
body('4. Click "Save"');
separator();
subtitle('Customer Features');
bullet('Search by name or phone');
bullet('View purchase history');
bullet('Add vehicles to customer profile');
bullet('Track total purchases and spending');

// === 7. SUPPLIERS ===
newPage();
header();
title('7. Suppliers');
separator();
body('Manage your supplier/vendor database.');
separator();
subtitle('Adding a Supplier');
body('1. Go to Suppliers page');
body('2. Click "+ Add Supplier"');
body('3. Fill in name, contact person, phone, GSTIN, address');
body('4. Click "Save"');
separator();
subtitle('Supplier Features');
bullet('Search by name');
bullet('Track outstanding amounts');
bullet('View purchase history');

// === 8. INVENTORY ===
newPage();
header();
title('8. Inventory Management');
separator();
body('Track all stock movements and adjustments.');
separator();
subtitle('Stock Movements');
body('Every sale, purchase, and adjustment creates a stock movement record. View all movements with filters.');
separator();
subtitle('Stock In');
body('Add stock manually (e.g., new shipment received).');
separator();
subtitle('Stock Out');
body('Remove stock manually (e.g., damaged goods).');
separator();
subtitle('Stock Adjustment');
body('Set exact quantity for a product (e.g., after physical count).');

// === 9. BARCODE ===
newPage();
header();
title('9. Barcode Management');
separator();
subtitle('Generating Barcodes');
body('1. Go to Barcode page');
body('2. Select a product');
body('3. Click "Generate Barcode"');
body('4. Barcode image is created');
separator();
subtitle('Barcode Types');
bullet('Code 128 - Standard barcode (most common)');
bullet('QR Code - Square barcode with more data');
separator();
subtitle('Printing Barcodes');
body('Click "Print" on any barcode to print it on your connected printer.');

// === 10. GST & INVOICES ===
newPage();
header();
title('10. GST & Invoices');
separator();
subtitle('GST Configuration');
body('Go to Settings → Billing to configure:');
bullet('GST Enable/Disable toggle');
bullet('GSTIN number');
bullet('CGST/SGST rates (default 9% each)');
bullet('IGST rate (default 18%)');
bullet('Place of Supply');
bullet('Reverse Charge indicator');
separator();
subtitle('GST Invoice (A4)');
body('Full tax invoice with:');
bullet('Company header with GSTIN');
bullet('Invoice details box');
bullet('Items table with HSN codes');
bullet('Tax summary by rate');
bullet('Amount in words');
bullet('Bank details');
bullet('Terms & conditions');
bullet('Authorized signatory');
separator();
subtitle('GSTR-1 Export');
body('Export GSTR-1 data in JSON format for government filing. Go to GST & Invoices → GSTR-1 Export.');
separator();
subtitle('HSN Summary');
body('View HSN-wise summary of all transactions for CA filing.');

// === 11. REPORTS ===
newPage();
header();
title('11. Reports');
separator();
subtitle('Daily Report');
body('View today\'s sales, revenue, and transactions.');
separator();
subtitle('Monthly Report');
body('View monthly sales summary with charts.');
separator();
subtitle('Product Report');
body('View sales by product with quantity and revenue.');
separator();
subtitle('Customer Report');
body('View customer-wise sales and spending.');
separator();
subtitle('Profit Report');
body('View profit margins and cost analysis.');

// === 12. AI ASSISTANT ===
newPage();
header();
title('12. AI Assistant');
separator();
body('The AI Assistant uses Groq API to help you manage your business.');
separator();
subtitle('Setup');
body('1. Get a free API key from console.groq.com');
body('2. Go to Settings → AI & API');
body('3. Paste your API key');
body('4. Click "Save Key"');
separator();
subtitle('Chat Mode');
body('Ask any business question:');
bullet('"What are my top 5 products this month?"');
bullet('"How much revenue today?"');
bullet('"Which customers are repeating?"');
separator();
subtitle('Agent Mode');
body('The AI agent can execute tasks:');
bullet('"Create a category called Wiper Blades" → Creates it');
bullet('"Add product Engine Oil at Rs.500" → Creates it');
bullet('"Show me today\'s sales" → Shows report');
bullet('"Create customer Raj Traders" → Creates it');
separator();
subtitle('Analytics Mode');
body('Generate AI business forecasts with demand prediction, dead stock detection, and reorder suggestions.');

// === 13. ACCOUNTING ===
newPage();
header();
title('13. Accounting');
separator();
body('Full double-entry accounting system.');
separator();
subtitle('Chart of Accounts');
body('40+ Indian standard accounts organized by type:');
bullet('Assets - Cash, Bank, Receivable, Stock, Fixed Assets');
bullet('Liabilities - Payable, GST Output, Capital');
bullet('Income - Sales, Discount Received, Interest');
bullet('Expenses - Purchases, Rent, Salary, Electricity');
separator();
subtitle('Journal Entries');
body('Create manual journal entries with debit/credit. Debit must equal credit.');
separator();
subtitle('Credit Notes (Sale Returns)');
body('Create credit notes for returned goods. Automatically restores stock and creates journal entry.');
separator();
subtitle('Debit Notes (Purchase Returns)');
body('Create debit notes for returned purchases. Automatically reduces stock and creates journal entry.');
separator();
subtitle('Trial Balance');
body('View all account balances to verify debits equal credits.');
separator();
subtitle('Profit & Loss Statement');
body('View revenue minus expenses for any period.');
separator();
subtitle('Balance Sheet');
body('View assets = liabilities + capital with retained earnings.');

// === 14. STAFF COMMISSION ===
newPage();
header();
title('14. Staff Commission');
separator();
body('Track staff sales and calculate commissions.');
separator();
subtitle('Adding Staff');
body('1. Go to Staff Commission page');
body('2. Click "+ Add Staff"');
body('3. Enter name, phone, commission rate (%), daily target');
body('4. Click "Add Staff"');
separator();
subtitle('Recording a Sale');
body('1. Select a staff member');
body('2. Click "+ Add Sale"');
body('3. Scan barcode OR type barcode OR type product name');
body('4. Click "🔍 Find" to look up product');
body('5. Adjust quantity and price if needed');
body('6. Click "Add Sale"');
body('7. Commission is auto-calculated');
separator();
subtitle('Viewing Performance');
bullet('Today\'s sales and commission per staff');
bullet('Monthly totals');
bullet('Total lifetime sales and commission');
bullet('Dashboard shows all staff performance');

// === 15. NUMBER PLATES ===
newPage();
header();
title('15. Number Plate Registration');
separator();
body('Track number plate orders for your agency.');
separator();
subtitle('Adding an Order');
body('1. Go to Number Plates page');
body('2. Click "+ New Order"');
body('3. Enter customer name, phone, plate number');
body('4. Select plate type (Standard/Fancy/Temporary/Commercial)');
body('5. Enter order date and amount');
body('6. Click "Add Order"');
separator();
subtitle('Managing Orders');
bullet('Update status: Pending → In Progress → Ready → Delivered');
bullet('Search by customer name, phone, or plate number');
bullet('Filter by status');
bullet('Edit or delete orders');
separator();
subtitle('Dashboard Integration');
body('Dashboard shows today\'s orders, monthly orders, pending count, and revenue.');

// === 16. VYAPAR IMPORT ===
newPage();
header();
title('16. Vyapar Data Import');
separator();
body('Import data from Vyapar app backup (.vyb file).');
separator();
subtitle('How to Export from Vyapar');
body('1. Open Vyapar app on your computer');
body('2. Go to Settings → Backup');
body('3. Click "Create Backup"');
body('4. This creates a .vyb file');
separator();
subtitle('Importing Data');
body('1. Go to Vyapar Import page');
body('2. Click "Upload .vyb File" or drag-drop');
body('3. Wait for import to complete');
body('4. All data is imported:');
bullet('Products with barcodes, prices, HSN codes');
bullet('Categories');
bullet('Customers and suppliers');
bullet('Sales and purchases');
bullet('Stock adjustments');
bullet('Firm details (name, GSTIN, bank)');
separator();
subtitle('Re-importing');
body('You can re-import the same .vyb file anytime:');
bullet('Existing products are updated (price, stock)');
bullet('Existing parties are updated (details)');
bullet('Duplicate sales are skipped');
bullet('New data is added');

// === 17. SETTINGS ===
newPage();
header();
title('17. Settings');
separator();
subtitle('Business Details');
bullet('Shop/Company name');
bullet('Address, State, PIN code');
bullet('Phone (primary + alternate)');
bullet('Email, Website');
bullet('Company logo');
separator();
subtitle('GST Configuration');
bullet('GST Enable/Disable');
bullet('GSTIN number');
bullet('PAN number');
bullet('GST rates (CGST, SGST, IGST)');
bullet('Place of Supply');
bullet('Reverse Charge');
separator();
subtitle('Billing');
bullet('Invoice prefix (e.g., INV-)');
bullet('Signature text');
bullet('Terms & conditions');
separator();
subtitle('Bank Details');
bullet('Bank name, Account number');
bullet('IFSC code, Branch');
bullet('UPI ID');
separator();
subtitle('AI / API');
bullet('Groq API key');
bullet('Default AI model');

// === 18. BACKUP ===
newPage();
header();
title('18. Backup & Restore');
separator();
subtitle('Backup Location');
body('All data is stored at:');
body('C:\\Users\\<username>\\AppData\\Roaming\\mahadev-enterprises-erp\\data\\');
separator();
subtitle('What to Backup');
bullet('mahadev_erp.db - Main database file');
bullet('uploads/ - Product images and logos');
bullet('barcodes/ - Barcode images');
separator();
subtitle('How to Backup');
body('1. Navigate to the data folder');
body('2. Copy mahadev_erp.db to any drive (D:, E:, USB, etc.)');
body('3. Copy uploads/ and barcodes/ folders if needed');
separator();
subtitle('How to Restore');
body('1. Copy mahadev_erp.db back to the data folder');
body('2. Restart the app');
body('3. All data is restored');
separator();
subtitle('Compatibility');
body('Backup works on ANY Windows PC. The database file is portable.');

// === 19. KEYBOARD SHORTCUTS ===
newPage();
header();
title('19. Keyboard Shortcuts');
separator();
subtitle('POS / Sales');
bullet('F2 - Focus barcode scanner input');
bullet('F3 - Focus product search');
bullet('F8 - Proceed to payment');
bullet('F9 - Complete sale');
separator();
subtitle('General');
bullet('Enter - Confirm/Submit');
bullet('Escape - Close modal/cancel');

// === 20. TROUBLESHOOTING ===
newPage();
header();
title('20. Troubleshooting');
separator();
subtitle('App Won\'t Start');
bullet('Check if another instance is running (check system tray)');
bullet('Restart your computer');
bullet('Run as Administrator');
separator();
subtitle('Port 3000 in Use');
bullet('Close other apps using port 3000');
bullet('Restart your computer');
separator();
subtitle('Products Not Showing');
bullet('Make sure you imported data via Vyapar Import');
bullet('Check if products are in the correct category');
separator();
subtitle('Barcode Scanner Not Working');
bullet('Most USB scanners work as keyboards (plug and play)');
bullet('Make sure the cursor is in the barcode input field');
bullet('Press F2 to focus the barcode field');
separator();
subtitle('Printer Not Working');
bullet('Go to Settings → Devices → Scan for Printers');
bullet('Make sure printer is connected and turned on');
bullet('Try printing from another app to verify printer works');
separator();
subtitle('AI Not Working');
bullet('Check if API key is configured in Settings → AI');
bullet('Get a free key from console.groq.com');
bullet('Make sure you have internet connection');
separator();
subtitle('Data Location');
body('All data is stored at:');
body('C:\\Users\\<username>\\AppData\\Roaming\\mahadev-enterprises-erp\\data\\');
body('The main database file is mahadev_erp.db');

// === END ===
newPage();
doc.rect(0, 0, 595, 842).fill('#0f172a');
doc.fill('#ffffff').fontSize(24).font('Helvetica-Bold').text('Thank You', L, 300, { width: W, align: 'center' });
doc.fontSize(14).font('Helvetica').text('Mahadev Enterprises ERP', L, 340, { width: W, align: 'center' });
doc.text('Version 1.0.0', L, 365, { width: W, align: 'center' });
doc.fill('#94a3b8').text('For support, contact your system administrator.', L, 420, { width: W, align: 'center' });
doc.fill('#000000');

doc.end();

stream.on('finish', () => {
  console.log(`User Guide created: ${outputPath}`);
  console.log(`Size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
  process.exit(0);
});

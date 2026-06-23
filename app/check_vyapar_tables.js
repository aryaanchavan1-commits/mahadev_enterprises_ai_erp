const AdmZip = require('adm-zip');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function main() {
  const vybPath = process.argv[2] || 'D:\\21-06-2026_17.18.40_MAHADEV_ENTERPRISES_VypBackup.vyb';
  
  if (!fs.existsSync(vybPath)) {
    console.log('File not found:', vybPath);
    process.exit(1);
  }

  const zip = new AdmZip(vybPath);
  const vypEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('.vyp'));
  if (!vypEntry) { console.log('No .vyp found'); process.exit(1); }

  const tmpPath = path.join(__dirname, 'data', 'vyapar_data', 'check.vyp');
  fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
  fs.writeFileSync(tmpPath, vypEntry.getData());

  const wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) });
  const db = new SQL.Database(fs.readFileSync(tmpPath));

  function q(sql) {
    try {
      const stmt = db.prepare(sql);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    } catch { return []; }
  }

  console.log('=== VYAPAR DATABASE TABLES ===\n');
  const tables = q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  tables.forEach(t => {
    const count = q(`SELECT COUNT(*) as c FROM ${t.name}`)[0]?.c || 0;
    if (count > 0) console.log(`  ${t.name}: ${count} rows`);
  });

  console.log('\n=== WHAT GETS IMPORTED ===\n');
  
  const imports = [
    { table: 'kb_firms', desc: 'Firm/Company details', imported: true },
    { table: 'kb_settings', desc: 'App settings', imported: true },
    { table: 'kb_item_categories', desc: 'Product categories', imported: true },
    { table: 'kb_item_categories_mapping', desc: 'Product-category links', imported: true },
    { table: 'kb_tax_code', desc: 'Tax rates', imported: true },
    { table: 'kb_names', desc: 'Customers & Suppliers', imported: true },
    { table: 'kb_items', desc: 'Products', imported: true },
    { table: 'kb_transactions', desc: 'Sales & Purchases', imported: true },
    { table: 'kb_lineitems', desc: 'Transaction line items', imported: true },
    { table: 'kb_item_adjustments', desc: 'Stock adjustments', imported: true },
  ];

  imports.forEach(imp => {
    const count = q(`SELECT COUNT(*) as c FROM ${imp.table}`)[0]?.c || 0;
    console.log(`  [IMPORTED] ${imp.table}: ${count} rows - ${imp.desc}`);
  });

  console.log('\n=== TABLES NOT IMPORTED ===\n');
  const importedTables = imports.map(i => i.table);
  tables.forEach(t => {
    if (!importedTables.includes(t.name)) {
      const count = q(`SELECT COUNT(*) as c FROM ${t.name}`)[0]?.c || 0;
      if (count > 0) console.log(`  [SKIPPED] ${t.name}: ${count} rows`);
    }
  });

  db.close();
  fs.unlinkSync(tmpPath);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

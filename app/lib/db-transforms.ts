// [AJAN-3 | claude/multi-db-sync-setup-3DmYn | 2026-04-14]
// PouchDB ↔ uygulama nesnesi dönüşüm fonksiyonları
// GlobalTableSyncContext, CariPage ve StokPage ortak kullanır.
// Döngüsel bağımlılığı önlemek için sayfa dosyalarından ayrı tutulmuştur:
//   GlobalTableSyncContext → CariPage/StokPage → SyncStatusBar → GlobalTableSyncContext (eski döngü)

// ─── Cari ─────────────────────────────────────────────────────────────────────

export function cariToDb(c: any) {
  return {
    id: c.id,
    type: c.type,
    company_name: c.companyName,
    contact_person: c.contactPerson,
    phone: c.phone,
    email: c.email || null,
    address: c.address || null,
    tax_number: c.taxNumber || null,
    tax_office: c.taxOffice || null,
    approved_business_no: c.approvedBusinessNo || null,
    region: c.region || null,
    category: c.category || null,
    balance: c.balance,
    transactions: c.transactions,
    transaction_history: JSON.stringify(c.transactionHistory || []),
    invoice_mode: c.invoiceMode || 'yok',
    default_kdv_rate: c.defaultKdvRate ?? 20,
    opening_balance: c.openingBalance ?? 0,
  };
}

export function cariFromDb(row: any): any {
  let transactionHistory: any[] = [];
  try {
    if (typeof row.transaction_history === 'string') {
      transactionHistory = JSON.parse(row.transaction_history);
    } else if (Array.isArray(row.transaction_history)) {
      transactionHistory = row.transaction_history;
    } else if (Array.isArray(row.transactionHistory)) {
      transactionHistory = row.transactionHistory;
    }
  } catch {}

  return {
    id: row.id,
    type: row.type,
    companyName: row.company_name || row.companyName || '',
    contactPerson: row.contact_person || row.contactPerson || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    taxNumber: row.tax_number || row.taxNumber || '',
    taxOffice: row.tax_office || row.taxOffice || '',
    approvedBusinessNo: row.approved_business_no || row.approvedBusinessNo || '',
    region: row.region || '',
    category: row.category || '',
    balance: row.balance ?? 0,
    transactions: row.transactions ?? 0,
    transactionHistory,
    created_at: row.created_at,
    invoiceMode: row.invoice_mode || row.invoiceMode || 'yok',
    defaultKdvRate: row.default_kdv_rate ?? row.defaultKdvRate ?? 20,
    openingBalance: row.opening_balance ?? row.openingBalance ?? 0,
  };
}

// ─── Ürün (Stok) ──────────────────────────────────────────────────────────────

export function productToDb(p: any) {
  return {
    id: p.id,
    name: p.name,
    unit: p.unit,
    sell_price: p.sellPrice,
    current_stock: p.currentStock,
    min_stock: p.minStock,
    supplier_entries: JSON.stringify({ category: p.category, movements: p.movements }),
  };
}

export function productFromDb(row: any): any {
  let parsed = { category: 'Diger', movements: [] as any[] };
  try {
    if (typeof row.supplier_entries === 'string') {
      const data = JSON.parse(row.supplier_entries);
      if (Array.isArray(data)) {
        parsed.movements = data.map((entry: any) => ({
          id: entry.id || crypto.randomUUID(),
          type: 'ALIS',
          partyName: entry.supplierName || 'Bilinmeyen Toptanci',
          date: entry.date || new Date().toISOString(),
          quantity: entry.quantity || 0,
          price: entry.buyPrice || 0,
          totalAmount: entry.totalAmount || 0,
          description: 'Eski sistemden aktarildi',
        }));
      } else {
        parsed.category = data.category || 'Diger';
        parsed.movements = data.movements || [];
      }
    } else if (Array.isArray(row.supplier_entries)) {
      parsed.movements = row.supplier_entries.map((entry: any) => ({
        id: entry.id || crypto.randomUUID(),
        type: 'ALIS',
        partyName: entry.supplierName || 'Bilinmeyen Toptanci',
        date: entry.date || new Date().toISOString(),
        quantity: entry.quantity || 0,
        price: entry.buyPrice || 0,
        totalAmount: entry.totalAmount || 0,
      }));
    } else if (Array.isArray(row.movements)) {
      parsed.movements = row.movements;
      parsed.category = row.category || 'Diger';
    }
  } catch {}

  let normalizedUnit: 'KG' | 'Adet' | 'Koli' = 'KG';
  const rawUnit = (row.unit || 'KG').toString().trim().toLowerCase();
  if (rawUnit === 'adet' || rawUnit === 'ad' || rawUnit === 'adt' || rawUnit === 'pcs' || rawUnit === 'piece') {
    normalizedUnit = 'Adet';
  } else if (rawUnit === 'koli' || rawUnit === 'kutu' || rawUnit === 'box' || rawUnit === 'paket') {
    normalizedUnit = 'Koli';
  } else {
    normalizedUnit = 'KG';
  }

  return {
    id: row.id,
    name: row.name || '',
    category: parsed.category,
    unit: normalizedUnit,
    sellPrice:    row.sell_price    ?? row.sellPrice    ?? 0,
    currentStock: row.current_stock ?? row.currentStock ?? 0,
    minStock:     row.min_stock     ?? row.minStock     ?? 0,
    movements: parsed.movements,
  };
}

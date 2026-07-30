export const parseAccountNumber = (accountString) => {
  if (!accountString) return { coa: '', outlet: '', pt: '' };
  
  // Example: "616100-SHI-SHMTA-000"
  const parts = accountString.toString().trim().split('-');
  const rawCoa = (parts[0] || '').trim();
  let coa = rawCoa;
  if (coa.startsWith('6')) {
    coa = coa.substring(0, 5);
  } else if (coa.startsWith('2')) {
    coa = coa.substring(0, 6);
  }
  const pt = (parts[1] || '').trim();
  const outlet = (parts[2] || '').trim();

  return { coa, pt, outlet };
};

export const determineCategory = (coa, reference) => {
  const ref = reference ? reference.toLowerCase() : '';
  
  if (coa.startsWith('61410') || coa.startsWith('20303') || coa.startsWith('61610')) return 'Listrik';
  if (coa.startsWith('61710') || coa.startsWith('20304')) return 'PAM';
  
  if (coa.startsWith('61810') || coa.startsWith('20305')) {
    if (ref.includes('receivings transaction entry')) {
      return null; // Excluded
    }
    return 'Gas';
  }
  
  if (coa.startsWith('63510')) return 'FCU (WATER CHILLER)';
  if (coa.startsWith('62010') || coa.startsWith('20306')) return 'Telp';
  if (coa.startsWith('61910') || coa.startsWith('20307')) return 'Internet';
  
  return null; // Not a utility COA
};

export const processRawData = (data, uploadMonth, groupCode, isBulk = false, debugCallback = null) => {
  let debugLogs = [];
  
  const result = data
    .map((rawRow, index) => {
      // Normalize keys to lowercase and trim spaces
      const row = {};
      Object.keys(rawRow).forEach(key => {
        if (typeof key === 'string') {
          const cleanKey = key.replace(/[\r\n]/g, '').trim().toLowerCase();
          row[cleanKey] = rawRow[key];
        }
      });

      const journalEntry = (row['journal entry'] || row['journal_entry'] || row['journal'] || '').toString().trim();
      const isTarget = journalEntry === '291547';
      
      if (isTarget) {
        debugLogs.push(`--- MEMBACA BARIS Excel ke-${index + 2} ---`);
        debugLogs.push(`Data Mentah: ${JSON.stringify(rawRow)}`);
      }

      const accountStr = row['account number'] || row['account_number'] || row['account'] || '';
      const { coa, outlet } = parseAccountNumber(accountStr);
      const category = determineCategory(coa, row['reference']);
      
      if (isTarget) {
        debugLogs.push(`Hasil Parsing Akun: string='${accountStr}', COA='${coa}', Outlet='${outlet}', Kategori='${category}'`);
      }
      
      if (!category) {
        if (isTarget) debugLogs.push(`❌ DITOLAK: Kategori tidak ditemukan (bukan utilitas).`);
        return null; // Ignore if not utility
      }
      
      let trxDate = row['trx date'] || row['trx_date'] || row['date'];
      
      // Fix Excel timezone/rounding backwards shift (e.g., 23:59:48 becoming the previous day)
      // by adding 12 hours (half a day) to ensure we hit the correct local date.
      if (trxDate) {
        try {
          const tempD = new Date(trxDate);
          if (!isNaN(tempD.getTime())) {
            tempD.setHours(tempD.getHours() + 12);
            trxDate = `${tempD.getFullYear()}-${String(tempD.getMonth() + 1).padStart(2, '0')}-${String(tempD.getDate()).padStart(2, '0')}`;
          }
        } catch (e) {
          // Fallback to original string if parse fails
        }
      }
      
      if (isTarget) {
        debugLogs.push(`Hasil Parsing Tanggal: trxDate='${trxDate}', journalEntry='${journalEntry}'`);
      }
      
      // Prevent Supabase not-null constraints
      if (!trxDate || !journalEntry) {
        if (isTarget) debugLogs.push(`❌ DITOLAK: Tanggal transaksi atau Journal Entry kosong.`);
        return null;
      }

      const cabang = row['cabang'] || '';
      const isCabangDiffers = outlet.toUpperCase() !== cabang.toString().trim().toUpperCase();
      
      // Handle date formatting
      let derivedMonth = uploadMonth;
      
      if (isBulk) {
        try {
          // Extract YYYY-MM-01 from the normalized trxDate
          const d = new Date(trxDate);
          if (!isNaN(d.getTime())) {
            derivedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
          }
        } catch (e) {
          console.warn("Invalid date format", trxDate);
        }
      }
      
      return {
        journal_entry: journalEntry,
        series: row['series'] || '',
        trx_date: trxDate,
        account_number: accountStr,
        account_description: (row['account description'] || row['account_description'] || '').toString(),
        debit_amount: parseFloat(row['debit amount'] || row['debit_amount'] || row['debit']) || 0,
        credit_amount: parseFloat(row['credit amount'] || row['credit_amount'] || row['credit']) || 0,
        reference: (row['reference'] || '').toString(),
        originating_document_number: (row['originating document number'] || row['originating_document_number'] || '').toString(),
        cabang: cabang.toString().trim(),
        upload_month: derivedMonth, // dynamically assigned if bulk
        category: category,
        outlet_code: outlet,
        is_cabang_differs: isCabangDiffers,
      };
    })
    .filter(Boolean); // Remove nulls

  if (debugCallback && debugLogs.length > 0) {
    debugCallback(debugLogs.join('\n'));
  }
  
  return result;
};

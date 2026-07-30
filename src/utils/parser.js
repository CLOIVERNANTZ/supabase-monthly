export const parseAccountNumber = (accountString) => {
  if (!accountString) return { coa: '', outlet: '', pt: '' };
  
  // Example: "616100-SHI-SHMTA-000"
  const parts = accountString.split('-');
  const rawCoa = parts[0] || '';
  let coa = rawCoa;
  if (coa.startsWith('6')) {
    coa = coa.substring(0, 5);
  } else if (coa.startsWith('2')) {
    coa = coa.substring(0, 6);
  }
  const pt = parts[1] || '';
  const outlet = parts[2] || '';

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

export const processRawData = (data, uploadMonth, groupCode, isBulk = false) => {
  return data
    .map((rawRow) => {
      // Normalize keys to lowercase and trim spaces
      const row = {};
      Object.keys(rawRow).forEach(key => {
        if (typeof key === 'string') {
          const cleanKey = key.replace(/[\r\n]/g, '').trim().toLowerCase();
          row[cleanKey] = rawRow[key];
        }
      });

      const accountStr = row['account number'] || '';
      const { coa, outlet } = parseAccountNumber(accountStr);
      const category = determineCategory(coa, row['reference']);
      
      if (!category) return null; // Ignore if not utility
      
      const trxDate = row['trx date'];
      const journalEntry = row['journal entry'];
      
      // Prevent Supabase not-null constraints
      if (!trxDate || !journalEntry) return null;

      const cabang = row['cabang'] || '';
      const isCabangDiffers = outlet.toUpperCase() !== cabang.toUpperCase();
      
      // Handle date formatting
      let derivedMonth = uploadMonth;
      
      if (isBulk) {
        // Parse date to extract YYYY-MM-01
        try {
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
        account_description: row['account description'] || '',
        debit_amount: parseFloat(row['debit amount']) || 0,
        credit_amount: parseFloat(row['credit amount']) || 0,
        reference: row['reference'] || '',
        originating_document_number: row['originating document number'] || '',
        cabang: cabang,
        upload_month: derivedMonth, // dynamically assigned if bulk
        category: category,
        outlet_code: outlet,
        is_cabang_differs: isCabangDiffers,
      };
    })
    .filter(Boolean); // Remove nulls
};

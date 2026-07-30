"use client";

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { processRawData } from '@/utils/parser';
import { UploadCloud, AlertCircle, CheckCircle2, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react';

export default function UploadPage() {
  const [files, setFiles] = useState([]);
  const [data, setData] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [uploadMonth, setUploadMonth] = useState('');
  const [isBulk, setIsBulk] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [debugInfo, setDebugInfo] = useState('');
  
  const parseFile = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target.result;
          const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          
          const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
          let headerRowIndex = -1;
          for (let i = 0; i < Math.min(30, rawData.length); i++) {
            const row = rawData[i];
            if (row && Array.isArray(row)) {
              const rowStr = row.join(' ').toLowerCase();
              if (rowStr.includes('journal') || rowStr.includes('trx date')) {
                headerRowIndex = i;
                break;
              }
            }
          }
          
          if (headerRowIndex !== -1) {
            const dataRows = rawData.slice(headerRowIndex + 1);
            let lastJournal = '';
            let lastDate = '';
            
            const formattedJson = dataRows.map(rowArray => {
              if (rowArray[0]) lastJournal = rowArray[0];
              if (rowArray[2]) lastDate = rowArray[2];
              return {
                'journal entry': lastJournal,
                'series': rowArray[1],
                'trx date': lastDate,
                'account number': rowArray[3],
                'account description': rowArray[4],
                'debit amount': rowArray[5],
                'credit amount': rowArray[6],
                'reference': rowArray[7],
                'originating document number': rowArray[8],
                'cabang': rowArray[9]
              };
            });
            
            const validData = formattedJson.filter(row => row['journal entry'] && row['trx date']);
            if (validData.length > 0) return resolve({ file: file.name, data: validData, error: null });
          }
        } catch (err) {
          console.warn('XLSX parse failed for', file.name, 'trying text fallback...', err);
        }
        
        // Text fallback
        const textReader = new FileReader();
        textReader.onload = (textEvt) => {
          const text = textEvt.target.result;
          const lines = text.split('\n');
          let headerRowIdx = -1;
          let delimiter = '\t';
          for (let i = 0; i < Math.min(30, lines.length); i++) {
            const lineLower = lines[i].toLowerCase();
            if (lineLower.includes('journal') || lineLower.includes('trx date')) {
              headerRowIdx = i;
              if (lines[i].includes(',')) delimiter = ',';
              break;
            }
          }
          
          if (headerRowIdx !== -1) {
            const fallbackData = [];
            let lastJournalText = '';
            let lastDateText = '';
            for (let i = headerRowIdx + 1; i < lines.length; i++) {
              if (!lines[i].trim()) continue;
              const values = lines[i].split(delimiter).map(v => v.replace(/["\r]/g, '').trim());
              if (values[0]) lastJournalText = values[0];
              if (values[2]) lastDateText = values[2];
              fallbackData.push({
                'journal entry': lastJournalText,
                'series': values[1],
                'trx date': lastDateText,
                'account number': values[3],
                'account description': values[4],
                'debit amount': values[5],
                'credit amount': values[6],
                'reference': values[7],
                'originating document number': values[8],
                'cabang': values[9]
              });
            }
            const validData = fallbackData.filter(row => row['journal entry'] && row['trx date']);
            if (validData.length > 0) return resolve({ file: file.name, data: validData, error: null });
          }
          resolve({ file: file.name, data: [], error: 'No valid header or rows found.' });
        };
        textReader.readAsText(file);
      };
      reader.readAsBinaryString(file);
    });
  };

  const handleFileUpload = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;
    
    setFiles(selectedFiles);
    setIsLoading(true);
    setData([]);
    setParsedData([]);
    setMessage(null);
    setDebugInfo('');
    
    let allData = [];
    let allDebug = '';
    let successCount = 0;
    
    for (const file of selectedFiles) {
      const result = await parseFile(file);
      if (result.data.length > 0) {
        allData = [...allData, ...result.data];
        successCount++;
      } else {
        allDebug += `\n[${result.file}] Failed: ${result.error}`;
      }
    }
    
    setData(allData);
    setDebugInfo(allDebug);
    setIsLoading(false);
    
    if (successCount === 0) {
      setMessage({ type: 'error', text: 'Tidak ada data valid yang berhasil dibaca dari file yang dipilih.' });
    } else {
      setMessage({ type: 'success', text: `Berhasil membaca data mentah dari ${successCount}/${selectedFiles.length} file. Total ${allData.length} baris.` });
    }
  };
  
  const handleProcess = () => {
    if (!isBulk && !uploadMonth) {
      setMessage({ type: 'error', text: 'Silakan pilih bulan upload atau gunakan mode Bulk.' });
      return;
    }
    if (data.length === 0) {
      setMessage({ type: 'error', text: 'Data kosong. Silakan upload file.' });
      return;
    }
    
    // YYYY-MM-01 format for easy comparison
    const formattedMonth = isBulk ? null : `${uploadMonth}-01`; 
    const result = processRawData(data, formattedMonth, null, isBulk);
    setParsedData(result);
    setMessage({ type: 'success', text: `Berhasil memproses ${result.length} baris data valid utilitas.` });
  };
  
  const handleUploadToDB = async () => {
    if (parsedData.length === 0) return;
    setIsLoading(true);
    setMessage(null);
    
    try {
      // 1. Unique months and outlets in the uploaded file
      const uniqueMonths = [...new Set(parsedData.map(r => r.upload_month))];
      const uniqueOutlets = [...new Set(parsedData.map(r => r.outlet_code))];
      
      // 2. Fetch OLD summary data for these months and outlets
      const { data: oldData, error: oldErr } = await supabase
        .from('a_utilities_outlets')
        .select('upload_month, group_name, category, total_debit')
        .in('upload_month', uniqueMonths)
        .in('outlet_code', uniqueOutlets);
      if (oldErr) throw oldErr;
      
      const oldGrouped = {};
      (oldData || []).forEach(row => {
        const key = `${row.upload_month}_${row.group_name}_${row.category}`;
        if (!oldGrouped[key]) oldGrouped[key] = 0;
        oldGrouped[key] += row.total_debit;
      });
      
      // 3. Fetch Master Group mapping for the uploaded outlets
      const { data: outletMapping, error: mapErr } = await supabase
        .from('a_master_outlet')
        .select(`
          outlet_code,
          a_master_pt (
            a_master_group (
              group_name
            )
          )
        `)
        .in('outlet_code', uniqueOutlets);
        
      if (mapErr) throw mapErr;
      
      const outletGroupMap = {};
      (outletMapping || []).forEach(row => {
        const groupName = row.a_master_pt?.a_master_group?.group_name || 'UNKNOWN';
        outletGroupMap[row.outlet_code] = groupName;
      });
      
      // 4. Calculate NEW summary data
      const newGrouped = {};
      parsedData.forEach(row => {
        const groupName = outletGroupMap[row.outlet_code] || 'UNKNOWN';
        const key = `${row.upload_month}_${groupName}_${row.category}`;
        if (!newGrouped[key]) newGrouped[key] = 0;
        newGrouped[key] += row.debit_amount;
      });
      
      // 5. Compare and generate Audit Logs
      const auditLogs = [];
      const allKeys = new Set([...Object.keys(oldGrouped), ...Object.keys(newGrouped)]);
      
      for (const key of allKeys) {
        const [month, group, category] = key.split('_');
        const oldVal = oldGrouped[key] || 0;
        const newVal = newGrouped[key] || 0;
        
        // Only log if there's a difference and it's not a tiny rounding error
        if (Math.abs(oldVal - newVal) > 0.01) {
          auditLogs.push({
            upload_month: month,
            group_name: group,
            category: category,
            old_amount: oldVal,
            new_amount: newVal
          });
        }
      }
      
      // 6. Delete old data (only for the months and outlets present in the file)
      for (const month of uniqueMonths) {
        const outletsInMonth = [...new Set(parsedData.filter(r => r.upload_month === month).map(r => r.outlet_code))];
        const { error: delErr } = await supabase
          .from('a_utilities_raw')
          .delete()
          .eq('upload_month', month)
          .in('outlet_code', outletsInMonth);
        if (delErr) throw delErr;
      }
      
      // 7. Insert New Data
      const { error: insErr } = await supabase
        .from('a_utilities_raw')
        .insert(parsedData);
      if (insErr) throw insErr;
      
      // 8. Save Audit Logs
      if (auditLogs.length > 0) {
        const { error: auditErr } = await supabase
          .from('a_utilities_audit_log')
          .insert(auditLogs);
        if (auditErr) console.warn("Failed to save audit logs:", auditErr);
      }
      
      setMessage({ type: 'success', text: `Upload & Replace berhasil! ${auditLogs.length} jejak perubahan dicatat ke Riwayat Revisi.` });
      setParsedData([]);
      setFiles([]);
      const fileInput = document.getElementById('file-upload-input');
      if (fileInput) fileInput.value = '';
      
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Terjadi kesalahan saat upload/replace data: ' + error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const differsCount = parsedData.filter(d => d.is_cabang_differs).length;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Upload Raw Data</h1>
          <button 
            onClick={() => setIsBulk(!isBulk)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
          >
            {isBulk ? <ToggleRight className="w-5 h-5 text-blue-600" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />}
            Mode Bulk (Semua Periode)
          </button>
        </div>
        
        <div className="mb-6 max-w-md">
          <label className={`block text-sm font-medium mb-2 ${isBulk ? 'text-slate-400' : 'text-slate-700'}`}>
            Bulan Upload {isBulk && '(Diabaikan - Mengikuti TRX Date)'}
          </label>
          <input 
            type="month" 
            value={uploadMonth}
            onChange={(e) => setUploadMonth(e.target.value)}
            disabled={isBulk}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
          />
        </div>
        
        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors">
          <UploadCloud className="w-12 h-12 text-blue-500 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-1">Pilih 1 atau Lebih File (Excel/CSV)</h3>
          <p className="text-slate-500 mb-4 text-sm">Upload banyak file sekaligus untuk diproses masal</p>
          <input 
            id="file-upload-input"
            type="file" 
            accept=".xlsx, .csv" 
            multiple
            onChange={handleFileUpload}
            className="block w-full max-w-xs text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {files.length > 0 && (
            <p className="mt-4 text-sm font-bold text-slate-700">{files.length} File Terpilih</p>
          )}
        </div>
        
        <div className="mt-6 flex justify-end">
          <button 
            onClick={handleProcess}
            disabled={files.length === 0 || (!isBulk && !uploadMonth) || isLoading}
            className="px-6 py-2 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            Proses Data <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {message && (
        <div className={`p-4 rounded-xl flex flex-col gap-2 ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          <div className="flex items-center gap-3">
            {message.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
            <span>{message.text}</span>
          </div>
          {message.type === 'error' && debugInfo && (
            <div className="mt-2 text-xs font-mono bg-white/50 p-2 rounded border border-red-200 whitespace-pre-wrap overflow-auto max-h-40">
              Debug Info:<br/>{debugInfo}
            </div>
          )}
        </div>
      )}
      
      {parsedData.length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Preview Data</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-sm text-slate-500">Total Baris</div>
              <div className="text-2xl font-bold text-slate-800">{parsedData.length}</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="text-sm text-blue-600">Total Debit</div>
              <div className="text-xl font-bold text-blue-800">
                Rp {parsedData.reduce((acc, curr) => acc + curr.debit_amount, 0).toLocaleString('id-ID')}
              </div>
            </div>
            <div className="p-4 bg-red-50 rounded-xl border border-red-100">
              <div className="text-sm text-red-600">Total Credit</div>
              <div className="text-xl font-bold text-red-800">
                Rp {parsedData.reduce((acc, curr) => acc + curr.credit_amount, 0).toLocaleString('id-ID')}
              </div>
            </div>
            <div className={`p-4 rounded-xl border ${differsCount > 0 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
              <div className={`text-sm ${differsCount > 0 ? 'text-orange-600' : 'text-green-600'}`}>Outlet vs Cabang Beda</div>
              <div className={`text-xl font-bold ${differsCount > 0 ? 'text-orange-800' : 'text-green-800'}`}>
                {differsCount}
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto rounded-xl border border-slate-200 mb-6">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tgl Jurnal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Bulan DB</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Kategori</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Outlet</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Debit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {parsedData.slice(0, 10).map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(row.trx_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.upload_month}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.category}</td>
                    <td className="px-4 py-3 font-medium text-blue-600">{row.outlet_code}</td>
                    <td className="px-4 py-3 text-slate-600">Rp {row.debit_amount.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3">
                      {row.is_cabang_differs ? (
                        <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-md">Beda</span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-md">Sesuai</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedData.length > 10 && (
              <div className="p-3 text-center text-sm text-slate-500 border-t border-slate-200 bg-slate-50">
                Menampilkan 10 dari {parsedData.length} baris data
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-4">
            <button 
              onClick={() => setParsedData([])}
              className="px-6 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-all"
            >
              Batal
            </button>
            <button 
              onClick={handleUploadToDB}
              disabled={isLoading}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {isLoading ? 'Mengupload...' : 'Smart Replace & Upload'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

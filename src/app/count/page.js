"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Search } from 'lucide-react';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount);
};

export default function CountPage() {
  const [targetMonth, setTargetMonth] = useState('');
  const [notes, setNotes] = useState({});
  
  useEffect(() => {
    const savedTarget = localStorage.getItem('preferred_target_month');
    if (savedTarget) {
      setTargetMonth(savedTarget);
    } else {
      const now = new Date();
      const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      setTargetMonth(currentMonthStr);
    }
  }, []);
  const [loading, setLoading] = useState(false);
  const [groupedData, setGroupedData] = useState([]);
  const [outletGroups, setOutletGroups] = useState({});
  const [mPlus1Set, setMPlus1Set] = useState(new Set());
  const [blankSet, setBlankSet] = useState(new Set());

  // Modal State
  const [showDrilldown, setShowDrilldown] = useState(false);
  const [drilldownData, setDrilldownData] = useState([]);
  const [drilldownOutlet, setDrilldownOutlet] = useState('');
  const [drilldownRawOutlet, setDrilldownRawOutlet] = useState('');
  const [drilldownCategory, setDrilldownCategory] = useState('');
  const [editingNote, setEditingNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const groupsOrder = ['LIFESTYLE', 'SG', 'SH']; // OTHERS goes last
  const utilityCategories = ['Listrik', 'PAM', 'Gas', 'Telp', 'Internet', 'FCU (WATER CHILLER)'];

  const fetchData = async () => {
    if (!targetMonth) return;
    setLoading(true);
    try {
      const formattedTarget = `${targetMonth}-01`;
      
      // Fetch Raw Data
      const { data: rawData, error } = await supabase
        .from('a_utilities_raw')
        .select('*')
        .eq('upload_month', formattedTarget)
        .limit(50000);
        
      if (error) throw error;
      
      // Fetch Active M+1
      const { data: mPlus1Data } = await supabase.from('a_utilities_mplus1').select('outlet_code, category').eq('is_active', true);
      const m1Set = new Set();
      if (mPlus1Data) mPlus1Data.forEach(d => m1Set.add(`${d.outlet_code}-${d.category}`));
      setMPlus1Set(m1Set);

      // Fetch Blanks
      const { data: blanksData } = await supabase.from('a_utilities_master_blank').select('*');
      const bSet = new Set();
      if (blanksData) blanksData.forEach(b => bSet.add(`${b.outlet_code}-${b.category}`));
      setBlankSet(bSet);

      // Fetch Notes
      const { data: notesData } = await supabase.from('a_utilities_notes').select('*').eq('upload_month', formattedTarget).like('category', 'COUNT_%');
      const notesObj = {};
      if (notesData) {
        notesData.forEach(n => {
          notesObj[`${n.outlet_code}_${n.category.replace('COUNT_', '')}`] = n.note;
        });
      }
      setNotes(notesObj);

      // Fetch Outlet Custom Groups
      const { data: outletData } = await supabase.from('a_master_outlet').select('outlet_code, custom_groups');
      const outletMap = {};
      if (outletData) {
        outletData.forEach(o => {
          let groups = o.custom_groups || [];
          if (typeof groups === 'string') {
            try { groups = JSON.parse(groups); } catch(e) { groups = []; }
          }
          outletMap[o.outlet_code] = Array.isArray(groups) ? groups : [];
        });
      }
      setOutletGroups(outletMap);

      // Process Data & Smart Cancellation
      const map = {}; // map[outlet][category] = array of valid rows
      
      (rawData || []).forEach(row => {
        const out = row.outlet_code;
        const cat = row.category;
        if (!map[out]) map[out] = {};
        if (!map[out][cat]) map[out][cat] = { rawRows: [] };
        map[out][cat].rawRows.push(row);
      });
      
      const processed = [];
      
      Object.keys(map).forEach(outlet => {
        const rowObj = { Outlet: outlet };
        
        utilityCategories.forEach(cat => {
          if (!map[outlet][cat]) {
            rowObj[`count_${cat}`] = 0;
            rowObj[`rows_${cat}`] = [];
            return;
          }
          
          let rows = [...map[outlet][cat].rawRows];
          let debits = rows.filter(r => r.debit_amount > 0 && r.credit_amount === 0);
          let credits = rows.filter(r => r.credit_amount > 0 && r.debit_amount === 0);
          let others = rows.filter(r => (r.debit_amount > 0 && r.credit_amount > 0) || (r.debit_amount === 0 && r.credit_amount === 0));
          
          // Smart Cancellation
          let remainingDebits = [];
          
          debits.forEach(d => {
            const matchIdx = credits.findIndex(c => Math.abs(c.credit_amount) === Math.abs(d.debit_amount));
            if (matchIdx !== -1) {
              // Cancelled!
              credits.splice(matchIdx, 1);
              // Do not add to remainingDebits
            } else {
              remainingDebits.push(d);
            }
          });
          
          // The final valid rows for counting
          const validRows = [...remainingDebits, ...credits, ...others];
          rowObj[`count_${cat}`] = validRows.length;
          rowObj[`rows_${cat}`] = rows; // store all raw rows for drilldown so they can see what got cancelled
        });
        
        // Only include outlet if it has at least one valid count > 0 OR if it's explicitly tracked
        const totalCount = utilityCategories.reduce((sum, cat) => sum + rowObj[`count_${cat}`], 0);
        if (totalCount > 0) {
          processed.push(rowObj);
        }
      });
      
      setGroupedData(processed);
      
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil data');
    } finally {
      setLoading(false);
    }
  };

  const saveNote = async () => {
    setSavingNote(true);
    try {
      const formattedTarget = `${targetMonth}-01`;
      const catKey = `COUNT_${drilldownCategory}`;
      if (!editingNote.trim()) {
        await supabase.from('a_utilities_notes').delete().match({ outlet_code: drilldownRawOutlet, upload_month: formattedTarget, category: catKey });
        const newNotes = { ...notes };
        delete newNotes[`${drilldownRawOutlet}_${drilldownCategory}`];
        setNotes(newNotes);
      } else {
        const { error } = await supabase.from('a_utilities_notes').upsert({
          outlet_code: drilldownRawOutlet, upload_month: formattedTarget, category: catKey, note: editingNote
        }, { onConflict: 'outlet_code,upload_month,category' });
        if (error) throw error;
        setNotes({ ...notes, [`${drilldownRawOutlet}_${drilldownCategory}`]: editingNote });
      }
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan keterangan');
    } finally {
      setSavingNote(false);
    }
  };

  const handleDrilldown = (outlet, category, count, allRows) => {
    setDrilldownRawOutlet(outlet);
    setDrilldownCategory(category);
    setDrilldownOutlet(`${outlet} - ${category}`);
    const sorted = [...(allRows||[])].sort((a, b) => new Date(b.trx_date) - new Date(a.trx_date));
    setDrilldownData(sorted);
    setEditingNote(notes[`${outlet}_${category}`] || '');
    setShowDrilldown(true);
  };

  const renderGroup = (groupName, rows) => {
    if (rows.length === 0) return null;
    
    // Sort outlets alphabetically within the group
    const sortedRows = [...rows].sort((a, b) => a.Outlet.localeCompare(b.Outlet));

    return (
      <div key={groupName} className="mb-8">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 px-2 flex items-center gap-2">
          <div className="w-2 h-4 bg-blue-500 rounded-sm"></div>
          {groupName}
        </h3>
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-sm text-left whitespace-nowrap bg-white">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">Outlet</th>
                {utilityCategories.map(cat => (
                  <th key={cat} className="px-4 py-3 text-center border-r border-slate-100 last:border-0">{cat}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRows.map(row => (
                <tr key={row.Outlet} className="hover:bg-blue-50/50 transition-colors group">
                  <td className="px-4 py-2.5 font-bold text-slate-700 sticky left-0 bg-white group-hover:bg-blue-50/50 z-10 border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">
                    {row.Outlet}
                  </td>
                  {utilityCategories.map(cat => {
                    const count = row[`count_${cat}`];
                    const allRows = row[`rows_${cat}`];
                    const isBlank = blankSet.has(`${row.Outlet}-${cat}`);
                    const isM1 = mPlus1Set.has(`${row.Outlet}-${cat}`);
                    
                    let bgClass = "bg-transparent";
                    if (isBlank) bgClass = "bg-[#92D050] text-black font-bold";
                    else if (isM1) bgClass = "bg-pink-100";
                    
                    return (
                      <td 
                        key={cat} 
                        onClick={() => handleDrilldown(row.Outlet, cat, count, allRows)}
                        className={`px-4 py-2.5 text-center border-r border-slate-100 last:border-0 cursor-pointer relative group ${bgClass}`}
                        title={notes[`${row.Outlet}_${cat}`] || 'Klik untuk lihat/edit keterangan'}
                      >
                        {notes[`${row.Outlet}_${cat}`] && (
                          <div className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full shadow" title="Ada keterangan"></div>
                        )}
                        {count > 0 ? (
                          <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold group-hover:bg-blue-200 group-hover:scale-110 transition-all">
                            {count}
                          </div>
                        ) : (
                          <span className="text-slate-300 group-hover:text-blue-500 transition-colors">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const rowsRendered = new Set();
  
  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Target Bulan:</label>
          <input 
            type="month" 
            value={targetMonth} 
            onChange={(e) => {
              const val = e.target.value;
              setTargetMonth(val);
              if (val) localStorage.setItem('preferred_target_month', val);
            }} 
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 outline-none font-bold text-slate-800" 
          />
          <button 
            onClick={fetchData} 
            disabled={loading || !targetMonth}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
          >
            {loading ? 'Memuat...' : <><Search className="w-4 h-4" /> Cari</>}
          </button>
        </div>
        <div className="text-sm font-bold text-slate-400">
          Mode Count (Otomatis membatalkan Debit = Kredit)
        </div>
      </div>

      {groupedData.length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          {groupsOrder.map(gName => {
            const gRows = groupedData.filter(r => (outletGroups[r.Outlet] || []).includes(gName));
            if (gRows.length > 0) {
              gRows.forEach(r => rowsRendered.add(r.Outlet));
              return renderGroup(gName, gRows);
            }
            return null;
          })}
          
          {/* OTHERS */}
          {renderGroup('OTHERS', groupedData.filter(r => !rowsRendered.has(r.Outlet)))}
        </div>
      )}
      
      {/* Drilldown Modal */}
      {showDrilldown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Detail Raw Data</h3>
                <p className="text-sm text-slate-500">{drilldownOutlet}</p>
              </div>
              <button onClick={() => setShowDrilldown(false)} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex gap-2">
              <input type="text" value={editingNote} onChange={e => setEditingNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveNote()} placeholder="Ketik keterangan cell ini (contoh: Belum ditagihkan, Tutup Sementara, dll)..." className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" />
              <button onClick={saveNote} disabled={savingNote} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 disabled:opacity-50">
                {savingNote ? 'Menyimpan...' : 'Simpan Keterangan'}
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              {drilldownData.length === 0 ? (
                <div className="text-center text-slate-500 py-8">Tidak ada transaksi (0 Count)</div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Journal</th>
                        <th className="px-4 py-3">Account</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Reference</th>
                        <th className="px-4 py-3 text-right">Debit</th>
                        <th className="px-4 py-3 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {drilldownData.map(row => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{row.journal_entry}</td>
                          <td className="px-4 py-3 text-slate-600">{row.account_number}</td>
                          <td className="px-4 py-3 text-slate-500">{new Date(row.trx_date).toLocaleDateString('id-ID')}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={row.reference}>{row.reference}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-800">{formatCurrency(row.debit_amount)}</td>
                          <td className="px-4 py-3 text-right text-red-600 font-medium">{formatCurrency(row.credit_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

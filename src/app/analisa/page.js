"use client";

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { supabase2 } from '@/lib/supabase2';
import { Download, Check, X, MessageSquare, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatUIDate } from '@/utils/dateFormatter';

export default function AnalisaPage() {
  const [targetMonth, setTargetMonth] = useState('');
  const [compareMonth, setCompareMonth] = useState('');
  const [data, setData] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [urlOutlet, setUrlOutlet] = useState(null);
  const [pics, setPics] = useState([]);
  
  const [analisaView, setAnalisaView] = useState('group'); // 'list' or 'group'
  const [editingNote, setEditingNote] = useState(null); // { outlet, category, text }
  const [savingNote, setSavingNote] = useState(false);

  // Drilldown states
  const [showDrilldown, setShowDrilldown] = useState(false);
  const [drilldownData, setDrilldownData] = useState([]);
  const [drilldownOutlet, setDrilldownOutlet] = useState('');
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    const now = new Date();
    let currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let targetD = new Date(now.getFullYear(), now.getMonth(), 1);
    
    if (typeof window !== 'undefined') {
      const savedTarget = localStorage.getItem('preferred_target_month');
      const savedCompare = localStorage.getItem('preferred_compare_month');
      if (savedTarget) currentMonthStr = savedTarget;
      
      const params = new URLSearchParams(window.location.search);
      const outlet = params.get('outlet');
      if (outlet) {
         setUrlOutlet(outlet);
      }
      const monthParam = params.get('month');
      if (monthParam) {
        currentMonthStr = monthParam;
      }
      
      const [y, m] = currentMonthStr.split('-');
      targetD = new Date(parseInt(y), parseInt(m) - 1, 1);
      
      if (savedCompare && !monthParam) {
        // If we have a saved compare month and aren't forcing via URL, use it
        // We'll set it at the end
      }
    }
    
    const prevDate = new Date(targetD.getFullYear(), targetD.getMonth() - 1, 1);
    let prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    
    if (typeof window !== 'undefined' && !new URLSearchParams(window.location.search).get('month')) {
      const savedCompare = localStorage.getItem('preferred_compare_month');
      if (savedCompare) prevMonthStr = savedCompare;
    }
    
    setTargetMonth(currentMonthStr);
    setCompareMonth(prevMonthStr);
  }, []);

  useEffect(() => {
    fetchData();
  }, [targetMonth, compareMonth]);

  const fetchData = async () => {
    if (!targetMonth || !compareMonth) return;
    setLoading(true);
    try {
      const formattedTarget = `${targetMonth}-01`;
      const formattedCompare = `${compareMonth}-01`;
      
      const { data: rawTargetData, error: targetError } = await supabase.from('a_utilities_raw').select('*').eq('upload_month', formattedTarget).limit(50000);
      if (targetError) throw targetError;
      
      const { data: rawCompareData, error: compareError } = await supabase.from('a_utilities_raw').select('*').eq('upload_month', formattedCompare).limit(50000);
      if (compareError) throw compareError;
      
      // Fetch Notes
      const { data: notesData, error: notesError } = await supabase.from('a_utilities_notes').select('*').eq('upload_month', formattedTarget);
      if (!notesError && notesData) {
        const notesObj = {};
        notesData.forEach(n => {
          notesObj[`${n.outlet_code}_${n.category}`] = n.note;
        });
        setNotes(notesObj);
      }
      
      // Fetch PICs
      let picsData = [];
      if (supabase2) {
        console.log("Fetching PICs from DB2...");
        const { data: usersData, error: usersError } = await supabase2.from('users').select('fullname, accessOutlets').eq('role', 'SPV AP');
        if (usersError) {
          console.error("Error fetching DB2 users:", usersError);
        } else if (usersData) {
          console.log("Fetched DB2 users:", usersData);
          picsData = usersData;
        }
      } else {
        console.warn("supabase2 is null. Check NEXT_PUBLIC_SUPABASE_URL_2 and NEXT_PUBLIC_SUPABASE_ANON_KEY_2 environment variables.");
      }
      setPics(picsData);
      
      processData(rawTargetData || [], rawCompareData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const categories = ['Listrik', 'PAM', 'Gas', 'FCU (WATER CHILLER)', 'Telp', 'Internet'];

  const processData = (targetData, compareDataList) => {
    const outlets = [...new Set([...targetData.map(d => d.outlet_code), ...compareDataList.map(d => d.outlet_code)])].sort();
    
    const processed = outlets.map(outlet => {
      const row = { Outlet: outlet };
      categories.forEach(cat => {
        const tAmt = targetData.filter(d => d.outlet_code === outlet && d.category === cat).reduce((sum, d) => sum + d.debit_amount - d.credit_amount, 0);
        const cAmt = compareDataList.filter(d => d.outlet_code === outlet && d.category === cat).reduce((sum, d) => sum + d.debit_amount - d.credit_amount, 0);
        row[cat] = tAmt;
        row[`${cat}_prev`] = cAmt;
        row[`${cat}_diff`] = tAmt - cAmt;
      });
      return row;
    });
    setData(processed);
  };

  const isAlert = (diff, prevAmt) => {
    if (diff > 1000000) return true;
    if (prevAmt > 0 && (diff / prevAmt) > 0.10) return true;
    if (prevAmt > 0 && (diff / prevAmt) < -0.25) return true; // Turun drastis > 25%
    return false;
  };

  const saveNote = async () => {
    if (!editingNote) return;
    setSavingNote(true);
    try {
      const formattedTarget = `${targetMonth}-01`;
      if (!editingNote.text.trim()) {
        await supabase.from('a_utilities_notes').delete().match({ outlet_code: editingNote.outlet, upload_month: formattedTarget, category: editingNote.category });
        const newNotes = { ...notes };
        delete newNotes[`${editingNote.outlet}_${editingNote.category}`];
        setNotes(newNotes);
      } else {
        const { error } = await supabase.from('a_utilities_notes').upsert({
          outlet_code: editingNote.outlet, upload_month: formattedTarget, category: editingNote.category, note: editingNote.text
        }, { onConflict: 'outlet_code,upload_month,category' });
        if (error) throw error;
        setNotes({ ...notes, [`${editingNote.outlet}_${editingNote.category}`]: editingNote.text });
      }
      setEditingNote(null);
    } catch (err) {
      console.error('Error saving note:', err);
      alert('Gagal menyimpan catatan');
    } finally {
      setSavingNote(false);
    }
  };

  const toggleStatus = async (outlet, category) => {
    const catDB = `${category}_STATUS`;
    const statusKey = `${outlet}_${catDB}`;
    const isDone = notes[statusKey] === 'DONE';
    const newStatus = isDone ? '' : 'DONE';
    
    const formattedTarget = `${targetMonth}-01`;
    
    // Optimistic UI update
    const newNotes = { ...notes };
    if (!newStatus) {
      delete newNotes[statusKey];
    } else {
      newNotes[statusKey] = newStatus;
    }
    setNotes(newNotes);
    
    try {
      if (!newStatus) {
        await supabase.from('a_utilities_notes').delete().match({ outlet_code: outlet, upload_month: formattedTarget, category: catDB });
      } else {
        await supabase.from('a_utilities_notes').upsert({
          outlet_code: outlet, upload_month: formattedTarget, category: catDB, note: newStatus
        }, { onConflict: 'outlet_code,upload_month,category' });
      }
    } catch (err) {
      console.error('Error saving status:', err);
      // Revert on error (optional, simple alert for now)
      alert('Gagal mengubah status');
    }
  };

  const handleAnomalyClick = async (outletCode, category) => {
    setDrilldownOutlet(`${outletCode} - ${category}`);
    setShowDrilldown(true);
    setDrillLoading(true);
    try {
      const months = [`${targetMonth}-01`, `${compareMonth}-01`];
      const { data: rawData, error } = await supabase.from('a_utilities_raw')
        .select('*')
        .eq('outlet_code', outletCode)
        .eq('category', category)
        .in('upload_month', months)
        .order('trx_date', { ascending: false });
        
      if (error) throw error;
      setDrilldownData(rawData || []);
    } catch (err) {
      console.error('Drilldown error:', err);
    } finally {
      setDrillLoading(false);
    }
  };

  const anomalies = useMemo(() => {
    const list = [];
    data.forEach(row => {
      if (urlOutlet && row.Outlet !== urlOutlet) return;
      categories.forEach(cat => {
        const diff = row[`${cat}_diff`] || 0;
        const prev = row[`${cat}_prev`] || 0;
        const current = row[cat] || 0;
        if (isAlert(diff, prev)) {
          list.push({ outlet: row.Outlet, category: cat, current, prev, diff, pct: prev > 0 ? (diff / prev) * 100 : (diff > 0 ? 100 : 0) });
        }
      });
    });
    return list;
  }, [data]);
  
  const groupedAnomalies = useMemo(() => {
    const groups = {};
    anomalies.forEach(a => {
      if (!groups[a.outlet]) groups[a.outlet] = [];
      groups[a.outlet].push(a);
    });
    return Object.entries(groups).map(([outlet, items]) => ({ outlet, items }));
  }, [anomalies]);
  
  const groupedByPic = useMemo(() => {
    if (analisaView !== 'pic') return [];
    
    const outletAnomalies = {};
    groupedAnomalies.forEach(g => outletAnomalies[g.outlet.trim().toUpperCase()] = g.items);
    
    console.log("=== DEBUG PIC MAPPING ===");
    console.log("1. Total PICs:", pics.length);
    console.log("2. Anomalies Available for Outlets:", Object.keys(outletAnomalies));

    const picGroups = pics.map(pic => {
      let assignedOutlets = [];
      try {
        assignedOutlets = typeof pic.accessOutlets === 'string' ? JSON.parse(pic.accessOutlets) : pic.accessOutlets;
      } catch (e) { assignedOutlets = []; }
      
      const items = [];
      (assignedOutlets || []).forEach(o => {
        const outCode = o.trim().toUpperCase();
        if (outletAnomalies[outCode]) {
          items.push({ outlet: outCode, anomalies: outletAnomalies[outCode] });
        }
      });
      
      return {
        picName: pic.fullname,
        items: items
      };
    }).filter(g => g.items.length > 0);
    
    // Find unmapped outlets
    const allMappedOutlets = new Set();
    pics.forEach(pic => {
      let assigned = [];
      try { assigned = typeof pic.accessOutlets === 'string' ? JSON.parse(pic.accessOutlets) : pic.accessOutlets; } catch(e){}
      (assigned || []).forEach(o => allMappedOutlets.add(o.trim().toUpperCase()));
    });
    
    const unmappedItems = [];
    groupedAnomalies.forEach(g => {
      if (!allMappedOutlets.has(g.outlet.trim().toUpperCase())) {
        unmappedItems.push({ outlet: g.outlet, anomalies: g.items });
      }
    });
    
    if (unmappedItems.length > 0) {
      picGroups.push({
        picName: 'Tidak Ada PIC',
        items: unmappedItems
      });
    }
    
    // Sort items inside each picGroup: "Done" at the bottom
    picGroups.forEach(group => {
      group.items.sort((a, b) => {
        const aDone = notes[`${a.outlet}_SUMMARY_STATUS`] === 'DONE';
        const bDone = notes[`${b.outlet}_SUMMARY_STATUS`] === 'DONE';
        if (aDone && !bDone) return 1;
        if (!aDone && bDone) return -1;
        return a.outlet.localeCompare(b.outlet);
      });
    });
    
    return picGroups;
  }, [groupedAnomalies, pics, notes, analisaView]);
  
  const exportAnalisa = () => {
    const exportData = groupedAnomalies.map(group => {
      const naikItems = group.items.filter(item => item.diff > 0);
      if (naikItems.length === 0) return null;
      
      const detailString = naikItems.map(item => 
        `${item.category} NAIK ${item.pct.toFixed(0)}% Rp ${item.diff.toLocaleString('id-ID')}`
      ).join(', ');

      // Kumpulkan semua catatan untuk outlet ini (Summary + per Kategori)
      let combinedNotes = notes[`${group.outlet}_SUMMARY`] || '';
      const catNotes = [];
      categories.forEach(cat => {
        if (notes[`${group.outlet}_${cat}`]) {
          catNotes.push(`${cat}: ${notes[`${group.outlet}_${cat}`]}`);
        }
      });
      if (catNotes.length > 0) {
        combinedNotes += (combinedNotes ? ', ' : '') + catNotes.join(', ');
      }

      return {
        'Outlet': group.outlet,
        'Keterangan Kenaikan': detailString,
        'Catatan': combinedNotes
      };
    }).filter(Boolean);

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Analisis Kenaikan');
    XLSX.writeFile(wb, `Analisis_Anomali_${targetMonth}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Target Bulan:</label>
            <input type="month" value={targetMonth} onChange={(e) => {
              const val = e.target.value;
              setTargetMonth(val);
              if (val) {
                localStorage.setItem('preferred_target_month', val);
                const [yy, mm] = val.split('-');
                const d = new Date(parseInt(yy), parseInt(mm) - 1, 1);
                d.setMonth(d.getMonth() - 1);
                const cmp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                setCompareMonth(cmp);
                localStorage.setItem('preferred_compare_month', cmp);
              }
            }} className="px-2 py-1 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 outline-none font-bold text-slate-800" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Pembanding:</label>
            <input type="month" value={compareMonth} onChange={(e) => {
              setCompareMonth(e.target.value);
              if (e.target.value) localStorage.setItem('preferred_compare_month', e.target.value);
            }} className="px-2 py-1 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 outline-none font-bold text-slate-800" />
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500"/> Peringatan Kenaikan</h2>
          <p className="text-xs text-slate-500">Menampilkan utilitas yang naik di atas 10% atau 1 Juta Rupiah.</p>
        </div>
        <div className="flex gap-3 mt-4 sm:mt-0">
          <div className="bg-slate-100 p-1 rounded-lg flex text-sm font-medium">
            <button onClick={() => setAnalisaView('list')} className={`px-4 py-1.5 rounded-md transition-colors ${analisaView === 'list' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>List Baris</button>
            <button onClick={() => setAnalisaView('group')} className={`px-4 py-1.5 rounded-md transition-colors ${analisaView === 'group' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Group by Outlet</button>
            <button onClick={() => setAnalisaView('pic')} className={`px-4 py-1.5 rounded-md transition-colors ${analisaView === 'pic' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Group by PIC</button>
          </div>
          {urlOutlet && (
             <button onClick={() => setUrlOutlet(null)} className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-200 transition-colors flex items-center gap-1">
               <X className="w-3 h-3"/> Filter: {urlOutlet}
             </button>
          )}
          <button onClick={exportAnalisa} className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-sm font-bold transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
          Memproses Data...
        </div>
      ) : anomalies.length === 0 ? (
        <div className="bg-emerald-50 text-emerald-700 p-10 text-center rounded-xl border border-emerald-200 font-bold shadow-sm">
          Bagus! Tidak ada kenaikan mencurigakan bulan ini.
        </div>
      ) : analisaView === 'list' ? (
        <div className="grid grid-cols-1 gap-3">
          {groupedAnomalies.map((group, i) => (
            <div key={i} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-black text-slate-800 uppercase tracking-wider">{group.outlet}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {group.items.map(item => (
                    <div 
                      key={item.category} 
                      className="bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleAnomalyClick(item.outlet, item.category)}
                      title="Klik untuk melihat detail per transaksi"
                    >
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded mr-2">{item.category}</span>
                      <span className="text-sm text-slate-600 flex-1">
                        {item.diff > 0 ? 'Naik' : 'Turun'} <span className={`font-bold ${item.diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>Rp {Math.abs(item.diff).toLocaleString('id-ID')} ({Math.abs(item.pct).toFixed(1)}%)</span> dari Rp {item.prev.toLocaleString('id-ID')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="w-full md:w-1/3 group">
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Catatan Analisis</label>
                {editingNote?.outlet === group.outlet && editingNote?.category === 'SUMMARY' ? (
                  <div className="flex gap-2 h-24">
                    <textarea autoFocus value={editingNote.text} onChange={e => setEditingNote({...editingNote, text: e.target.value})} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNote(); } }} placeholder="Ketik alasan anomali outlet ini..." className="flex-1 px-3 py-2 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"></textarea>
                    <div className="flex flex-col gap-1">
                      <button onClick={saveNote} disabled={savingNote} className="px-3 py-2 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-700 h-10"><Check className="w-4 h-4"/></button>
                      <button onClick={() => setEditingNote(null)} className="px-3 py-2 bg-slate-100 text-slate-600 rounded font-medium text-sm hover:bg-slate-200 h-10"><X className="w-4 h-4"/></button>
                    </div>
                  </div>
                ) : notes[`${group.outlet}_SUMMARY`] ? (
                  <div onClick={() => setEditingNote({outlet: group.outlet, category: 'SUMMARY', text: notes[`${group.outlet}_SUMMARY`]})} className="p-3 bg-yellow-50 text-yellow-800 text-sm rounded-lg border border-yellow-200 cursor-pointer hover:bg-yellow-100 whitespace-pre-wrap h-full min-h-[6rem]">
                    {notes[`${group.outlet}_SUMMARY`]}
                  </div>
                ) : (
                  <div onClick={() => setEditingNote({outlet: group.outlet, category: 'SUMMARY', text: ''})} className="p-3 border border-dashed border-slate-300 text-slate-400 text-sm rounded-lg cursor-pointer hover:bg-slate-50 hover:text-blue-500 opacity-50 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 h-full min-h-[6rem]">
                    <MessageSquare className="w-4 h-4"/> Tambah Catatan
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : analisaView === 'group' ? (
        <div className="space-y-6">
          {Object.entries(
            anomalies.reduce((acc, curr) => {
              if (!acc[curr.outlet]) acc[curr.outlet] = [];
              acc[curr.outlet].push(curr);
              return acc;
            }, {})
          ).map(([outletName, items]) => (
            <div key={outletName} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                <h3 className="font-black text-slate-800 text-lg uppercase tracking-wide">{outletName}</h3>
              </div>
              <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {items.map((item, i) => (
                  <div key={i} className={`flex flex-col gap-2 p-4 rounded-lg border relative ${item.diff > 0 ? 'bg-red-50/30 border-red-100' : 'bg-emerald-50/30 border-emerald-100'}`}>
                    <div className={`flex justify-between items-start cursor-pointer p-1 -m-1 rounded transition-colors ${item.diff > 0 ? 'hover:bg-red-50/50' : 'hover:bg-emerald-50/50'}`} onClick={() => handleAnomalyClick(item.outlet, item.category)}>
                      <div>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-bold rounded uppercase tracking-wider">{item.category}</span>
                        <div className="mt-2 text-sm text-slate-600">Bulan Ini: <span className="font-bold text-slate-800">Rp {item.current.toLocaleString('id-ID')}</span></div>
                        <div className="text-xs text-slate-500">Bulan Lalu: Rp {item.prev.toLocaleString('id-ID')}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-black ${item.diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {item.diff > 0 ? '▲' : '▼'} Rp {Math.abs(item.diff).toLocaleString('id-ID')}
                        </div>
                        <div className={`text-xs font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${item.diff > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {item.diff > 0 ? '+' : '-'}{Math.abs(item.pct).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    
                    <div className={`mt-2 pt-2 border-t group ${item.diff > 0 ? 'border-red-100/50' : 'border-emerald-100/50'}`}>
                       {editingNote?.outlet === item.outlet && editingNote?.category === item.category ? (
                        <div className="flex gap-2">
                          <input type="text" autoFocus value={editingNote.text} onChange={e => setEditingNote({...editingNote, text: e.target.value})} onKeyDown={e => { if(e.key === 'Enter') saveNote() }} placeholder="Catatan..." className="flex-1 px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none" />
                          <button onClick={saveNote} disabled={savingNote} className="px-2 bg-blue-600 text-white rounded"><Check className="w-3 h-3"/></button>
                          <button onClick={() => setEditingNote(null)} className="px-2 bg-slate-200 text-slate-600 rounded"><X className="w-3 h-3"/></button>
                        </div>
                      ) : notes[`${item.outlet}_${item.category}`] ? (
                        <div onClick={() => setEditingNote({outlet: item.outlet, category: item.category, text: notes[`${item.outlet}_${item.category}`]})} className="p-2 bg-yellow-50 text-yellow-800 text-xs rounded border border-yellow-200 cursor-pointer hover:bg-yellow-100">
                          <span className="font-bold">Catatan:</span> {notes[`${item.outlet}_${item.category}`]}
                        </div>
                      ) : (
                        <div onClick={() => setEditingNote({outlet: item.outlet, category: item.category, text: ''})} className="text-xs text-slate-400 cursor-pointer hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <MessageSquare className="w-3 h-3"/> Tambah Catatan Analisis
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : analisaView === 'pic' ? (
        <div className="space-y-8">
          {groupedByPic.map((group, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="bg-blue-50 px-4 py-3 border-b border-slate-200">
                 <h3 className="font-black text-blue-800 text-lg uppercase tracking-wide">{group.picName}</h3>
               </div>
               <div className="p-4 grid grid-cols-1 gap-4">
                 {group.items.map(item => {
                   const isMasterDone = notes[`${item.outlet}_SUMMARY_STATUS`] === 'DONE';
                   return (
                     <div key={item.outlet} className={`p-2 rounded border flex flex-col md:flex-row items-center gap-3 transition-all ${isMasterDone ? 'bg-slate-50 border-slate-200 grayscale opacity-70' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                       <div className="font-black text-slate-800 uppercase text-xs w-20 shrink-0 text-center md:text-left">{item.outlet}</div>
                       
                       <div className="flex-1 min-w-0 flex flex-col gap-1 w-full">
                         {item.anomalies.map((ano, idx) => {
                             const isUtilDone = notes[`${item.outlet}_${ano.category}_STATUS`] === 'DONE';
                             const noteText = notes[`${item.outlet}_${ano.category}`];
                             return (
                               <div key={ano.category} className="flex items-center gap-2 text-[10px]">
                                 <span className={`px-1.5 py-0.5 rounded shrink-0 ${isUtilDone || isMasterDone ? 'bg-slate-100 text-slate-400 line-through' : 'bg-red-50 text-red-700 font-medium'}`}>
                                   {ano.category} {ano.diff > 0 ? 'NAIK' : 'TURUN'} {Math.abs(ano.pct).toFixed(0)}%
                                 </span>
                                 <span className="text-slate-600 truncate flex-1">{noteText ? `- ${noteText}` : ''}</span>
                               </div>
                             );
                         })}
                       </div>
                       
                       <div className="flex items-center gap-2 shrink-0">
                         <span className="text-[10px] font-bold text-slate-500 uppercase">Done</span>
                         <label className="relative inline-flex items-center cursor-pointer">
                           <input type="checkbox" className="sr-only peer" checked={isMasterDone} onChange={() => toggleStatus(item.outlet, 'SUMMARY')} />
                           <div className="w-7 h-3.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-blue-600"></div>
                         </label>
                       </div>
                     </div>
                   );
                 })}
               </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Drilldown Modal */}
      {showDrilldown && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-black text-slate-800 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                  Raw Data Drilldown - Outlet: <span className="text-blue-600">{drilldownOutlet}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">Periode Analisa: {targetMonth} & {compareMonth}</p>
              </div>
              <button onClick={() => setShowDrilldown(false)} className="p-2 bg-slate-200 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-300 transition-colors">
                <X className="w-5 h-5"/>
              </button>
            </div>
            <div className="p-0 overflow-y-auto bg-slate-50/50 flex-1">
              {drillLoading ? (
                <div className="flex justify-center py-20 text-slate-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
                  Memuat Data...
                </div>
              ) : (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-white sticky top-0 shadow-sm z-10">
                    <tr>
                      <th className="px-4 py-3 font-bold text-xs text-slate-500 uppercase tracking-wider">Trx Date</th>
                      <th className="px-4 py-3 font-bold text-xs text-slate-500 uppercase tracking-wider">Bulan Data</th>
                      <th className="px-4 py-3 font-bold text-xs text-slate-500 uppercase tracking-wider">Account Number</th>
                      <th className="px-4 py-3 font-bold text-xs text-slate-500 uppercase tracking-wider">Account Description</th>
                      <th className="px-4 py-3 font-bold text-xs text-slate-500 uppercase tracking-wider text-right">Debit</th>
                      <th className="px-4 py-3 font-bold text-xs text-slate-500 uppercase tracking-wider text-right">Kredit</th>
                      <th className="px-4 py-3 font-bold text-xs text-slate-500 uppercase tracking-wider">Referensi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {drilldownData.length > 0 ? drilldownData.map((d, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-700">{formatUIDate(d.trx_date)}</td>
                        <td className="px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50/50">{formatUIDate(d.upload_month)}</td>
                        <td className="px-4 py-2 text-slate-500 font-mono text-xs">{d.account_number}</td>
                        <td className="px-4 py-2 text-slate-600 max-w-[200px] truncate" title={d.account_description}>{d.account_description}</td>
                        <td className="px-4 py-2 text-right font-medium text-slate-700">{d.debit_amount.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-2 text-right font-medium text-slate-700">{d.credit_amount.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-2 text-slate-500 text-xs min-w-[200px] whitespace-normal break-words">{d.reference}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="7" className="text-center py-10 text-slate-500 text-sm">Tidak ada data mentah yang ditemukan.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

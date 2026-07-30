"use client";

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
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
      const params = new URLSearchParams(window.location.search);
      const outlet = params.get('outlet');
      if (outlet) {
         setUrlOutlet(outlet);
      }
      const monthParam = params.get('month');
      if (monthParam) {
        currentMonthStr = monthParam;
        const [y, m] = monthParam.split('-');
        targetD = new Date(parseInt(y), parseInt(m) - 1, 1);
      }
    }
    
    const prevDate = new Date(targetD.getFullYear(), targetD.getMonth() - 1, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    
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
        if (diff > 0 && isAlert(diff, prev)) {
          list.push({ outlet: row.Outlet, category: cat, current, prev, diff, pct: prev > 0 ? (diff / prev) * 100 : 100 });
        }
      });
    });
    return list;
  }, [data]);
  
  const exportAnalisa = () => {
    const exportData = anomalies.map(a => ({
      'Outlet': a.outlet,
      'Kategori': a.category,
      'Bulan Ini': a.current,
      'Bulan Lalu': a.prev,
      'Kenaikan': a.diff,
      'Persentase': a.pct.toFixed(2) + '%',
      'Catatan': notes[`${a.outlet}_${a.category}`] || ''
    }));
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
            setTargetMonth(e.target.value);
            if (e.target.value) {
              const [yy, mm] = e.target.value.split('-');
              const d = new Date(parseInt(yy), parseInt(mm) - 1, 1);
              d.setMonth(d.getMonth() - 1);
              setCompareMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }
          }} className="px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 outline-none font-bold text-slate-800" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Bulan Lalu:</label>
          <input type="month" value={compareMonth} onChange={(e) => setCompareMonth(e.target.value)} className="px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 outline-none font-bold text-slate-800" />
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
          {anomalies.map((item, i) => (
            <div key={i} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1 cursor-pointer hover:bg-slate-50 p-2 -m-2 rounded transition-colors" onClick={() => handleAnomalyClick(item.outlet, item.category)}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-black text-slate-800 uppercase tracking-wider">{item.outlet}</span>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded">{item.category}</span>
                </div>
                <p className="text-sm text-slate-600">
                  Naik <span className="font-bold text-red-600">Rp {item.diff.toLocaleString('id-ID')} ({item.pct.toFixed(1)}%)</span> dari Rp {item.prev.toLocaleString('id-ID')} menjadi Rp {item.current.toLocaleString('id-ID')}.
                </p>
              </div>
              <div className="w-full md:w-1/3 group">
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Catatan Analisis</label>
                {editingNote?.outlet === item.outlet && editingNote?.category === item.category ? (
                  <div className="flex gap-2">
                    <input type="text" autoFocus value={editingNote.text} onChange={e => setEditingNote({...editingNote, text: e.target.value})} onKeyDown={e => e.key === 'Enter' && saveNote()} placeholder="Ketik alasan kenaikan..." className="flex-1 px-3 py-1.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-100"/>
                    <button onClick={saveNote} disabled={savingNote} className="px-3 py-1.5 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-700"><Check className="w-4 h-4"/></button>
                    <button onClick={() => setEditingNote(null)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded font-medium text-sm hover:bg-slate-200"><X className="w-4 h-4"/></button>
                  </div>
                ) : notes[`${item.outlet}_${item.category}`] ? (
                  <div onClick={() => setEditingNote({outlet: item.outlet, category: item.category, text: notes[`${item.outlet}_${item.category}`]})} className="p-2 bg-yellow-50 text-yellow-800 text-sm rounded border border-yellow-200 cursor-pointer hover:bg-yellow-100">
                    {notes[`${item.outlet}_${item.category}`]}
                  </div>
                ) : (
                  <div onClick={() => setEditingNote({outlet: item.outlet, category: item.category, text: ''})} className="p-2 border border-dashed border-slate-300 text-slate-400 text-sm rounded cursor-pointer hover:bg-slate-50 hover:text-blue-500 opacity-50 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                    <MessageSquare className="w-4 h-4"/> Tambah Catatan
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
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
                  <div key={i} className="flex flex-col gap-2 p-4 bg-red-50/30 rounded-lg border border-red-100 relative">
                    <div className="flex justify-between items-start cursor-pointer hover:bg-red-50/50 p-1 -m-1 rounded transition-colors" onClick={() => handleAnomalyClick(item.outlet, item.category)}>
                      <div>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-bold rounded uppercase tracking-wider">{item.category}</span>
                        <div className="mt-2 text-sm text-slate-600">Bulan Ini: <span className="font-bold text-slate-800">Rp {item.current.toLocaleString('id-ID')}</span></div>
                        <div className="text-xs text-slate-500">Bulan Lalu: Rp {item.prev.toLocaleString('id-ID')}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-red-600">▲ Rp {item.diff.toLocaleString('id-ID')}</div>
                        <div className="text-xs font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded inline-block mt-1">+{item.pct.toFixed(1)}%</div>
                      </div>
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-red-100/50 group">
                       {editingNote?.outlet === item.outlet && editingNote?.category === item.category ? (
                        <div className="flex gap-2">
                          <input type="text" autoFocus value={editingNote.text} onChange={e => setEditingNote({...editingNote, text: e.target.value})} onKeyDown={e => e.key === 'Enter' && saveNote()} placeholder="Catatan..." className="flex-1 px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none" />
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
      )}

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

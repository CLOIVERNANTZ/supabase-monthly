"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ExternalLink, Download, X, List, TrendingUp, Search, BarChart2 } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { formatUIDate } from '@/utils/dateFormatter';

export default function Dashboard() {
  const router = useRouter();
  const [targetMonth, setTargetMonth] = useState('');
  const [compareMonth, setCompareMonth] = useState('');
  const [data, setData] = useState([]);
  const [mPlus1Set, setMPlus1Set] = useState(new Set());
  const [blankSet, setBlankSet] = useState(new Set());
  const [outletGroups, setOutletGroups] = useState({});
  const [loading, setLoading] = useState(false);
  const [cellMenu, setCellMenu] = useState({ x: 0, y: 0, outlet: '', category: '', show: false });
  const [notesMap, setNotesMap] = useState({});
  
  // Filters
  const [filterOutlet, setFilterOutlet] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMinDiff, setFilterMinDiff] = useState('');
  const [filterMinPct, setFilterMinPct] = useState('');
  
  // Drilldown states
  const [showDrilldown, setShowDrilldown] = useState(false);
  const [drilldownData, setDrilldownData] = useState([]);
  const [drilldownOutlet, setDrilldownOutlet] = useState('');
  const [drillLoading, setDrillLoading] = useState(false);

  // Set default current and previous month on mount
  useEffect(() => {
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    
    setTargetMonth(currentMonthStr);
    setCompareMonth(prevMonthStr);
  }, []);

  useEffect(() => {
    fetchData();
  }, [targetMonth, compareMonth]);

  const fetchData = async () => {
    if (!targetMonth) return;
    setLoading(true);
    try {
      const formattedTarget = `${targetMonth}-01`;
      const { data: rawTargetData, error: targetError } = await supabase.from('a_utilities_raw').select('*').eq('upload_month', formattedTarget).limit(50000);
      if (targetError) throw targetError;
      
      let compareDataList = [];
      if (compareMonth) {
        const formattedCompare = `${compareMonth}-01`;
        const { data: rawCompareData, error: compareError } = await supabase.from('a_utilities_raw').select('*').eq('upload_month', formattedCompare).limit(50000);
        if (compareError) throw compareError;
        compareDataList = rawCompareData || [];
      }
      
      // Fetch active M+1 data from the new management table
      const { data: mPlus1Data, error: m1Error } = await supabase.from('a_utilities_mplus1')
        .select('outlet_code, category')
        .eq('is_active', true);
        
      if (!m1Error && mPlus1Data) {
        const m1Set = new Set();
        mPlus1Data.forEach(d => m1Set.add(`${d.outlet_code}-${d.category}`));
        setMPlus1Set(m1Set);
      }

      const { data: blanksData } = await supabase.from('a_utilities_master_blank').select('*');
      if (blanksData) {
        const bSet = new Set();
        blanksData.forEach(b => {
          bSet.add(`${b.outlet_code}-${b.category}`);
        });
        setBlankSet(bSet);
      }

      const { data: notesData } = await supabase.from('a_utilities_notes').select('*').eq('upload_month', formattedTarget);
      if (notesData) {
        const nMap = {};
        notesData.forEach(n => {
          nMap[`${n.outlet_code}-${n.category}`] = { note: n.note, color: n.color };
        });
        setNotesMap(nMap);
      }
      
      const { data: outletData } = await supabase.from('a_master_outlet').select('outlet_code, custom_groups');
      if (outletData) {
        const outletMap = {};
        outletData.forEach(o => {
          let groups = o.custom_groups || [];
          if (typeof groups === 'string') {
            try { groups = JSON.parse(groups); } catch(e){ groups = []; }
          }
          outletMap[o.outlet_code] = Array.isArray(groups) ? groups : [];
        });
        setOutletGroups(outletMap);
      }
      
      processData(rawTargetData || [], compareDataList);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const allCategories = ['Listrik', 'PAM', 'Gas', 'FCU (WATER CHILLER)', 'Telp', 'Internet'];
  const categories = filterCategory ? [filterCategory] : allCategories;

  const processData = (targetData, compareDataList) => {
    const outlets = [...new Set([...targetData.map(d => d.outlet_code), ...compareDataList.map(d => d.outlet_code)])].sort();
    
    const processed = outlets.map(outlet => {
      const row = { Outlet: outlet };
      categories.forEach(cat => {
        const tAmt = targetData.filter(d => d.outlet_code === outlet && d.category === cat).reduce((sum, d) => sum + d.debit_amount - d.credit_amount, 0);
        const cAmt = compareDataList.filter(d => d.outlet_code === outlet && d.category === cat).reduce((sum, d) => sum + d.debit_amount - d.credit_amount, 0);
          
        row[cat] = tAmt;
        if (compareMonth) {
          row[`${cat}_prev`] = cAmt;
          row[`${cat}_diff`] = tAmt - cAmt;
        }
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

  // Filter Data
  const getFilteredData = () => {
    let fd = data;
    if (filterOutlet) {
      fd = fd.filter(row => row.Outlet.toLowerCase().includes(filterOutlet.toLowerCase()));
    }
    
    if (filterMinDiff || filterMinPct) {
      const minDiff = parseFloat(filterMinDiff) || 0;
      const minPct = parseFloat(filterMinPct) || 0;
      
      fd = fd.filter(row => {
        return categories.some(cat => {
          const diff = row[`${cat}_diff`] || 0;
          const prev = row[`${cat}_prev`] || 0;
          const pct = prev > 0 ? (diff / prev) * 100 : 0;
          
          if (diff <= 0 && (filterMinDiff || filterMinPct)) return false; // only care about increases if filters are active
          
          let matches = true;
          if (filterMinDiff && diff < minDiff) matches = false;
          if (filterMinPct && pct < minPct) matches = false;
          
          return matches;
        });
      });
    }
    return fd;
  };
  
  const filteredData = getFilteredData();

  const exportTabel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data Utilitas');

    // 1. Define columns for data mapping
    const columns = [
      { key: 'Outlet', width: 25 }
    ];
    
    // Summary columns (left side)
    categories.forEach(cat => {
      columns.push({ key: `sum_${cat}`, width: 15 });
    });
    
    // Detailed columns (right side)
    if (compareMonth) {
      categories.forEach(cat => {
        columns.push({ key: `${cat}_curr`, width: 15 });
        columns.push({ key: `${cat}_prev`, width: 15 });
        columns.push({ key: `${cat}_diff`, width: 15 });
        columns.push({ key: `${cat}_status`, width: 20 });
      });
    }
    worksheet.columns = columns;
    
    // 2. Build Header Row 1
    const headerRow1 = ['Outlet'];
    const sumTitle = `Utilities Cost (${targetMonth})`;
    headerRow1.push(sumTitle);
    for (let i = 1; i < categories.length; i++) headerRow1.push(''); // spacing for merge
    
    if (compareMonth) {
      categories.forEach(cat => {
        headerRow1.push(cat);
        headerRow1.push('');
        headerRow1.push('');
        headerRow1.push(''); // spacing for merge (4 cols per cat)
      });
    }
    worksheet.addRow(headerRow1);
    
    // 3. Build Header Row 2
    const headerRow2 = ['Outlet']; // Will be merged vertically with row 1
    categories.forEach(cat => {
      headerRow2.push(cat);
    });
    
    if (compareMonth) {
      categories.forEach(cat => {
        headerRow2.push('Bulan Ini');
        headerRow2.push('Bulan Lalu');
        headerRow2.push('Selisih');
        headerRow2.push('Status');
      });
    }
    worksheet.addRow(headerRow2);
    
    // 4. Merge Cells & Style Headers
    worksheet.mergeCells('A1:A2');
    
    let sumStart = 2;
    let sumEnd = sumStart + categories.length - 1;
    if (sumEnd >= sumStart) worksheet.mergeCells(1, sumStart, 1, sumEnd);
    
    if (compareMonth) {
      let detStart = sumEnd + 1;
      categories.forEach(() => {
        worksheet.mergeCells(1, detStart, 1, detStart + 3);
        detStart += 4;
      });
    }
    
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    
    worksheet.getRow(2).font = { bold: true };
    worksheet.getRow(2).alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

    // 5. Add Data Grouped
    const groupsOrder = ['LIFESTYLE', 'SG', 'SH'];
    const rowsRendered = new Set();
    const filteredData = getFilteredData();
    const lastColLetter = worksheet.getColumn(worksheet.columns.length).letter;

    const renderExcelGroup = (groupName, rows) => {
      if (rows.length === 0) return;
      
      const groupHeader = worksheet.addRow([groupName]);
      worksheet.mergeCells(`A${groupHeader.number}:${lastColLetter}${groupHeader.number}`);
      groupHeader.font = { bold: true };
      groupHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; // slate-200
      
      rows.forEach(row => {
        const rowData = { Outlet: row.Outlet };
        categories.forEach(cat => {
          rowData[`sum_${cat}`] = row[cat] || 0;
        });
        if (compareMonth) {
          categories.forEach(cat => {
            const curr = row[cat] || 0;
            const prev = row[`${cat}_prev`] || 0;
            const diff = row[`${cat}_diff`] || 0;
            const pct = prev > 0 ? (diff / prev) * 100 : (diff > 0 ? 100 : 0);
            let statusText = 'TETAP';
            if (diff > 1000000) statusText = `NAIK ${diff.toLocaleString('id-ID')}`;
            else if (pct > 10) statusText = `NAIK ${pct.toFixed(1)}%`;
            else if (diff > 0) statusText = `NAIK ${pct.toFixed(0)}%`;
            else if (diff < 0) statusText = `TURUN ${Math.abs(pct).toFixed(0)}%`;
            rowData[`${cat}_curr`] = curr;
            rowData[`${cat}_prev`] = prev;
            rowData[`${cat}_diff`] = diff;
            rowData[`${cat}_status`] = statusText;
          });
        }
        
        const excelRow = worksheet.addRow(rowData);
        
        categories.forEach(cat => {
          const hasM1 = mPlus1Set.has(`${row.Outlet}-${cat}`);
          const isBlank = blankSet.has(`${row.Outlet}-${cat}`);
          const noteInfo = notesMap[`${row.Outlet}-${cat}`];
          
          let argb = null;
          if (noteInfo?.color === 'red') argb = 'FFFFCCCC';
          else if (noteInfo?.color === 'yellow') argb = 'FFFFFFCC';
          else if (noteInfo?.color === 'blue') argb = 'FFCCE5FF';
          else if (isBlank) argb = 'FF92D050'; // User requested #92D050
          else if (hasM1) argb = 'FFFCE7F3'; // pink-100
          
          const sumCell = excelRow.getCell(`sum_${cat}`);
          if (argb) sumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
          if (noteInfo?.note) sumCell.note = noteInfo.note;
          if (isBlank) sumCell.font = { color: { argb: 'FF000000' } }; // Black text
          
          if (compareMonth) {
            const detCell = excelRow.getCell(`${cat}_curr`);
            if (argb) detCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
            if (noteInfo?.note) detCell.note = noteInfo.note;
            if (isBlank) detCell.font = { color: { argb: 'FF000000' } }; // Black text
          }
        });
      });
    };

    groupsOrder.forEach(gName => {
      const gRows = filteredData.filter(r => (outletGroups[r.Outlet] || []).includes(gName));
      if (gRows.length > 0) {
        renderExcelGroup(gName, gRows);
        gRows.forEach(r => rowsRendered.add(r.Outlet));
      }
    });

    const otherRows = filteredData.filter(r => !rowsRendered.has(r.Outlet));
    renderExcelGroup('OTHERS', otherRows);

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Export_Utilitas_${targetMonth}.xlsx`);
  };

  const fetchDrilldownData = async (outletCode, category) => {
    setDrilldownOutlet(`${outletCode} - ${category}`);
    setShowDrilldown(true);
    setDrillLoading(true);
    try {
      const month = `${targetMonth}-01`;
      const { data: rawData, error } = await supabase.from('a_utilities_raw')
        .select('*')
        .eq('outlet_code', outletCode)
        .eq('category', category)
        .eq('upload_month', month)
        .order('trx_date', { ascending: false });
      if (error) throw error;
      setDrilldownData(rawData || []);
    } catch (err) {
      console.error('Drilldown error:', err);
    } finally {
      setDrillLoading(false);
    }
  };

  const handleCellClick = (e, outlet, category) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Calculate position
    const rect = e.currentTarget.getBoundingClientRect();
    
    // Handle edge cases near bottom/right of screen
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    let x = rect.left + window.scrollX + (rect.width / 2);
    let y = rect.bottom + window.scrollY;
    
    if (x + 220 > windowWidth) x = windowWidth - 230;
    if (y + 320 > windowHeight) y = rect.top + window.scrollY - 330; // Show above if near bottom

    const existing = notesMap[`${outlet}-${category}`];

    setCellMenu({
      x,
      y,
      outlet,
      category,
      selectedColor: existing?.color || null,
      noteText: existing?.note || '',
      show: true
    });
  };

  const handleSaveNoteAndColor = async () => {
    const { outlet, category, selectedColor, noteText } = cellMenu;
    const formattedTarget = `${targetMonth}-01`;
    try {
      const existing = notesMap[`${outlet}-${category}`];
      const finalColor = selectedColor;
      const finalNote = noteText;
      
      if (existing) {
        await supabase.from('a_utilities_notes')
          .update({ color: finalColor, note: finalNote })
          .eq('upload_month', formattedTarget)
          .eq('outlet_code', outlet)
          .eq('category', category);
      } else {
        await supabase.from('a_utilities_notes')
          .insert({
            upload_month: formattedTarget,
            outlet_code: outlet,
            category: category,
            note: finalNote,
            color: finalColor
          });
      }
      
      setNotesMap(prev => ({
        ...prev,
        [`${outlet}-${category}`]: { note: finalNote, color: finalColor }
      }));
      setCellMenu({...cellMenu, show: false});
    } catch (e) {
      console.error(e);
      alert('Gagal menyimpan catatan & warna');
    }
  };

  return (
    <div className="space-y-4 relative">
      <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Target:</label>
              <input type="month" value={targetMonth} onChange={(e) => {
                setTargetMonth(e.target.value);
                if (e.target.value) {
                  const [yy, mm] = e.target.value.split('-');
                  const d = new Date(parseInt(yy), parseInt(mm) - 1, 1);
                  d.setMonth(d.getMonth() - 1);
                  setCompareMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                }
              }} className="px-2 py-1 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 outline-none font-bold text-slate-800" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Pembanding:</label>
              <input type="month" value={compareMonth} onChange={(e) => setCompareMonth(e.target.value)} className="px-2 py-1 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 outline-none font-bold text-slate-800" />
            </div>
          </div>
          <button onClick={exportTabel} className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-sm font-bold transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
        
        {/* Global Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Outlet:</label>
            <input type="text" placeholder="Cari nama..." value={filterOutlet} onChange={(e) => setFilterOutlet(e.target.value)} className="px-2 py-1 text-sm border border-slate-200 rounded-md focus:border-blue-500 outline-none w-32" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Utilitas:</label>
            <select value={filterCategory} onChange={(e) => filterCategory(e.target.value)} className="px-2 py-1 text-sm border border-slate-200 rounded-md focus:border-blue-500 outline-none w-32 bg-white">
              <option value="">Semua</option>
              {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Min Rp:</label>
            <input type="number" placeholder="1000000" value={filterMinDiff} onChange={(e) => setFilterMinDiff(e.target.value)} className="px-2 py-1 text-sm border border-slate-200 rounded-md focus:border-blue-500 outline-none w-28" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Min %:</label>
            <input type="number" placeholder="10" value={filterMinPct} onChange={(e) => setFilterMinPct(e.target.value)} className="px-2 py-1 text-sm border border-slate-200 rounded-md focus:border-blue-500 outline-none w-20" />
          </div>
        </div>
      </div>
      
      {loading ? (
        <div className="flex justify-center py-20 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
          Memproses Data...
        </div>
      ) : data.length === 0 ? (
        <div className="bg-white p-10 text-center rounded-xl shadow-sm border border-slate-200 text-slate-500">
          Tidak ada data untuk periode terpilih.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[75vh]">
          <div className="overflow-auto flex-1 bg-white">
            <table className="min-w-max w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              {/* HEADER BARIS 1 */}
              <tr>
                <th rowSpan={2} className="px-3 py-3 text-left text-xs font-black text-slate-800 uppercase tracking-wider border-b border-r border-slate-300 sticky left-0 bg-slate-100 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  Outlet
                </th>
                <th colSpan={categories.length} className="px-3 py-2 text-center text-xs font-black text-blue-800 uppercase tracking-wider border-b border-r border-slate-300 bg-blue-50">
                  Utilities Cost ({targetMonth})
                </th>
                {compareMonth && categories.map(cat => (
                  <th key={`h1_${cat}`} colSpan={4} className="px-3 py-2 text-center text-xs font-black text-slate-700 uppercase tracking-wider border-b border-r border-slate-300 bg-slate-200">
                    {cat}
                  </th>
                ))}
              </tr>
              {/* HEADER BARIS 2 */}
              <tr>
                {/* Utilities Cost Columns */}
                {categories.map(cat => (
                  <th key={`h2_util_${cat}`} className="px-3 py-2 text-right text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-r border-slate-200 bg-slate-50">
                    {cat}
                  </th>
                ))}
                {/* Detail Columns for each Category */}
                {compareMonth && categories.map(cat => (
                  <React.Fragment key={`h2_det_${cat}`}>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-600 uppercase border-b border-r border-slate-200 bg-slate-50">Bulan Ini</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-600 uppercase border-b border-r border-slate-200 bg-slate-50">Bulan Lalu</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-600 uppercase border-b border-r border-slate-200 bg-slate-50">Selisih</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-600 uppercase border-b border-r border-slate-300 bg-slate-50">Status</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                const groupsOrder = ['LIFESTYLE', 'SG', 'SH'];
                const rowsRendered = new Set();
                const filteredData = getFilteredData();
                
                const renderRowsForGroup = (groupName, rows) => {
                  if (rows.length === 0) return null;
                  return (
                    <React.Fragment key={`group_${groupName}`}>
                      <tr>
                        <td colSpan={compareMonth ? categories.length * 5 + 1 : categories.length + 1} className="bg-slate-200 px-4 py-2 font-bold text-slate-800 text-left uppercase sticky left-0 z-20">
                          {groupName}
                        </td>
                      </tr>
                      {rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2 whitespace-nowrap text-xs font-bold text-slate-700 bg-white sticky left-0 z-10 border-r border-b border-slate-200">
                            {row.Outlet}
                          </td>
                          
                          {/* Utilities Cost Target Month */}
                          {categories.map(cat => {
                            const hasM1 = mPlus1Set.has(`${row.Outlet}-${cat}`);
                            const isBlank = blankSet.has(`${row.Outlet}-${cat}`);
                            
                            const noteInfo = notesMap[`${row.Outlet}-${cat}`];
                            let bgClass = 'bg-blue-50/10';
                            
                            // Prioritas: Warna Custom -> isBlank -> hasM1 -> Default
                            if (noteInfo?.color === 'red') bgClass = 'bg-red-100';
                            else if (noteInfo?.color === 'yellow') bgClass = 'bg-yellow-100';
                            else if (noteInfo?.color === 'blue') bgClass = 'bg-blue-100';
                            else if (isBlank) bgClass = 'bg-[#92D050]';
                            else if (hasM1) bgClass = 'bg-pink-100';
                            
                            const val = row[cat] || 0;

                            return (
                              <td 
                                key={`tc_${cat}`} 
                                onClick={(e) => handleCellClick(e, row.Outlet, cat)} 
                                className={`px-3 py-2 whitespace-nowrap text-right text-[11px] font-bold border-b border-r border-slate-200 cursor-context-menu hover:opacity-80 hover:ring-2 hover:ring-inset hover:ring-blue-400 transition-all group/cell relative ${bgClass} ${isBlank ? 'text-black' : 'text-slate-800'}`}
                              >
                                {noteInfo?.note && (
                                  <div className="absolute top-0 right-0 w-0 h-0 border-t-[8px] border-l-[8px] border-t-red-500 border-l-transparent"></div>
                                )}
                                {noteInfo?.note && (
                                  <div className="hidden group-hover:block absolute z-10 top-full right-0 mt-1 w-48 p-2 bg-yellow-50 text-slate-700 text-xs text-left rounded shadow-lg border border-yellow-200 whitespace-normal pointer-events-none">
                                    {noteInfo.note}
                                  </div>
                                )}
                                {val > 0 ? val.toLocaleString('id-ID') : (isBlank ? '' : '-')}
                                <ExternalLink className="w-3 h-3 text-blue-500 opacity-0 group-hover/cell:opacity-100 absolute bottom-1 left-1 transition-opacity" />
                              </td>
                            );
                          })}
                          
                          {/* Detailed Analysis Section (Right Side) */}
                          {compareMonth && categories.map(cat => {
                            const current = row[cat] || 0;
                            const prev = row[`${cat}_prev`] || 0;
                            const diff = row[`${cat}_diff`] || 0;
                            const pct = prev > 0 ? (diff / prev) * 100 : (diff > 0 ? 100 : 0);
                            const alert = isAlert(diff, prev);
                            
                            let statusText = '';
                            if (diff > 1000000) statusText = `NAIK ${diff.toLocaleString('id-ID')}`;
                            else if (pct > 10) statusText = `NAIK ${pct.toFixed(1)}%`;
                            else if (diff > 0) statusText = `NAIK ${pct.toFixed(0)}%`;
                            else if (diff < 0) statusText = `TURUN ${Math.abs(pct).toFixed(0)}%`;
                            else if (current > 0) statusText = `TETAP`;
                            else statusText = `-`;
                            
                            const textColor = alert ? 'text-red-600' : (diff < 0 ? 'text-emerald-600' : 'text-slate-600');
                            const noteInfo = notesMap[`${row.Outlet}-${cat}`];
                            const bgColorClass = noteInfo?.color === 'red' ? 'bg-red-100' : noteInfo?.color === 'yellow' ? 'bg-yellow-100' : noteInfo?.color === 'blue' ? 'bg-blue-100' : 'bg-transparent';
                            
                            return (
                              <React.Fragment key={`cc_${cat}`}>
                                <td 
                                  onClick={(e) => handleCellClick(e, row.Outlet, cat)}
                                  className={`px-3 py-2 whitespace-nowrap text-right text-[11px] font-medium border-b border-r border-slate-200 cursor-context-menu hover:ring-2 hover:ring-inset hover:ring-blue-400 relative group transition-colors ${bgColorClass} text-slate-700`}
                                  title={noteInfo?.note ? noteInfo.note : `Klik kiri untuk aksi detail`}
                                >
                                  {noteInfo?.note && (
                                    <div className="absolute top-0 right-0 w-0 h-0 border-t-[8px] border-l-[8px] border-t-red-500 border-l-transparent"></div>
                                  )}
                                  {noteInfo?.note && (
                                    <div className="hidden group-hover:block absolute z-10 top-full right-0 mt-1 w-48 p-2 bg-yellow-50 text-slate-700 text-xs text-left rounded shadow-lg border border-yellow-200 whitespace-normal pointer-events-none">
                                      {noteInfo.note}
                                    </div>
                                  )}
                                  {current ? current.toLocaleString('id-ID') : '-'}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-right text-[11px] font-medium text-slate-500 border-b border-r border-slate-200 bg-slate-50/50">
                                  {prev ? prev.toLocaleString('id-ID') : '-'}
                                </td>
                                <td className={`px-3 py-2 whitespace-nowrap text-right text-[11px] font-bold border-b border-r border-slate-200 ${textColor}`}>
                                  {diff !== 0 ? diff.toLocaleString('id-ID') : '-'}
                                </td>
                                <td className={`px-3 py-2 whitespace-nowrap text-left text-[10px] font-black border-b border-r border-slate-300 ${textColor}`}>
                                  {statusText}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                };

                const elements = [];
                groupsOrder.forEach(gName => {
                  const gRows = filteredData.filter(r => (outletGroups[r.Outlet] || []).includes(gName));
                  if (gRows.length > 0) {
                    elements.push(renderRowsForGroup(gName, gRows));
                    gRows.forEach(r => rowsRendered.add(r.Outlet));
                  }
                });

                const otherRows = filteredData.filter(r => !rowsRendered.has(r.Outlet));
                if (otherRows.length > 0) {
                  elements.push(renderRowsForGroup('OTHERS', otherRows));
                }

                return elements;
              })()}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Drilldown Modal (Kept the same) */}
      {showDrilldown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <ExternalLink className="w-5 h-5 text-blue-600" />
                  Raw Data Drilldown - Outlet: <span className="text-blue-600">{drilldownOutlet}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">Periode: {targetMonth}</p>
              </div>
              <button onClick={() => setShowDrilldown(false)} className="p-2 bg-slate-200 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-300 transition-colors">
                <X className="w-5 h-5"/>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {drillLoading ? (
                <div className="py-20 text-center text-slate-500 animate-pulse">Memuat raw data...</div>
              ) : drilldownData.length === 0 ? (
                <div className="py-20 text-center text-slate-500">Tidak ada raw data ditemukan.</div>
              ) : (
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Trx Date</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Journal</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Account</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Description</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Kategori</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Debit</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Credit</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drilldownData.map((d, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatUIDate(d.trx_date)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-800 font-medium">{d.journal_entry}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{d.account_number}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate" title={d.account_description}>{d.account_description}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs border border-blue-100 font-bold">{d.category}</span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-slate-700 font-bold">{d.debit_amount?.toLocaleString('id-ID')}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-slate-700">{d.credit_amount?.toLocaleString('id-ID')}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs min-w-[200px] whitespace-normal break-words">{d.reference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cell Context Menu Dropdown */}
      {cellMenu.show && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={(e) => { e.stopPropagation(); setCellMenu({...cellMenu, show: false}); }}></div>
          <div 
            className="absolute z-[100] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden w-40 text-[10px]"
            style={{ top: cellMenu.y, left: cellMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
               <div>
                 <span className="font-bold text-slate-700">{cellMenu.outlet}</span> - <span className="text-blue-600 font-medium">{cellMenu.category}</span>
               </div>
               <button onClick={() => setCellMenu({...cellMenu, show: false})} className="text-slate-400 hover:text-slate-700"><X className="w-3 h-3"/></button>
            </div>
            <div className="p-2 border-b border-slate-100 bg-white space-y-2">
              <div>
                <label className="font-bold text-slate-500 mb-0.5 block">Warna:</label>
                <div className="flex gap-1.5 justify-center">
                  {['red', 'yellow', 'blue', 'transparent'].map(c => (
                    <button 
                      key={c}
                      onClick={() => setCellMenu(prev => ({...prev, selectedColor: c === 'transparent' ? null : c}))}
                      className={`w-4 h-4 rounded-sm border shadow-sm transition-all ${cellMenu.selectedColor === c || (c === 'transparent' && !cellMenu.selectedColor) ? 'ring-2 ring-blue-500 scale-110' : ''} ${c === 'red' ? 'bg-red-200 border-red-300' : c === 'yellow' ? 'bg-yellow-200 border-yellow-300' : c === 'blue' ? 'bg-blue-200 border-blue-300' : 'bg-white border-slate-300'}`}
                      title={c === 'transparent' ? 'Hapus Warna' : `Warna ${c}`}
                    >
                      {c === 'transparent' && <X className="w-3 h-3 text-slate-300 mx-auto" />}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="font-bold text-slate-500 mb-0.5 block">Catatan:</label>
                <textarea 
                  value={cellMenu.noteText}
                  onChange={(e) => setCellMenu(prev => ({...prev, noteText: e.target.value}))}
                  className="w-full p-1.5 border border-slate-200 rounded-sm outline-none focus:border-blue-500 h-10 resize-none leading-tight"
                  placeholder="Ketik catatan..."
                />
              </div>
              
              <button 
                onClick={handleSaveNoteAndColor}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 rounded-sm shadow-sm transition-colors"
              >
                Simpan
              </button>
            </div>
            <div className="p-1 flex flex-col bg-slate-50 gap-0.5">
            <button 
              onClick={() => {
                setCellMenu({...cellMenu, show: false});
                fetchDrilldownData(cellMenu.outlet, cellMenu.category);
              }} 
              className="w-full text-left px-2 py-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition-colors flex items-center gap-1.5 rounded-sm"
            >
              <List className="w-3 h-3 text-slate-400" /> Drilldown
            </button>
            <button 
              onClick={() => router.push(`/mplus1?outlet=${cellMenu.outlet}&category=${cellMenu.category}&year=${targetMonth ? targetMonth.split('-')[0] : new Date().getFullYear()}`)} 
              className="w-full text-left px-2 py-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition-colors flex items-center gap-1.5 rounded-sm"
            >
              <TrendingUp className="w-3 h-3 text-pink-400" /> M+1 Accrued
            </button>
            <button 
              onClick={() => router.push(`/raw?outlet=${cellMenu.outlet}&category=${cellMenu.category}&period=${targetMonth}-01`)} 
              className="w-full text-left px-2 py-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition-colors flex items-center gap-1.5 rounded-sm"
            >
              <Search className="w-3 h-3 text-slate-400" /> Raw Data
            </button>
            <button 
              onClick={() => router.push(`/analisa?outlet=${cellMenu.outlet}&month=${targetMonth}`)} 
              className="w-full text-left px-2 py-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition-colors flex items-center gap-1.5 rounded-sm"
            >
              <ExternalLink className="w-3 h-3 text-slate-400" /> Analisa
            </button>
            <button 
              onClick={() => router.push(`/grafik?outlet=${cellMenu.outlet}&category=${cellMenu.category}&year=${targetMonth ? targetMonth.split('-')[0] : new Date().getFullYear()}`)} 
              className="w-full text-left px-2 py-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition-colors flex items-center gap-1.5 rounded-sm"
            >
              <BarChart2 className="w-3 h-3 text-slate-400" /> Grafik
            </button>
          </div>
          </div>
        </>
      )}
    </div>
  );
}

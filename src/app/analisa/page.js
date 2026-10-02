"use client";

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { supabase2 } from '@/lib/supabase2';
import { Download, Check, X, MessageSquare, AlertTriangle, Wand2 } from 'lucide-react';
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
  
  const [analisaView, setAnalisaView] = useState('group'); // 'list' | 'group' | 'pic' | 'spv'
  const [editingNote, setEditingNote] = useState(null); // { outlet, category, text }
  const [savingNote, setSavingNote] = useState(false);
  const [collapsedOutlets, setCollapsedOutlets] = useState(new Set());

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


  const [generatingNote, setGeneratingNote] = useState(false);

  const handleGenerateAutoNote = async (outlet, category) => {
    if (!supabase2) {
      alert("Database PIC tidak terhubung.");
      return;
    }
    setGeneratingNote(true);
    setEditingNote({ outlet, category, text: 'Memuat data DB2...' });
    
    try {
      const utilsMap = {
        'Listrik': ['UEL', 'PEM.LISTRIK', 'UEL GDG'],
        'PAM': ['UWT'],
        'Gas': ['UGS'],
      };
      const allowedUtils = utilsMap[category] || [];
      
      let query1 = supabase2.from('payments')
         .select('utility, periode, usage, tarif, totalInv, status')
         .eq('outlet', outlet)
         .not('status', 'eq', 'REJECTED')
         .not('status', 'eq', 'CANCELLED');
      let query2 = supabase2.from('progress_pajak_detail')
         .select('utilitas, periode_usage, periode, usage, tarif, inv_usage, dpp, ppn')
         .eq('outlet', outlet);
      
      if (allowedUtils.length > 0) {
        query1 = query1.in('utility', allowedUtils);
        query2 = query2.in('utilitas', allowedUtils);
      }
      
      const [res1, res2] = await Promise.all([query1, query2]);
      if (res1.error) throw res1.error;
      if (res2.error) throw res2.error;
      
      let data = [];
      if (res1.data) data = [...res1.data];
      if (res2.data) {
         data = [...data, ...res2.data.map(r => ({
            utility: r.utilitas,
            periode: r.periode || r.periode_usage,
            usage: r.usage,
            tarif: r.tarif,
            totalInv: (r.inv_usage != null) ? r.inv_usage : ((Number(r.dpp) || 0) + (Number(r.ppn) || 0))
         }))];
      }
      
      console.log('[AutoNote] outlet:', outlet, 'category:', category, 'rows:', data.length, data.map(d => ({ utility: d.utility, periode: d.periode, usage: d.usage })));
      
      if (data.length === 0) {
        setEditingNote({ outlet, category, text: `Data ${category} tidak ditemukan di DB2.` });
        setGeneratingNote(false);
        return;
      }
      
      const normalizePeriode = (p) => {
         if (!p) return null;
         p = p.toUpperCase().trim();
         // Format YYYY-MM
         let m = p.match(/^(\d{4})-(\d{2})$/);
         if (m) return `${m[1]}-${m[2]}`;
         
         // Daftar nama bulan (ID dan EN, 3-huruf dan panjang)
         const monthMap = {
            'JAN': 1, 'JANUARI': 1, 'JANUARY': 1,
            'FEB': 2, 'FEBRUARI': 2, 'FEBRUARY': 2,
            'MAR': 3, 'MARET': 3, 'MARCH': 3,
            'APR': 4, 'APRIL': 4,
            'MEI': 5, 'MAY': 5,
            'JUN': 6, 'JUNI': 6, 'JUNE': 6,
            'JUL': 7, 'JULI': 7, 'JULY': 7,
            'AGU': 8, 'AGUSTUS': 8, 'AUGUSTUS': 8, 'AUG': 8, 'AUGUST': 8,
            'SEP': 9, 'SEPTEMBER': 9,
            'OKT': 10, 'OKTOBER': 10, 'OCT': 10, 'OCTOBER': 10,
            'NOV': 11, 'NOVEMBER': 11,
            'DES': 12, 'DESEMBER': 12, 'DEC': 12, 'DECEMBER': 12,
         };
         
         // Cari nama bulan yang match (dari yang terpanjang dulu)
         const sortedKeys = Object.keys(monthMap).sort((a, b) => b.length - a.length);
         let monthNum = null;
         for (const key of sortedKeys) {
            if (p.includes(key)) {
               monthNum = monthMap[key];
               break;
            }
         }
         
         if (monthNum !== null) {
            // Coba 4-digit tahun dulu
            let yM4 = p.match(/\d{4}/);
            if (yM4) return `${yM4[0]}-${String(monthNum).padStart(2, '0')}`;
            // Fallback: 2-digit tahun -> prefix 20
            let yM2 = p.match(/\b(\d{2})\b/);
            if (yM2) return `20${yM2[1]}-${String(monthNum).padStart(2, '0')}`;
         }
         
         return null;
      };
      
      let targetRow = null;
      let compareRow = null;
      
      // Kumpulkan per utility untuk mencari yang datanya paling lengkap dan valid
      const utilsMapData = {};
      for (const row of data) {
         const norm = normalizePeriode(row.periode);
         if (norm === targetMonth || norm === compareMonth) {
            if (!utilsMapData[row.utility]) utilsMapData[row.utility] = {};
            utilsMapData[row.utility][norm] = row;
         }
      }
      
      let bestUtil = null;
      for (const [util, periods] of Object.entries(utilsMapData)) {
         if (periods[targetMonth] && periods[compareMonth]) {
             const uC = Number(String(periods[targetMonth].usage).replace(/,/g, '')) || 0;
             const uP = Number(String(periods[compareMonth].usage).replace(/,/g, '')) || 0;
             if (uC > 0 && uP > 0) {
                 bestUtil = util;
                 break;
             }
             if (!bestUtil) bestUtil = util;
         }
      }
      
      if (!bestUtil) {
         setEditingNote({ outlet, category, text: `Data bulan current/lalu tidak lengkap di DB2.` });
         setGeneratingNote(false);
         return;
      }
      
      targetRow = utilsMapData[bestUtil][targetMonth];
      compareRow = utilsMapData[bestUtil][compareMonth];
      
      const parseNum = (v) => {
         if (v === null || v === undefined) return 0;
         let s = String(v).trim();
         if (!s) return 0;
         
         const match = s.match(/[.,](\d+)$/);
         if (match) {
             const digits = match[1];
             if (digits.length === 3) {
                 // Terdeteksi 3 angka di belakang titik/koma -> Ribuan
                 return Number(s.replace(/[.,]/g, '')) || 0;
             } else {
                 // Desimal
                 const mainPart = s.substring(0, s.length - 1 - digits.length).replace(/[.,]/g, '');
                 return Number(mainPart + '.' + digits) || 0;
             }
         }
         return Number(s.replace(/[.,]/g, '')) || 0;
      };
      
      const uCur = Math.round(parseNum(targetRow.usage));
      const uPrev = Math.round(parseNum(compareRow.usage));
      const tCur = Math.round(parseNum(targetRow.tarif));
      const tPrev = Math.round(parseNum(compareRow.tarif));
      
      const diffUsage = Math.abs(uCur - uPrev);
      const diffTarif = Math.abs(tCur - tPrev);
      
      const totalCur = Math.round(parseNum(targetRow.totalInv));
      const totalPrev = Math.round(parseNum(compareRow.totalInv));
      const diffTotal = Math.abs(totalCur - totalPrev);
      
      let noteParts = [];
      if (diffUsage > 0) {
          if (uCur > uPrev) {
             noteParts.push(`Usage naik ${diffUsage.toLocaleString('id-ID')} dari ${uPrev.toLocaleString('id-ID')} jadi ${uCur.toLocaleString('id-ID')}`);
          } else {
             noteParts.push(`Usage turun ${diffUsage.toLocaleString('id-ID')} dari ${uPrev.toLocaleString('id-ID')} jadi ${uCur.toLocaleString('id-ID')}`);
          }
      }
      
      if (diffTarif >= 100) {
         if (tCur > tPrev) {
            noteParts.push(`Tarif Naik ${diffTarif.toLocaleString('id-ID')}`);
         } else if (tCur < tPrev) {
            noteParts.push(`Tarif Turun ${diffTarif.toLocaleString('id-ID')}`);
         }
      }
      
      let finalNote = noteParts.join(' & ');
      if (finalNote !== '' && diffTotal > 0) {
         finalNote += ` Total Rp ${diffTotal.toLocaleString('id-ID')}`;
      }
      
      if (finalNote === '') {
         setEditingNote({ outlet, category, text: `-` });
      } else {
         setEditingNote({ outlet, category, text: finalNote });
      }
      
    } catch (err) {
       console.error("Error generating auto note:", err);
       setEditingNote({ outlet, category, text: `Gagal memuat: ${err.message}` });
    }
    setGeneratingNote(false);
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

  // Grouped by SPV: always computed, includes both anomaly outlets AND blank/empty outlets
  const groupedBySpv = useMemo(() => {
    const outletAnomalies = {};
    groupedAnomalies.forEach(g => outletAnomalies[g.outlet.trim().toUpperCase()] = g.items);

    // Outlets with blank/missing data = in data but has a category with 0 or missing current value
    const blankOutlets = new Set();
    data.forEach(row => {
      if (urlOutlet && row.Outlet !== urlOutlet) return;
      const hasSomeData = categories.some(cat => (row[cat] || 0) > 0);
      if (!hasSomeData) { blankOutlets.add(row.Outlet.trim().toUpperCase()); return; }
      categories.forEach(cat => {
        if ((row[`${cat}_prev`] || 0) > 0 && (row[cat] || 0) === 0) {
          blankOutlets.add(row.Outlet.trim().toUpperCase());
        }
      });
    });

    const allMappedOutlets = new Set();
    const spvGroups = pics.map(pic => {
      let assignedOutlets = [];
      try { assignedOutlets = typeof pic.accessOutlets === 'string' ? JSON.parse(pic.accessOutlets) : pic.accessOutlets; } catch(e){}
      (assignedOutlets || []).forEach(o => allMappedOutlets.add(o.trim().toUpperCase()));

      const anomalyItems = [];
      const blankItems = [];
      (assignedOutlets || []).forEach(o => {
        const outCode = o.trim().toUpperCase();
        if (outletAnomalies[outCode]) anomalyItems.push({ outlet: outCode, anomalies: outletAnomalies[outCode] });
        else if (blankOutlets.has(outCode)) blankItems.push({ outlet: outCode });
      });

      // Sort: OPEN first, DONE last
      anomalyItems.sort((a, b) => {
        const aDone = notes[`${a.outlet}_SUMMARY_STATUS`] === 'DONE';
        const bDone = notes[`${b.outlet}_SUMMARY_STATUS`] === 'DONE';
        if (aDone && !bDone) return 1;
        if (!aDone && bDone) return -1;
        return a.outlet.localeCompare(b.outlet);
      });

      return { picName: pic.fullname, anomalyItems, blankItems };
    }).filter(g => g.anomalyItems.length > 0 || g.blankItems.length > 0);

    // Unmapped outlets with anomalies
    const unmappedAnomalies = [];
    const unmappedBlanks = [];
    groupedAnomalies.forEach(g => {
      if (!allMappedOutlets.has(g.outlet.trim().toUpperCase())) unmappedAnomalies.push({ outlet: g.outlet, anomalies: g.items });
    });
    blankOutlets.forEach(o => {
      if (!allMappedOutlets.has(o)) unmappedBlanks.push({ outlet: o });
    });
    if (unmappedAnomalies.length > 0 || unmappedBlanks.length > 0) {
      spvGroups.push({ picName: 'Tidak Ada PIC', anomalyItems: unmappedAnomalies, blankItems: unmappedBlanks });
    }

    return spvGroups;
  }, [groupedAnomalies, pics, notes, data, urlOutlet]);

  const toggleCollapse = (key) => {
    setCollapsedOutlets(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exportAnalisa = () => {
    // Buat pemetaan Outlet -> PIC
    const outletPicMap = {};
    pics.forEach(pic => {
      let assignedOutlets = [];
      try { assignedOutlets = typeof pic.accessOutlets === 'string' ? JSON.parse(pic.accessOutlets) : pic.accessOutlets; } catch(e){}
      (assignedOutlets || []).forEach(o => {
        outletPicMap[o.trim().toUpperCase()] = pic.fullname;
      });
    });

    const exportData = groupedAnomalies.map(group => {
      if (group.items.length === 0) return null;
      
      const detailString = group.items.map(item => {
        const dir = item.diff > 0 ? 'NAIK' : 'TURUN';
        return `${item.category} ${dir} ${Math.abs(item.pct).toFixed(0)}% Rp ${Math.abs(item.diff).toLocaleString('id-ID')}`;
      }).join(', ');

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

      const isDone = notes[`${group.outlet}_SUMMARY_STATUS`] === 'DONE' ? 'DONE' : 'OPEN';

      return {
        'PIC': outletPicMap[group.outlet.trim().toUpperCase()] || 'Tidak Ada PIC',
        'Outlet': group.outlet,
        'Keterangan Anomali': detailString,
        'Catatan': combinedNotes,
        'Status': isDone
      };
    }).filter(Boolean);

    // Sort: OPEN dulu, baru DONE. Lalu berdasarkan PIC, lalu Outlet.
    exportData.sort((a, b) => {
      if (a.Status !== b.Status) return a.Status === 'DONE' ? 1 : -1;
      if (a.PIC !== b.PIC) return a.PIC.localeCompare(b.PIC);
      return a.Outlet.localeCompare(b.Outlet);
    });

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
            <button onClick={() => setAnalisaView('spv')} className={`px-4 py-1.5 rounded-md transition-colors ${analisaView === 'spv' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Ringkasan SPV</button>
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
                          <input type="text" autoFocus value={editingNote.text} onChange={e => setEditingNote({...editingNote, text: e.target.value})} onKeyDown={e => { if(e.key === 'Enter') saveNote() }} disabled={generatingNote} placeholder="Catatan..." className="flex-1 px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none" />
                            <button onClick={() => handleGenerateAutoNote(item.outlet, item.category)} disabled={generatingNote} title="Auto-generate dari DB2" className="px-2 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded transition-colors"><Wand2 className="w-3 h-3"/></button>
                          <button onClick={saveNote} disabled={savingNote} className="px-2 bg-blue-600 text-white rounded"><Check className="w-3 h-3"/></button>
                          <button onClick={() => setEditingNote(null)} className="px-2 bg-slate-200 text-slate-600 rounded"><X className="w-3 h-3"/></button>
                        </div>
                      ) : notes[`${item.outlet}_${item.category}`] ? (
                        <div onClick={() => setEditingNote({outlet: item.outlet, category: item.category, text: notes[`${item.outlet}_${item.category}`]})} className="p-2 bg-yellow-50 text-yellow-800 text-xs rounded border border-yellow-200 cursor-pointer hover:bg-yellow-100">
                          <span className="font-bold">Catatan:</span> {notes[`${item.outlet}_${item.category}`]}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                          <div onClick={() => setEditingNote({outlet: item.outlet, category: item.category, text: ''})} className="text-xs text-slate-400 cursor-pointer hover:text-blue-500 flex items-center gap-1">
                            <MessageSquare className="w-3 h-3"/> Tambah Catatan Analisis
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); handleGenerateAutoNote(item.outlet, item.category); }} disabled={generatingNote} className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded shadow flex items-center gap-1 hover:bg-blue-700 transition-colors disabled:opacity-50"><Wand2 className="w-3 h-3"/> Auto DB2</button>
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
      ) : analisaView === 'spv' ? (
        <div className="space-y-6">
          {groupedBySpv.length === 0 ? (
            <div className="bg-blue-50 text-blue-700 p-8 text-center rounded-xl border border-blue-200 font-bold">
              Tidak ada data anomali atau kosong. Pastikan PIC sudah terdaftar di database.
            </div>
          ) : groupedBySpv.map((spvGroup, gi) => (
            <div key={gi} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-indigo-600 px-5 py-3 flex items-center justify-between">
                <h3 className="font-black text-white text-base uppercase tracking-wide">{spvGroup.picName}</h3>
                <div className="flex items-center gap-2">
                  {spvGroup.anomalyItems.length > 0 && <span className="text-[10px] font-bold bg-red-500/80 text-white px-2 py-0.5 rounded-full">{spvGroup.anomalyItems.length} Anomali</span>}
                  {spvGroup.blankItems.length > 0 && <span className="text-[10px] font-bold bg-yellow-300/80 text-indigo-900 px-2 py-0.5 rounded-full">{spvGroup.blankItems.length} Kosong</span>}
                </div>
              </div>

              {spvGroup.anomalyItems.length > 0 && (
                <div>
                  <div className="bg-red-50 px-5 py-2 border-b border-red-100">
                    <span className="text-xs font-black text-red-700 uppercase tracking-wider">⚡ Deteksi Lonjakan / Anomali Tagihan</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {spvGroup.anomalyItems.map(item => {
                      const collapseKey = `${spvGroup.picName}_${item.outlet}`;
                      const isCollapsed = collapsedOutlets.has(collapseKey);
                      const isMasterDone = notes[`${item.outlet}_SUMMARY_STATUS`] === 'DONE';
                      const hasRedAlert = item.anomalies.some(a => Math.abs(a.diff) > 1000000 || Math.abs(a.pct) > 30);
                      return (
                        <div key={item.outlet} className={`transition-all ${isMasterDone ? 'opacity-50 grayscale' : ''}`}>
                          <div
                            className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-slate-50 ${hasRedAlert && !isMasterDone ? 'border-l-4 border-red-500' : 'border-l-4 border-amber-400'}`}
                            onClick={() => toggleCollapse(collapseKey)}
                          >
                            <span className="font-black text-xs text-slate-700 w-16 shrink-0">{item.outlet}</span>
                            <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
                              {item.anomalies.map(a => {
                                const isRed = Math.abs(a.diff) > 1000000 || Math.abs(a.pct) > 30;
                                return (
                                  <span key={a.category} className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${isRed ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {a.category} {a.diff > 0 ? '\u25b2' : '\u25bc'}{Math.abs(a.pct).toFixed(0)}%
                                  </span>
                                );
                              })}
                              {notes[`${item.outlet}_SUMMARY`] && (
                                <span className="text-[10px] text-slate-500 italic truncate">&mdash; {notes[`${item.outlet}_SUMMARY`]}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {isMasterDone && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">✓ Done</span>}
                              <span className="text-[10px] text-slate-400">{isCollapsed ? '\u25bc' : '\u25b2'}</span>
                            </div>
                          </div>
                          {!isCollapsed && (
                            <div className="bg-slate-50 px-4 pb-3 pt-1 border-t border-slate-100">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                {item.anomalies.map(a => {
                                  const isRed = Math.abs(a.diff) > 1000000 || Math.abs(a.pct) > 30;
                                  const noteText = notes[`${item.outlet}_${a.category}`];
                                  const isUtilDone = notes[`${item.outlet}_${a.category}_STATUS`] === 'DONE';
                                  return (
                                    <div key={a.category} className={`rounded-lg p-2.5 border ${isRed ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'} ${isUtilDone ? 'opacity-50' : ''}`}>
                                      <div className="flex items-center justify-between mb-1 cursor-pointer hover:opacity-80" onClick={() => handleAnomalyClick(item.outlet, a.category)} title="Lihat Raw Data">
                                        <span className={`text-[11px] font-black ${isRed ? 'text-red-700' : 'text-amber-700'} underline decoration-dotted underline-offset-2`}>{a.category}</span>
                                        <span className={`text-[11px] font-bold ${a.diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                          {a.diff > 0 ? '\u25b2' : '\u25bc'} {Math.abs(a.pct).toFixed(1)}% &middot; Rp {Math.abs(a.diff).toLocaleString('id-ID')}
                                        </span>
                                      </div>
                                      {editingNote?.outlet === item.outlet && editingNote?.category === a.category ? (
                                        <div className="flex gap-1.5">
                                          <input type="text" autoFocus value={editingNote.text} onChange={e => setEditingNote({...editingNote, text: e.target.value})} onKeyDown={e => { if(e.key === 'Enter') saveNote() }} disabled={generatingNote} placeholder="Catatan..." className="flex-1 px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none" />
                                          <button onClick={() => handleGenerateAutoNote(item.outlet, a.category)} disabled={generatingNote} title="Auto-generate dari DB2" className="px-1.5 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded transition-colors"><Wand2 className="w-3 h-3"/></button>
                                          <button onClick={saveNote} disabled={savingNote} className="px-1.5 bg-blue-600 text-white rounded"><Check className="w-3 h-3"/></button>
                                          <button onClick={() => setEditingNote(null)} className="px-1.5 bg-slate-200 text-slate-600 rounded"><X className="w-3 h-3"/></button>
                                        </div>
                                      ) : noteText ? (
                                        <div className="flex items-start gap-1 mt-2">
                                          <div onClick={() => setEditingNote({outlet: item.outlet, category: a.category, text: noteText})} className="flex-1 text-[10px] text-yellow-800 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-1 cursor-pointer hover:bg-yellow-100">{noteText}</div>
                                          <button onClick={(e) => { e.stopPropagation(); handleGenerateAutoNote(item.outlet, a.category); }} disabled={generatingNote} className="px-1.5 py-1 bg-blue-600 text-white text-[9px] font-bold rounded shadow flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-50" title="Regenerate Auto Note DB2"><Wand2 className="w-3 h-3"/></button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between mt-2">
                                          <div onClick={() => setEditingNote({outlet: item.outlet, category: a.category, text: ''})} className="text-[10px] text-slate-400 cursor-pointer hover:text-blue-500 flex items-center gap-1"><MessageSquare className="w-2.5 h-2.5"/> Tambah Catatan Analisis</div>
                                          <button onClick={(e) => { e.stopPropagation(); handleGenerateAutoNote(item.outlet, a.category); }} disabled={generatingNote} className="px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded shadow flex items-center gap-1 hover:bg-blue-700 transition-colors disabled:opacity-50"><Wand2 className="w-2.5 h-2.5"/> Auto DB2</button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                                {editingNote?.outlet === item.outlet && editingNote?.category === 'SUMMARY' ? (
                                  <div className="flex gap-2 flex-1">
                                    <input type="text" autoFocus value={editingNote.text} onChange={e => setEditingNote({...editingNote, text: e.target.value})} onKeyDown={e => { if(e.key === 'Enter') saveNote() }} placeholder="Catatan ringkasan outlet..." className="flex-1 px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none" />
                                    <button onClick={saveNote} disabled={savingNote} className="px-2 bg-blue-600 text-white rounded text-xs"><Check className="w-3 h-3"/></button>
                                    <button onClick={() => setEditingNote(null)} className="px-2 bg-slate-200 text-slate-600 rounded text-xs"><X className="w-3 h-3"/></button>
                                  </div>
                                ) : (
                                  <div onClick={() => setEditingNote({outlet: item.outlet, category: 'SUMMARY', text: notes[`${item.outlet}_SUMMARY`] || ''})} className="text-[10px] text-slate-500 cursor-pointer hover:text-blue-500 flex-1 truncate">
                                    {notes[`${item.outlet}_SUMMARY`] ? <span className="text-yellow-800">📝 {notes[`${item.outlet}_SUMMARY`]}</span> : '+ Catatan ringkasan outlet'}
                                  </div>
                                )}
                                <label className="relative inline-flex items-center cursor-pointer gap-1.5 ml-3 shrink-0">
                                  <input type="checkbox" className="sr-only peer" checked={isMasterDone} onChange={() => toggleStatus(item.outlet, 'SUMMARY')} />
                                  <div className="w-7 h-3.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-emerald-500"></div>
                                  <span className="text-[10px] font-bold text-slate-500">Done</span>
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {spvGroup.blankItems.length > 0 && (
                <div>
                  <div className="bg-yellow-50 px-5 py-2 border-t border-b border-yellow-100">
                    <span className="text-xs font-black text-yellow-700 uppercase tracking-wider">⏳ Menunggu Inputan / Data Kosong</span>
                  </div>
                  <div className="flex flex-wrap gap-2 px-5 py-3">
                    {spvGroup.blankItems.map(item => {
                      const collapseKey = `blank_${spvGroup.picName}_${item.outlet}`;
                      const isCollapsed = collapsedOutlets.has(collapseKey);
                      return (
                        <div key={item.outlet} className="border border-yellow-200 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 cursor-pointer hover:bg-yellow-100" onClick={() => toggleCollapse(collapseKey)}>
                            <span className="text-xs font-black text-yellow-800">{item.outlet}</span>
                            <span className="text-[10px] text-yellow-600">{isCollapsed ? '\u25bc' : '\u25b2'}</span>
                          </div>
                          {!isCollapsed && (
                            <div className="px-3 pb-2 pt-1 bg-white min-w-[140px]">
                              {editingNote?.outlet === item.outlet && editingNote?.category === 'SUMMARY' ? (
                                <div className="flex gap-1.5">
                                  <input type="text" autoFocus value={editingNote.text} onChange={e => setEditingNote({...editingNote, text: e.target.value})} onKeyDown={e => { if(e.key === 'Enter') saveNote() }} placeholder="Catatan..." className="flex-1 px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none" />
                                  <button onClick={saveNote} disabled={savingNote} className="px-1.5 bg-blue-600 text-white rounded"><Check className="w-3 h-3"/></button>
                                  <button onClick={() => setEditingNote(null)} className="px-1.5 bg-slate-200 text-slate-600 rounded"><X className="w-3 h-3"/></button>
                                </div>
                              ) : (
                                <div onClick={() => setEditingNote({outlet: item.outlet, category: 'SUMMARY', text: notes[`${item.outlet}_SUMMARY`] || ''})} className="text-[10px] cursor-pointer text-slate-500 hover:text-blue-500">
                                  {notes[`${item.outlet}_SUMMARY`] ? <span className="text-yellow-800">📝 {notes[`${item.outlet}_SUMMARY`]}</span> : '+ Tambah catatan'}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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

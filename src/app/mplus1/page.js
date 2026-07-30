"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Download, X, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatUIDate } from '@/utils/dateFormatter';

export default function MPlus1Page() {
  const [targetYear, setTargetYear] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [urlOutlet, setUrlOutlet] = useState(null);
  const [urlCategory, setUrlCategory] = useState(null);

  useEffect(() => {
    let initialYear = new Date().getFullYear().toString();
    
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('year')) initialYear = params.get('year');
      if (params.get('outlet')) setUrlOutlet(params.get('outlet'));
      if (params.get('category')) setUrlCategory(params.get('category'));
    }
    setTargetYear(initialYear);
  }, []);

  useEffect(() => {
    fetchData();
  }, [targetYear, urlOutlet, urlCategory]);

  const fetchData = async () => {
    if (!targetYear) return;
    setLoading(true);
    try {
      const startDate = `${targetYear}-01-01`;
      const endDate = `${targetYear}-12-31`;
      
      let query = supabase.from('a_utilities_raw')
        .select('*')
        .gte('upload_month', startDate)
        .lte('upload_month', endDate)
        .order('upload_month', { ascending: false })
        .order('trx_date', { ascending: false });
        
      if (urlOutlet) query = query.eq('outlet_code', urlOutlet);
      if (urlCategory) {
        query = query.eq('category', urlCategory);
      }
      
      const { data: rawData, error } = await query.limit(50000);
      
      if (error) throw error;
      
      setData(rawData || []);
    } catch (error) {
      console.error('Error fetching M+1 data:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setUrlOutlet(null);
    setUrlCategory(null);
  };

  // 1. Identify which (outlet, category) pairs have at least one accrued (account_number starts with 2)
  // 2. Group all data (both normal and accrued) for those pairs
  const groupedData = React.useMemo(() => {
    const accruedPairs = new Set();
    data.forEach(d => {
      if (d.account_number.startsWith('2')) {
        accruedPairs.add(`${d.outlet_code}_${d.category}`);
      }
    });

    const groups = {};
    data.forEach(d => {
      if (accruedPairs.has(`${d.outlet_code}_${d.category}`)) {
        if (!groups[d.outlet_code]) groups[d.outlet_code] = {};
        if (!groups[d.outlet_code][d.category]) groups[d.outlet_code][d.category] = [];
        groups[d.outlet_code][d.category].push(d);
      }
    });
    return groups;
  }, [data]);

  const exportExcel = () => {
    const exportData = [];
    Object.keys(groupedData).forEach(outlet => {
      Object.keys(groupedData[outlet]).forEach(cat => {
        groupedData[outlet][cat].forEach(d => {
           exportData.push({
             'Outlet': d.outlet_code,
             'Kategori': d.category,
             'Bulan Data': d.upload_month,
             'Trx Date': d.trx_date,
             'Status': d.account_number.startsWith('2') ? 'ACCRUED (M+1)' : 'NORMAL',
             'Account Number': d.account_number,
             'Account Description': d.account_description,
             'Journal Entry': d.journal_entry,
             'Nominal': d.credit_amount > 0 ? d.credit_amount : d.debit_amount,
             'Referensi': d.reference
           });
        });
      });
    });
    
    if (exportData.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'M+1 Analysis');
    XLSX.writeFile(wb, `Export_MPlus1_Analysis_${targetYear}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Tahun Analisis:
          </label>
          <select 
            value={targetYear} 
            onChange={(e) => setTargetYear(e.target.value)} 
            className="px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 outline-none font-bold text-slate-800"
          >
            {[2023, 2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          
          {(urlOutlet || urlCategory) && (
            <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
              <span className="text-xs text-slate-500 font-bold uppercase">Filter:</span>
              {urlOutlet && <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded">{urlOutlet}</span>}
              {urlCategory && <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded">{urlCategory}</span>}
              <button onClick={clearFilters} className="text-slate-400 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-sm font-bold transition-colors">
          <Download className="w-4 h-4" /> Export Excel
        </button>
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">Laporan M+1 (Accrued Expenses)</h2>
        <p className="text-xs text-slate-500">Daftar biaya utilitas yang memiliki catatan accrued (M+1) di tahun {targetYear}. Menampilkan history dari Jan - Des.</p>
      </div>
      
      {loading ? (
        <div className="py-20 flex items-center justify-center text-slate-500 bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
          Memproses Data...
        </div>
      ) : Object.keys(groupedData).length === 0 ? (
        <div className="py-20 flex items-center justify-center text-slate-400 text-sm border-2 border-dashed border-slate-200 bg-slate-50 rounded-xl font-medium">
          Tidak ada data Accrued (M+1) yang ditemukan untuk {targetYear}.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.keys(groupedData).sort().map(outlet => (
            <div key={outlet} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-800 px-5 py-3">
                <h3 className="text-white font-black text-lg tracking-wider">{outlet}</h3>
              </div>
              
              <div className="p-5 overflow-x-auto">
                <div className="flex gap-6 min-w-max">
                  {Object.keys(groupedData[outlet]).sort().map(cat => (
                    <div key={cat} className="flex-none w-[600px] border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                      <div className="bg-blue-50 px-4 py-2 border-b border-slate-200">
                        <span className="font-bold text-blue-800 uppercase tracking-wider">{cat}</span>
                      </div>
                      <div className="flex-1 overflow-y-auto max-h-[400px]">
                        <table className="min-w-full divide-y divide-slate-200 text-[11px]">
                          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                              <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase">Bulan</th>
                              <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase">Trx Date</th>
                              <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase">Account</th>
                              <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase">Desc / Ref</th>
                              <th className="px-3 py-2 text-right font-bold text-slate-600 uppercase">Nominal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {groupedData[outlet][cat].map((d, i) => {
                              const isAccrued = d.account_number.startsWith('2');
                              return (
                                <tr key={i} className={`hover:bg-opacity-80 transition-colors ${isAccrued ? 'bg-pink-50' : 'bg-white hover:bg-slate-50'}`}>
                                  <td className="px-3 py-2 whitespace-nowrap text-slate-600 font-medium">
                                    {formatUIDate(d.upload_month)}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                                    {formatUIDate(d.trx_date)}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <span className={`font-mono ${isAccrued ? 'text-pink-600 font-bold' : 'text-slate-500'}`}>
                                      {d.account_number}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 min-w-[200px]">
                                    <div className="font-medium line-clamp-1" title={d.account_description}>{d.account_description}</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1" title={d.reference}>{d.reference}</div>
                                  </td>
                                  <td className={`px-3 py-2 whitespace-nowrap text-right font-bold ${isAccrued ? 'text-pink-600' : 'text-slate-700'}`}>
                                    {(d.credit_amount > 0 ? d.credit_amount : d.debit_amount).toLocaleString('id-ID')}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

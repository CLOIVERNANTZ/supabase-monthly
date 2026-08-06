"use client";

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Search, Check } from 'lucide-react';
import { formatUIDate } from '@/utils/dateFormatter';
import GrafikDB2 from './GrafikDB2';

export default function GrafikPage() {
  const [targetYear, setTargetYear] = useState('');
  const [data, setData] = useState({}); // { outlet_code: [ { month: 'Jan', Listrik: 100, ... } ] }
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Grafik states
  const [selectedOutlets, setSelectedOutlets] = useState([]);
  const [outletSearch, setOutletSearch] = useState('');
  const [showOutletDropdown, setShowOutletDropdown] = useState(false);
  const categories = ['Listrik', 'PAM', 'Gas', 'Telp', 'Internet'];
  const [selectedUtilities, setSelectedUtilities] = useState(categories);
  const [activeLines, setActiveLines] = useState({}); // { [outlet]: 'category' }
  const [db2Mappings, setDb2Mappings] = useState({}); // { outlet_code: mapping_db2 }
  
  const dropdownRef = useRef(null);

  useEffect(() => {
    let initialYear = new Date().getFullYear().toString();
    const savedYear = localStorage.getItem('preferred_target_year');
    if (savedYear) {
      initialYear = savedYear;
    }
    
    let initialOutlets = [];
    if (typeof window !== 'undefined') {
      const savedOutlets = localStorage.getItem('preferred_grafik_outlets');
      if (savedOutlets) {
        try { initialOutlets = JSON.parse(savedOutlets); } catch(e){}
      }
      
      const params = new URLSearchParams(window.location.search);
      if (params.get('year')) {
        initialYear = params.get('year');
      }
      if (params.get('outlet')) {
        initialOutlets = [params.get('outlet')];
        localStorage.setItem('preferred_grafik_outlets', JSON.stringify(initialOutlets));
      }
      if (params.get('category')) setSelectedUtilities([params.get('category')]);
    }
    setTargetYear(initialYear);
    setSelectedOutlets(initialOutlets);
    
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowOutletDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    fetchGrafikData();
  }, [targetYear, selectedOutlets]);

  const fetchGrafikData = async () => {
    if (!targetYear) return;
    setLoading(true);
    try {
      // 1. Fetch unique outlets from master for sorting and toggles
      const { data: outletsData, error: outletsError } = await supabase.from('a_master_outlet')
        .select('outlet_code, yang_masuk, order_index')
        .order('yang_masuk', { ascending: false }) // true comes first
        .order('order_index', { ascending: true })
        .order('outlet_code', { ascending: true });
        
      if (outletsError) throw outletsError;
      
      let uniqueOutlets = outletsData || [];
      setOutlets(uniqueOutlets);
      
      let currentSelection = selectedOutlets;
      

      
      if (currentSelection.length === 0) {
        setLoading(false);
        return;
      }

      const startDate = `${targetYear}-01-01`;
      const endDate = `${targetYear}-12-31`;
      
      const { data: rawData, error } = await supabase.from('a_utilities_raw')
        .select('*')
        .gte('upload_month', startDate)
        .lte('upload_month', endDate)
        .in('outlet_code', currentSelection)
        .limit(50000);
        
      if (error) throw error;
      
      // Fetch DB2 mappings
      const { data: mappingData } = await supabase.from('a_master_outlet')
        .select('outlet_code, mapping_db2')
        .in('outlet_code', currentSelection);
      
      if (mappingData) {
        const mappings = {};
        mappingData.forEach(row => {
          mappings[row.outlet_code] = row.mapping_db2 || row.outlet_code;
        });
        setDb2Mappings(mappings);
      }
      
      processData(rawData || [], currentSelection);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Removed "FCU (WATER CHILLER)" from chart rendering as requested

  // Removed "FCU (WATER CHILLER)" from chart rendering as requested

  const processData = (rawData, currentSelection) => {
    const structuredData = {};
    
    currentSelection.forEach(outlet => {
      const outletDataByMonth = {};
      
      for (let m = 1; m <= 12; m++) {
        // Create an array of months 'Jan', 'Feb', etc
        const d = new Date(2020, m - 1, 1); // Fixed year to avoid timezone issues
        const monthName = d.toLocaleString('id-ID', { month: 'short' });
        outletDataByMonth[m] = { month: monthName, sort: m };
        categories.forEach(cat => outletDataByMonth[m][cat] = 0);
      }
      
      const outletRawData = rawData.filter(d => d.outlet_code === outlet);
      outletRawData.forEach(d => {
        if (!categories.includes(d.category)) return;
        const m = parseInt(d.upload_month.split('-')[1], 10);
        outletDataByMonth[m][d.category] += (d.debit_amount - d.credit_amount);
      });
      
      structuredData[outlet] = Object.values(outletDataByMonth).sort((a,b) => a.sort - b.sort);
    });
    
    setData(structuredData);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Tahun Grafik:</label>
          <input type="number" min="2020" max="2050" value={targetYear} onChange={(e) => {
              const val = e.target.value;
              setTargetYear(val);
              if (val) localStorage.setItem('preferred_target_year', val);
            }} className="px-3 py-1.5 w-24 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 outline-none font-bold text-slate-800" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">Grafik Historis per Tahun</h2>
            <p className="text-xs text-slate-500">Pilih outlet untuk melihat pergerakan biaya utilitas sepanjang tahun.</p>
          </div>
          
          <div className="relative w-full sm:w-72" ref={dropdownRef}>
            <div 
              onClick={() => setShowOutletDropdown(!showOutletDropdown)}
              className="flex justify-between items-center px-4 py-2 bg-white border border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 shadow-sm"
            >
              <span className="text-sm font-medium text-slate-700 truncate">
                {selectedOutlets.length === 0 ? 'Pilih Outlet...' : `${selectedOutlets.length} Outlet Terpilih`}
              </span>
              <TrendingUp className="w-4 h-4 text-slate-400" />
            </div>
            
            {showOutletDropdown && (
              <div className="absolute top-full mt-1 right-0 w-full md:w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
                <div className="p-2 border-b border-slate-100 bg-slate-50">
                  <div className="relative">
                    <Search className="absolute left-2 top-2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Cari outlet..." 
                      value={outletSearch}
                      onChange={(e) => setOutletSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-sm rounded border border-slate-200 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                  {outlets
                    .filter(r => r.outlet_code.toLowerCase().includes(outletSearch.toLowerCase()))
                    .sort((a, b) => {
                      const aSel = selectedOutlets.includes(a.outlet_code);
                      const bSel = selectedOutlets.includes(b.outlet_code);
                      if (aSel && !bSel) return -1;
                      if (!aSel && bSel) return 1;
                      return 0; // retain original order (yang_masuk, order_index)
                    })
                    .map((outletObj, i) => {
                    const outlet = outletObj.outlet_code;
                    const isSelected = selectedOutlets.includes(outlet);
                    const isYangMasuk = outletObj.yang_masuk !== false; // default true if null
                    return (
                      <div 
                        key={i}
                        onClick={() => {
                          let newOutlets;
                          if (isSelected) newOutlets = selectedOutlets.filter(o => o !== outlet);
                          else newOutlets = [...selectedOutlets, outlet];
                          setSelectedOutlets(newOutlets);
                          localStorage.setItem('preferred_grafik_outlets', JSON.stringify(newOutlets));
                        }}
                        className={`flex items-center px-3 py-2 cursor-pointer rounded text-sm transition-colors
                          ${!isYangMasuk ? 'opacity-50 grayscale bg-slate-50 hover:bg-slate-100' : 'hover:bg-blue-50'}
                        `}
                      >
                        <div className={`w-4 h-4 rounded border mr-3 flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className={isSelected ? 'font-bold text-slate-800' : (isYangMasuk ? 'text-slate-700' : 'text-slate-500 italic')}>{outlet}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {loading ? (
          <div className="py-20 flex items-center justify-center text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
            Memproses Data Tahunan...
          </div>
        ) : (
          <div className="space-y-10 mt-4">
            {selectedOutlets.length === 0 ? (
              <div className="py-20 flex items-center justify-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                Pilih minimal satu outlet untuk menampilkan grafik.
              </div>
            ) : (
              selectedOutlets.map(outlet => {
                if (!data[outlet]) {
                  return (
                    <div key={outlet} className="py-20 flex items-center justify-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                      Tidak ada data grafik untuk {outlet} di tahun {targetYear}.
                    </div>
                  );
                }
                
                return (
                <div key={outlet} className="border border-slate-100 bg-slate-50/50 rounded-xl p-4 flex flex-col">
                  <h3 className="font-black text-slate-700 text-lg mb-4 text-center border-b border-slate-200 pb-2">{outlet} - {targetYear}</h3>
                  
                  <div className="flex gap-4 mb-4 justify-center flex-wrap">
                    {categories.map(cat => (
                      <label key={cat} className="flex items-center gap-2 text-sm text-slate-700 font-bold cursor-pointer">
                        <input type="checkbox" checked={selectedUtilities.includes(cat)} onChange={(e) => {
                          if (e.target.checked) setSelectedUtilities([...selectedUtilities, cat]);
                          else setSelectedUtilities(selectedUtilities.filter(c => c !== cat));
                        }} className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"/>
                        {cat}
                      </label>
                    ))}
                  </div>

                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data[outlet]} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11, fontWeight: 'bold'}} />
                        <YAxis orientation="left" stroke="#64748b" axisLine={false} tickLine={false} tick={{fontSize: 11}} 
                          tickFormatter={(val) => `Rp ${(val/1000000).toFixed(0)}M`}
                        />
                        <RechartsTooltip 
                          formatter={(value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(value)}
                          contentStyle={{borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px'}}
                          cursor={{fill: '#f1f5f9'}}
                        />
                        <Legend wrapperStyle={{paddingTop: '20px', fontSize: '12px', fontWeight: 'bold'}} />
                        
                        {selectedUtilities.includes('Listrik') && <Bar dataKey="Listrik" onClick={() => setActiveLines(prev => ({...prev, [outlet]: prev[outlet] === 'Listrik' ? null : 'Listrik'}))} cursor="pointer" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />}
                        {selectedUtilities.includes('PAM') && <Bar dataKey="PAM" onClick={() => setActiveLines(prev => ({...prev, [outlet]: prev[outlet] === 'PAM' ? null : 'PAM'}))} cursor="pointer" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={50} />}
                        {selectedUtilities.includes('Gas') && <Bar dataKey="Gas" onClick={() => setActiveLines(prev => ({...prev, [outlet]: prev[outlet] === 'Gas' ? null : 'Gas'}))} cursor="pointer" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={50} />}
                        {selectedUtilities.includes('Telp') && <Bar dataKey="Telp" onClick={() => setActiveLines(prev => ({...prev, [outlet]: prev[outlet] === 'Telp' ? null : 'Telp'}))} cursor="pointer" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={50} />}
                        {selectedUtilities.includes('Internet') && <Bar dataKey="Internet" onClick={() => setActiveLines(prev => ({...prev, [outlet]: prev[outlet] === 'Internet' ? null : 'Internet'}))} cursor="pointer" fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={50} />}
                        
                        {activeLines[outlet] && (
                          <Line 
                            type="monotone" 
                            dataKey={activeLines[outlet]} 
                            stroke="#0f172a" 
                            strokeWidth={3} 
                            dot={{r: 4, strokeWidth: 2, fill: '#fff'}} 
                            activeDot={{r: 6}} 
                            isAnimationActive={true}
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Data Table */}
                  <div className="mt-8 overflow-x-auto bg-white rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold text-slate-700 tracking-wider">Bulan</th>
                          {selectedUtilities.map(cat => (
                            <th key={`th_${cat}`} className="px-4 py-3 text-right font-bold text-slate-700 tracking-wider">{cat}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {data[outlet].map(row => (
                          <tr key={row.month} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-black text-slate-800">{row.month}</td>
                            {selectedUtilities.map(cat => (
                              <td key={`td_${cat}`} className="px-4 py-2 text-right font-medium text-slate-600">
                                {row[cat] > 0 ? row[cat].toLocaleString('id-ID') : '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* AREA UNTUK GRAFIK DATABASE 2 (DARI AI LAIN) */}
                  <GrafikDB2 selectedOutlets={[db2Mappings[outlet] || outlet]} targetYear={targetYear} />

                </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

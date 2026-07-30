"use client";

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Download, Search, Check, ChevronDown, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatUIDate } from '@/utils/dateFormatter';

export default function RawDataPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Available filters based on DB
  const [availableOutlets, setAvailableOutlets] = useState([]);
  const [availablePeriods, setAvailablePeriods] = useState([]);
  const allCategories = ['Listrik', 'PAM', 'Gas', 'FCU (WATER CHILLER)', 'Telp', 'Internet'];
  
  // Selected filters
  const [selectedOutlets, setSelectedOutlets] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([...allCategories]);
  const [selectedPeriods, setSelectedPeriods] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Search states for dropdowns
  const [outletSearch, setOutletSearch] = useState('');
  
  // Dropdown visibility
  const [showOutletDropdown, setShowOutletDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  
  const outletRef = useRef(null);
  const categoryRef = useRef(null);
  const periodRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('outlet')) setSelectedOutlets([params.get('outlet')]);
      if (params.get('category')) setSelectedCategories([params.get('category')]);
      if (params.get('period')) setSelectedPeriods([params.get('period')]);
    }
    fetchMetadata().then(() => setIsInitialized(true));
    
    const handleClickOutside = (event) => {
      if (outletRef.current && !outletRef.current.contains(event.target)) setShowOutletDropdown(false);
      if (categoryRef.current && !categoryRef.current.contains(event.target)) setShowCategoryDropdown(false);
      if (periodRef.current && !periodRef.current.contains(event.target)) setShowPeriodDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      fetchData();
    }
  }, [selectedOutlets, selectedCategories, selectedPeriods, isInitialized]);

  const fetchMetadata = async () => {
    try {
      // Fetch unique outlets from view
      const { data: outletsData, error: outletsError } = await supabase.from('a_utilities_outlets').select('outlet_code');
      if (outletsError) throw outletsError;
      
      if (outletsData) {
        const outlets = outletsData.map(d => d.outlet_code).sort();
        setAvailableOutlets(outlets);
      }

      // Fetch unique periods from view
      const { data: periodsData, error: periodsError } = await supabase.from('a_utilities_periods').select('upload_month');
      if (periodsError) throw periodsError;
      
      if (periodsData) {
        const periods = periodsData.map(d => d.upload_month).sort((a,b) => b.localeCompare(a));
        setAvailablePeriods(periods);
      }
    } catch (error) {
      console.error('Error fetching metadata:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase.from('a_utilities_raw').select('*');
      
      if (selectedOutlets.length > 0) {
        query = query.in('outlet_code', selectedOutlets);
      }
      
      if (selectedCategories.length > 0) {
        query = query.in('category', selectedCategories);
      }
      
      if (selectedPeriods.length > 0) {
        query = query.in('upload_month', selectedPeriods);
      }
      
      // Limit to avoid crashing browser if too much data, order descending
      const { data: rawData, error } = await query.order('upload_month', { ascending: false }).limit(50000);
      
      if (error) throw error;
      setData(rawData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = () => {
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Raw Data');
    XLSX.writeFile(wb, `Export_RawData.xlsx`);
  };

  const MultiSelectDropdown = ({ title, options, selected, setSelected, search, setSearch, show, setShow, dropdownRef }) => (
    <div className="relative" ref={dropdownRef}>
      <div 
        onClick={() => setShow(!show)}
        className="flex justify-between items-center px-3 py-1.5 bg-white border border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 shadow-sm min-w-[160px]"
      >
        <span className="text-xs font-bold text-slate-700 truncate mr-2">
          {selected.length === 0 
            ? `Semua ${title}` 
            : selected.length === options.length && options.length > 0 
              ? `Semua ${title}` 
              : selected.length === 1 
                ? (title === 'Periode' ? formatUIDate(selected[0]) : selected[0]) 
                : `${selected.length} ${title}`}
        </span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </div>
      
      {show && (
        <div className="absolute top-full mt-1 left-0 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
          {setSearch && (
            <div className="p-2 border-b border-slate-100 bg-slate-50">
              <div className="relative">
                <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Cari..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 text-xs rounded border border-slate-200 focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-1">
            <div 
              onClick={() => setSelected(selected.length === options.length ? [] : [...options])}
              className="flex items-center px-3 py-2 hover:bg-slate-50 cursor-pointer rounded text-xs border-b border-slate-100 mb-1"
            >
              <div className={`w-3.5 h-3.5 rounded border mr-2 flex items-center justify-center ${selected.length === options.length ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                {selected.length === options.length && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className="font-bold text-slate-700">Pilih Semua</span>
            </div>
            
            {options.filter(o => !search || o.toLowerCase().includes(search.toLowerCase())).map((opt, i) => {
              const isSelected = selected.includes(opt);
              return (
                <div 
                  key={i}
                  onClick={() => {
                    if (isSelected) setSelected(selected.filter(o => o !== opt));
                    else setSelected([...selected, opt]);
                  }}
                  className="flex items-center px-3 py-2 hover:bg-slate-50 cursor-pointer rounded text-xs"
                >
                  <div className={`w-3.5 h-3.5 rounded border mr-2 flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                    {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className={isSelected ? 'font-bold text-slate-800' : 'text-slate-600'}>{opt}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-800 font-black text-lg">
            <Filter className="w-5 h-5 text-blue-600" /> Eksplorasi Raw Data
          </div>
          <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-sm font-bold transition-colors">
            <Download className="w-4 h-4" /> Export Excel
          </button>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
          <MultiSelectDropdown 
            title="Periode" 
            options={availablePeriods} 
            selected={selectedPeriods} 
            setSelected={setSelectedPeriods} 
            show={showPeriodDropdown} 
            setShow={setShowPeriodDropdown} 
            dropdownRef={periodRef} 
          />
          <MultiSelectDropdown 
            title="Outlet" 
            options={availableOutlets} 
            selected={selectedOutlets} 
            setSelected={setSelectedOutlets} 
            search={outletSearch} 
            setSearch={setOutletSearch} 
            show={showOutletDropdown} 
            setShow={setShowOutletDropdown} 
            dropdownRef={outletRef} 
          />
          <MultiSelectDropdown 
            title="Utilitas" 
            options={allCategories} 
            selected={selectedCategories} 
            setSelected={setSelectedCategories} 
            show={showCategoryDropdown} 
            setShow={setShowCategoryDropdown} 
            dropdownRef={categoryRef} 
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-20 flex items-center justify-center text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
            Memuat data...
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px]">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-bold text-slate-700 uppercase">Periode</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-slate-700 uppercase">Trx Date</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-slate-700 uppercase">Outlet</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-slate-700 uppercase">Kategori</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-slate-700 uppercase">Journal</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-slate-700 uppercase">Account</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-slate-700 uppercase">Description</th>
                  <th className="px-3 py-3 text-right text-xs font-bold text-slate-700 uppercase">Debit</th>
                  <th className="px-3 py-3 text-right text-xs font-bold text-slate-700 uppercase">Credit</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-slate-700 uppercase">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="px-4 py-10 text-center text-slate-500">Tidak ada data sesuai filter.</td>
                  </tr>
                ) : data.map((d, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap text-blue-700 font-bold bg-blue-50/30 border-r border-slate-100">
                      {formatUIDate(d.upload_month)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500 font-medium">{formatUIDate(d.trx_date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-black text-slate-800">{d.outlet_code}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs border border-indigo-100 font-bold">{d.category}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700 font-medium text-xs">{d.journal_entry}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600 text-xs">{d.account_number}</td>
                    <td className="px-3 py-2 text-slate-600 text-xs min-w-[150px] whitespace-normal break-words">{d.account_description}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-slate-700 font-bold">{d.debit_amount?.toLocaleString('id-ID')}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-slate-700">{d.credit_amount?.toLocaleString('id-ID')}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs min-w-[200px] whitespace-normal break-words">{d.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

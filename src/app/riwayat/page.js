"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { History, ArrowRight, ArrowDown, ArrowUp, Calendar, Filter } from 'lucide-react';

export default function RiwayatRevisiPage() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterGroup, setFilterGroup] = useState('ALL');
  
  const groups = ['ALL', 'VC', 'SH', 'SG', 'SP', 'PK', 'IS', 'BB', 'NG', 'SM'];

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('a_utilities_audit_log')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (filterMonth) {
        query = query.eq('upload_month', `${filterMonth}-01`);
      }
      
      if (filterGroup !== 'ALL') {
        query = query.eq('group_name', filterGroup);
      }
        
      const { data, error } = await query.limit(500);
      
      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterMonth, filterGroup]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <History className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-800">Riwayat Perubahan Data (Audit Trail)</h1>
        </div>
        
        <p className="text-slate-500 mb-8 max-w-3xl">
          Halaman ini mencatat semua jejak revisi yang terjadi saat Anda melakukan "Smart Replace & Upload". Anda dapat melacak perubahan nominal secara spesifik, misalnya listrik yang awalnya 7 juta kemudian di-upload ulang menjadi 5 juta.
        </p>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-8 p-4 bg-slate-50 rounded-xl border border-slate-200 items-end">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Calendar className="w-4 h-4" /> Bulan Data
            </label>
            <input 
              type="month" 
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-48"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Filter className="w-4 h-4" /> Filter Group
            </label>
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-32"
            >
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <button 
            onClick={() => { setFilterMonth(''); setFilterGroup('ALL'); }}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Reset Filter
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Waktu Revisi</th>
                <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Bulan Data</th>
                <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Group</th>
                <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Kategori</th>
                <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Sebelum (Old)</th>
                <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Sesudah (New)</th>
                <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Selisih</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500">Memuat riwayat...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                    Tidak ada jejak revisi yang ditemukan untuk kriteria ini.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const diff = log.new_amount - log.old_amount;
                  const isDecrease = diff < 0;
                  const isIncrease = diff > 0;
                  
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {new Date(log.upload_month).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 font-bold rounded-md">
                          {log.group_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{log.category}</td>
                      <td className="px-4 py-3 text-slate-500 line-through decoration-red-300">
                        {formatCurrency(log.old_amount)}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800 flex items-center gap-2">
                        <ArrowRight className="w-4 h-4 text-slate-400" />
                        {formatCurrency(log.new_amount)}
                      </td>
                      <td className="px-4 py-3">
                        {diff === 0 ? (
                          <span className="text-slate-400">Tidak Berubah</span>
                        ) : (
                          <div className={`flex items-center gap-1 font-bold ${isDecrease ? 'text-green-600' : 'text-orange-600'}`}>
                            {isDecrease ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                            {formatCurrency(Math.abs(diff))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

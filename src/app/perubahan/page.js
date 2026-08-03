"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Trash2, AlertTriangle, Search, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function PerubahanDataPage() {
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  
  useEffect(() => {
    const savedTarget = localStorage.getItem('preferred_target_month');
    if (savedTarget) {
      setSelectedMonth(savedTarget);
    } else {
      const now = new Date();
      setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
  }, []);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  
  const groups = ['ALL', 'LIFESTYLE', 'SG', 'SH', 'OTHERS'];

  const fetchMonthStats = async (month, group) => {
    if (!month) {
      setStats(null);
      return;
    }
    
    setIsLoading(true);
    setMessage(null);
    setConfirmDelete(false);
    
    try {
      const formattedMonth = `${month}-01`;
      let outletCodes = null;
      
      if (group !== 'ALL') {
        const { data: outlets, error: outletErr } = await supabase
          .from('a_utilities_outlets')
          .select('outlet_code')
          .eq('upload_month', formattedMonth)
          .eq('group_name', group);
          
        if (outletErr) throw outletErr;
        outletCodes = [...new Set(outlets.map(o => o.outlet_code))];
        
        if (outletCodes.length === 0) {
          setStats({ count: 0, totalDebit: 0, totalCredit: 0 });
          setIsLoading(false);
          return;
        }
      }
      
      // Get count
      let countQuery = supabase
        .from('a_utilities_raw')
        .select('*', { count: 'exact', head: true })
        .eq('upload_month', formattedMonth);
        
      if (outletCodes) countQuery = countQuery.in('outlet_code', outletCodes);
      
      const { count, error: countErr } = await countQuery;
        
      if (countErr) throw countErr;
      
      if (count === 0) {
        setStats({ count: 0, totalDebit: 0, totalCredit: 0 });
        setIsLoading(false);
        return;
      }

      // If there's data, fetch it to calculate sum
      let dataQuery = supabase
        .from('a_utilities_raw')
        .select('debit_amount, credit_amount')
        .eq('upload_month', formattedMonth);
        
      if (outletCodes) dataQuery = dataQuery.in('outlet_code', outletCodes);
        
      const { data, error: dataErr } = await dataQuery;
        
      if (dataErr) throw dataErr;
      
      const totalDebit = data.reduce((acc, row) => acc + (row.debit_amount || 0), 0);
      const totalCredit = data.reduce((acc, row) => acc + (row.credit_amount || 0), 0);
      
      setStats({ count, totalDebit, totalCredit });
      
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Gagal mengambil data bulan tersebut: ' + error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthStats(selectedMonth, selectedGroup);
  }, [selectedMonth, selectedGroup]);

  const handleDelete = async () => {
    if (!selectedMonth || !stats || stats.count === 0) return;
    
    setIsDeleting(true);
    setMessage(null);
    
    try {
      const formattedMonth = `${selectedMonth}-01`;
      let outletCodes = null;
      
      if (selectedGroup !== 'ALL') {
        const { data: outlets } = await supabase
          .from('a_utilities_outlets')
          .select('outlet_code')
          .eq('upload_month', formattedMonth)
          .eq('group_name', selectedGroup);
        outletCodes = [...new Set(outlets.map(o => o.outlet_code))];
      }
      
      let delQuery = supabase
        .from('a_utilities_raw')
        .delete()
        .eq('upload_month', formattedMonth);
        
      if (outletCodes) delQuery = delQuery.in('outlet_code', outletCodes);
      
      const { error } = await delQuery;
        
      if (error) throw error;
      
      setMessage({ type: 'success', text: `Berhasil menghapus ${stats.count} baris data untuk bulan ${selectedMonth} ${selectedGroup !== 'ALL' ? `(Group ${selectedGroup})` : ''}. Anda sekarang bisa melakukan Upload ulang yang bersih!` });
      setStats({ count: 0, totalDebit: 0, totalCredit: 0 });
      setConfirmDelete(false);
      
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Gagal menghapus data: ' + error.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    setIsDeletingAll(true);
    setMessage(null);
    try {
      // Menghapus semua data (menggunakan trik neq id tidak valid)
      const { error } = await supabase
        .from('a_utilities_raw')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
        
      if (error) throw error;
      
      setMessage({ type: 'success', text: 'Berhasil mereset dan menghapus SELURUH data utilities dari semua bulan. Database sekarang kosong dan bersih!' });
      setStats(null);
      setConfirmDeleteAll(false);
      
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Gagal mereset database: ' + error.message });
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold text-slate-800">Perubahan Data (Reset Bulan)</h1>
        </div>
        <p className="text-slate-500 mb-8 max-w-2xl">
          Gunakan halaman ini jika Anda ingin melakukan revisi/perubahan data besar-besaran untuk suatu bulan. Hapus data bulan tersebut secara keseluruhan di sini terlebih dahulu, lalu lakukan <b>Upload</b> ulang file Excel yang sudah direvisi.
        </p>

        <div className="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-xl">
          <label className="block text-sm font-bold text-slate-700 mb-2">Pilih Bulan & Group yang Ingin Dikelola / Dihapus</label>
          <div className="flex flex-wrap gap-4">
              <input 
                type="month" 
                value={selectedMonth}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedMonth(val);
                  if (val) localStorage.setItem('preferred_target_month', val);
                }}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold text-slate-800 transition-colors"
              />
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-full max-w-[150px] font-medium text-lg"
            >
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <button 
              onClick={() => fetchMonthStats(selectedMonth, selectedGroup)}
              disabled={isLoading || !selectedMonth}
              className="px-6 py-3 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-100 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {isLoading ? 'Mencari...' : <><Search className="w-5 h-5" /> Cek Data</>}
            </button>
          </div>
        </div>

        {message && (
          <div className={`p-4 mb-8 rounded-xl flex items-center gap-3 ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            {message.type === 'error' ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
            <span className="font-medium">{message.text}</span>
          </div>
        )}

        {stats && (
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="p-4 bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
              Hasil Pencarian: {selectedMonth} {selectedGroup !== 'ALL' && `- Group ${selectedGroup}`}
            </div>
            
            {stats.count === 0 ? (
              <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                <CheckCircle2 className="w-12 h-12 text-green-400 mb-3" />
                <p className="text-lg font-medium text-slate-700">Database Kosong</p>
                <p>Tidak ada data utilities yang tersimpan untuk kriteria tersebut.</p>
              </div>
            ) : (
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="text-sm text-slate-500 font-medium mb-1">Total Baris Data</div>
                    <div className="text-3xl font-black text-slate-800">{stats.count.toLocaleString('id-ID')}</div>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <div className="text-sm text-blue-600 font-medium mb-1">Total Debit</div>
                    <div className="text-2xl font-bold text-blue-900">Rp {stats.totalDebit.toLocaleString('id-ID')}</div>
                  </div>
                  <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                    <div className="text-sm text-red-600 font-medium mb-1">Total Credit</div>
                    <div className="text-2xl font-bold text-red-900">Rp {stats.totalCredit.toLocaleString('id-ID')}</div>
                  </div>
                </div>

                <div className="p-6 bg-red-50 border border-red-200 rounded-xl">
                  <h3 className="text-red-800 font-bold text-lg mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" /> Zona Berbahaya
                  </h3>
                  <p className="text-red-700 text-sm mb-6 max-w-2xl">
                    Tindakan ini akan menghapus <b>seluruh baris data utilities</b> untuk bulan {selectedMonth} {selectedGroup !== 'ALL' ? `Group ${selectedGroup}` : ''} secara permanen. Lakukan ini hanya jika Anda ingin mengosongkan database sebelum melakukan Upload file Excel revisi.
                  </p>
                  
                  {!confirmDelete ? (
                    <button 
                      onClick={() => setConfirmDelete(true)}
                      className="px-6 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-sm flex items-center gap-2 transition-all"
                    >
                      <Trash2 className="w-5 h-5" /> Hapus Seluruh Data {selectedGroup !== 'ALL' ? 'Group Ini' : 'Bulan Ini'}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-red-300 shadow-sm inline-flex">
                      <span className="text-red-800 font-bold px-3">Yakin ingin menghapus {stats.count} data?</span>
                      <button 
                        onClick={() => setConfirmDelete(false)}
                        disabled={isDeleting}
                        className="px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-md hover:bg-slate-200 transition-all"
                      >
                        Batal
                      </button>
                      <button 
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="px-4 py-2 bg-red-600 text-white font-bold rounded-md hover:bg-red-700 disabled:opacity-50 transition-all"
                      >
                        {isDeleting ? 'Menghapus...' : 'Ya, Hapus Permanen!'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* RESET TOTAL DATABASE SECTION */}
        <div className="mt-12 pt-8 border-t border-slate-200">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-red-800 font-bold text-xl mb-2 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6" /> Reset Total (Semua Bulan)
              </h3>
              <p className="text-red-700 max-w-xl">
                Fitur ini akan menghapus <b>seluruh data utilities dari semua bulan dan semua grup</b> sekaligus. Sangat berguna jika Anda ingin mengulang proses dari nol dan melakukan upload Bulk yang baru secara bersih.
              </p>
            </div>
            
            <div className="flex-shrink-0">
              {!confirmDeleteAll ? (
                <button 
                  onClick={() => setConfirmDeleteAll(true)}
                  className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-sm flex items-center gap-2 transition-all"
                >
                  <Trash2 className="w-5 h-5" /> Hapus Semua Data
                </button>
              ) : (
                <div className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-red-300 shadow-sm">
                  <span className="text-red-800 font-bold text-center">Anda sangat yakin?</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setConfirmDeleteAll(false)}
                      disabled={isDeletingAll}
                      className="px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-all flex-1"
                    >
                      Batal
                    </button>
                    <button 
                      onClick={handleDeleteAll}
                      disabled={isDeletingAll}
                      className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-all flex-1"
                    >
                      {isDeletingAll ? 'Proses...' : 'Ya, Reset!'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

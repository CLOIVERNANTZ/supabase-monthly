"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Power, Plus, Trash2, ShieldAlert } from 'lucide-react';

export default function MPlus1Page() {
  const [mPlus1Data, setMPlus1Data] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newOutlet, setNewOutlet] = useState('');
  const [newCategory, setNewCategory] = useState('Listrik');

  const fetchMPlus1Data = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('a_utilities_mplus1')
        .select('*')
        .order('outlet_code', { ascending: true });
        
      if (error) throw error;
      setMPlus1Data(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMPlus1Data();
  }, []);

  const handleToggle = async (id, currentStatus) => {
    try {
      // Optimistic UI update
      setMPlus1Data(prev => prev.map(item => item.id === id ? { ...item, is_active: !currentStatus } : item));
      
      const { error } = await supabase
        .from('a_utilities_mplus1')
        .update({ is_active: !currentStatus })
        .eq('id', id);
        
      if (error) throw error;
    } catch (err) {
      console.error(err);
      // Revert on error
      fetchMPlus1Data();
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newOutlet.trim()) return;
    
    try {
      const { error } = await supabase
        .from('a_utilities_mplus1')
        .insert({
          outlet_code: newOutlet.trim().toUpperCase(),
          category: newCategory,
          is_active: true
        });
        
      if (error) {
        if (error.code === '23505') alert('Outlet dan Kategori ini sudah ada di daftar!');
        else throw error;
      } else {
        setNewOutlet('');
        setIsAdding(false);
        fetchMPlus1Data();
      }
    } catch (err) {
      console.error(err);
      alert('Gagal menambah data');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Hapus konfigurasi ini secara permanen?')) return;
    try {
      const { error } = await supabase.from('a_utilities_mplus1').delete().eq('id', id);
      if (error) throw error;
      fetchMPlus1Data();
    } catch (err) {
      console.error(err);
      alert('Gagal menghapus');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Power className="w-8 h-8 text-pink-500" />
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Manajemen M+1</h1>
              <p className="text-slate-500 text-sm">Atur utilitas mana saja yang statusnya menunggak 1 bulan (M+1)</p>
            </div>
          </div>
          
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> {isAdding ? 'Batal' : 'Tambah Baru'}
          </button>
        </div>

        {isAdding && (
          <form onSubmit={handleAdd} className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-xl flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-bold text-slate-700 mb-1">Kode Outlet</label>
              <input 
                type="text" 
                required
                value={newOutlet}
                onChange={e => setNewOutlet(e.target.value)}
                placeholder="Contoh: SGCMC"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500 font-bold uppercase"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-bold text-slate-700 mb-1">Kategori Utilitas</label>
              <select 
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500 font-bold"
              >
                <option value="Listrik">Listrik</option>
                <option value="PAM">PAM</option>
                <option value="Gas">Gas</option>
                <option value="Telp">Telp</option>
                <option value="Internet">Internet</option>
                <option value="FCU (WATER CHILLER)">FCU (WATER CHILLER)</option>
              </select>
            </div>
            <button type="submit" className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors">
              Simpan
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full py-12 text-center text-slate-500">Memuat data...</div>
          ) : mPlus1Data.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-500 flex flex-col items-center">
              <ShieldAlert className="w-12 h-12 text-slate-300 mb-3" />
              Belum ada data konfigurasi M+1.
            </div>
          ) : (
            Object.keys(mPlus1Data.reduce((acc, row) => {
              if (!acc[row.outlet_code]) acc[row.outlet_code] = [];
              acc[row.outlet_code].push(row);
              return acc;
            }, {})).sort().map(outlet => {
              const rows = mPlus1Data.filter(r => r.outlet_code === outlet);
              return (
                <div key={outlet} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                  <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 font-bold text-slate-800 text-lg flex justify-between items-center">
                    {outlet}
                  </div>
                  <div className="p-5 flex flex-col gap-4">
                    {rows.map(row => (
                      <div key={row.id} className="flex items-center justify-between pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                        <span className="text-sm font-bold text-slate-600">{row.category}</span>
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => handleToggle(row.id, row.is_active)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${row.is_active ? 'bg-pink-500' : 'bg-slate-300'}`}
                            title={row.is_active ? "Nonaktifkan M+1" : "Aktifkan M+1"}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${row.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                          <button 
                            onClick={() => handleDelete(row.id)}
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                            title="Hapus dari daftar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

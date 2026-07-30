"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Settings, MapPin, Hash, Plus, Check, UploadCloud, X } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function MasterData() {
  const [activeTab, setActiveTab] = useState('outlet');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Data states
  const [outlets, setOutlets] = useState([]);
  const [coas, setCoas] = useState([]);
  const [blanks, setBlanks] = useState([]);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState(''); // 'outlet', 'coa'
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'outlet') {
        const { data } = await supabase.from('a_master_outlet').select('*').order('outlet_code');
        setOutlets(data || []);
      } else if (activeTab === 'coa') {
        const { data } = await supabase.from('a_master_coa').select('*').order('category');
        setCoas(data || []);
      } else if (activeTab === 'blank') {
        const { data } = await supabase.from('a_utilities_master_blank').select('*').order('outlet_code');
        setBlanks(data || []);
        if (outlets.length === 0) {
          const { data: out } = await supabase.from('a_master_outlet').select('*').order('outlet_code');
          setOutlets(out || []);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleToggleGroup = async (outletId, customGroups, groupToToggle) => {
    let currentGroups = Array.isArray(customGroups) ? customGroups : [];
    let newGroups;
    if (currentGroups.includes(groupToToggle)) {
      newGroups = currentGroups.filter(g => g !== groupToToggle);
    } else {
      newGroups = [...currentGroups, groupToToggle];
    }

    try {
      const { error } = await supabase
        .from('a_master_outlet')
        .update({ custom_groups: newGroups })
        .eq('id', outletId);
      if (error) throw error;
      setOutlets(outlets.map(o => o.id === outletId ? { ...o, custom_groups: newGroups } : o));
      showMsg('Berhasil mengupdate grouping.');
    } catch (err) {
      showMsg(err.message, 'error');
    }
  };

  // CSV OUTLET UPLOAD
  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // Baca sebagai 2D array agar bisa membaca index kolom langsung (tanpa nama header)
        const rawArray = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        // Asumsi format kolom dari pengguna:
        // Index 1 = code
        // Index 2 = name
        // Index 3 = brand
        // Index 10 = pt
        // Index 11 = status
        // Index 13 = is_lifestyle
        
        let outletsToInsert = [];
        
        for (let i = 1; i < rawArray.length; i++) { // mulai dari 1 untuk melewati judul
          const row = rawArray[i];
          if (!row || row.length === 0) continue;
          
          const code = row[1];
          if (!code) continue; // Wajib ada kode
          
          const status = row[11] ? String(row[11]).toUpperCase().trim() : '';
          if (status === 'CLOSED') continue; // Abaikan jika CLOSED
          
          const name = row[2] || '';
          const brand = row[3] || '';
          const pt = row[10] || '';
          const isLifestyle = row[13] === 'TRUE' || row[13] === true || row[13] === 1;
          
          let customGroups = [];
          if (isLifestyle) customGroups.push('LIFESTYLE');
          if (brand === 'SH') customGroups.push('SH');
          if (brand === 'SG') customGroups.push('SG');
          
          outletsToInsert.push({
            outlet_code: code,
            outlet_name: name,
            brand_name: brand,
            pt_name: pt,
            custom_groups: customGroups
          });
        }
        
        if (outletsToInsert.length === 0) {
          showMsg('Tidak ada data valid yang bisa dimasukkan.', 'error');
          return;
        }

        const { error: errO } = await supabase
          .from('a_master_outlet')
          .upsert(outletsToInsert, { onConflict: 'outlet_code' });
          
        if (errO) throw errO;
        
        showMsg(`Berhasil mengupload ${outletsToInsert.length} outlet dari CSV.`);
        fetchData();
      } catch (err) {
        showMsg('Error upload CSV: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (modalType === 'outlet') {
        const { error } = await supabase.from('a_master_outlet').insert([
          { 
            outlet_code: formData.code, 
            outlet_name: formData.name, 
            pt_name: formData.pt_name, 
            brand_name: formData.brand_name 
          }
        ]);
        if (error) throw error;
        showMsg('Outlet berhasil ditambah');
      } else if (modalType === 'coa') {
        const { error } = await supabase.from('a_master_coa').insert([
          { coa_code: formData.code, category: formData.category }
        ]);
        if (error) throw error;
        showMsg('COA berhasil ditambah');
      } else if (modalType === 'blank') {
        if (!formData.outlet_code || !formData.categories || formData.categories.length === 0) {
           showMsg('Outlet dan minimal 1 kategori harus dipilih', 'error');
           setLoading(false);
           return;
        }
        const insertData = formData.categories.map(c => ({
          outlet_code: formData.outlet_code,
          category: c
        }));
        
        const { error } = await supabase.from('a_utilities_master_blank').insert(insertData);
        if (error) throw error;
        showMsg('Konfigurasi Blank berhasil ditambah');
      }
      setShowModal(false);
      setFormData({});
      fetchData();
    } catch (err) {
      showMsg(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBlank = async (id) => {
    if (!confirm('Hapus konfigurasi blank ini?')) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('a_utilities_master_blank').delete().eq('id', id);
      if (error) throw error;
      showMsg('Berhasil menghapus konfigurasi blank');
      fetchData();
    } catch (err) {
      showMsg(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (type) => {
    setModalType(type);
    setFormData(type === 'blank' ? { categories: [] } : {});
    setShowModal(true);
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex gap-4 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('outlet')}
          className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'outlet' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <MapPin className="w-4 h-4" /> Master Outlet
        </button>
        <button 
          onClick={() => setActiveTab('coa')}
          className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'coa' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <Hash className="w-4 h-4" /> Master COA
        </button>
        <button 
          onClick={() => setActiveTab('blank')}
          className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'blank' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <Check className="w-4 h-4" /> Blank
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-xl ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message.text}
        </div>
      )}

      {loading && !showModal ? (
        <div className="py-20 text-center text-slate-500">Memuat data...</div>
      ) : (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          
          {activeTab === 'outlet' && (
            <div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h2 className="text-lg font-bold text-slate-800">Daftar Outlet</h2>
                <div className="flex gap-2">
                  <div className="relative">
                    <input 
                      type="file" 
                      accept=".csv,.xlsx" 
                      onChange={handleCSVUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      title="Upload CSV Outlet"
                    />
                    <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 pointer-events-none">
                      <UploadCloud className="w-4 h-4" /> Import CSV
                    </button>
                  </div>
                  <button onClick={() => openModal('outlet')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                    <Plus className="w-4 h-4" /> Tambah Outlet
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-500">Kode</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-500">Nama Outlet</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-500">PT</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-500">Brand</th>
                      <th className="px-4 py-3 text-center font-medium text-slate-500">SH</th>
                      <th className="px-4 py-3 text-center font-medium text-slate-500">SG</th>
                      <th className="px-4 py-3 text-center font-medium text-slate-500">LIFESTYLE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {outlets.map(out => {
                      const cgroups = Array.isArray(out.custom_groups) ? out.custom_groups : [];
                      return (
                        <tr key={out.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{out.outlet_code}</td>
                          <td className="px-4 py-3 text-slate-600">{out.outlet_name}</td>
                          <td className="px-4 py-3 text-slate-600">{out.pt_name || '-'}</td>
                          <td className="px-4 py-3 text-slate-600">{out.brand_name || '-'}</td>
                          {['SH', 'SG', 'LIFESTYLE'].map(grp => (
                            <td key={grp} className="px-4 py-3 text-center">
                              <button 
                                onClick={() => handleToggleGroup(out.id, out.custom_groups, grp)}
                                className={`w-6 h-6 rounded flex items-center justify-center mx-auto border transition-colors ${cgroups.includes(grp) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-transparent hover:border-blue-400'}`}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {outlets.length === 0 && (
                      <tr>
                        <td colSpan="7" className="px-4 py-8 text-center text-slate-500">Belum ada data Outlet. Silakan upload CSV atau tambah data.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'coa' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-slate-800">Mapping COA Utilitas</h2>
                <button onClick={() => openModal('coa')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                  <Plus className="w-4 h-4" /> Tambah COA
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-500">Kode COA (5 Digit)</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-500">Kategori Utilitas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {coas.map(coa => (
                      <tr key={coa.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{coa.coa_code}</td>
                        <td className="px-4 py-3">
                          <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200">
                            {coa.category}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {coas.length === 0 && (
                      <tr>
                        <td colSpan="2" className="px-4 py-8 text-center text-slate-500">Belum ada data COA. Gunakan script SQL untuk inisiasi.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'blank' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-slate-800">Daftar Utilitas Blank</h2>
                <button onClick={() => openModal('blank')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                  <Plus className="w-4 h-4" /> Tambah Blank
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-500">Outlet Code</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-500">Kategori Utilitas</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {blanks.map(b => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{b.outlet_code}</td>
                        <td className="px-4 py-3">
                          <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-200">
                            {b.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleDeleteBlank(b.id)} className="text-red-500 hover:text-red-700 font-medium text-xs">
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                    {blanks.length === 0 && (
                      <tr>
                        <td colSpan="3" className="px-4 py-8 text-center text-slate-500">Belum ada data Blank.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL / POPUP */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">
                Tambah {modalType === 'outlet' ? 'Outlet' : modalType === 'coa' ? 'COA' : 'Blank'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-4 space-y-4">
              {modalType !== 'blank' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kode</label>
                  <input required type="text" value={formData.code || ''} onChange={e => setFormData({...formData, code: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              )}
              
              {modalType === 'outlet' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nama</label>
                    <input required type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">PT Name</label>
                    <input type="text" value={formData.pt_name || ''} onChange={e => setFormData({...formData, pt_name: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Opsional" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Brand Name</label>
                    <input type="text" value={formData.brand_name || ''} onChange={e => setFormData({...formData, brand_name: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Opsional" />
                  </div>
                </>
              )}

              {modalType === 'coa' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kategori</label>
                  <select required value={formData.category || ''} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">-- Pilih Kategori --</option>
                    {['Listrik', 'PAM', 'Gas', 'FCU (WATER CHILLER)', 'Telp', 'Internet'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              {modalType === 'blank' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Outlet</label>
                    <select required value={formData.outlet_code || ''} onChange={e => setFormData({...formData, outlet_code: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                      <option value="">-- Pilih Outlet --</option>
                      {outlets.map(o => <option key={o.outlet_code} value={o.outlet_code}>{o.outlet_code} - {o.outlet_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Kategori (Pilih Beberapa)</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Listrik', 'PAM', 'Gas', 'FCU (WATER CHILLER)', 'Telp', 'Internet'].map(c => (
                        <label key={c} className="flex items-center gap-2 text-sm text-slate-700 border p-2 rounded-lg cursor-pointer hover:bg-slate-50">
                          <input 
                            type="checkbox" 
                            checked={(formData.categories || []).includes(c)}
                            onChange={(e) => {
                              const curr = formData.categories || [];
                              if (e.target.checked) {
                                setFormData({...formData, categories: [...curr, c]});
                              } else {
                                setFormData({...formData, categories: curr.filter(x => x !== c)});
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          {c}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50">Batal</button>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

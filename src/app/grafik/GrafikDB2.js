import React, { useState, useEffect, useMemo } from 'react';
import { supabase2 } from '@/lib/supabase2'; 
import { 
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { TrendingUp, Activity, Maximize2 } from 'lucide-react';

const generateSearchPeriods = (targetYear) => {
  if (!targetYear) return [];
  const yy = String(targetYear);
  const yShort = yy.slice(-2);
  
  const arrBulanUP = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"];
  let periods = [];
  
  for (let i = 0; i < 12; i++) {
    const mmStr = String(i + 1).padStart(2, '0');
    periods.push(`${yy}-${mmStr}`);
    periods.push(`${arrBulanUP[i]} ${yShort}`, `${arrBulanUP[i]} ${yy}`);
    periods.push(`${arrBulanUP[i]}-${yShort}`, `${arrBulanUP[i]}-${yy}`);
  }
  return periods;
};

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];
const KNOWN_COLORS = {
  'UEL': '#3b82f6', // Blue
  'UWT': '#10b981', // Green
  'UGS': '#ef4444', // Red
  'UEL GDG': '#f59e0b', // Yellow/Orange
};

const getUtilColor = (util, index) => {
  return KNOWN_COLORS[util] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
};

export default function GrafikDB2({ selectedOutlets = [], targetYear = '' }) {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [availableUtils, setAvailableUtils] = useState([]);
  
  const MAIN_UTILS = ['UEL', 'UEL GDG', 'UWT', 'UGS', 'PEM.LISTRIK'];
  const [selectedUtils, setSelectedUtils] = useState(MAIN_UTILS);
  const [selectedMetrics, setSelectedMetrics] = useState(['total', 'usage', 'tarif']);

  const [debugRow, setDebugRow] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      if (!selectedOutlets.length || !targetYear) {
        if (isMounted) {
            setRawData([]);
            setAvailableUtils([]);
        }
        return;
      }

      setLoading(true);
      setError(null);
      setDebugRow(null);

      // Gunakan ilike agar lebih kebal terhadap salah penulisan kapital/kecil
      const shortYear = targetYear.slice(-2);

      try {
        if (!supabase2) {
          throw new Error("Konfigurasi DB2 (NEXT_PUBLIC_SUPABASE_URL_2) tidak ditemukan di environment production.");
        }

        const { data, error: fetchError } = await supabase2
          .from('payments')
          .select('outlet, utility, totalNet, totalInv, tarif, usage, periode, status')
          .in('outlet', selectedOutlets)
          .or(`periode.ilike.%${targetYear}%,periode.ilike.%${shortYear}%`);

        if (fetchError) throw fetchError;
        
        const validData = (data || []).filter(row => 
          row.status !== 'REJECTED' && row.status !== 'VOID'
        );

        if (isMounted) {
            setRawData(validData);
            
            if (validData.length === 0) {
              // Jika kosong, kita coba fetch 1 baris bebas dari DB2 untuk melihat wujud datanya
              const { data: dbg, error: dbgErr } = await supabase2.from('payments').select('*').limit(1);
              setDebugRow({ 
                 status: 'EXECUTED', 
                 dataLength: dbg ? dbg.length : 0, 
                 error: dbgErr, 
                 sampleData: dbg && dbg.length > 0 ? dbg[0] : null 
              });
            }

            // Extract unique utilities
            const utils = [...new Set(validData.map(r => r.utility).filter(Boolean))];
            setAvailableUtils(utils);
        }
      } catch (err) {
        console.error('Error fetching DB2:', err);
        if (isMounted) setError(err.message || JSON.stringify(err));
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [selectedOutlets, targetYear]);

  const toggleMetric = (metric) => {
    setSelectedMetrics(prev => 
      prev.includes(metric) ? prev.filter(m => m !== metric) : [...prev, metric]
    );
  };

  const toggleUtil = (util) => {
    setSelectedUtils(prev => 
      prev.includes(util) ? prev.filter(u => u !== util) : [...prev, util]
    );
  };

  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  const { chartData, summary } = useMemo(() => {
    const aggregated = monthLabels.map(month => ({ name: month }));
    
    // Initialize structure
    availableUtils.forEach(util => {
        aggregated.forEach(m => {
            m[`${util}_total`] = 0;
            m[`${util}_usage`] = 0;
            m[`${util}_tarif`] = 0;
        });
    });

    let ytdTotal = 0;
    let monthTotals = new Array(12).fill(0);

    rawData.forEach(row => {
      if (!selectedUtils.includes(row.utility)) return; // Only process selected utils

      const util = row.utility;
      // Gunakan totalInv (Total Invoice / tagihan akhir) sebagai prioritas utama
      // karena totalNet belum termasuk pajak
      const nominalTotal = Number(row.totalInv) || Number(row.totalNet) || 0;
      const nominalUsage = Number(row.usage) || 0;
      const nominalTarif = Number(row.tarif) || 0;
      
      let monthIdx = -1;
      const str = String(row.periode || "").toUpperCase();

      if (str.includes('-') && /^\d{4}-\d{2}$/.test(str.substring(0,7))) {
        monthIdx = parseInt(str.split('-')[1], 10) - 1; 
      } else {
        const monthNamesID = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"];
        for (let i = 0; i < 12; i++) {
          if (str.includes(monthNamesID[i])) {
            monthIdx = i;
            break;
          }
        }
      }
      
      if (monthIdx >= 0 && monthIdx < 12) {
        aggregated[monthIdx][`${util}_total`] += nominalTotal;
        aggregated[monthIdx][`${util}_usage`] += nominalUsage;
        
        // For Tarif, if multiple rows in same month, take average or max? Usually max or just override. 
        // We'll just take max for now to avoid summing rates.
        aggregated[monthIdx][`${util}_tarif`] = Math.max(aggregated[monthIdx][`${util}_tarif`], nominalTarif);

        ytdTotal += nominalTotal;
        monthTotals[monthIdx] += nominalTotal;
      }
    });

    // Calculate Summary
    const activeMonthsCount = monthTotals.filter(t => t > 0).length;
    const avgMonthly = activeMonthsCount > 0 ? ytdTotal / activeMonthsCount : 0;
    
    let maxMonthValue = -1;
    let maxMonthIdx = -1;
    monthTotals.forEach((val, idx) => {
        if (val > maxMonthValue) {
            maxMonthValue = val;
            maxMonthIdx = idx;
        }
    });

    return { 
        chartData: aggregated, 
        summary: {
            ytd: ytdTotal,
            avg: avgMonthly,
            highestValue: maxMonthValue > 0 ? maxMonthValue : 0,
            highestMonth: maxMonthIdx >= 0 ? monthLabels[maxMonthIdx] : '-',
            activeMonths: activeMonthsCount
        }
    };
  }, [rawData, selectedUtils]);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const formatShortRp = (val) => {
    if (val === 0) return '0';
    if (val >= 1e9) return `${(val / 1e9).toFixed(1)} M`;
    if (val >= 1e6) return `${(val / 1e6).toFixed(1)} Jt`;
    return `${val.toLocaleString('id-ID')}`;
  };

  const formatNumber = (val) => {
    return (val || 0).toLocaleString('id-ID');
  };

  // Extract visible known utils vs "Lainnya"
  const otherUtils = availableUtils.filter(u => !MAIN_UTILS.includes(u));
  // Render main utils explicitly so they always appear as checkboxes
  const visibleUtilsToRender = MAIN_UTILS;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white p-4 rounded-lg shadow-xl text-xs min-w-[200px]">
          <p className="font-bold mb-2 pb-2 border-b border-slate-700">{label}</p>
          {payload.map((entry, index) => {
             const key = entry.dataKey;
             const parts = key.split('_');
             const util = parts.slice(0, -1).join('_');
             const metric = parts[parts.length - 1];
             
             let formattedVal = entry.value;
             if (metric === 'total' || metric === 'tarif') formattedVal = formatCurrency(entry.value);
             else if (metric === 'usage') formattedVal = formatNumber(entry.value);

             return (
               <div key={index} className="flex items-center gap-2 my-1">
                 <span 
                   className="w-2 h-2 rounded-full flex-shrink-0" 
                   style={{ backgroundColor: entry.color }}
                 ></span>
                 <span className="font-semibold text-slate-300">{util} - {metric === 'total' ? 'Total (Rp)' : metric === 'usage' ? 'Usage' : 'Tarif'}:</span>
                 <span className="ml-auto text-right font-mono">{formattedVal}</span>
               </div>
             );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full mt-8 p-6 bg-white rounded-xl shadow-sm border border-slate-200 font-sans">
      
      {/* SECTION 1: FILTERS */}
      <div className="flex flex-col xl:flex-row justify-between items-start gap-6 border-b border-slate-100 pb-6 mb-6">
        
        {/* Utility Filters */}
        <div>
           <div className="text-[10px] font-bold text-slate-400 tracking-wider mb-3 uppercase">Pilih Utilitas</div>
           <div className="flex flex-wrap items-center gap-3">
             {visibleUtilsToRender.map(util => (
                <label key={util} className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 transition-colors">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    checked={selectedUtils.includes(util)}
                    onChange={() => toggleUtil(util)}
                  />
                  <span className="text-xs font-semibold text-slate-700">{util}</span>
                </label>
             ))}
             
             {otherUtils.length > 0 && (
                <div className="relative group">
                   <button className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-700">
                     Utilitas Lainnya...
                   </button>
                   <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 p-2">
                     {otherUtils.map(util => (
                        <label key={util} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 text-blue-600 rounded border-slate-300"
                            checked={selectedUtils.includes(util)}
                            onChange={() => toggleUtil(util)}
                          />
                          <span className="text-xs text-slate-700">{util}</span>
                        </label>
                     ))}
                   </div>
                </div>
             )}
           </div>
        </div>

        {/* Metric Filters */}
        <div>
           <div className="text-[10px] font-bold text-slate-400 tracking-wider mb-3 uppercase">Metrik Penilaian</div>
           <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                <input type="checkbox" className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" checked={selectedMetrics.includes('total')} onChange={() => toggleMetric('total')} />
                <span className="text-xs font-semibold text-slate-700">Total (Rp)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                <input type="checkbox" className="w-4 h-4 text-emerald-500 rounded focus:ring-emerald-500" checked={selectedMetrics.includes('usage')} onChange={() => toggleMetric('usage')} />
                <span className="text-xs font-semibold text-slate-700">Usage</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                <input type="checkbox" className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500" checked={selectedMetrics.includes('tarif')} onChange={() => toggleMetric('tarif')} />
                <span className="text-xs font-semibold text-slate-700">Tarif</span>
              </label>
           </div>
        </div>

      </div>

      {loading && (
        <div className="flex justify-center items-center h-64 text-blue-500 font-medium">
          <Activity className="animate-pulse mr-3 h-5 w-5" /> Memuat data DB2...
        </div>
      )}

      {error && (
        <div className="p-4 mb-4 text-red-700 bg-red-50 rounded-lg border border-red-200 text-sm">
          <span className="font-bold">Gagal memuat data:</span> {error}
        </div>
      )}

      {!loading && !error && rawData.length === 0 && debugRow && (
        <div className="p-5 mb-8 bg-amber-50 border border-amber-200 rounded-lg">
          <h4 className="font-bold text-amber-800 mb-2">Mode Debugging Aktif</h4>
          <p className="text-sm text-amber-700 mb-4">
            Grafik kosong karena tidak ada data yang cocok dengan Outlet: <b>{selectedOutlets.join(', ')}</b> dan Tahun <b>{targetYear}</b>.
          </p>
          <div className="mb-2 text-sm font-semibold text-amber-800">
            Hasil Uji Coba Tarik 1 Data Acak (Tanpa Filter):
          </div>
          <pre className="bg-amber-100 p-3 rounded text-xs text-amber-900 overflow-x-auto font-mono border border-amber-200">
            Jumlah Data Ditemukan: {debugRow.dataLength}{'\n'}
            Error Supabase: {JSON.stringify(debugRow.error, null, 2)}{'\n'}
            Contoh Data: {JSON.stringify(debugRow.sampleData, null, 2)}
          </pre>
          {debugRow.dataLength === 0 && (
            <p className="text-sm text-red-600 mt-4 font-semibold">
              ⚠️ Peringatan: Bahkan ketika kita tidak memakai filter apa-apa, Supabase mengembalikan 0 baris data!
              Ini berarti antara tabel "payments" memang benar-benar kosong di database, ATAU Policy RLS "Izinkan Read Payments" Anda memiliki aturan bersyarat (klausa USING) yang diam-diam menyembunyikan datanya dari pengguna anonim.
            </p>
          )}
          {debugRow.dataLength > 0 && (
            <p className="text-sm text-amber-700 mt-4">
              <b>Solusi:</b> Perhatikan bagian <code>"outlet"</code> pada contoh data di atas. Samakan teks tersebut ke dalam menu <b>Master Data -&gt; Nama DB 2</b> agar filternya cocok!
            </p>
          )}
        </div>
      )}

      {!loading && !error && rawData.length > 0 && (
        <>


          {/* SECTION 3: MATRIX DATA TABLE */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm mb-8">
            <table className="min-w-full text-[10px] text-left">
              <thead className="text-[10px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200 tracking-wider">
                <tr>
                  <th className="px-2 py-2 font-bold border-r border-slate-200 bg-slate-100">Utilitas</th>
                  <th className="px-2 py-2 font-bold border-r border-slate-200 bg-slate-100">Metrik</th>
                  {monthLabels.map(m => (
                    <th key={m} className="px-1 py-2 font-bold text-center">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {selectedUtils.map((util, index) => (
                  <React.Fragment key={util}>
                    
                    {selectedMetrics.includes('total') && (
                      <tr className="hover:bg-slate-50">
                        <td className="px-2 py-1.5 font-bold text-slate-800 border-r border-slate-100 bg-slate-50/50" rowSpan={selectedMetrics.length}>
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getUtilColor(util, index) }}></span>
                            {util}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 font-semibold text-slate-600 border-r border-slate-100">Total (Rp)</td>
                        {monthLabels.map((_, i) => {
                          const val = chartData[i][`${util}_total`];
                          return (
                            <td key={i} className="px-1 py-1.5 text-right tabular-nums text-slate-700">
                              {val > 0 ? formatNumber(val) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    )}

                    {selectedMetrics.includes('usage') && (
                      <tr className="hover:bg-slate-50">
                        {!selectedMetrics.includes('total') && (
                           <td className="px-2 py-1.5 font-bold text-slate-800 border-r border-slate-100 bg-slate-50/50" rowSpan={selectedMetrics.length}>
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getUtilColor(util, index) }}></span>
                              {util}
                            </div>
                           </td>
                        )}
                        <td className="px-2 py-1.5 font-semibold text-slate-600 border-r border-slate-100">Usage</td>
                        {monthLabels.map((_, i) => {
                          const val = chartData[i][`${util}_usage`];
                          return (
                            <td key={i} className="px-1 py-1.5 text-right tabular-nums text-emerald-600 font-medium">
                              {val > 0 ? formatNumber(val) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    )}

                    {selectedMetrics.includes('tarif') && (
                      <tr className="hover:bg-slate-50">
                        {!selectedMetrics.includes('total') && !selectedMetrics.includes('usage') && (
                           <td className="px-2 py-1.5 font-bold text-slate-800 border-r border-slate-100 bg-slate-50/50" rowSpan={selectedMetrics.length}>
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getUtilColor(util, index) }}></span>
                              {util}
                            </div>
                           </td>
                        )}
                        <td className="px-2 py-1.5 font-semibold text-slate-600 border-r border-slate-100">Tarif</td>
                        {monthLabels.map((_, i) => {
                          const val = chartData[i][`${util}_tarif`];
                          return (
                            <td key={i} className="px-1 py-1.5 text-right tabular-nums text-amber-600 font-medium">
                              {val > 0 ? formatNumber(val) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    )}

                  </React.Fragment>
                ))}
                
                {selectedUtils.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-4 py-8 text-center text-slate-400">
                      Pilih setidaknya satu utilitas untuk melihat data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* SECTION 4: COMPOSED CHART */}
          <div className="h-[400px] w-full mb-8 relative">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                
                {selectedMetrics.includes('total') && (
                  <YAxis 
                    yAxisId="left" 
                    orientation="left" 
                    tickFormatter={formatShortRp} 
                    tick={{ fill: '#64748b', fontSize: 11 }} 
                    axisLine={false} 
                    tickLine={false}
                    width={80}
                  />
                )}
                
                {(selectedMetrics.includes('usage') || selectedMetrics.includes('tarif')) && (
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    tickFormatter={formatNumber}
                    tick={{ fill: '#64748b', fontSize: 11 }} 
                    axisLine={false} 
                    tickLine={false}
                    width={60}
                  />
                )}

                <Tooltip content={<CustomTooltip />} />
                
                <Legend 
                  verticalAlign="top" 
                  align="right" 
                  wrapperStyle={{ paddingBottom: '10px', fontSize: '10px', fontWeight: 500 }}
                  iconType="circle"
                />

                {/* Render Series per Utility */}
                {selectedUtils.map((util, index) => {
                  const color = getUtilColor(util, index);
                  return (
                    <React.Fragment key={util}>
                      {selectedMetrics.includes('total') && (
                        <Bar 
                          yAxisId="left"
                          dataKey={`${util}_total`} 
                          name={`${util} - Total (Rp)`} 
                          fill={color} 
                          radius={[4, 4, 0, 0]}
                          barSize={32}
                          fillOpacity={0.8}
                        />
                      )}
                      
                      {selectedMetrics.includes('usage') && (
                        <Line 
                          yAxisId="right"
                          type="monotone" 
                          dataKey={`${util}_usage`} 
                          name={`${util} - Usage`}
                          stroke={color} 
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={{ r: 4, fill: color, strokeWidth: 0 }}
                          activeDot={{ r: 6 }}
                        />
                      )}

                      {selectedMetrics.includes('tarif') && (
                        <Line 
                          yAxisId="right"
                          type="stepAfter" 
                          dataKey={`${util}_tarif`} 
                          name={`${util} - Tarif`}
                          stroke={color} 
                          strokeWidth={2}
                          dot={{ r: 4, fill: '#fff', strokeWidth: 2, stroke: color }}
                          activeDot={{ r: 6 }}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* SECTION 2: SUMMARY CARDS (MOVED TO BOTTOM) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 flex flex-col justify-between">
               <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">TOTAL TAGIHAN (YTD)</div>
               <div className="text-2xl font-black text-slate-800">{formatCurrency(summary.ytd)}</div>
               <div className="text-xs text-slate-400 mt-2">Total pengeluaran tahun ini</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 flex flex-col justify-between">
               <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">RATA-RATA BULANAN</div>
               <div className="text-2xl font-black text-slate-800">{formatCurrency(summary.avg)}</div>
               <div className="text-xs text-slate-400 mt-2">Rata-rata dari {summary.activeMonths} bulan aktif</div>
            </div>
            <div className="bg-red-50 rounded-xl p-5 border border-red-100 flex flex-col justify-between relative overflow-hidden">
               <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">BULAN TERTINGGI</div>
               <div className="text-2xl font-black text-red-600">{summary.highestMonth}</div>
               <div className="text-xs font-semibold text-red-500 mt-2">{formatCurrency(summary.highestValue)}</div>
               <TrendingUp className="absolute -right-4 -bottom-4 w-24 h-24 text-red-100 opacity-50" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

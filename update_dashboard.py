import re

with open('src/app/page.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_td = """                          <tr key={idx} className={`hover:bg-slate-50 transition-colors ${isInactive ? 'opacity-50 grayscale' : ''}`}>
                            <td className={`px-4 py-2 whitespace-nowrap text-xs font-bold bg-white sticky left-0 z-10 border-r border-b border-slate-200 ${isInactive ? 'text-slate-400' : 'text-slate-700'}`}>
                              {row.Outlet}
                            </td>"""

new_td = """                          <tr key={idx} className={`hover:bg-slate-50 transition-colors ${isInactive ? 'opacity-50 grayscale' : ''}`}>
                            <td className={`px-4 py-2 whitespace-nowrap text-xs font-bold bg-white sticky left-0 z-10 border-r border-b border-slate-200 relative group/outlet ${isInactive ? 'text-slate-400' : 'text-slate-700'}`}>
                              {notesMap[`${row.Outlet}-SUMMARY`]?.note && (
                                <div className="absolute top-0 left-0 w-0 h-0 border-t-[8px] border-r-[8px] border-t-yellow-500 border-r-transparent"></div>
                              )}
                              {notesMap[`${row.Outlet}-SUMMARY`]?.note && (
                                <div className="hidden group-hover/outlet:block absolute z-20 top-full left-0 mt-1 w-48 p-2 bg-yellow-50 text-slate-700 text-xs font-normal text-left rounded shadow-lg border border-yellow-200 whitespace-normal pointer-events-none">
                                  <span className="font-bold block mb-1">Catatan Ringkasan:</span>
                                  {notesMap[`${row.Outlet}-SUMMARY`].note}
                                </div>
                              )}
                              {row.Outlet}
                            </td>"""

if old_td in content:
    content = content.replace(old_td, new_td)
    with open('src/app/page.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replaced Outlet cell')
else:
    print('Did not find Outlet cell exact match')

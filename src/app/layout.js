import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Utilities Dashboard',
  description: 'Analisis Biaya Utilitas',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="bg-slate-50 text-slate-900 min-h-screen flex flex-col">
        <header className="bg-white/70 backdrop-blur-md sticky top-0 z-50 border-b border-slate-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16 w-full">
                <div className="flex items-center gap-6">
                  {/* Dropdown Menu */}
                  <div className="relative group cursor-pointer">
                    <div className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center gap-1">
                      Utilities Analytics
                      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                    <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-200 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                      <Link href="/upload" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 border-b border-slate-100">Upload Data</Link>
                      <Link href="/perubahan" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 border-b border-slate-100">Perubahan Data</Link>
                      <Link href="/mplus1" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 border-b border-slate-100">M+1 Management</Link>
                      <Link href="/master" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 border-b border-slate-100">Master Data</Link>
                      <Link href="/riwayat" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 border-b border-slate-100">Riwayat Revisi</Link>
                      <Link href="/raw" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600">Raw Data</Link>
                    </div>
                  </div>
                  
                  <nav className="hidden md:flex space-x-1">
                    <Link href="/" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-100 transition-colors">
                      Dashboard
                    </Link>
                    <Link href="/analisa" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-100 transition-colors">
                      Analisa
                    </Link>
                    <Link href="/count" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-100 transition-colors">
                      Count
                    </Link>
                    <Link href="/grafik" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-100 transition-colors">
                      Grafik
                    </Link>
                  </nav>
                </div>
            </div>
          </div>
        </header>
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}

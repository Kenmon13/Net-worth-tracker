import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import TrackerPage from './pages/TrackerPage';
import StocksPage from './pages/StocksPage';
import HistoryPage from './pages/HistoryPage';
import LoginPage from './pages/LoginPage';
import { isLoggedIn, clearToken } from './auth';
import { getMe } from './api';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppLayout() {
  const [username, setUsername] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedIn()) {
      getMe().then(u => setUsername(u.username)).catch(() => {});
    }
  }, []);

  const handleLogout = () => {
    clearToken();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? 'bg-indigo-500 text-white'
        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
    }`;

  const mobileNavClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-0.5 py-2 px-3 text-xs transition-colors ${
      isActive ? 'text-indigo-400' : 'text-slate-500'
    }`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex">
      {/* Desktop sidebar */}
      <nav className="hidden md:flex w-48 shrink-0 bg-slate-900 border-r border-slate-800 p-4 flex-col gap-2 sticky top-0 h-screen">
        <div className="text-lg font-bold text-white mb-4">Net Worth</div>
        <NavLink to="/" end className={navLinkClass}>Assets</NavLink>
        <NavLink to="/stocks" className={navLinkClass}>Stocks</NavLink>
        <NavLink to="/history" className={navLinkClass}>History</NavLink>
      </nav>
      <div className="flex-1 min-w-0 flex flex-col pb-16 md:pb-0">
        <div className="flex justify-end items-center gap-3 px-4 md:px-6 py-3">
          {username && (
            <span className="text-sm text-slate-400">{username}</span>
          )}
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-md border border-slate-700 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            Logout
          </button>
        </div>
        <div className="flex-1 max-w-[1100px] mx-auto px-4 md:px-6 pb-6 w-full">
        <Routes>
          <Route path="/" element={<ProtectedRoute><TrackerPage /></ProtectedRoute>} />
          <Route path="/stocks" element={<ProtectedRoute><StocksPage /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
        </Routes>
        </div>
      </div>
      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex justify-around items-center z-50 safe-bottom">
        <NavLink to="/" end className={mobileNavClass}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          <span>Assets</span>
        </NavLink>
        <NavLink to="/stocks" className={mobileNavClass}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          <span>Stocks</span>
        </NavLink>
        <NavLink to="/history" className={mobileNavClass}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>History</span>
        </NavLink>
      </nav>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<AppLayout />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

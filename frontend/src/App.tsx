import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import TrackerPage from './pages/TrackerPage';
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex">
      <nav className="w-48 shrink-0 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-2 sticky top-0 h-screen">
        <div className="text-lg font-bold text-white mb-4">Net Worth</div>
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `px-3 py-2 rounded-md text-sm transition-colors ${
              isActive
                ? 'bg-indigo-500 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`
          }
        >
          Assets
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md text-sm transition-colors ${
              isActive
                ? 'bg-indigo-500 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`
          }
        >
          History
        </NavLink>
      </nav>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex justify-end items-center gap-3 px-6 py-3">
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
        <div className="flex-1 max-w-[1100px] mx-auto px-6 pb-6">
        <Routes>
          <Route path="/" element={<ProtectedRoute><TrackerPage /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
        </Routes>
        </div>
      </div>
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

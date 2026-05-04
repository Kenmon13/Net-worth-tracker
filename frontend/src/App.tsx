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
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-[1100px] mx-auto px-6 py-6">
        <nav className="flex gap-3 mb-6 items-center">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-4 py-1.5 rounded-md border text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-500 text-white border-indigo-500'
                  : 'border-slate-700 text-indigo-300 hover:bg-slate-800'
              }`
            }
          >
            Tracker
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) =>
              `px-4 py-1.5 rounded-md border text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-500 text-white border-indigo-500'
                  : 'border-slate-700 text-indigo-300 hover:bg-slate-800'
              }`
            }
          >
            History
          </NavLink>
          <div className="ml-auto flex items-center gap-3">
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
        </nav>
        <Routes>
          <Route path="/" element={<ProtectedRoute><TrackerPage /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
        </Routes>
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

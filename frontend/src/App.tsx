import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import TrackerPage from './pages/TrackerPage';
import HistoryPage from './pages/HistoryPage';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-200">
        <div className="max-w-[1100px] mx-auto px-6 py-6">
          <nav className="flex gap-3 mb-6">
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
          </nav>
          <Routes>
            <Route path="/" element={<TrackerPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;

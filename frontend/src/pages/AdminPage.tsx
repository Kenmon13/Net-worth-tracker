import { useEffect, useState } from 'react';
import * as api from '../api';
import type { AdminUser } from '../api';

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAdminUsers()
      .then(setUsers)
      .catch(() => setError('Failed to load users. Admin access required.'));
  }, []);

  if (error) {
    return (
      <>
        <h1 className="text-3xl font-bold mb-1">Admin</h1>
        <p className="text-red-400 mt-4">{error}</p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-3xl font-bold mb-1">Admin</h1>
      <p className="text-slate-400 mb-6">Registered users ({users.length})</p>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-6 px-5 py-3 border-b border-slate-700 text-[11px] text-slate-500 uppercase">
          <div>ID</div>
          <div>Username</div>
          <div>Role</div>
          <div>Registered</div>
        </div>
        {users.map((u) => (
          <div key={u.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-6 px-5 py-3 border-b border-slate-700/50 text-sm last:border-b-0">
            <div className="text-slate-500">{u.id}</div>
            <div className="text-slate-200 font-medium">{u.username}</div>
            <div>{u.is_admin ? <span className="text-indigo-400 text-xs font-semibold">Admin</span> : <span className="text-slate-500 text-xs">User</span>}</div>
            <div className="text-slate-400 text-xs">{u.created_at ? new Date(u.created_at + 'Z').toLocaleDateString() : '—'}</div>
          </div>
        ))}
      </div>
    </>
  );
}

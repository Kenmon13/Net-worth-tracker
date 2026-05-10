import { useEffect, useState } from 'react';
import * as api from '../api';
import type { AdminUser } from '../api';

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');

  const refresh = () => {
    api.getAdminUsers()
      .then(setUsers)
      .catch(() => setError('Failed to load users. Admin access required.'));
  };

  useEffect(() => { refresh(); }, []);

  async function handleDelete(user: AdminUser) {
    if (!confirm(`Delete user "${user.username}" and all their data? This cannot be undone.`)) return;
    try {
      await api.deleteAdminUser(user.id);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete user');
    }
  }

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
      <div className="flex items-center gap-4 mb-6">
        <p className="text-slate-400">Registered users ({users.length})</p>
        <button
          onClick={async () => {
            const result = await api.resetIdCounter();
            alert(`ID counter reset. Next new user will be ID ${result.next_id}.`);
          }}
          className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-md text-xs"
        >
          Reset ID Counter
        </button>
      </div>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 mb-5">
        <div className="text-lg font-semibold text-slate-200 mb-1">Total Users</div>
        <div className="text-3xl font-bold text-indigo-400">{users.length}</div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="grid grid-cols-[40px_1fr_60px_100px_70px] gap-x-4 px-5 py-3 border-b border-slate-700 text-[11px] text-slate-500 uppercase">
          <div>ID</div>
          <div>Username</div>
          <div>Role</div>
          <div>Registered</div>
          <div></div>
        </div>
        {users.map((u) => (
          <div key={u.id} className="grid grid-cols-[40px_1fr_60px_100px_70px] gap-x-4 px-5 py-3 border-b border-slate-700/50 text-sm items-center last:border-b-0">
            <div className="text-slate-500">{u.id}</div>
            <div className="text-slate-200 font-medium">{u.username}</div>
            <div>{u.is_admin ? <span className="text-indigo-400 text-xs font-semibold">Admin</span> : <span className="text-slate-500 text-xs">User</span>}</div>
            <div className="text-slate-400 text-xs">{u.created_at ? new Date(u.created_at + 'Z').toLocaleDateString() : '—'}</div>
            <div>
              {!u.is_admin && (
                <button
                  onClick={() => handleDelete(u)}
                  className="bg-red-950 hover:bg-red-900 text-white px-2.5 py-1 rounded-md text-xs"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

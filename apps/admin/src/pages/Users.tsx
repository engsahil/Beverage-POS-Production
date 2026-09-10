import { useState, useEffect } from 'react';
import api from '../api';

interface User {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  role?: { id: string; name: string };
  branch?: { id: string; name: string } | null;
  lastLoginAt: string | null;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
}

interface Branch {
  id: string;
  name: string;
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    username: '',
    password: '',
    fullName: '',
    email: '',
    phone: '',
    roleId: '',
    branchId: '',
  });

  useEffect(() => {
    loadUsers();
    loadRoles();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/users', { params: { limit: 100 } });
      setUsers(data.data || []);
    } catch (err: any) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const { data } = await api.get('/roles');
      setRoles(data.data || []);
    } catch (err) {
      console.error('Failed to load roles:', err);
    }
  };

  const handleCreate = async () => {
    if (!form.username || !form.password || !form.fullName) {
      alert('Username, password, and full name are required');
      return;
    }

    try {
      setCreating(true);
      await api.post('/users', {
        ...form,
        branchId: form.branchId || null,
        roleId: form.roleId || null,
      });
      setShowCreateModal(false);
      setForm({ username: '', password: '', fullName: '', email: '', phone: '', roleId: '', branchId: '' });
      loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      if (currentStatus) {
        await api.post(`/users/${id}/disable`);
      } else {
        await api.post(`/users/${id}/enable`);
      }
      loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update user');
    }
  };

  const resetPassword = async (id: string, username: string) => {
    const newPass = prompt(`Enter new password for ${username}:`);
    if (!newPass || newPass.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    try {
      await api.post('/users/reset-password', { userId: id, newPassword: newPass });
      alert('Password reset successfully');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to reset password');
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading users...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 4 }}>Users</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '10px 20px',
            background: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Add User
        </button>
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #dc2626', borderRadius: 8, color: '#991b1b', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Username</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Full Name</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Role</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Phone</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                  No users found
                </td>
              </tr>
            ) : (
              users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 12, fontSize: 14, fontWeight: 500, color: '#1f2937' }}>{u.username}</td>
                  <td style={{ padding: 12, fontSize: 14, color: '#374151' }}>{u.fullName}</td>
                  <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>{u.role?.name || '-'}</td>
                  <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>{u.phone || '-'}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      background: u.isActive ? '#f0fdf4' : '#fef2f2',
                      color: u.isActive ? '#16a34a' : '#dc2626',
                    }}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button
                        onClick={() => resetPassword(u.id, u.username)}
                        style={{ padding: '4px 10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                      >
                        Reset PW
                      </button>
                      <button
                        onClick={() => toggleActive(u.id, u.isActive)}
                        style={{
                          padding: '4px 10px',
                          background: u.isActive ? '#fef2f2' : '#f0fdf4',
                          color: u.isActive ? '#dc2626' : '#16a34a',
                          border: 'none',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {u.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 28,
            maxWidth: 500,
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: 20, marginBottom: 20, color: '#1f2937' }}>Add New User</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Username *</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Password *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Min 8 chars with uppercase, lowercase, number &amp; special character</div>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Full Name *</label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Role</label>
              <select
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
              >
                <option value="">Select Role</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
                style={{ padding: '10px 20px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !form.username || !form.password || !form.fullName}
                style={{
                  padding: '10px 20px',
                  background: creating ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: creating ? 'not-allowed' : 'pointer',
                }}
              >
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

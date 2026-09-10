import { useState, useEffect } from 'react';
import api from '../api';

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  _count?: { users: number };
  permissions?: Array<{ permission: { id: string; name: string; module: string; action: string } }>;
}

interface Permission {
  id: string;
  name: string;
  module: string;
  action: string;
  description: string | null;
}

export default function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPermModal, setShowPermModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [permForm, setPermForm] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadRoles(); loadPermissions(); }, []);

  const loadRoles = async () => {
    try {
      const { data } = await api.get('/roles');
      setRoles(data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadPermissions = async () => {
    try {
      const { data } = await api.get('/permissions');
      setPermissions(data.data || []);
    } catch (err) { console.error(err); }
  };

  const loadRoleDetail = async (id: string) => {
    try {
      const { data } = await api.get(`/roles/${id}`);
      setSelectedRole(data.data);
      setPermForm((data.data.permissions || []).map((p: any) => p.permission?.id || p.permissionId));
      setShowPermModal(true);
    } catch (err: any) { alert('Failed to load role details'); }
  };

  const handleCreate = async () => {
    if (!form.name) return;
    try {
      setSaving(true);
      await api.post('/roles', form);
      setShowCreateModal(false);
      setForm({ name: '', description: '' });
      loadRoles();
    } catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete role "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/roles/${id}`);
      loadRoles();
    } catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
  };

  const handleSavePerms = async () => {
    if (!selectedRole) return;
    try {
      setSaving(true);
      await api.put(`/roles/${selectedRole.id}`, {
        name: selectedRole.name,
        description: selectedRole.description,
        permissionIds: permForm,
      });
      setShowPermModal(false);
      loadRoles();
    } catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const modules = [...new Set(permissions.map(p => p.module))].sort();

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 4 }}>Roles & Permissions</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>{roles.length} roles | {permissions.length} permissions</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          + Create Role
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {roles.map(role => (
          <div key={role.id} style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
              <div>
                <h3 style={{ fontSize: 16, color: '#1f2937', margin: 0 }}>{role.name}</h3>
                {role.isSystem && <span style={{ fontSize: 11, background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>System</span>}
              </div>
              {!role.isSystem && (
                <button onClick={() => handleDelete(role.id, role.name)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}>×</button>
              )}
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '8px 0' }}>{role.description || 'No description'}</p>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
              {role._count?.users || 0} user{(role._count?.users || 0) !== 1 ? 's' : ''} assigned
            </div>
            <button onClick={() => loadRoleDetail(role.id)} style={{ width: '100%', padding: '8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
              Manage Permissions
            </button>
          </div>
        ))}
      </div>

      {/* Create Role Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 400, width: '90%' }}>
            <h2 style={{ fontSize: 20, marginBottom: 20 }}>Create Role</h2>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateModal(false)} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.name} style={{ padding: '10px 20px', background: saving ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {showPermModal && selectedRole && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 700, width: '90%', maxHeight: '85vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>Permissions: {selectedRole.name}</h2>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>{permForm.length} of {permissions.length} permissions enabled</p>
            {modules.map(mod => (
              <div key={mod} style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 8, textTransform: 'capitalize', borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>{mod.replace(/_/g, ' ')}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
                  {permissions.filter(p => p.module === mod).map(perm => (
                    <label key={perm.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', padding: '4px 0' }}>
                      <input type="checkbox" checked={permForm.includes(perm.id)} onChange={(e) => {
                        if (e.target.checked) setPermForm([...permForm, perm.id]);
                        else setPermForm(permForm.filter(id => id !== perm.id));
                      }} />
                      <span>{perm.action}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
              <button onClick={() => setShowPermModal(false)} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSavePerms} disabled={saving || selectedRole.isSystem} style={{ padding: '10px 20px', background: saving || selectedRole.isSystem ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save Permissions'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

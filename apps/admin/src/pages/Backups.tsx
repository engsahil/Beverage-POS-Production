import { useState, useEffect } from 'react';
import api from '../api';

interface Backup { id: string; backupNumber: string; type: string; status: string; fileSize: number | null; createdAt: string; completedAt: string | null; errorMessage: string | null; }

export default function Backups() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [storage, setStorage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadBackups(); loadStorage(); }, []);

  const loadBackups = async () => {
    try { const { data } = await api.get('/backups'); setBackups(data.data || []); } catch (err) {} finally { setLoading(false); }
  };

  const loadStorage = async () => {
    try { const { data } = await api.get('/backups/storage/usage'); setStorage(data.data); } catch (err) {}
  };

  const createBackup = async () => {
    try { setCreating(true); await api.post('/backups'); alert('Backup queued'); loadBackups(); }
    catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
    finally { setCreating(false); }
  };

  const restoreBackup = async (id: string) => {
    if (!confirm('RESTORE THIS BACKUP?\n\nAll current data for this business will be REPLACED with the backup snapshot. Anything created after the backup will be lost. This cannot be undone.')) return;
    try {
      const { data } = await api.post(`/backups/${id}/restore`, { confirm: true });
      if (data?.data?.restored) {
        alert(`Restore completed: ${data.data.restoredRows ?? 0} rows across ${data.data.tableCount ?? 0} tables restored.`);
        loadBackups();
      } else {
        alert(data?.data?.message || 'Restore finished (no data was changed).');
      }
    }
    catch (err: any) { alert(err.response?.data?.error?.message || 'Restore failed — no data was changed.'); }
  };

  const deleteBackup = async (id: string) => {
    if (!confirm('Delete this backup permanently?')) return;
    try { await api.delete(`/backups/${id}`); loadBackups(); }
    catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;

  const usedMB = storage ? Number(storage.usedBytes || 0) / 1024 / 1024 : 0;
  const quotaMB = storage ? Number(storage.quotaBytes || 0) / 1024 / 1024 : 1024;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 4 }}>Cloud Backups</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>{backups.length} backup{backups.length !== 1 ? 's' : ''} | {usedMB.toFixed(1)} MB / {quotaMB.toFixed(0)} MB used</p>
        </div>
        <button onClick={createBackup} disabled={creating} style={{ padding: '10px 20px', background: creating ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{creating ? 'Creating...' : '+ Manual Backup'}</button>
      </div>

      <div style={{ background: '#f3f4f6', height: 8, borderRadius: 4, marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ background: usedMB / quotaMB > 0.8 ? '#dc2626' : '#059669', height: '100%', width: `${Math.min(100, (usedMB / quotaMB) * 100)}%`, borderRadius: 4 }} />
      </div>

      <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Backup #</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Date</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Type</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Size</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Status</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.length === 0 ? <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No backups yet. Create your first backup.</td></tr> : (
              backups.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{b.backupNumber}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>{new Date(b.createdAt).toLocaleString()}</td>
                  <td style={{ padding: 12, fontSize: 14 }}>{b.type}</td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right' }}>{b.fileSize ? `${(Number(b.fileSize) / 1024 / 1024).toFixed(2)} MB` : '-'}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: b.status === 'COMPLETED' || b.status === 'VERIFIED' ? '#f0fdf4' : b.status === 'FAILED' ? '#fef2f2' : '#fef3c7',
                      color: b.status === 'COMPLETED' || b.status === 'VERIFIED' ? '#16a34a' : b.status === 'FAILED' ? '#dc2626' : '#d97706',
                    }}>{b.status}</span>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      {b.status === 'COMPLETED' && <button onClick={() => restoreBackup(b.id)} style={{ padding: '4px 8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Restore</button>}
                      <button onClick={() => deleteBackup(b.id)} style={{ padding: '4px 8px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

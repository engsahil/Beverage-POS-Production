import { useState, useEffect } from 'react';
import api from '../api';

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: any;
  newValues: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user?: { fullName: string; username: string } | null;
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ action: '', entityType: '', search: '' });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 50;

  useEffect(() => { loadLogs(); }, [page, filter]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/audit-logs', { params: { page, limit: perPage, ...filter } });
      setLogs(data.data || []);
      setTotal(data.meta?.total || 0);
    } catch (err) {
      setLogs([]);
    } finally { setLoading(false); }
  };

  const actionTypes = [...new Set(logs.map(l => l.action))].sort();
  const entityTypes = [...new Set(logs.map(l => l.entityType))].sort();

  return (
    <div>
      <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 24 }}>Audit Logs</h1>

      <div style={{ background: 'white', padding: 16, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search..." value={filter.search} onChange={(e) => { setFilter({ ...filter, search: e.target.value }); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: 200 }} />
        <select value={filter.action} onChange={(e) => { setFilter({ ...filter, action: e.target.value }); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
          <option value="">All Actions</option>
          {actionTypes.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filter.entityType} onChange={(e) => { setFilter({ ...filter, entityType: e.target.value }); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
          <option value="">All Entities</option>
          {entityTypes.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              <th style={{ padding: 10, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Time</th>
              <th style={{ padding: 10, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>User</th>
              <th style={{ padding: 10, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Action</th>
              <th style={{ padding: 10, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Entity</th>
              <th style={{ padding: 10, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center' }}>Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No audit logs found. Logs are recorded when users perform actions in the system.</td></tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 10, fontSize: 13, color: '#6b7280' }}>{new Date(log.createdAt).toLocaleString()}</td>
                  <td style={{ padding: 10, fontSize: 13 }}>{log.user?.fullName || 'System'}</td>
                  <td style={{ padding: 10, fontSize: 13 }}><span style={{ padding: '2px 8px', background: '#f3f4f6', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{log.action}</span></td>
                  <td style={{ padding: 10, fontSize: 13, color: '#6b7280' }}>{log.entityType} {log.entityId ? `#${log.entityId.substring(0, 8)}` : ''}</td>
                  <td style={{ padding: 10, fontSize: 12, color: '#9ca3af' }}>{log.ipAddress || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > perPage && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Previous</button>
          <span style={{ padding: '8px 16px', fontSize: 13, color: '#6b7280' }}>Page {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={logs.length < perPage} style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Next</button>
        </div>
      )}
    </div>
  );
}

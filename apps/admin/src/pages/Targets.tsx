import { useState, useEffect } from 'react';
import api from '../api';

interface Target {
  id: string;
  name: string;
  targetType: string;
  periodType: string;
  startDate: string;
  endDate: string;
  targetValue: number;
  status: string;
  assignedUser?: { fullName: string } | null;
  assignedBranch?: { name: string } | null;
}

export default function Targets() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTargets(); }, []);

  const loadTargets = async () => {
    try {
      const { data } = await api.get('/targets', { params: { limit: 100 } });
      setTargets(data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const cancelTarget = async (id: string) => {
    if (!confirm('Cancel this target?')) return;
    try { await api.post(`/targets/${id}/cancel`); loadTargets(); }
    catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 4 }}>Sales Targets</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>{targets.length} target{targets.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {targets.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#9ca3af', background: 'white', borderRadius: 8 }}>No sales targets configured</div>
        ) : (
          targets.map(t => (
            <div key={t.id} style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 style={{ fontSize: 15, color: '#1f2937', margin: 0 }}>{t.name}</h3>
                <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                  background: t.status === 'ACTIVE' ? '#f0fdf4' : t.status === 'COMPLETED' ? '#eff6ff' : '#fef2f2',
                  color: t.status === 'ACTIVE' ? '#16a34a' : t.status === 'COMPLETED' ? '#2563eb' : '#dc2626',
                }}>{t.status}</span>
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Type: {t.targetType} | Period: {t.periodType}</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Assigned: {t.assignedUser?.fullName || t.assignedBranch?.name || 'All'}</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>{new Date(t.startDate).toLocaleDateString()} - {new Date(t.endDate).toLocaleDateString()}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626', marginBottom: 12 }}>Rs. {Number(t.targetValue).toLocaleString()}</div>
              {t.status === 'ACTIVE' && <button onClick={() => cancelTarget(t.id)} style={{ width: '100%', padding: '8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Cancel Target</button>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import api from '../api';

interface Claim {
  id: string;
  claimNumber: string;
  claimDate: string;
  claimType: string;
  status: string;
  totalAmount: number;
  reason: string;
  vendor?: { name: string } | null;
  creator: { fullName: string };
  _count?: { items: number };
}

export default function Claims() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { loadClaims(); }, []);

  const loadClaims = async () => {
    try {
      const { data } = await api.get('/claims', { params: { limit: 100 } });
      setClaims(data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleAction = async (id: string, action: string) => {
    if (!confirm(`${action} this claim?`)) return;
    try {
      await api.post(`/claims/${id}/${action}`);
      loadClaims();
    } catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
  };

  const filtered = claims.filter(c =>
    !filter || c.status === filter || c.claimType === filter
  );

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 4 }}>Claims Management</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>{claims.length} claim{claims.length !== 1 ? 's' : ''}</p>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
          <option value="">All</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="RESOLVED">Resolved</option>
          <option value="DAMAGE">Damage</option>
          <option value="EXPIRED">Expired</option>
          <option value="SUPPLIER">Supplier</option>
        </select>
      </div>

      <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Claim #</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Date</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Type</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Vendor</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Amount</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Status</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No claims found</td></tr>
            ) : (
              filtered.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{c.claimNumber}</td>
                  <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>{new Date(c.claimDate).toLocaleDateString()}</td>
                  <td style={{ padding: 12, fontSize: 14 }}>{c.claimType}</td>
                  <td style={{ padding: 12, fontSize: 14 }}>{c.vendor?.name || '-'}</td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600 }}>Rs. {Number(c.totalAmount).toFixed(2)}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: c.status === 'APPROVED' || c.status === 'RESOLVED' ? '#f0fdf4' : c.status === 'REJECTED' || c.status === 'CANCELLED' ? '#fef2f2' : '#fef3c7',
                      color: c.status === 'APPROVED' || c.status === 'RESOLVED' ? '#16a34a' : c.status === 'REJECTED' || c.status === 'CANCELLED' ? '#dc2626' : '#d97706',
                    }}>{c.status}</span>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      {c.status === 'DRAFT' && <button onClick={() => handleAction(c.id, 'submit')} style={{ padding: '4px 8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Submit</button>}
                      {c.status === 'SUBMITTED' && <>
                        <button onClick={() => handleAction(c.id, 'approve')} style={{ padding: '4px 8px', background: '#059669', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Approve</button>
                        <button onClick={() => handleAction(c.id, 'reject')} style={{ padding: '4px 8px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Reject</button>
                      </>}
                      {c.status === 'APPROVED' && <button onClick={() => handleAction(c.id, 'resolve')} style={{ padding: '4px 8px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Resolve</button>}
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

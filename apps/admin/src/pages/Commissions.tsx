import { useState, useEffect } from 'react';
import api from '../api';

interface CommissionRule { id: string; name: string; commissionType: string; percentage: number | null; fixedAmount: number | null; isActive: boolean; assignedUser?: { fullName: string } | null; }
interface CommissionRecord { id: string; periodStart: string; periodEnd: string; commissionAmount: number; status: string; user: { fullName: string }; eligibleSalesAmount: number; }

export default function Commissions() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'rules' | 'records'>('rules');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [rulesRes, recordsRes] = await Promise.all([
        api.get('/commissions/rules'),
        api.get('/commissions', { params: { limit: 100 } }),
      ]);
      setRules(rulesRes.data.data || []);
      setRecords(recordsRes.data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const toggleRule = async (id: string) => {
    try { await api.patch(`/commissions/rules/${id}/toggle`); loadData(); }
    catch (err: any) { alert('Failed'); }
  };

  const approveRecord = async (id: string) => {
    try { await api.post(`/commissions/${id}/approve`); loadData(); }
    catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
  };

  const markPaid = async (id: string) => {
    try { await api.post(`/commissions/${id}/mark-paid`); loadData(); }
    catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;

  return (
    <div>
      <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 24 }}>Commissions</h1>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <button onClick={() => setTab('rules')} style={{ padding: '10px 20px', background: tab === 'rules' ? '#dc2626' : 'white', color: tab === 'rules' ? 'white' : '#374151', border: tab === 'rules' ? 'none' : '1px solid #d1d5db', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Rules ({rules.length})</button>
        <button onClick={() => setTab('records')} style={{ padding: '10px 20px', background: tab === 'records' ? '#dc2626' : 'white', color: tab === 'records' ? 'white' : '#374151', border: tab === 'records' ? 'none' : '1px solid #d1d5db', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Records ({records.length})</button>
      </div>

      {tab === 'rules' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {rules.length === 0 ? <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#9ca3af', background: 'white', borderRadius: 8 }}>No commission rules configured</div> : (
            rules.map(r => (
              <div key={r.id} style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h3 style={{ fontSize: 15, margin: 0 }}>{r.name}</h3>
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: r.isActive ? '#f0fdf4' : '#fef2f2', color: r.isActive ? '#16a34a' : '#dc2626' }}>{r.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Type: {r.commissionType}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Rate: {r.percentage ? `${r.percentage}%` : `Rs. ${Number(r.fixedAmount || 0).toFixed(2)}`}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>For: {r.assignedUser?.fullName || 'All Staff'}</div>
                <button onClick={() => toggleRule(r.id)} style={{ width: '100%', padding: '8px', background: r.isActive ? '#fef2f2' : '#f0fdf4', color: r.isActive ? '#dc2626' : '#16a34a', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{r.isActive ? 'Deactivate' : 'Activate'}</button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'records' && (
        <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Employee</th>
                <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Period</th>
                <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Sales</th>
                <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Commission</th>
                <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Status</th>
                <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No commission records</td></tr> : (
                records.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 12, fontSize: 14 }}>{r.user?.fullName}</td>
                    <td style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>{new Date(r.periodStart).toLocaleDateString()} - {new Date(r.periodEnd).toLocaleDateString()}</td>
                    <td style={{ padding: 12, fontSize: 14, textAlign: 'right' }}>Rs. {Number(r.eligibleSalesAmount).toLocaleString()}</td>
                    <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>Rs. {Number(r.commissionAmount).toFixed(2)}</td>
                    <td style={{ padding: 12, textAlign: 'center' }}><span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: r.status === 'PAID' ? '#f0fdf4' : r.status === 'APPROVED' ? '#eff6ff' : '#fef3c7', color: r.status === 'PAID' ? '#16a34a' : r.status === 'APPROVED' ? '#2563eb' : '#d97706' }}>{r.status}</span></td>
                    <td style={{ padding: 12, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        {r.status === 'CALCULATED' && <button onClick={() => approveRecord(r.id)} style={{ padding: '4px 8px', background: '#059669', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Approve</button>}
                        {r.status === 'APPROVED' && <button onClick={() => markPaid(r.id)} style={{ padding: '4px 8px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Mark Paid</button>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

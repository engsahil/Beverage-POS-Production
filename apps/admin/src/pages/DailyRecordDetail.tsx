import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

interface DailyRecord {
  id: string;
  businessDate: string;
  status: string;
  openingCash: number;
  closingCash: number | null;
  expectedCash: number | null;
  cashVariance: number | null;
  totalSales: number;
  totalRefunds: number;
  totalExpenses: number;
  transactionCount: number;
  notes: string | null;
  opener: { fullName: string };
  closer?: { fullName: string } | null;
  openedAt: string;
  closedAt: string | null;
}

interface SaleSummary {
  paymentMethod: string;
  count: number;
  total: number;
}

export default function DailyRecordDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<DailyRecord | null>(null);
  const [salesBreakdown, setSalesBreakdown] = useState<SaleSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [recordRes, breakdownRes] = await Promise.all([
        api.get(`/daily-records/${id}`),
        api.get(`/daily-records/${id}/summary`).catch(() => ({ data: { data: [] } })),
      ]);
      setRecord(recordRes.data.data);
      setSalesBreakdown(breakdownRes.data.data || []);
    } catch (err) {
      console.error('Failed to load daily record:', err);
      alert('Failed to load daily record');
      navigate('/daily-records');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  }

  if (!record) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Daily record not found</div>;
  }

  const netCash = record.totalSales - record.totalRefunds - record.totalExpenses;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => navigate('/daily-records')} style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer', marginBottom: 16 }}>← Back to Daily Records</button>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 8 }}>Daily Record - {new Date(record.businessDate).toLocaleDateString()}</h1>
            <div style={{ display: 'flex', gap: 16, fontSize: 14, color: '#6b7280' }}>
              <span>Opened: {new Date(record.openedAt).toLocaleString()}</span>
              <span>by {record.opener.fullName}</span>
              {record.closedAt && (
                <>
                  <span>Closed: {new Date(record.closedAt).toLocaleString()}</span>
                  <span>by {record.closer?.fullName}</span>
                </>
              )}
            </div>
          </div>
          <span style={{ padding: '6px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600, background: record.status === 'CLOSED' ? '#f0fdf4' : '#fef3c7', color: record.status === 'CLOSED' ? '#16a34a' : '#d97706' }}>
            {record.status}
          </span>
        </div>
      </div>

      {/* Financial Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Total Sales</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#059669' }}>Rs. {record.totalSales.toFixed(2)}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{record.transactionCount} transactions</div>
        </div>
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Refunds</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>Rs. {record.totalRefunds.toFixed(2)}</div>
        </div>
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Expenses</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#d97706' }}>Rs. {record.totalExpenses.toFixed(2)}</div>
        </div>
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Net Cash</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1f2937' }}>Rs. {netCash.toFixed(2)}</div>
        </div>
      </div>

      {/* Cash Reconciliation */}
      <div style={{ background: 'white', padding: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Cash Reconciliation</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Opening Cash</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1f2937' }}>Rs. {record.openingCash.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Expected Cash</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1f2937' }}>Rs. {(record.expectedCash || 0).toFixed(2)}</div>
          </div>
          {record.closingCash !== null && (
            <>
              <div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Actual Cash</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#1f2937' }}>Rs. {record.closingCash.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Variance</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: (record.cashVariance || 0) === 0 ? '#059669' : '#dc2626' }}>
                  {(record.cashVariance || 0) > 0 ? '+' : ''}Rs. {(record.cashVariance || 0).toFixed(2)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sales by Payment Method */}
      {salesBreakdown.length > 0 && (
        <div style={{ background: 'white', padding: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>Sales by Payment Method</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Payment Method</th>
                <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Transactions</th>
                <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {salesBreakdown.map(sale => (
                <tr key={sale.paymentMethod} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{sale.paymentMethod}</td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right' }}>{sale.count}</td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600 }}>Rs. {sale.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      {record.notes && (
        <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Notes</div>
          <div style={{ fontSize: 14, color: '#6b7280' }}>{record.notes}</div>
        </div>
      )}
    </div>
  );
}

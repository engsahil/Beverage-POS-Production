import { useState, useEffect } from 'react';
import api from '../api';

interface Sale {
  id: string;
  saleNumber: string;
  total: number;
  status: string;
  createdAt: string;
  customer?: { name: string };
  cashier?: { fullName: string };
  items?: Array<{ productName: string; quantity: number }>;
}

export default function Sales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSales();
  }, []);

  const loadSales = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/sales', { params: { limit: 50 } });
      setSales(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load sales');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading sales...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{
          background: '#fef2f2',
          border: '1px solid #dc2626',
          color: '#dc2626',
          padding: 16,
          borderRadius: 8,
        }}>
          {error}
        </div>
      </div>
    );
  }

  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, color: '#1f2937' }}>Sales ({sales.length})</h1>
        <div style={{
          background: 'white',
          padding: '12px 20px',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        }}>
          <span style={{ color: '#6b7280', fontSize: 14, marginRight: 8 }}>Total Revenue:</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>
            Rs. {totalRevenue.toFixed(2)}
          </span>
        </div>
      </div>

      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}>
        {sales.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
            No sales yet. Sales will appear here after transactions are completed.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Sale #</th>
                <th style={{ textAlign: 'left', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Customer</th>
                <th style={{ textAlign: 'left', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Cashier</th>
                <th style={{ textAlign: 'center', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Items</th>
                <th style={{ textAlign: 'right', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Total</th>
                <th style={{ textAlign: 'right', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(sale => (
                <tr key={sale.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 16, fontWeight: 600 }}>{sale.saleNumber}</td>
                  <td style={{ padding: 16, color: '#6b7280' }}>{sale.customer?.name || 'Walk-in'}</td>
                  <td style={{ padding: 16, color: '#6b7280', fontSize: 14 }}>{sale.cashier?.fullName || '-'}</td>
                  <td style={{ padding: 16, textAlign: 'center', color: '#6b7280' }}>
                    {sale.items?.length || 0}
                  </td>
                  <td style={{ padding: 16, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>
                    Rs. {sale.total.toFixed(2)}
                  </td>
                  <td style={{ padding: 16, textAlign: 'right', color: '#6b7280', fontSize: 14 }}>
                    {new Date(sale.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

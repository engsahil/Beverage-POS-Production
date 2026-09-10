import { useState, useEffect } from 'react';
import api from '../api';

interface SalesReport {
  totalSales: number;
  totalRevenue: number;
  totalDiscount: number;
  totalTax: number;
  averageOrderValue: number;
  cashSales: number;
  cardSales: number;
  creditSales: number;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  dailyBreakdown: Array<{ date: string; count: number; revenue: number }>;
}

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory' | 'financial'>('sales');

  useEffect(() => {
    loadReports();
  }, [dateRange]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/reports/sales', {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }
      });
      setSalesReport(data.data || data);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportData = async (type: string) => {
    try {
      const { data } = await api.post('/data/export', {
        entityType: type,
        fileFormat: 'CSV',
        filters: dateRange,
      });
      alert(`Export started: ${data.data?.fileName || 'File will be ready shortly'}`);
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Export failed');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 8 }}>Reports</h1>
        
        {/* Date Range Filter */}
        <div style={{
          background: 'white',
          padding: 16,
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 16,
        }}>
          <label style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>From:</label>
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
          />
          <label style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>To:</label>
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
          />
          <div style={{ flex: 1 }} />
          <button
            onClick={() => exportData('SALE')}
            style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
          >
            Export Sales CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['sales', 'inventory', 'financial'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              background: activeTab === tab ? '#dc2626' : 'white',
              color: activeTab === tab ? 'white' : '#374151',
              border: activeTab === tab ? 'none' : '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>Loading reports...</div>
      ) : (
        <>
          {activeTab === 'sales' && salesReport && (
            <div>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                {[
                  { label: 'Total Sales', value: salesReport.totalSales?.toString() || '0', color: '#1f2937' },
                  { label: 'Revenue', value: `Rs. ${Number(salesReport.totalRevenue || 0).toFixed(2)}`, color: '#dc2626' },
                  { label: 'Avg Order', value: `Rs. ${Number(salesReport.averageOrderValue || 0).toFixed(2)}`, color: '#059669' },
                  { label: 'Discounts', value: `Rs. ${Number(salesReport.totalDiscount || 0).toFixed(2)}`, color: '#d97706' },
                ].map((card, i) => (
                  <div key={i} style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>{card.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
                  </div>
                ))}
              </div>

              {/* Payment Methods */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Cash Sales</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#1f2937' }}>Rs. {Number(salesReport.cashSales || 0).toFixed(2)}</div>
                </div>
                <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Card Sales</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#1f2937' }}>Rs. {Number(salesReport.cardSales || 0).toFixed(2)}</div>
                </div>
                <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Credit Sales</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#dc2626' }}>Rs. {Number(salesReport.creditSales || 0).toFixed(2)}</div>
                </div>
              </div>

              {/* Top Products */}
              {salesReport.topProducts && salesReport.topProducts.length > 0 && (
                <div style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 12, color: '#1f2937' }}>Top Products</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: 8, textAlign: 'left', fontSize: 12, color: '#6b7280' }}>Product</th>
                        <th style={{ padding: 8, textAlign: 'right', fontSize: 12, color: '#6b7280' }}>Qty Sold</th>
                        <th style={{ padding: 8, textAlign: 'right', fontSize: 12, color: '#6b7280' }}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.topProducts.map((p, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: 8, fontSize: 14 }}>{p.name}</td>
                          <td style={{ padding: 8, fontSize: 14, textAlign: 'right' }}>{p.quantity}</td>
                          <td style={{ padding: 8, fontSize: 14, textAlign: 'right', fontWeight: 600 }}>Rs. {Number(p.revenue).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'inventory' && (
            <div style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <h3 style={{ fontSize: 16, marginBottom: 12, color: '#1f2937' }}>Inventory Reports</h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={() => exportData('INVENTORY')} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>
                  Export Inventory
                </button>
                <button onClick={() => exportData('PURCHASE')} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>
                  Export Purchases
                </button>
              </div>
            </div>
          )}

          {activeTab === 'financial' && (
            <div style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <h3 style={{ fontSize: 16, marginBottom: 12, color: '#1f2937' }}>Financial Reports</h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={() => exportData('SALE')} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>
                  Export Sales
                </button>
                <button onClick={() => exportData('CUSTOMER')} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>
                  Export Customers
                </button>
                <button onClick={() => exportData('VENDOR')} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>
                  Export Vendors
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

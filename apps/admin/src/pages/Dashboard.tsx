import { useState, useEffect } from 'react';
import api from '../api';
import {
  IconTrendingUp,
  IconReceipt,
  IconPackage,
  IconUsers,
  IconClock,
  IconArrowRight,
  IconAlertTriangle,
  IconCheckCircle,
} from '../components/Icons';

interface DashboardData {
  todaySales: number;
  todayTransactions: number;
  totalProducts: number;
  totalCustomers: number;
  recentSales: Array<{
    id: string;
    saleNumber: string;
    total: number;
    paymentMethod?: string;
    createdAt: string;
    customer?: { name: string; phone?: string };
    status?: string;
  }>;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const [productsRes, customersRes, salesRes] = await Promise.all([
        api.get('/products', { params: { limit: 1 } }),
        api.get('/customers', { params: { limit: 1 } }),
        api.get('/sales', { params: { limit: 10 } }),
      ]);

      const today = new Date().toISOString().split('T')[0];
      const todaySales =
        salesRes.data.data?.filter((s: any) => s.createdAt.startsWith(today)) || [];

      setData({
        todaySales: todaySales.reduce((sum: number, s: any) => sum + (Number(s.total) || 0), 0),
        todayTransactions: todaySales.length,
        totalProducts: productsRes.data.meta?.total || 0,
        totalCustomers: customersRes.data.meta?.total || 0,
        recentSales: salesRes.data.data?.slice(0, 6) || [],
      });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--color-text-subtle)' }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Loading dashboard analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <div
          style={{
            background: 'var(--color-danger-bg)',
            border: '1px solid var(--color-danger-border)',
            color: 'var(--color-danger)',
            padding: '16px 20px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 14,
          }}
        >
          <IconAlertTriangle size={18} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const stats = [
    {
      label: "Today's Gross Sales",
      value: `Rs. ${data.todaySales.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      subtext: 'Calculated from completed transactions',
      icon: IconTrendingUp,
      accentColor: '#dc2626',
      bgLight: '#fef2f2',
    },
    {
      label: "Today's Orders",
      value: data.todayTransactions,
      subtext: 'Receipts printed today',
      icon: IconReceipt,
      accentColor: '#059669',
      bgLight: '#ecfdf5',
    },
    {
      label: 'Active Catalog SKUs',
      value: data.totalProducts,
      subtext: 'Registered beverage items',
      icon: IconPackage,
      accentColor: '#2563eb',
      bgLight: '#eff6ff',
    },
    {
      label: 'Customer Accounts',
      value: data.totalCustomers,
      subtext: 'Retail & wholesale ledgers',
      icon: IconUsers,
      accentColor: '#7c3aed',
      bgLight: '#f5f3ff',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Welcome Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px 28px',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Store Intelligence
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: '#f8fafc', marginBottom: 4 }}>
            Beverage Sales Overview
          </h1>
          <p style={{ fontSize: 13, color: '#cbd5e1' }}>
            Live trading and reconciliation for the current business date.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              padding: '8px 14px',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(255,255,255,0.12)',
              fontSize: 12,
              fontWeight: 500,
              color: '#e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <IconClock size={15} color="#94a3b8" />
            <span>{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={i}
              style={{
                background: 'var(--color-surface)',
                padding: '20px 22px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-card)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {stat.label}
                </span>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: stat.bgLight,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: stat.accentColor,
                  }}
                >
                  <Icon size={18} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-main)', letterSpacing: -0.5, marginBottom: 4 }} className="mono">
                  {stat.value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-light)', fontWeight: 500 }}>
                  {stat.subtext}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Activity Table */}
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-main)' }}>
              Latest Completed Transactions
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginTop: 2 }}>
              Real-time orders processed across active cashier terminals
            </p>
          </div>
          <button
            onClick={loadDashboard}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              background: 'var(--color-surface-hover)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
            }}
          >
            Refresh Data
          </button>
        </div>

        {data.recentSales.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--color-text-light)' }}>
            <div style={{ marginBottom: 8 }}>
              <IconReceipt size={32} color="#cbd5e1" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' }}>No sales recorded today yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Transactions will appear here as cashiers complete checkout orders.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Sale #
                  </th>
                  <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Customer Account
                  </th>
                  <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    Amount (PKR)
                  </th>
                  <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    Timestamp
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((sale) => (
                  <tr
                    key={sale.id}
                    style={{
                      borderBottom: '1px solid var(--color-border-subtle)',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-main)' }} className="mono">
                        {sale.saleNumber}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: sale.customer ? 'var(--color-info-bg)' : 'var(--color-surface-hover)',
                          color: sale.customer ? 'var(--color-info)' : 'var(--color-text-muted)',
                        }}
                      >
                        {sale.customer?.name || 'Walk-in Customer'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-primary)' }} className="mono">
                        Rs. {(Number(sale.total) || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: 12, color: 'var(--color-text-subtle)' }} className="mono">
                      {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

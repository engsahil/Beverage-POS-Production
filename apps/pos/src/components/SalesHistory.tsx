import { useState, useEffect } from 'react';
import api from '../api';
import { IconReceipt, IconSearch, IconPrinter, IconClock, IconRefresh } from './Icons';

interface Sale {
  id: string;
  saleNumber: string;
  saleDate: string;
  status: string;
  total: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  cashier: { fullName: string };
  customer?: { name: string } | null;
  payments: Array<{ paymentMethod: string; amount: number }>;
  _count?: { items: number };
}

interface SalesHistoryProps {
  onClose: () => void;
  onReprint?: (saleId: string) => void;
}

export default function SalesHistory({ onClose, onReprint }: SalesHistoryProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('today');

  useEffect(() => {
    loadSales();
  }, [dateFilter]);

  const loadSales = async () => {
    try {
      setLoading(true);
      const params: any = { limit: 50 };
      if (dateFilter === 'today') {
        params.startDate = new Date().toISOString().split('T')[0];
        params.endDate = new Date().toISOString().split('T')[0];
      } else if (dateFilter === 'week') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        params.startDate = d.toISOString().split('T')[0];
      }
      if (search) params.search = search;
      const { data } = await api.get('/sales', { params });
      setSales(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        className="modal-animate"
        style={{
          background: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          width: '90%',
          maxWidth: 820,
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconReceipt size={18} color="var(--primary)" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              Terminal Sales Audit & Reprint Log
            </h2>
          </div>
          <button onClick={onClose} style={{ fontSize: 20, color: 'var(--text-muted)', background: 'transparent' }}>
            ×
          </button>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, background: '#ffffff' }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#f8fafc',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
            }}
          >
            <IconSearch size={14} color="#64748b" />
            <input
              type="text"
              placeholder="Search receipt #, customer, cashier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadSales()}
              style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 12 }}
            />
          </div>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}
          >
            <option value="today">Today's Transactions</option>
            <option value="week">Last 7 Days</option>
            <option value="all">All Historical Records</option>
          </select>

          <button
            onClick={loadSales}
            style={{
              padding: '6px 12px',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <IconRefresh size={13} />
            <span>Filter</span>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 13 }}>
              Loading sales transactions...
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, borderBottom: '1px solid var(--border)' }}>
                <tr>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Receipt #</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Timestamp</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Cashier</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Payment Type</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', textAlign: 'right' }}>Total Amount</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', textAlign: 'center' }}>State</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 13 }}>
                      No sales matching this criterion found.
                    </td>
                  </tr>
                ) : (
                  sales.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600 }} className="mono">
                        {s.saleNumber}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)' }} className="mono">
                        {new Date(s.saleDate).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-main)' }}>
                        {s.cashier?.fullName || 'Cashier'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)' }}>
                        {s.payments?.map((p) => p.paymentMethod).join(', ') || 'CASH'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, textAlign: 'right', fontWeight: 700, color: 'var(--text-main)' }} className="mono">
                        Rs. {Number(s.total).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            background: s.status === 'COMPLETED' ? '#ecfdf5' : '#fef2f2',
                            color: s.status === 'COMPLETED' ? '#059669' : '#dc2626',
                            border: s.status === 'COMPLETED' ? '1px solid #a7f3d0' : '1px solid #fecaca',
                          }}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {onReprint && (
                          <button
                            onClick={() => onReprint(s.id)}
                            style={{
                              padding: '3px 8px',
                              background: 'var(--surface-subtle)',
                              border: '1px solid var(--border)',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <IconPrinter size={12} />
                            <span>Reprint</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--border)',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          <span>
            Displaying <strong>{sales.length}</strong> transactions
          </span>
          <span className="mono" style={{ fontWeight: 700, color: 'var(--primary)' }}>
            Batch Turnover: Rs. {sales.reduce((sum, s) => sum + Number(s.total), 0).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

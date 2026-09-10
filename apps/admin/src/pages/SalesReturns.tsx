import { useState, useEffect } from 'react';
import api from '../api';

interface Sale {
  id: string;
  saleNumber: string;
  saleDate: string;
  status: string;
  total: number;
  customer?: { name: string } | null;
  cashier: { fullName: string };
  items: SaleItem[];
}

interface SaleItem {
  id: string;
  productName: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export default function SalesReturns() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadSales();
  }, []);

  const loadSales = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/sales', { params: { limit: 100, status: 'COMPLETED' } });
      setSales(data.data || []);
    } catch (err) {
      console.error('Failed to load sales:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVoid = async () => {
    if (!selectedSale || !voidReason) {
      alert('Please provide a reason for voiding this sale');
      return;
    }

    try {
      setProcessing(true);
      await api.post(`/sales/${selectedSale.id}/void`, { reason: voidReason });
      setShowVoidModal(false);
      setSelectedSale(null);
      setVoidReason('');
      loadSales();
      alert('Sale voided successfully');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to void sale');
    } finally {
      setProcessing(false);
    }
  };

  const filteredSales = sales.filter(s =>
    s.saleNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 8 }}>Sales Returns & Voids</h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>Void completed sales and process returns</p>
      </div>

      <div style={{ background: 'white', padding: 16, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by sale number or customer..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', maxWidth: 400, padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
        />
      </div>

      <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Sale #</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Date</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Customer</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Cashier</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Total</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Status</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No sales found</td></tr>
            ) : (
              filteredSales.map(sale => (
                <tr key={sale.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{sale.saleNumber}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>{new Date(sale.saleDate).toLocaleString()}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{sale.customer?.name || 'Walk-in'}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{sale.cashier?.fullName}</td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600 }}>Rs. {Number(sale.total).toFixed(2)}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#16a34a' }}>
                      {sale.status}
                    </span>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <button
                      onClick={() => {
                        setSelectedSale(sale);
                        setShowVoidModal(true);
                      }}
                      style={{ padding: '6px 12px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Void Sale
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showVoidModal && selectedSale && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 500, width: '90%' }}>
            <h2 style={{ fontSize: 20, marginBottom: 16 }}>Void Sale {selectedSale.saleNumber}</h2>
            
            <div style={{ padding: 16, background: '#fef3c7', borderRadius: 8, marginBottom: 16 }}>
              <p style={{ fontSize: 14, color: '#78350f', margin: 0 }}>
                <strong>Warning:</strong> This action will void the sale and restore inventory. This cannot be undone.
              </p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 14, marginBottom: 4 }}><strong>Customer:</strong> {selectedSale.customer?.name || 'Walk-in'}</p>
              <p style={{ fontSize: 14, marginBottom: 4 }}><strong>Total:</strong> Rs. {Number(selectedSale.total).toFixed(2)}</p>
              <p style={{ fontSize: 14 }}><strong>Items:</strong> {selectedSale.items?.length || 0}</p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Reason for Void *</label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                placeholder="Explain why this sale is being voided..."
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowVoidModal(false);
                  setSelectedSale(null);
                  setVoidReason('');
                }}
                disabled={processing}
                style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleVoid}
                disabled={processing || !voidReason}
                style={{ padding: '10px 20px', background: (processing || !voidReason) ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                {processing ? 'Voiding...' : 'Void Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

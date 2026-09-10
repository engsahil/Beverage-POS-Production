import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

interface StockCountItem {
  id: string;
  productId: string;
  variantId: string | null;
  product: { name: string; sku: string | null };
  variant?: { name: string } | null;
  systemQuantity: number;
  physicalQuantity: number;
  difference: number;
  notes: string | null;
}

interface StockCount {
  id: string;
  countNumber: string;
  countDate: string;
  status: string;
  notes: string | null;
  creator: { fullName: string };
  confirmer?: { fullName: string } | null;
  confirmedAt: string | null;
  items: StockCountItem[];
}

export default function StockCountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [count, setCount] = useState<StockCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (id) loadCount();
  }, [id]);

  const loadCount = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/stock-counts/${id}`);
      setCount(data.data);
    } catch (err) {
      console.error('Failed to load stock count:', err);
      alert('Failed to load stock count');
      navigate('/stock-counts');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    try {
      setProcessing(true);
      await api.post(`/stock-counts/${id}/confirm`, { notes: confirmNotes || null });
      setShowConfirmModal(false);
      loadCount();
      alert('Stock count confirmed. Inventory adjustments have been applied.');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to confirm stock count');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this stock count? No inventory adjustments will be made.')) return;
    try {
      await api.post(`/stock-counts/${id}/cancel`);
      navigate('/stock-counts');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to cancel');
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  }

  if (!count) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Stock count not found</div>;
  }

  const totalVariance = count.items.reduce((sum, item) => sum + item.difference, 0);
  const itemsWithVariance = count.items.filter(item => item.difference !== 0);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => navigate('/stock-counts')} style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer', marginBottom: 16 }}>← Back to Stock Counts</button>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 8 }}>Stock Count {count.countNumber}</h1>
            <div style={{ display: 'flex', gap: 16, fontSize: 14, color: '#6b7280' }}>
              <span>Date: {new Date(count.countDate).toLocaleDateString()}</span>
              <span>Created by: {count.creator.fullName}</span>
              {count.confirmer && <span>Confirmed by: {count.confirmer.fullName}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ padding: '6px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600, background: count.status === 'CONFIRMED' ? '#f0fdf4' : count.status === 'DRAFT' ? '#fef3c7' : '#fef2f2', color: count.status === 'CONFIRMED' ? '#16a34a' : count.status === 'DRAFT' ? '#d97706' : '#dc2626' }}>
              {count.status}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Total Items</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1f2937' }}>{count.items.length}</div>
        </div>
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Items with Variance</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: itemsWithVariance.length > 0 ? '#dc2626' : '#059669' }}>{itemsWithVariance.length}</div>
        </div>
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Total Variance</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: totalVariance !== 0 ? '#dc2626' : '#059669' }}>{totalVariance.toFixed(2)}</div>
        </div>
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Accuracy Rate</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1f2937' }}>
            {count.items.length > 0 ? (((count.items.length - itemsWithVariance.length) / count.items.length) * 100).toFixed(1) : 0}%
          </div>
        </div>
      </div>

      {/* Actions */}
      {count.status === 'DRAFT' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowConfirmModal(true)} style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Confirm & Apply Adjustments</button>
          <button onClick={handleCancel} style={{ padding: '10px 20px', background: '#fef2f2', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel Count</button>
        </div>
      )}

      {count.notes && (
        <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Notes</div>
          <div style={{ fontSize: 14, color: '#6b7280' }}>{count.notes}</div>
        </div>
      )}

      {/* Items Table */}
      <div style={{ background: 'white', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Counted Items</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Product</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Variant</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>System Qty</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Physical Qty</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Variance</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {count.items.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', background: item.difference !== 0 ? '#fef2f2' : 'transparent' }}>
                <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{item.product.name}</td>
                <td style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>{item.variant?.name || '-'}</td>
                <td style={{ padding: 12, fontSize: 14, textAlign: 'right' }}>{Number(item.systemQuantity).toFixed(2)}</td>
                <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600 }}>{Number(item.physicalQuantity).toFixed(2)}</td>
                <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600, color: item.difference !== 0 ? '#dc2626' : '#059669' }}>
                  {item.difference > 0 ? '+' : ''}{Number(item.difference).toFixed(2)}
                </td>
                <td style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>{item.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 500, width: '90%' }}>
            <h2 style={{ fontSize: 20, marginBottom: 16 }}>Confirm Stock Count</h2>
            
            <div style={{ padding: 16, background: '#fef3c7', borderRadius: 8, marginBottom: 20 }}>
              <p style={{ fontSize: 14, color: '#78350f', margin: 0 }}>
                <strong>Warning:</strong> This will apply inventory adjustments for {itemsWithVariance.length} item{itemsWithVariance.length !== 1 ? 's' : ''} with variance. This action cannot be undone.
              </p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Confirmation Notes (Optional)</label>
              <textarea value={confirmNotes} onChange={(e) => setConfirmNotes(e.target.value)} rows={3} placeholder="Add notes about this confirmation..." style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowConfirmModal(false)} disabled={processing} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleConfirm} disabled={processing} style={{ padding: '10px 20px', background: processing ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {processing ? 'Confirming...' : 'Confirm & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

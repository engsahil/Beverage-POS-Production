import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

interface TransferItem {
  id: string;
  productId: string;
  variantId: string | null;
  product: { name: string; sku: string | null };
  variant?: { name: string } | null;
  quantity: number;
  notes: string | null;
}

interface Transfer {
  id: string;
  transferNumber: string;
  transferDate: string;
  status: string;
  notes: string | null;
  sourceBranch: { name: string };
  destinationBranch: { name: string };
  creator: { fullName: string };
  approver?: { fullName: string } | null;
  receiver?: { fullName: string } | null;
  approvedAt: string | null;
  receivedAt: string | null;
  items: TransferItem[];
}

export default function TransferDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (id) loadTransfer();
  }, [id]);

  const loadTransfer = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/transfers/${id}`);
      setTransfer(data.data);
    } catch (err) {
      console.error('Failed to load transfer:', err);
      alert('Failed to load transfer');
      navigate('/transfers');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!confirm('Approve this transfer? Stock will be deducted from source branch.')) return;
    try {
      setProcessing(true);
      await api.post(`/transfers/${id}/approve`);
      loadTransfer();
      alert('Transfer approved. Stock deducted from source branch.');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to approve');
    } finally {
      setProcessing(false);
    }
  };

  const handleReceive = async () => {
    if (!confirm('Receive this transfer? Stock will be added to destination branch.')) return;
    try {
      setProcessing(true);
      await api.post(`/transfers/${id}/receive`);
      loadTransfer();
      alert('Transfer received. Stock added to destination branch.');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to receive');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this transfer?')) return;
    try {
      await api.post(`/transfers/${id}/cancel`);
      navigate('/transfers');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to cancel');
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  }

  if (!transfer) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Transfer not found</div>;
  }

  const totalItems = transfer.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => navigate('/transfers')} style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer', marginBottom: 16 }}>← Back to Transfers</button>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 8 }}>Transfer {transfer.transferNumber}</h1>
            <div style={{ display: 'flex', gap: 16, fontSize: 14, color: '#6b7280' }}>
              <span>Date: {new Date(transfer.transferDate).toLocaleDateString()}</span>
              <span>Created by: {transfer.creator.fullName}</span>
            </div>
          </div>
          <span style={{ padding: '6px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600, background: transfer.status === 'RECEIVED' ? '#f0fdf4' : transfer.status === 'APPROVED' ? '#eff6ff' : transfer.status === 'DRAFT' ? '#fef3c7' : '#fef2f2', color: transfer.status === 'RECEIVED' ? '#16a34a' : transfer.status === 'APPROVED' ? '#2563eb' : transfer.status === 'DRAFT' ? '#d97706' : '#dc2626' }}>
            {transfer.status}
          </span>
        </div>
      </div>

      {/* Transfer Flow */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 24, marginBottom: 24 }}>
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Source Branch</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#1f2937' }}>{transfer.sourceBranch.name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 24, color: '#9ca3af' }}>→</div>
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Destination Branch</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#1f2937' }}>{transfer.destinationBranch.name}</div>
        </div>
      </div>

      {/* Status Timeline */}
      <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 16 }}>Status Timeline</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>Created</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{new Date(transfer.transferDate).toLocaleString()}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>by {transfer.creator.fullName}</div>
          </div>
          {transfer.approvedAt && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>Approved</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{new Date(transfer.approvedAt).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>by {transfer.approver?.fullName}</div>
            </div>
          )}
          {transfer.receivedAt && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#2563eb' }}>Received</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{new Date(transfer.receivedAt).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>by {transfer.receiver?.fullName}</div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {(transfer.status === 'DRAFT' || transfer.status === 'APPROVED') && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {transfer.status === 'DRAFT' && (
            <>
              <button onClick={handleApprove} disabled={processing} style={{ padding: '10px 20px', background: processing ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {processing ? 'Approving...' : 'Approve Transfer'}
              </button>
              <button onClick={handleCancel} style={{ padding: '10px 20px', background: '#fef2f2', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </>
          )}
          {transfer.status === 'APPROVED' && (
            <button onClick={handleReceive} disabled={processing} style={{ padding: '10px 20px', background: processing ? '#9ca3af' : '#059669', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              {processing ? 'Receiving...' : 'Receive Transfer'}
            </button>
          )}
        </div>
      )}

      {transfer.notes && (
        <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Notes</div>
          <div style={{ fontSize: 14, color: '#6b7280' }}>{transfer.notes}</div>
        </div>
      )}

      {/* Items Table */}
      <div style={{ background: 'white', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18 }}>Transfer Items</h2>
          <div style={{ fontSize: 14, color: '#6b7280' }}>Total: {totalItems.toFixed(2)} units</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Product</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Variant</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Quantity</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {transfer.items.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{item.product.name}</td>
                <td style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>{item.variant?.name || '-'}</td>
                <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600 }}>{Number(item.quantity).toFixed(2)}</td>
                <td style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>{item.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

interface ClaimItem {
  id: string;
  productId: string;
  variantId: string | null;
  product: { name: string; sku: string | null };
  variant?: { name: string } | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
  reason: string;
}

interface Claim {
  id: string;
  claimNumber: string;
  claimDate: string;
  claimType: string;
  status: string;
  reason: string;
  notes: string | null;
  vendor?: { name: string } | null;
  purchase?: { purchaseNumber: string } | null;
  creator: { fullName: string };
  submitter?: { fullName: string } | null;
  reviewer?: { fullName: string } | null;
  approver?: { fullName: string } | null;
  resolver?: { fullName: string } | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  resolvedAt: string | null;
  items: ClaimItem[];
}

export default function ClaimDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'submit' | 'review' | 'approve' | 'reject' | 'resolve'>('submit');
  const [actionNotes, setActionNotes] = useState('');

  useEffect(() => {
    if (id) loadClaim();
  }, [id]);

  const loadClaim = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/claims/${id}`);
      setClaim(data.data);
    } catch (err) {
      console.error('Failed to load claim:', err);
      alert('Failed to load claim');
      navigate('/claims');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async () => {
    try {
      setProcessing(true);
      await api.post(`/claims/${id}/${actionType}`, { notes: actionNotes || null });
      setShowActionModal(false);
      setActionNotes('');
      loadClaim();
      alert(`Claim ${actionType}d successfully`);
    } catch (err: any) {
      alert(err.response?.data?.error?.message || `Failed to ${actionType} claim`);
    } finally {
      setProcessing(false);
    }
  };

  const openActionModal = (type: 'submit' | 'review' | 'approve' | 'reject' | 'resolve') => {
    setActionType(type);
    setShowActionModal(true);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  }

  if (!claim) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Claim not found</div>;
  }

  const totalAmount = claim.items.reduce((sum, item) => sum + item.totalCost, 0);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => navigate('/claims')} style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer', marginBottom: 16 }}>← Back to Claims</button>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 8 }}>Claim {claim.claimNumber}</h1>
            <div style={{ display: 'flex', gap: 16, fontSize: 14, color: '#6b7280' }}>
              <span>Date: {new Date(claim.claimDate).toLocaleDateString()}</span>
              <span>Type: {claim.claimType}</span>
              <span>Created by: {claim.creator.fullName}</span>
            </div>
          </div>
          <span style={{ padding: '6px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600, background: claim.status === 'RESOLVED' ? '#f0fdf4' : claim.status === 'APPROVED' ? '#eff6ff' : claim.status === 'DRAFT' ? '#fef3c7' : '#fef2f2', color: claim.status === 'RESOLVED' ? '#16a34a' : claim.status === 'APPROVED' ? '#2563eb' : claim.status === 'DRAFT' ? '#d97706' : '#dc2626' }}>
            {claim.status}
          </span>
        </div>
      </div>

      {/* Claim Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Vendor</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>{claim.vendor?.name || 'N/A'}</div>
        </div>
        <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Purchase Reference</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>{claim.purchase?.purchaseNumber || 'N/A'}</div>
        </div>
      </div>

      {/* Status Timeline */}
      <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 16 }}>Status Timeline</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>Created</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{new Date(claim.claimDate).toLocaleString()}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>by {claim.creator.fullName}</div>
          </div>
          {claim.submittedAt && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#d97706' }}>Submitted</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{new Date(claim.submittedAt).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>by {claim.submitter?.fullName}</div>
            </div>
          )}
          {claim.reviewedAt && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>Reviewed</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{new Date(claim.reviewedAt).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>by {claim.reviewer?.fullName}</div>
            </div>
          )}
          {claim.approvedAt && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#2563eb' }}>Approved</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{new Date(claim.approvedAt).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>by {claim.approver?.fullName}</div>
            </div>
          )}
          {claim.resolvedAt && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>Resolved</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{new Date(claim.resolvedAt).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>by {claim.resolver?.fullName}</div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {claim.status !== 'RESOLVED' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {claim.status === 'DRAFT' && (
            <button onClick={() => openActionModal('submit')} style={{ padding: '10px 20px', background: '#d97706', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Submit for Review</button>
          )}
          {claim.status === 'SUBMITTED' && (
            <button onClick={() => openActionModal('review')} style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Review Claim</button>
          )}
          {claim.status === 'REVIEWED' && (
            <>
              <button onClick={() => openActionModal('approve')} style={{ padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Approve</button>
              <button onClick={() => openActionModal('reject')} style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Reject</button>
            </>
          )}
          {claim.status === 'APPROVED' && (
            <button onClick={() => openActionModal('resolve')} style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Mark as Resolved</button>
          )}
        </div>
      )}

      {/* Reason and Notes */}
      <div style={{ background: '#f9fafb', padding: 16, borderRadius: 8, marginBottom: 24 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Reason</div>
          <div style={{ fontSize: 14, color: '#6b7280' }}>{claim.reason}</div>
        </div>
        {claim.notes && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 14, color: '#6b7280' }}>{claim.notes}</div>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div style={{ background: 'white', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18 }}>Claim Items</h2>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#dc2626' }}>Total: Rs. {totalAmount.toFixed(2)}</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Product</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Variant</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Qty</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Unit Cost</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Total</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {claim.items.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{item.product.name}</td>
                <td style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>{item.variant?.name || '-'}</td>
                <td style={{ padding: 12, fontSize: 14, textAlign: 'right' }}>{Number(item.quantity).toFixed(2)}</td>
                <td style={{ padding: 12, fontSize: 14, textAlign: 'right' }}>Rs. {Number(item.unitCost).toFixed(2)}</td>
                <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600 }}>Rs. {Number(item.totalCost).toFixed(2)}</td>
                <td style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>{item.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Action Modal */}
      {showActionModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 500, width: '90%' }}>
            <h2 style={{ fontSize: 20, marginBottom: 16, textTransform: 'capitalize' }}>{actionType} Claim</h2>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Notes (Optional)</label>
              <textarea value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} rows={3} placeholder={`Add notes about ${actionType}ing this claim...`} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowActionModal(false); setActionNotes(''); }} disabled={processing} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAction} disabled={processing} style={{ padding: '10px 20px', background: processing ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {processing ? `${actionType}ing...` : actionType.charAt(0).toUpperCase() + actionType.slice(1)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

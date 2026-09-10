import { useState } from 'react';
import api from '../api';
import {
  IconAlertTriangle,
  IconLock,
  IconCheck,
  IconX,
} from './Icons';

interface PriceOverrideModalProps {
  isOpen: boolean;
  productName: string;
  originalPrice: number;
  requestedPrice: number;
  onApprove: (approved: boolean, approvedPrice?: number) => void;
  onClose: () => void;
}

export default function PriceOverrideModal({
  isOpen,
  productName,
  originalPrice,
  requestedPrice,
  onApprove,
  onClose,
}: PriceOverrideModalProps) {
  const [mode, setMode] = useState<'request' | 'approve'>('request');
  const [reason, setReason] = useState('');
  const [approverCredentials, setApproverCredentials] = useState({ username: '', password: '' });
  const [approvedPrice, setApprovedPrice] = useState(requestedPrice);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const discount = originalPrice - requestedPrice;
  const discountPercent = ((discount / originalPrice) * 100).toFixed(1);

  const handleRequestApproval = async () => {
    if (!reason.trim()) {
      setError('Please provide a justification reason for the price override');
      return;
    }
    setMode('approve');
    setError('');
  };

  const handleApprove = async () => {
    if (!approverCredentials.username || !approverCredentials.password) {
      setError('Supervisor / Manager credentials required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const { data } = await api.post('/auth/login', approverCredentials);
      const managerUser = data.data.user;

      if (!managerUser.permissions?.includes('*') && !managerUser.permissions?.includes('pos.override')) {
        setError('Authenticated user does not have price override authorization');
        setLoading(false);
        return;
      }

      onApprove(true, approvedPrice);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Invalid supervisor credentials');
      } else {
        setError(err.response?.data?.error?.message || 'Failed to authenticate override authorization');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReject = () => {
    onApprove(false);
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
          padding: 24,
          maxWidth: 480,
          width: '90%',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        {mode === 'request' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: 'var(--warning-bg)',
                  color: 'var(--warning)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconAlertTriangle size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>Price Override Request</h2>
                <p style={{ fontSize: 12, color: 'var(--text-subtle)' }}>Requires supervisor PIN verification</p>
              </div>
            </div>

            <div
              style={{
                padding: '14px 16px',
                background: 'var(--warning-bg)',
                border: '1px solid var(--warning-border)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>{productName}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: '#78350f' }}>
                <div>Original Price: <strong className="mono">Rs. {originalPrice.toFixed(2)}</strong></div>
                <div>Requested Price: <strong className="mono" style={{ color: 'var(--primary)' }}>Rs. {requestedPrice.toFixed(2)}</strong></div>
                <div style={{ gridColumn: 'span 2' }}>
                  Line Discount: <strong className="mono">Rs. {discount.toFixed(2)} ({discountPercent}%)</strong>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                Override Justification / Reason *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Promotional beverage bundle, damaged outer box, loyalty gesture..."
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  padding: '10px 12px',
                  background: 'var(--danger-bg)',
                  border: '1px solid var(--danger-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--danger)',
                  fontSize: 12,
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <IconAlertTriangle size={15} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '9px 16px',
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRequestApproval}
                disabled={!reason.trim()}
                style={{
                  padding: '9px 18px',
                  background: !reason.trim() ? '#cbd5e1' : 'var(--primary)',
                  color: '#ffffff',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Request Supervisor PIN
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: '#f1f5f9',
                  color: 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconLock size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>Supervisor Authorization</h2>
                <p style={{ fontSize: 12, color: 'var(--text-subtle)' }}>Enter manager login to unlock price adjustment</p>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                Supervisor Approved Price (PKR)
              </label>
              <input
                type="number"
                step="0.01"
                value={approvedPrice}
                onChange={(e) => setApprovedPrice(parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 14,
                  fontWeight: 600,
                }}
                className="mono"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                Manager Username *
              </label>
              <input
                type="text"
                placeholder="Supervisor username"
                value={approverCredentials.username}
                onChange={(e) => setApproverCredentials({ ...approverCredentials, username: e.target.value })}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                Manager Password / PIN *
              </label>
              <input
                type="password"
                placeholder="Supervisor password"
                value={approverCredentials.password}
                onChange={(e) => setApproverCredentials({ ...approverCredentials, password: e.target.value })}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  padding: '10px 12px',
                  background: 'var(--danger-bg)',
                  border: '1px solid var(--danger-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--danger)',
                  fontSize: 12,
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <IconAlertTriangle size={15} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setMode('request');
                  setApproverCredentials({ username: '', password: '' });
                  setError('');
                }}
                style={{
                  padding: '9px 14px',
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                }}
              >
                Back
              </button>
              <button
                onClick={handleReject}
                style={{
                  padding: '9px 16px',
                  background: 'var(--danger-bg)',
                  color: 'var(--danger)',
                  border: '1px solid var(--danger-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Decline
              </button>
              <button
                onClick={handleApprove}
                disabled={loading}
                style={{
                  padding: '9px 20px',
                  background: loading ? '#cbd5e1' : 'var(--success)',
                  color: '#ffffff',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {loading ? 'Validating...' : 'Authorize Override'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

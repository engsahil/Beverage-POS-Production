import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import {
  IconClock,
  IconCheckCircle,
  IconAlertTriangle,
  IconPlus,
} from './Icons';

interface Shift {
  id: string;
  status: string;
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  actualAmount?: number;
  difference?: number;
  openedAt: string;
  closedAt?: string;
  notes?: string;
}

interface ShiftManagerProps {
  onShiftChange: (shift: Shift | null) => void;
}

export default function ShiftManager({ onShiftChange }: ShiftManagerProps) {
  const { user } = useAuth();
  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadActiveShift();
  }, []);

  // Backend returns openingCash/openingDate (Decimal serialized as string);
  // normalize to the shape this component renders.
  const normalizeShift = (s: any): Shift => ({
    ...s,
    openingAmount: Number(s.openingCash ?? s.openingAmount ?? 0),
    openedAt: s.openingDate ?? s.openedAt ?? s.createdAt,
  });

  const loadActiveShift = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/shifts/active', {
        params: user?.branchId ? { branchId: user.branchId } : undefined,
      });
      if (data.data) {
        const normalized = normalizeShift(data.data);
        setShift(normalized);
        onShiftChange(normalized);
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        console.error('Failed to load shift:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const openShift = async () => {
    if (!openingAmount || parseFloat(openingAmount) < 0) {
      setError('Please enter a valid opening float cash amount');
      return;
    }

    try {
      setError('');
      const { data } = await api.post('/shifts/open', {
        branchId: user?.branchId,
        openingCash: parseFloat(openingAmount),
        openingNotes: notes || undefined,
      });
      const normalized = normalizeShift(data.data);
      setShift(normalized);
      onShiftChange(normalized);
      setShowOpenForm(false);
      setOpeningAmount('');
      setNotes('');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to open shift');
    }
  };

  const closeShift = async () => {
    if (!closingAmount || parseFloat(closingAmount) < 0) {
      setError('Please enter verified counted cash amount');
      return;
    }

    try {
      setError('');
      const { data } = await api.post(`/shifts/${shift?.id}/close`, {
        actualCash: parseFloat(closingAmount),
        closingNotes: notes || undefined,
      });
      setShift(null);
      onShiftChange(null);
      setShowCloseForm(false);
      setClosingAmount('');
      setNotes('');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to close shift');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-subtle)', background: 'var(--surface-subtle)' }}>
        Checking shift status...
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 16px', background: '#ffffff', borderBottom: '1px solid var(--border)' }}>
      {!shift ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>No Active Terminal Shift</div>
              <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Open shift register to enable checkout & receipt printing</div>
            </div>
            <button
              onClick={() => setShowOpenForm(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                background: 'var(--primary)',
                color: '#ffffff',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <IconPlus size={14} />
              <span>Open Shift</span>
            </button>
          </div>

          {showOpenForm && (
            <div className="fade-in" style={{ marginTop: 12, padding: 14, background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  Opening Float Cash (PKR) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  placeholder="0.00"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    fontSize: 13,
                    background: '#ffffff',
                  }}
                  className="mono"
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  Shift Remarks (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Morning counter float"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    fontSize: 12,
                    background: '#ffffff',
                  }}
                />
              </div>
              {error && (
                <div style={{ padding: '8px 10px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 4, color: 'var(--danger)', fontSize: 12, marginBottom: 10 }}>
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={openShift}
                  style={{
                    flex: 1,
                    padding: '7px 12px',
                    background: 'var(--primary)',
                    color: '#ffffff',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Confirm & Open Register
                </button>
                <button
                  onClick={() => {
                    setShowOpenForm(false);
                    setError('');
                  }}
                  style={{
                    padding: '7px 14px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  borderRadius: 9999,
                  background: 'var(--success-bg)',
                  border: '1px solid var(--success-border)',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--success)',
                }}
              >
                <IconCheckCircle size={13} />
                <span>Shift Active</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Opened: <span className="mono" style={{ fontWeight: 600 }}>{new Date(shift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> | Float: <span className="mono" style={{ fontWeight: 600 }}>Rs. {(Number(shift.openingAmount) || 0).toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={() => setShowCloseForm(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                background: '#78350f',
                color: '#ffffff',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <IconClock size={13} />
              <span>Close Shift</span>
            </button>
          </div>

          {showCloseForm && (
            <div className="fade-in" style={{ marginTop: 12, padding: 14, background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ marginBottom: 10, padding: '10px 12px', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 2 }}>
                  Register Float Summary
                </div>
                <div style={{ fontSize: 12, color: '#78350f' }} className="mono">
                  Opening Float: Rs. {(Number(shift.openingAmount) || 0).toFixed(2)}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  Counted Cash in Drawer (PKR) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={closingAmount}
                  onChange={(e) => setClosingAmount(e.target.value)}
                  placeholder="0.00"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    fontSize: 13,
                    background: '#ffffff',
                  }}
                  className="mono"
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  Closing Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Cash drawer count notes..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    fontSize: 12,
                    background: '#ffffff',
                  }}
                />
              </div>
              {error && (
                <div style={{ padding: '8px 10px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 4, color: 'var(--danger)', fontSize: 12, marginBottom: 10 }}>
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={closeShift}
                  style={{
                    flex: 1,
                    padding: '7px 12px',
                    background: '#78350f',
                    color: '#ffffff',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Reconcile & Close Shift
                </button>
                <button
                  onClick={() => {
                    setShowCloseForm(false);
                    setError('');
                  }}
                  style={{
                    padding: '7px 14px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

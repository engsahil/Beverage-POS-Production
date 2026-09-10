import { useState, useEffect } from 'react';
import api from '../api';
import {
  IconCalendar,
  IconCheckCircle,
  IconClock,
  IconPlus,
  IconAlertTriangle,
} from '../components/Icons';

interface DailyRecord {
  id: string;
  businessDate: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  opener: { fullName: string };
  closer?: { fullName: string } | null;
  notes: string | null;
}

export default function DailyRecords() {
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [current, setCurrent] = useState<DailyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadRecords();
    loadCurrent();
  }, []);

  const loadRecords = async () => {
    try {
      const { data } = await api.get('/daily-records', { params: { limit: 30 } });
      setRecords(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrent = async () => {
    try {
      const { data } = await api.get('/daily-records/current');
      setCurrent(data.data || null);
    } catch (err) {}
  };

  const openDay = async () => {
    try {
      await api.post('/daily-records/open', { notes: notes || undefined });
      setShowOpenModal(false);
      setNotes('');
      loadRecords();
      loadCurrent();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to open day');
    }
  };

  const closeDay = async () => {
    if (!current) return;
    if (!confirm('Close the active business day? All active shifts will be reconciled.')) return;
    try {
      await api.post(`/daily-records/${current.id}/close`, { notes: notes || undefined });
      setShowCloseModal(false);
      setNotes('');
      loadRecords();
      loadCurrent();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to close day');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-subtle)' }}>
        Loading daily record history...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-main)', letterSpacing: -0.4 }}>
            Daily Records Management
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-subtle)', marginTop: 2 }}>
            Business date tracking, opening/closing sessions, and audit controls
          </p>
        </div>
        {current ? (
          <button
            onClick={() => setShowCloseModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 18px',
              background: '#78350f',
              color: '#ffffff',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <IconClock size={16} color="#ffffff" />
            <span>Close Active Day</span>
          </button>
        ) : (
          <button
            onClick={() => setShowOpenModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 18px',
              background: 'var(--color-primary)',
              color: '#ffffff',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <IconPlus size={16} color="#ffffff" />
            <span>Open Business Day</span>
          </button>
        )}
      </div>

      {/* Active Day Banner */}
      {current && (
        <div
          style={{
            background: 'var(--color-success-bg)',
            border: '1px solid var(--color-success-border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ color: 'var(--color-success)' }}>
              <IconCheckCircle size={24} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#065f46' }}>
                Active Business Day: {new Date(current.businessDate).toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
              <div style={{ fontSize: 12, color: '#047857', marginTop: 2 }}>
                Opened at {new Date(current.openedAt).toLocaleTimeString()} by {current.opener?.fullName}
              </div>
            </div>
          </div>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 700,
              background: '#dcfce7',
              color: '#15803d',
              letterSpacing: '0.04em',
            }}
          >
            TRADING ACTIVE
          </span>
        </div>
      )}

      {/* Records Table Card */}
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Opened At</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Closed At</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Opened By</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Closed By</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--color-text-light)' }}>
                  <IconCalendar size={32} color="#cbd5e1" style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' }}>No historical daily records found</div>
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: '1px solid var(--color-border-subtle)', transition: 'background 0.1s ease' }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '14px 20px', fontSize: 13, fontWeight: 600, color: 'var(--color-text-main)' }} className="mono">
                    {new Date(r.businessDate).toLocaleDateString('en-PK')}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 12, color: 'var(--color-text-muted)' }} className="mono">
                    {new Date(r.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 12, color: 'var(--color-text-muted)' }} className="mono">
                    {r.closedAt ? new Date(r.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: 'var(--color-text-main)', fontWeight: 500 }}>
                    {r.opener?.fullName || 'System'}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: 'var(--color-text-muted)' }}>
                    {r.closer?.fullName || '-'}
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: 9999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: r.status === 'OPEN' ? 'var(--color-success-bg)' : 'var(--color-surface-hover)',
                        color: r.status === 'OPEN' ? 'var(--color-success)' : 'var(--color-text-muted)',
                        border: r.status === 'OPEN' ? '1px solid var(--color-success-border)' : '1px solid var(--color-border)',
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Open Day Modal */}
      {showOpenModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="modal-animate"
            style={{
              background: '#ffffff',
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              maxWidth: 420,
              width: '90%',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 8 }}>
              Open Business Trading Day
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-subtle)', marginBottom: 18 }}>
              Initialize transaction counters and enable cashier shift openings.
            </p>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>
                Session Opening Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Add any specific operational notes..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowOpenModal(false)}
                style={{
                  padding: '8px 16px',
                  background: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--color-text-muted)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={openDay}
                style={{
                  padding: '8px 18px',
                  background: 'var(--color-primary)',
                  color: '#ffffff',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Confirm & Open Day
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Day Modal */}
      {showCloseModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="modal-animate"
            style={{
              background: '#ffffff',
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              maxWidth: 420,
              width: '90%',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 8 }}>
              Close Business Day
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-subtle)', marginBottom: 18 }}>
              Reconcile all register totals and produce final closing ledger.
            </p>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>
                Closing Summary Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Enter end-of-day summary details..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCloseModal(false)}
                style={{
                  padding: '8px 16px',
                  background: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--color-text-muted)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={closeDay}
                style={{
                  padding: '8px 18px',
                  background: '#78350f',
                  color: '#ffffff',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Confirm & Close Day
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

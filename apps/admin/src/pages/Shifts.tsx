import { useState, useEffect } from 'react';
import api from '../api';

interface Shift {
  id: string;
  shiftNumber: string;
  openingDate: string;
  closingDate: string | null;
  openingCash: number;
  expectedCash: number | null;
  actualCash: number | null;
  cashDifference: number | null;
  salesTotal: number;
  cashSales: number;
  cardSales: number;
  status: string;
  cashier: { fullName: string };
  openingNotes: string | null;
  closingNotes: string | null;
}

export default function Shifts() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

  useEffect(() => {
    loadShifts();
  }, []);

  const loadShifts = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/shifts', { params: { limit: 50 } });
      setShifts(data.data || []);
    } catch (err: any) {
      setError('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading shifts...</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 24 }}>Cashier Shifts</h1>

      {error && <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #dc2626', borderRadius: 8, color: '#991b1b', marginBottom: 16 }}>{error}</div>}

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Open Shifts', value: shifts.filter(s => s.status === 'OPEN').length, color: '#059669' },
          { label: 'Closed Today', value: shifts.filter(s => s.status === 'CLOSED' && s.closingDate && new Date(s.closingDate).toDateString() === new Date().toDateString()).length, color: '#1f2937' },
          { label: 'Total Sales Today', value: `Rs. ${shifts.filter(s => s.closingDate && new Date(s.closingDate).toDateString() === new Date().toDateString()).reduce((sum, s) => sum + Number(s.salesTotal), 0).toFixed(2)}`, color: '#dc2626' },
          { label: 'Cash Differences', value: shifts.filter(s => s.cashDifference && Math.abs(Number(s.cashDifference)) > 0).length, color: '#d97706' },
        ].map((card, i) => (
          <div key={i} style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Shift #</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Cashier</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Opened</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Closed</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Opening</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Sales</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Difference</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {shifts.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No shifts found</td></tr>
            ) : (
              shifts.map(shift => (
                <tr key={shift.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => setSelectedShift(shift)}>
                  <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{shift.shiftNumber}</td>
                  <td style={{ padding: 12, fontSize: 14 }}>{shift.cashier?.fullName}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>{new Date(shift.openingDate).toLocaleString()}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>{shift.closingDate ? new Date(shift.closingDate).toLocaleString() : '-'}</td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right' }}>Rs. {Number(shift.openingCash).toFixed(2)}</td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>Rs. {Number(shift.salesTotal).toFixed(2)}</td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600, color: shift.cashDifference && Math.abs(Number(shift.cashDifference)) > 0 ? '#dc2626' : '#059669' }}>
                    {shift.cashDifference !== null ? `Rs. ${Number(shift.cashDifference).toFixed(2)}` : '-'}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: shift.status === 'OPEN' ? '#f0fdf4' : shift.status === 'CLOSED' ? '#f3f4f6' : '#fef2f2',
                      color: shift.status === 'OPEN' ? '#16a34a' : shift.status === 'CLOSED' ? '#6b7280' : '#dc2626',
                    }}>{shift.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Shift Detail Modal */}
      {selectedShift && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 600, width: '90%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, color: '#1f2937' }}>Shift {selectedShift.shiftNumber}</h2>
              <button onClick={() => setSelectedShift(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div><span style={{ fontSize: 12, color: '#6b7280' }}>Cashier:</span><div style={{ fontSize: 14, fontWeight: 600 }}>{selectedShift.cashier?.fullName}</div></div>
              <div><span style={{ fontSize: 12, color: '#6b7280' }}>Status:</span><div style={{ fontSize: 14, fontWeight: 600 }}>{selectedShift.status}</div></div>
              <div><span style={{ fontSize: 12, color: '#6b7280' }}>Opened:</span><div style={{ fontSize: 14 }}>{new Date(selectedShift.openingDate).toLocaleString()}</div></div>
              <div><span style={{ fontSize: 12, color: '#6b7280' }}>Closed:</span><div style={{ fontSize: 14 }}>{selectedShift.closingDate ? new Date(selectedShift.closingDate).toLocaleString() : 'Still Open'}</div></div>
            </div>
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>Financial Summary</h3>
            <div style={{ background: '#f9fafb', padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span>Opening Cash:</span><span style={{ fontWeight: 600 }}>Rs. {Number(selectedShift.openingCash).toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span>Total Sales:</span><span style={{ fontWeight: 600, color: '#dc2626' }}>Rs. {Number(selectedShift.salesTotal).toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span>Cash Sales:</span><span>Rs. {Number(selectedShift.cashSales).toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span>Card Sales:</span><span>Rs. {Number(selectedShift.cardSales).toFixed(2)}</span></div>
              {selectedShift.expectedCash !== null && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span>Expected Cash:</span><span style={{ fontWeight: 600 }}>Rs. {Number(selectedShift.expectedCash).toFixed(2)}</span></div>}
              {selectedShift.actualCash !== null && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span>Actual Cash:</span><span style={{ fontWeight: 600 }}>Rs. {Number(selectedShift.actualCash).toFixed(2)}</span></div>}
              {selectedShift.cashDifference !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
                  <span style={{ fontWeight: 700 }}>Difference:</span>
                  <span style={{ fontWeight: 700, color: Math.abs(Number(selectedShift.cashDifference)) > 0 ? '#dc2626' : '#059669' }}>Rs. {Number(selectedShift.cashDifference).toFixed(2)}</span>
                </div>
              )}
            </div>
            {selectedShift.openingNotes && <div style={{ marginBottom: 8 }}><span style={{ fontSize: 12, color: '#6b7280' }}>Opening Notes:</span><p style={{ fontSize: 13, margin: '4px 0' }}>{selectedShift.openingNotes}</p></div>}
            {selectedShift.closingNotes && <div><span style={{ fontSize: 12, color: '#6b7280' }}>Closing Notes:</span><p style={{ fontSize: 13, margin: '4px 0' }}>{selectedShift.closingNotes}</p></div>}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { IconClock, IconTrash, IconReceipt, IconCheckCircle } from './Icons';

export interface HeldSale {
  id: string;
  items: any[];
  customer: any | null;
  heldAt: string;
  note: string;
}

const STORAGE_KEY = 'bevpos_held_sales';

function loadHeldSales(): HeldSale[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveHeldSales(sales: HeldSale[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
}

interface HoldSaleProps {
  cart: any[];
  selectedCustomer: any | null;
  onRecall: (heldCart: any[], customer: any | null) => void;
  onClose: () => void;
}

export default function HoldSaleModal({
  cart,
  selectedCustomer,
  onRecall,
  onClose,
}: HoldSaleProps) {
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<'hold' | 'resume'>('hold');

  useEffect(() => {
    setHeldSales(loadHeldSales());
  }, []);

  const handleHold = () => {
    if (cart.length === 0) {
      alert('Active cart is empty - nothing to hold');
      return;
    }
    const sale: HeldSale = {
      id: `HOLD-${Date.now()}`,
      items: [...cart],
      customer: selectedCustomer,
      heldAt: new Date().toISOString(),
      note: note.trim() || `Held Order (${cart.length} items)`,
    };
    const updated = [sale, ...heldSales];
    saveHeldSales(updated);
    setHeldSales(updated);
    setNote('');
    onRecall([], null);
    onClose();
  };

  const handleResume = (sale: HeldSale) => {
    onRecall(sale.items, sale.customer);
    const updated = heldSales.filter((s) => s.id !== sale.id);
    saveHeldSales(updated);
    setHeldSales(updated);
    onClose();
  };

  const handleDelete = (id: string) => {
    if (!confirm('Discard this held transaction?')) return;
    const updated = heldSales.filter((s) => s.id !== id);
    saveHeldSales(updated);
    setHeldSales(updated);
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
          maxWidth: 560,
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
            <IconClock size={18} color="var(--primary)" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              Order Hold & Recall Center
            </h2>
          </div>
          <button onClick={onClose} style={{ fontSize: 20, color: 'var(--text-muted)', background: 'transparent' }}>
            ×
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setTab('hold')}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: tab === 'hold' ? 'var(--primary)' : 'var(--surface)',
              color: tab === 'hold' ? '#ffffff' : 'var(--text-muted)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              fontWeight: 600,
              border: tab === 'hold' ? 'none' : '1px solid var(--border)',
            }}
          >
            Hold Active Cart ({cart.length} items)
          </button>
          <button
            onClick={() => setTab('resume')}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: tab === 'resume' ? 'var(--primary)' : 'var(--surface)',
              color: tab === 'resume' ? '#ffffff' : 'var(--text-muted)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              fontWeight: 600,
              border: tab === 'resume' ? 'none' : '1px solid var(--border)',
            }}
          >
            Recall Orders ({heldSales.length})
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {tab === 'hold' ? (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                Temporarily store the current checkout cart in local terminal memory and clear the screen for another customer.
              </p>
              {cart.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-subtle)' }}>
                  Active cart is empty. Add products to hold an order.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                      Order Hold Note / Reference
                    </label>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Customer obtaining cash from vehicle"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      padding: 14,
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      marginBottom: 16,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}>
                      Cart Summary: {cart.length} item{cart.length !== 1 ? 's' : ''}
                    </div>
                    {selectedCustomer && (
                      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>
                        Customer: <strong>{selectedCustomer.name}</strong>
                      </div>
                    )}
                    <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 14 }} className="mono">
                      Payable Amount: Rs.{' '}
                      {cart.reduce((s: number, i: any) => s + i.total, 0).toFixed(2)}
                    </div>
                  </div>

                  <button
                    onClick={handleHold}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'var(--primary)',
                      color: '#ffffff',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    Hold Order & Clear Cart
                  </button>
                </>
              )}
            </div>
          ) : (
            <div>
              {heldSales.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-subtle)' }}>
                  No held orders in terminal storage.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {heldSales.map((sale) => (
                    <div
                      key={sale.id}
                      style={{
                        padding: '12px 14px',
                        background: '#f8fafc',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                          {sale.note}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {sale.items.length} items • Rs.{' '}
                          {sale.items.reduce((s: number, i: any) => s + i.total, 0).toFixed(2)} • Held at{' '}
                          {new Date(sale.heldAt).toLocaleTimeString()}
                          {sale.customer && ` • Customer: ${sale.customer.name}`}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => handleResume(sale)}
                          style={{
                            padding: '6px 12px',
                            background: 'var(--success)',
                            color: '#ffffff',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          Resume
                        </button>
                        <button
                          onClick={() => handleDelete(sale.id)}
                          style={{
                            padding: '6px 10px',
                            background: 'var(--danger-bg)',
                            color: 'var(--danger)',
                            border: '1px solid var(--danger-border)',
                            borderRadius: 4,
                            fontSize: 11,
                          }}
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

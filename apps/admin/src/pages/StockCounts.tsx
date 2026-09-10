import { useState, useEffect } from 'react';
import api from '../api';
import {
  IconClipboardCheck,
  IconPlus,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconTrash,
} from '../components/Icons';

interface StockCount {
  id: string;
  countNumber: string;
  countDate: string;
  status: string;
  notes: string | null;
  creator: { fullName: string };
  confirmer?: { fullName: string } | null;
  confirmedAt: string | null;
  items?: any[];
  _count?: { items: number };
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
}

export default function StockCounts() {
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [countItems, setCountItems] = useState([{ productId: '', systemQty: 0, physicalQty: 0, notes: '' }]);
  const [form, setForm] = useState({ countDate: new Date().toISOString().split('T')[0], notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCounts();
    loadProducts();
  }, []);

  const loadCounts = async () => {
    try {
      const { data } = await api.get('/stock-counts', { params: { limit: 50 } });
      setCounts(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const { data } = await api.get('/products', { params: { limit: 200 } });
      setProducts(data.data || []);
    } catch (err) {}
  };

  const addItem = () => setCountItems([...countItems, { productId: '', systemQty: 0, physicalQty: 0, notes: '' }]);
  const removeItem = (i: number) => {
    if (countItems.length > 1) setCountItems(countItems.filter((_, idx) => idx !== i));
  };
  const updateItem = (i: number, field: string, value: any) =>
    setCountItems(countItems.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));

  const handleCreate = async () => {
    const validItems = countItems.filter((i) => i.productId);
    if (validItems.length === 0) {
      alert('Please add at least one product to the count audit');
      return;
    }
    try {
      setSaving(true);
      await api.post('/stock-counts', {
        countDate: form.countDate,
        notes: form.notes,
        items: validItems.map((i) => ({
          productId: i.productId,
          systemQuantity: i.systemQty,
          physicalQuantity: i.physicalQty,
          notes: i.notes || null,
        })),
      });
      setShowCreateModal(false);
      setCountItems([{ productId: '', systemQty: 0, physicalQty: 0, notes: '' }]);
      loadCounts();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to create stock count audit');
    } finally {
      setSaving(false);
    }
  };

  const confirmCount = async (id: string) => {
    if (!confirm('Confirm this physical count? System will record variance adjustments into the stock ledger.')) return;
    try {
      await api.post(`/stock-counts/${id}/confirm`);
      loadCounts();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to confirm count');
    }
  };

  const cancelCount = async (id: string) => {
    if (!confirm('Discard and cancel this draft count audit?')) return;
    try {
      await api.post(`/stock-counts/${id}/cancel`);
      loadCounts();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to cancel count');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-subtle)' }}>
        Loading stock count sessions...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-main)', letterSpacing: -0.4 }}>
            Physical Stock Counts & Audits
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-subtle)', marginTop: 2 }}>
            Reconcile physical floor inventory with ledger quantities ({counts.length} audit sessions recorded)
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
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
          <IconPlus size={16} />
          <span>New Stock Count Audit</span>
        </button>
      </div>

      {/* Counts Table Card */}
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
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Audit Number</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Count Date</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auditor</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>SKUs Audited</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Status</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {counts.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--color-text-light)' }}>
                  <IconClipboardCheck size={32} color="#cbd5e1" style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' }}>No stock count audits performed</div>
                </td>
              </tr>
            ) : (
              counts.map((c) => (
                <tr
                  key={c.id}
                  style={{ borderBottom: '1px solid var(--color-border-subtle)', transition: 'background 0.1s ease' }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '14px 20px', fontSize: 13, fontWeight: 600, color: 'var(--color-text-main)' }} className="mono">
                    {c.countNumber}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: 'var(--color-text-muted)' }} className="mono">
                    {new Date(c.countDate).toLocaleDateString('en-PK')}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: 'var(--color-text-main)', fontWeight: 500 }}>
                    {c.creator?.fullName || 'System Staff'}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13, textAlign: 'center', color: 'var(--color-text-muted)' }} className="mono">
                    {c._count?.items || c.items?.length || 0} items
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: 9999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: c.status === 'CONFIRMED' ? 'var(--color-success-bg)' : c.status === 'DRAFT' ? 'var(--color-warning-bg)' : 'var(--color-danger-bg)',
                        color: c.status === 'CONFIRMED' ? 'var(--color-success)' : c.status === 'DRAFT' ? 'var(--color-warning)' : 'var(--color-danger)',
                        border: c.status === 'CONFIRMED' ? '1px solid var(--color-success-border)' : c.status === 'DRAFT' ? '1px solid var(--color-warning-border)' : '1px solid var(--color-danger-border)',
                      }}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    {c.status === 'DRAFT' && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => confirmCount(c.id)}
                          style={{
                            padding: '4px 10px',
                            background: 'var(--color-primary)',
                            color: '#ffffff',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => cancelCount(c.id)}
                          style={{
                            padding: '4px 10px',
                            background: 'var(--color-surface-hover)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 4,
                            fontSize: 11,
                            color: 'var(--color-text-muted)',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Count Modal */}
      {showCreateModal && (
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
              maxWidth: 720,
              width: '90%',
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 6 }}>
              New Physical Stock Audit
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-subtle)', marginBottom: 18 }}>
              Enter physical item counts to compare against current warehouse ledger balances.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>Audit Date</label>
                <input
                  type="date"
                  value={form.countDate}
                  onChange={(e) => setForm({ ...form, countDate: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>Audit Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly beverage reconciliation"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                />
              </div>
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 10 }}>Audited Item Lines</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {countItems.map((item, i) => {
                const variance = item.physicalQty - item.systemQty;
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      background: 'var(--color-surface-hover)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(i, 'productId', e.target.value)}
                      style={{ flex: 2, padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 13, background: '#ffffff' }}
                    >
                      <option value="">Select Beverage Product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.sku ? `(${p.sku})` : ''}
                        </option>
                      ))}
                    </select>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>Sys:</span>
                      <input
                        type="number"
                        step="0.01"
                        value={item.systemQty}
                        onChange={(e) => updateItem(i, 'systemQty', parseFloat(e.target.value) || 0)}
                        placeholder="Sys"
                        style={{ width: 75, padding: '7px 8px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 13, textAlign: 'right' }}
                        className="mono"
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>Actual:</span>
                      <input
                        type="number"
                        step="0.01"
                        value={item.physicalQty}
                        onChange={(e) => updateItem(i, 'physicalQty', parseFloat(e.target.value) || 0)}
                        placeholder="Act"
                        style={{ width: 75, padding: '7px 8px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 13, textAlign: 'right' }}
                        className="mono"
                      />
                    </div>

                    <div style={{ minWidth: 65, textAlign: 'right' }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: variance === 0 ? 'var(--color-success)' : variance > 0 ? 'var(--color-info)' : 'var(--color-danger)',
                        }}
                        className="mono"
                      >
                        {variance === 0 ? '0.00' : `${variance > 0 ? '+' : ''}${variance.toFixed(2)}`}
                      </span>
                    </div>

                    {countItems.length > 1 && (
                      <button onClick={() => removeItem(i)} style={{ color: 'var(--color-danger)', padding: 4 }}>
                        <IconTrash size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={addItem}
              style={{
                width: '100%',
                padding: '9px',
                background: '#ffffff',
                border: '1px dashed var(--color-border-strong)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                marginBottom: 20,
              }}
            >
              + Add Item Line
            </button>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  padding: '9px 16px',
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
                onClick={handleCreate}
                disabled={saving}
                style={{
                  padding: '9px 20px',
                  background: saving ? '#cbd5e1' : 'var(--color-primary)',
                  color: '#ffffff',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {saving ? 'Creating Audit...' : 'Save Draft Audit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

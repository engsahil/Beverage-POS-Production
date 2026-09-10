import { useState, useEffect } from 'react';
import api from '../api';

interface InventoryItem {
  id: string;
  branchId: string;
  productId: string;
  variantId?: string | null;
  product: {
    name: string;
    sku?: string;
    minStockThreshold?: number | null;
  };
  currentQuantity: number;
  lowStockThreshold: number;
  unit: {
    name: string;
    shortCode: string;
  } | null;
  updatedAt: string;
}

interface StockAdjustment {
  productId: string;
  quantity: number;
  reason: string;
  notes?: string;
}

export default function Inventory() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustForm, setAdjustForm] = useState<StockAdjustment>({
    productId: '',
    quantity: 0,
    reason: 'ADJUSTMENT',
    notes: '',
  });
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get('/inventory', {
        params: { limit: 200 }
      });
      // Normalize API payload: Prisma Decimals serialize as strings, and
      // unit/threshold may be absent for product-level (non-variant) stock.
      const items = (data.data || []).map((item: any) => ({
        ...item,
        currentQuantity: Number(item.currentQuantity ?? 0),
        lowStockThreshold: Number(
          item.lowStockThreshold ?? item.product?.minStockThreshold ?? 0
        ),
      }));
      setInventory(items);
    } catch (err: any) {
      setError('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustClick = (item: InventoryItem) => {
    setAdjustItem(item);
    setAdjustForm({
      productId: item.productId,
      quantity: 0,
      reason: 'ADJUSTMENT',
      notes: '',
    });
    setShowAdjustModal(true);
  };

  const handleAdjustSubmit = async () => {
    if (!adjustItem || adjustForm.quantity === 0) return;

    try {
      setAdjusting(true);
      // The adjust API requires branchId (and variantId for variant stock).
      await api.post('/inventory/adjust', {
        branchId: adjustItem.branchId,
        productId: adjustItem.productId,
        ...(adjustItem.variantId ? { variantId: adjustItem.variantId } : {}),
        quantity: adjustForm.quantity,
        reason: adjustForm.reason,
        notes: adjustForm.notes,
      });
      setShowAdjustModal(false);
      loadInventory(); // Reload to show updated quantities
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to adjust stock');
    } finally {
      setAdjusting(false);
    }
  };

  const isLowStock = (item: InventoryItem) => {
    return item.currentQuantity <= item.lowStockThreshold;
  };

  const isOutOfStock = (item: InventoryItem) => {
    return item.currentQuantity === 0;
  };

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.product.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = !filterLowStock || isLowStock(item);
    return matchesSearch && matchesFilter;
  });

  const lowStockCount = inventory.filter(isLowStock).length;
  const outOfStockCount = inventory.filter(isOutOfStock).length;

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading inventory...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 8 }}>Inventory Management</h1>
        
        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{
            background: 'white',
            padding: 20,
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>Total Items</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#1f2937' }}>{inventory.length}</div>
          </div>
          <div style={{
            background: 'white',
            padding: 20,
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>Low Stock</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#f59e0b' }}>{lowStockCount}</div>
          </div>
          <div style={{
            background: 'white',
            padding: 20,
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>Out of Stock</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#dc2626' }}>{outOfStockCount}</div>
          </div>
        </div>

        {/* Filters */}
        <div style={{
          background: 'white',
          padding: 16,
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search by product name or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filterLowStock}
                onChange={(e) => setFilterLowStock(e.target.checked)}
              />
              <span style={{ fontSize: 14, color: '#374151' }}>Show Low Stock Only</span>
            </label>
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          padding: 16,
          background: '#fef2f2',
          border: '1px solid #dc2626',
          borderRadius: 8,
          color: '#991b1b',
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      <div style={{
        background: 'white',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Product
              </th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                SKU
              </th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Current Stock
              </th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Low Stock Threshold
              </th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Status
              </th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                  {searchTerm || filterLowStock ? 'No inventory items match your filters' : 'No inventory items found'}
                </td>
              </tr>
            ) : (
              filteredInventory.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 12, fontSize: 14, color: '#1f2937', fontWeight: 500 }}>
                    {item.product.name}
                  </td>
                  <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>
                    {item.product.sku || '-'}
                  </td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600 }}>
                    {item.currentQuantity.toFixed(2)} {(item.unit?.shortCode ?? '')}
                  </td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right', color: '#6b7280' }}>
                    {item.lowStockThreshold.toFixed(2)} {(item.unit?.shortCode ?? '')}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    {isOutOfStock(item) ? (
                      <span style={{
                        padding: '4px 12px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        Out of Stock
                      </span>
                    ) : isLowStock(item) ? (
                      <span style={{
                        padding: '4px 12px',
                        background: '#fef3c7',
                        color: '#d97706',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        Low Stock
                      </span>
                    ) : (
                      <span style={{
                        padding: '4px 12px',
                        background: '#f0fdf4',
                        color: '#16a34a',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        In Stock
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <button
                      onClick={() => handleAdjustClick(item)}
                      style={{
                        padding: '6px 12px',
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Adjust Stock
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Adjust Stock Modal */}
      {showAdjustModal && adjustItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 32,
            maxWidth: 500,
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: 20, marginBottom: 16, color: '#1f2937' }}>
              Adjust Stock: {adjustItem.product.name}
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
              Current Stock: <strong>{adjustItem.currentQuantity.toFixed(2)} {(adjustItem.unit?.shortCode ?? '')}</strong>
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Quantity Change (use negative for reduction) *
              </label>
              <input
                type="number"
                step="0.01"
                value={adjustForm.quantity}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantity: parseFloat(e.target.value) || 0 })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                New Stock: {(adjustItem.currentQuantity + adjustForm.quantity).toFixed(2)} {(adjustItem.unit?.shortCode ?? '')}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Reason *
              </label>
              <select
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              >
                <option value="ADJUSTMENT">Manual Adjustment</option>
                <option value="DAMAGED">Damaged</option>
                <option value="RETURNED">Returned</option>
                <option value="COUNT_CORRECTION">Count Correction</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Notes
              </label>
              <textarea
                value={adjustForm.notes || ''}
                onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAdjustModal(false)}
                disabled={adjusting}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: adjusting ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAdjustSubmit}
                disabled={adjusting || adjustForm.quantity === 0}
                style={{
                  padding: '10px 20px',
                  background: adjusting || adjustForm.quantity === 0 ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: adjusting || adjustForm.quantity === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {adjusting ? 'Adjusting...' : 'Confirm Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

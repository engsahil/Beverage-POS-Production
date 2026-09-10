import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api';

interface Category {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  name: string;
  shortCode: string;
}

interface Product {
  id?: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string;
  purchasePrice: number;
  sellingPrice: number;
  isActive: boolean;
  taxEnabled: boolean;
  taxRate: number;
  discountAllowed: boolean;
  maxDiscountPercent: number;
  description: string | null;
}

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState<Product>({
    name: '',
    sku: null,
    barcode: null,
    categoryId: '',
    purchasePrice: 0,
    sellingPrice: 0,
    isActive: true,
    taxEnabled: false,
    taxRate: 0,
    discountAllowed: true,
    maxDiscountPercent: 10,
    description: null,
  });

  useEffect(() => {
    loadDependencies();
    if (isEdit) {
      loadProduct();
    }
  }, [id]);

  const loadDependencies = async () => {
    try {
      const [catRes, unitRes] = await Promise.all([
        api.get('/categories', { params: { limit: 100 } }),
        api.get('/units', { params: { limit: 100 } }),
      ]);
      setCategories(catRes.data.data || []);
      setUnits(unitRes.data.data || []);
    } catch (err) {
      console.error('Failed to load dependencies:', err);
    }
  };

  const loadProduct = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/products/${id}`);
      const product = data.data;
      setForm({
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        categoryId: product.categoryId,
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        isActive: product.isActive,
        taxEnabled: product.taxEnabled,
        taxRate: product.taxRate || 0,
        discountAllowed: product.discountAllowed,
        maxDiscountPercent: product.maxDiscountPercent || 10,
        description: product.description,
      });
    } catch (err: any) {
      setError('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isEdit) {
        await api.put(`/products/${id}`, form);
      } else {
        await api.post('/products', form);
      }
      navigate('/products');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  if (loading && isEdit) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading product...</div>;
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => navigate('/products')}
          style={{
            padding: '8px 16px',
            background: '#f3f4f6',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          ← Back to Products
        </button>
        <h1 style={{ fontSize: 28, color: '#1f2937' }}>
          {isEdit ? 'Edit Product' : 'Create Product'}
        </h1>
      </div>

      <div style={{
        background: 'white',
        padding: 32,
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      }}>
        <form onSubmit={handleSubmit}>
          {/* Basic Info */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, marginBottom: 16, color: '#1f2937' }}>Basic Information</h2>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Product Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                  SKU
                </label>
                <input
                  type="text"
                  value={form.sku || ''}
                  onChange={(e) => setForm({ ...form, sku: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                  Barcode
                </label>
                <input
                  type="text"
                  value={form.barcode || ''}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Category *
              </label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              >
                <option value="">Select Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Description
              </label>
              <textarea
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value || null })}
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
          </div>

          {/* Pricing */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, marginBottom: 16, color: '#1f2937' }}>Pricing</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                  Purchase Price *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.purchasePrice}
                  onChange={(e) => setForm({ ...form, purchasePrice: parseFloat(e.target.value) || 0 })}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                  Selling Price *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.sellingPrice}
                  onChange={(e) => setForm({ ...form, sellingPrice: parseFloat(e.target.value) || 0 })}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.taxEnabled}
                  onChange={(e) => setForm({ ...form, taxEnabled: e.target.checked })}
                />
                <span style={{ fontSize: 14, color: '#374151' }}>Tax Enabled</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.discountAllowed}
                  onChange={(e) => setForm({ ...form, discountAllowed: e.target.checked })}
                />
                <span style={{ fontSize: 14, color: '#374151' }}>Discount Allowed</span>
              </label>
            </div>

            {form.taxEnabled && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                  Tax Rate (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.taxRate}
                  onChange={(e) => setForm({ ...form, taxRate: parseFloat(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    maxWidth: 200,
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
            )}

            {form.discountAllowed && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                  Max Discount (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.maxDiscountPercent}
                  onChange={(e) => setForm({ ...form, maxDiscountPercent: parseFloat(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    maxWidth: 200,
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
            )}
          </div>

          {/* Status */}
          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Active</span>
            </label>
          </div>

          {error && (
            <div style={{
              padding: 12,
              background: '#fef2f2',
              border: '1px solid #dc2626',
              borderRadius: 6,
              color: '#991b1b',
              fontSize: 14,
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: loading ? '#9ca3af' : '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Saving...' : isEdit ? 'Update Product' : 'Create Product'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/products')}
              style={{
                padding: '12px 24px',
                background: '#f3f4f6',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

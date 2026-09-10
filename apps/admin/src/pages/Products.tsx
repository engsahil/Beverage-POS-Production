import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sellingPrice: number;
  purchasePrice: number;
  isActive: boolean;
  category?: { name: string };
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/products', { params: { limit: 100 } });
      setProducts(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading products...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{
          background: '#fef2f2',
          border: '1px solid #dc2626',
          color: '#dc2626',
          padding: 16,
          borderRadius: 8,
        }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, color: '#1f2937' }}>Products ({products.length})</h1>
        <Link
          to="/products/new"
          style={{
            padding: '10px 20px',
            background: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          + Create Product
        </Link>
      </div>

      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}>
        {products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
            No products found. Create your first product to get started.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ textAlign: 'left', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>SKU</th>
                <th style={{ textAlign: 'left', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Category</th>
                <th style={{ textAlign: 'right', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Price</th>
                <th style={{ textAlign: 'center', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Status</th>
                <th style={{ textAlign: 'center', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => (
                <tr key={product.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 16, fontWeight: 500 }}>{product.name}</td>
                  <td style={{ padding: 16, color: '#6b7280', fontSize: 14 }}>{product.sku || '-'}</td>
                  <td style={{ padding: 16, color: '#6b7280', fontSize: 14 }}>{product.category?.name || '-'}</td>
                  <td style={{ padding: 16, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>
                    Rs. {product.sellingPrice.toFixed(2)}
                  </td>
                  <td style={{ padding: 16, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      background: product.isActive ? '#d1fae5' : '#fee2e2',
                      color: product.isActive ? '#065f46' : '#991b1b',
                    }}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: 16, textAlign: 'center' }}>
                    <Link
                      to={`/products/${product.id}/edit`}
                      style={{
                        padding: '6px 12px',
                        background: '#f3f4f6',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textDecoration: 'none',
                      }}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

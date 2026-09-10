import { useState, useEffect } from 'react';
import api from '../api';
import { IconUsers, IconSearch, IconTrash } from './Icons';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  creditLimit: number;
  currentBalance: number;
  status: string;
}

interface CustomerSelectorProps {
  selectedCustomer: Customer | null;
  onSelectCustomer: (customer: Customer | null) => void;
}

export default function CustomerSelector({ selectedCustomer, onSelectCustomer }: CustomerSelectorProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (search.length >= 2) {
      searchCustomers();
    } else {
      setCustomers([]);
    }
  }, [search]);

  const searchCustomers = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/customers', {
        params: {
          search,
          limit: 10,
          status: 'ACTIVE',
        },
      });
      setCustomers(data.data || []);
      setShowDropdown(true);
    } catch (err) {
      console.error('Failed to search customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectCustomer = (customer: Customer) => {
    onSelectCustomer(customer);
    setSearch('');
    setShowDropdown(false);
  };

  const clearCustomer = () => {
    onSelectCustomer(null);
    setSearch('');
  };

  return (
    <div style={{ position: 'relative' }}>
      {selectedCustomer ? (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--info-bg)',
            border: '1px solid var(--info-border)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconUsers size={14} color="#0284c7" />
              <span style={{ fontWeight: 700, color: '#0c4a6e', fontSize: 13 }}>
                {selectedCustomer.name}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#0369a1', marginTop: 2 }}>
              {selectedCustomer.phone || 'No phone'} | Ledger: Rs. {Number(selectedCustomer.currentBalance).toFixed(2)}
            </div>
          </div>
          <button
            onClick={clearCustomer}
            style={{
              padding: '3px 8px',
              background: '#ffffff',
              color: 'var(--danger)',
              border: '1px solid var(--danger-border)',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Clear
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#f8fafc',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              gap: 8,
            }}
          >
            <IconUsers size={14} color="#64748b" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => search.length >= 2 && setShowDropdown(true)}
              placeholder="Assign Customer (Name/Phone)..."
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                fontSize: 12,
                color: 'var(--text-main)',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ color: '#94a3b8', padding: 2 }}>
                ×
              </button>
            )}
          </div>

          {showDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 4,
                background: '#ffffff',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-md)',
                maxHeight: 260,
                overflowY: 'auto',
                zIndex: 1000,
              }}
            >
              {loading ? (
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 12 }}>
                  Searching registered accounts...
                </div>
              ) : customers.length === 0 ? (
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 12 }}>
                  {search.length < 2 ? 'Type at least 2 characters' : 'No matching customers found'}
                </div>
              ) : (
                customers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => selectCustomer(customer)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: '#ffffff',
                      border: 'none',
                      borderBottom: '1px solid var(--border-subtle)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'block',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 12 }}>
                      {customer.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {customer.phone || 'No phone'} • Balance: Rs. {Number(customer.currentBalance).toFixed(2)}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

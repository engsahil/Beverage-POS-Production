import { useState, useEffect } from 'react';
import api from '../api';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [activeTab, setActiveTab] = useState('business');
  const [business, setBusiness] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    taxNumber: '',
    currency: 'PKR',
    timezone: 'Asia/Karachi',
  });
  const [receipt, setReceipt] = useState({
    headerText: '',
    footerText: '',
    showLogo: true,
    showBarcode: true,
    paperWidth: '80mm',
  });
  const [pos, setPos] = useState({
    defaultTaxRate: 0,
    requireShiftOpen: true,
    allowDiscount: true,
    maxDiscountPercent: 25,
    allowPriceOverride: false,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [bizRes, receiptRes, posRes] = await Promise.all([
        api.get('/settings/business-profile').catch(() => ({ data: { data: {} } })),
        api.get('/settings/receipt').catch(() => ({ data: { data: {} } })),
        api.get('/settings/pos').catch(() => ({ data: { data: {} } })),
      ]);
      if (bizRes.data?.data) setBusiness(prev => ({ ...prev, ...bizRes.data.data }));
      if (receiptRes.data?.data) setReceipt(prev => ({ ...prev, ...receiptRes.data.data }));
      if (posRes.data?.data) setPos(prev => ({ ...prev, ...posRes.data.data }));
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (endpoint: string, data: any, tab: string) => {
    try {
      setSaving(tab);
      await api.put(`/settings/${endpoint}`, data);
      alert('Settings saved successfully');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to save settings');
    } finally {
      setSaving('');
    }
  };

  const tabs = [
    { id: 'business', label: 'Business Profile' },
    { id: 'receipt', label: 'Receipt' },
    { id: 'pos', label: 'POS' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'customer', label: 'Customer' },
    { id: 'cloud', label: 'Cloud Backup' },
    { id: 'whatsapp', label: 'WhatsApp' },
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading settings...</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 24 }}>Settings</h1>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Sidebar */}
        <div style={{ width: 200, flexShrink: 0 }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 16px',
                marginBottom: 4,
                background: activeTab === tab.id ? '#dc2626' : 'white',
                color: activeTab === tab.id ? 'white' : '#374151',
                border: activeTab === tab.id ? 'none' : '1px solid #e5e7eb',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          <div style={{ background: 'white', padding: 28, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            {activeTab === 'business' && (
              <div>
                <h2 style={{ fontSize: 18, marginBottom: 20, color: '#1f2937' }}>Business Profile</h2>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Business Name</label>
                  <input type="text" value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Address</label>
                  <textarea value={business.address} onChange={(e) => setBusiness({ ...business, address: e.target.value })} rows={2} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Phone</label>
                    <input type="tel" value={business.phone} onChange={(e) => setBusiness({ ...business, phone: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Email</label>
                    <input type="email" value={business.email} onChange={(e) => setBusiness({ ...business, email: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Tax Number</label>
                    <input type="text" value={business.taxNumber} onChange={(e) => setBusiness({ ...business, taxNumber: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Currency</label>
                    <input type="text" value={business.currency} onChange={(e) => setBusiness({ ...business, currency: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Timezone</label>
                    <input type="text" value={business.timezone} onChange={(e) => setBusiness({ ...business, timezone: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
                  </div>
                </div>
                <button onClick={() => saveSettings('business-profile', business, 'business')} disabled={saving === 'business'} style={{ padding: '10px 20px', background: saving === 'business' ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: saving === 'business' ? 'not-allowed' : 'pointer' }}>
                  {saving === 'business' ? 'Saving...' : 'Save Business Profile'}
                </button>
              </div>
            )}

            {activeTab === 'receipt' && (
              <div>
                <h2 style={{ fontSize: 18, marginBottom: 20, color: '#1f2937' }}>Receipt Settings</h2>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Header Text</label>
                  <input type="text" value={receipt.headerText} onChange={(e) => setReceipt({ ...receipt, headerText: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Footer Text</label>
                  <input type="text" value={receipt.footerText} onChange={(e) => setReceipt({ ...receipt, footerText: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Paper Width</label>
                    <select value={receipt.paperWidth} onChange={(e) => setReceipt({ ...receipt, paperWidth: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                      <option value="58mm">58mm</option>
                      <option value="80mm">80mm</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 24 }}>
                    <input type="checkbox" checked={receipt.showLogo} onChange={(e) => setReceipt({ ...receipt, showLogo: e.target.checked })} />
                    <label style={{ fontSize: 14 }}>Show Logo</label>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 24 }}>
                    <input type="checkbox" checked={receipt.showBarcode} onChange={(e) => setReceipt({ ...receipt, showBarcode: e.target.checked })} />
                    <label style={{ fontSize: 14 }}>Show Barcode</label>
                  </div>
                </div>
                <button onClick={() => saveSettings('receipt', receipt, 'receipt')} disabled={saving === 'receipt'} style={{ padding: '10px 20px', background: saving === 'receipt' ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: saving === 'receipt' ? 'not-allowed' : 'pointer' }}>
                  {saving === 'receipt' ? 'Saving...' : 'Save Receipt Settings'}
                </button>
              </div>
            )}

            {activeTab === 'pos' && (
              <div>
                <h2 style={{ fontSize: 18, marginBottom: 20, color: '#1f2937' }}>POS Settings</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Default Tax Rate (%)</label>
                    <input type="number" step="0.01" value={pos.defaultTaxRate} onChange={(e) => setPos({ ...pos, defaultTaxRate: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Max Discount (%)</label>
                    <input type="number" step="0.01" value={pos.maxDiscountPercent} onChange={(e) => setPos({ ...pos, maxDiscountPercent: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={pos.requireShiftOpen} onChange={(e) => setPos({ ...pos, requireShiftOpen: e.target.checked })} />
                    <span style={{ fontSize: 14 }}>Require Shift Open for Sales</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={pos.allowDiscount} onChange={(e) => setPos({ ...pos, allowDiscount: e.target.checked })} />
                    <span style={{ fontSize: 14 }}>Allow Discounts</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={pos.allowPriceOverride} onChange={(e) => setPos({ ...pos, allowPriceOverride: e.target.checked })} />
                    <span style={{ fontSize: 14 }}>Allow Price Override</span>
                  </label>
                </div>
                <button onClick={() => saveSettings('pos', pos, 'pos')} disabled={saving === 'pos'} style={{ padding: '10px 20px', background: saving === 'pos' ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: saving === 'pos' ? 'not-allowed' : 'pointer' }}>
                  {saving === 'pos' ? 'Saving...' : 'Save POS Settings'}
                </button>
              </div>
            )}

            {['inventory', 'customer', 'cloud', 'whatsapp'].includes(activeTab) && (
              <div>
                <h2 style={{ fontSize: 18, marginBottom: 12, color: '#1f2937', textTransform: 'capitalize' }}>{activeTab} Settings</h2>
                <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
                  Configure {activeTab} settings for your business. These settings control how the system handles {activeTab} operations.
                </p>
                <button
                  onClick={async () => {
                    try {
                      const { data } = await api.get(`/settings/${activeTab}`);
                      alert(`Current ${activeTab} settings loaded: ${JSON.stringify(data.data || {}).substring(0, 200)}`);
                    } catch (err: any) {
                      alert('No settings configured yet. Use the API to configure.');
                    }
                  }}
                  style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}
                >
                  Load Current Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

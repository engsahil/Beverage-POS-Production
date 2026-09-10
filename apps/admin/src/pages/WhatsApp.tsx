import { useState, useEffect } from 'react';
import api from '../api';

export default function WhatsApp() {
  const [config, setConfig] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ enabled: false, adminPhoneNumber: '', provider: 'meta', providerAccountId: '', providerPhoneNumberId: '' });

  useEffect(() => { loadConfig(); loadMessages(); }, []);

  const loadConfig = async () => {
    try {
      const { data } = await api.get('/whatsapp/config');
      const c = data.data || {};
      setConfig(c);
      setForm({ enabled: c.enabled || false, adminPhoneNumber: c.adminPhoneNumber || '', provider: c.provider || 'meta', providerAccountId: c.providerAccountId || '', providerPhoneNumberId: c.providerPhoneNumberId || '' });
    } catch (err) {} finally { setLoading(false); }
  };

  const loadMessages = async () => {
    try { const { data } = await api.get('/whatsapp/messages', { params: { limit: 20 } }); setMessages(data.data || []); } catch (err) {}
  };

  const saveConfig = async () => {
    try { setSaving(true); await api.put('/whatsapp/config', form); alert('Saved'); loadConfig(); }
    catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const testConnection = async () => {
    try { await api.post('/whatsapp/test-connection'); alert('Test sent'); }
    catch (err: any) { alert(err.response?.data?.error?.message || 'Test failed'); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;

  return (
    <div>
      <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 24 }}>WhatsApp Integration</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: 'white', padding: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>Configuration</h2>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>Enable WhatsApp</span>
            </label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Admin Phone (+92...)</label>
            <input type="tel" value={form.adminPhoneNumber} onChange={(e) => setForm({ ...form, adminPhoneNumber: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Provider Account ID</label>
            <input type="text" value={form.providerAccountId} onChange={(e) => setForm({ ...form, providerAccountId: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Phone Number ID</label>
            <input type="text" value={form.providerPhoneNumberId} onChange={(e) => setForm({ ...form, providerPhoneNumberId: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={saveConfig} disabled={saving} style={{ flex: 1, padding: '10px', background: saving ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={testConnection} style={{ flex: 1, padding: '10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>Test</button>
          </div>
        </div>
        <div style={{ background: 'white', padding: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>Recent Messages</h2>
          {messages.length === 0 ? <p style={{ color: '#9ca3af', fontSize: 14 }}>No messages sent yet</p> : (
            messages.map(m => (
              <div key={m.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 500 }}>{m.messageType}</span>
                  <span style={{ color: m.status === 'SENT' || m.status === 'DELIVERED' ? '#16a34a' : m.status === 'FAILED' ? '#dc2626' : '#d97706', fontSize: 11, fontWeight: 600 }}>{m.status}</span>
                </div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>{m.recipient} | {new Date(m.createdAt).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

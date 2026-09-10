import { useState, useEffect } from 'react';
import api from '../api';

export default function POSSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [scannerSettings, setScannerSettings] = useState({
    enabled: true,
    enterSuffix: true,
    prefix: '',
    suffix: '',
    inputDelay: 50,
    unknownBarcodeBehavior: 'SEARCH', // SEARCH, ALERT, IGNORE
    duplicateScanBehavior: 'INCREMENT', // INCREMENT, ALERT, IGNORE
  });
  const [offlineSettings, setOfflineSettings] = useState({
    enabled: true,
    autoSync: true,
    syncInterval: 30,
    maxQueueSize: 100,
    retryAttempts: 3,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [scannerRes, offlineRes] = await Promise.all([
        api.get('/settings/pos-scanner').catch(() => ({ data: { data: null } })),
        api.get('/settings/pos-offline').catch(() => ({ data: { data: null } })),
      ]);
      if (scannerRes.data?.data) setScannerSettings(prev => ({ ...prev, ...scannerRes.data.data }));
      if (offlineRes.data?.data) setOfflineSettings(prev => ({ ...prev, ...offlineRes.data.data }));
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (endpoint: string, data: any, key: string) => {
    try {
      setSaving(key);
      await api.put(`/settings/${endpoint}`, data);
      alert('Settings saved');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to save');
    } finally {
      setSaving('');
    }
  };

  const testScanner = () => {
    const testInput = document.getElementById('scanner-test-input') as HTMLInputElement;
    if (testInput) {
      testInput.focus();
      testInput.value = '';
      setTimeout(() => {
        if (testInput.value) {
          alert(`Scanner test: Received "${testInput.value}"`);
        } else {
          alert('No barcode scanned. Try scanning a barcode into the test field.');
        }
      }, 2000);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 24 }}>POS Settings</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Scanner Settings */}
        <div style={{ background: 'white', padding: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>Barcode Scanner</h2>
          
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={scannerSettings.enabled} onChange={(e) => setScannerSettings({ ...scannerSettings, enabled: e.target.checked })} />
              <span style={{ fontSize: 14 }}>Enable Barcode Scanner</span>
            </label>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={scannerSettings.enterSuffix} onChange={(e) => setScannerSettings({ ...scannerSettings, enterSuffix: e.target.checked })} />
              <span style={{ fontSize: 14 }}>Auto-submit on Enter key</span>
            </label>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Input Delay (ms)</label>
            <input type="number" value={scannerSettings.inputDelay} onChange={(e) => setScannerSettings({ ...scannerSettings, inputDelay: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            <span style={{ fontSize: 11, color: '#6b7280' }}>Time to wait for complete barcode input</span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Unknown Barcode</label>
            <select value={scannerSettings.unknownBarcodeBehavior} onChange={(e) => setScannerSettings({ ...scannerSettings, unknownBarcodeBehavior: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
              <option value="SEARCH">Search as text</option>
              <option value="ALERT">Show error alert</option>
              <option value="IGNORE">Ignore</option>
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Duplicate Scan</label>
            <select value={scannerSettings.duplicateScanBehavior} onChange={(e) => setScannerSettings({ ...scannerSettings, duplicateScanBehavior: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
              <option value="INCREMENT">Increment quantity</option>
              <option value="ALERT">Show warning</option>
              <option value="IGNORE">Ignore duplicate</option>
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Scanner Test</label>
            <input id="scanner-test-input" type="text" placeholder="Scan barcode here..." style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 8 }} />
            <button onClick={testScanner} style={{ width: '100%', padding: '8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Test Scanner (2s)</button>
          </div>

          <button onClick={() => saveSettings('pos-scanner', scannerSettings, 'scanner')} disabled={saving === 'scanner'} style={{ width: '100%', padding: '10px', background: saving === 'scanner' ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            {saving === 'scanner' ? 'Saving...' : 'Save Scanner Settings'}
          </button>
        </div>

        {/* Offline Settings */}
        <div style={{ background: 'white', padding: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>Offline & Sync</h2>
          
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={offlineSettings.enabled} onChange={(e) => setOfflineSettings({ ...offlineSettings, enabled: e.target.checked })} />
              <span style={{ fontSize: 14 }}>Enable Offline Mode</span>
            </label>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={offlineSettings.autoSync} onChange={(e) => setOfflineSettings({ ...offlineSettings, autoSync: e.target.checked })} />
              <span style={{ fontSize: 14 }}>Auto-sync when online</span>
            </label>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Sync Interval (seconds)</label>
            <input type="number" value={offlineSettings.syncInterval} onChange={(e) => setOfflineSettings({ ...offlineSettings, syncInterval: parseInt(e.target.value) || 30 })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Max Queue Size</label>
            <input type="number" value={offlineSettings.maxQueueSize} onChange={(e) => setOfflineSettings({ ...offlineSettings, maxQueueSize: parseInt(e.target.value) || 100 })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            <span style={{ fontSize: 11, color: '#6b7280' }}>Maximum offline transactions before blocking</span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Retry Attempts</label>
            <input type="number" value={offlineSettings.retryAttempts} onChange={(e) => setOfflineSettings({ ...offlineSettings, retryAttempts: parseInt(e.target.value) || 3 })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
          </div>

          <button onClick={() => saveSettings('pos-offline', offlineSettings, 'offline')} disabled={saving === 'offline'} style={{ width: '100%', padding: '10px', background: saving === 'offline' ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            {saving === 'offline' ? 'Saving...' : 'Save Offline Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import api from '../api';
import {
  IconKeyboard,
  IconInfo,
  IconCheck,
  IconX,
  IconRefresh,
} from '../components/Icons';

interface Shortcut {
  id: string;
  action: string;
  key: string;
  description: string;
  isCustom: boolean;
}

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: '1', action: 'new_order', key: 'F2', description: 'Start new order / clear cart', isCustom: false },
  { id: '2', action: 'payment', key: 'F4', description: 'Open checkout payment modal', isCustom: false },
  { id: '3', action: 'hold_sale', key: 'F5', description: 'Hold current active cart', isCustom: false },
  { id: '4', action: 'sales_history', key: 'F8', description: 'View sales receipt log', isCustom: false },
  { id: '5', action: 'close_modal', key: 'Escape', description: 'Close modal / cancel prompt', isCustom: false },
  { id: '6', action: 'search', key: 'Ctrl+F', description: 'Focus product search bar', isCustom: false },
  { id: '7', action: 'print', key: 'Ctrl+P', description: 'Trigger thermal receipt reprint', isCustom: false },
];

export default function KeyboardShortcuts() {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');

  useEffect(() => {
    loadShortcuts();
  }, []);

  const loadShortcuts = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/settings/pos-shortcuts');
      setShortcuts(data.data?.length ? data.data : DEFAULT_SHORTCUTS);
    } catch (err) {
      setShortcuts(DEFAULT_SHORTCUTS);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string, key: string) => {
    const conflict = shortcuts.find((s) => s.key === key && s.id !== id);
    if (conflict) {
      alert(`Key "${key}" is already assigned to "${conflict.description}"`);
      return;
    }

    try {
      await api.patch(`/settings/pos-shortcuts/${id}`, { key });
      setEditingId(null);
      setNewKey('');
      loadShortcuts();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update shortcut');
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset all terminal shortcuts to default function keys?')) return;
    try {
      await api.post('/settings/pos-shortcuts/reset');
      setShortcuts(DEFAULT_SHORTCUTS);
    } catch (err: any) {
      setShortcuts(DEFAULT_SHORTCUTS);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-subtle)' }}>
        Loading shortcut configuration...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-main)', letterSpacing: -0.4 }}>
            POS Keyboard Shortcuts
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-subtle)', marginTop: 2 }}>
            Configure function keys and hotkeys for rapid cashier terminal operation
          </p>
        </div>
        <button
          onClick={handleReset}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-muted)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <IconRefresh size={15} />
          <span>Reset to Factory Defaults</span>
        </button>
      </div>

      {/* Shortcuts Table Card */}
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
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action Identifier</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned Key</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts.map((shortcut) => (
              <tr
                key={shortcut.id}
                style={{ borderBottom: '1px solid var(--color-border-subtle)', transition: 'background 0.1s ease' }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '14px 20px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-main)', padding: '3px 8px', background: '#f1f5f9', borderRadius: 4 }}>
                    {shortcut.action.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '14px 20px', fontSize: 13, color: 'var(--color-text-muted)' }}>
                  {shortcut.description}
                </td>
                <td style={{ padding: '14px 20px' }}>
                  {editingId === shortcut.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        onKeyDown={(e) => {
                          e.preventDefault();
                          const keys: string[] = [];
                          if (e.ctrlKey) keys.push('Ctrl');
                          if (e.altKey) keys.push('Alt');
                          if (e.shiftKey) keys.push('Shift');
                          if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
                            keys.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
                          }
                          setNewKey(keys.join('+'));
                        }}
                        placeholder="Press key combo..."
                        style={{
                          padding: '6px 10px',
                          border: '1px solid var(--color-primary)',
                          borderRadius: 4,
                          fontSize: 13,
                          width: 160,
                          fontWeight: 600,
                        }}
                        className="mono"
                        autoFocus
                      />
                      <button
                        onClick={() => handleUpdate(shortcut.id, newKey)}
                        disabled={!newKey}
                        style={{
                          padding: '6px 12px',
                          background: !newKey ? '#cbd5e1' : 'var(--color-primary)',
                          color: '#ffffff',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setNewKey('');
                        }}
                        style={{
                          padding: '6px 12px',
                          background: 'var(--color-surface-hover)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 4,
                          fontSize: 12,
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span
                      style={{
                        padding: '4px 10px',
                        background: '#1e293b',
                        color: '#f8fafc',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        border: '1px solid #334155',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      }}
                      className="mono"
                    >
                      {shortcut.key}
                    </span>
                  )}
                </td>
                <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                  {editingId !== shortcut.id && (
                    <button
                      onClick={() => {
                        setEditingId(shortcut.id);
                        setNewKey(shortcut.key);
                      }}
                      style={{
                        padding: '5px 12px',
                        background: 'var(--color-surface-hover)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      Reassign
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Guidance Card */}
      <div
        style={{
          background: 'var(--color-info-bg)',
          border: '1px solid var(--color-info-border)',
          borderRadius: 'var(--radius-md)',
          padding: '18px 22px',
          display: 'flex',
          gap: 14,
        }}
      >
        <div style={{ color: 'var(--color-info)', flexShrink: 0, marginTop: 2 }}>
          <IconInfo size={20} />
        </div>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', marginBottom: 6 }}>
            Cashier Operational Guidelines
          </h3>
          <ul style={{ fontSize: 13, color: '#1e3a8a', margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Standard USB and Bluetooth barcode scanners automatically transmit carriage return (Enter) independently of these shortcuts.</li>
            <li>Function keys (F1 through F12) provide the fastest single-key response during checkout rushes.</li>
            <li>Modifiers (Ctrl, Alt, Shift) can be combined for administrative actions to prevent accidental cashier keystrokes.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

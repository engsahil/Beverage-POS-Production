import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import ProductForm from './pages/ProductForm';
import Sales from './pages/Sales';
import Categories from './pages/Categories';
import Units from './pages/Units';
import Customers from './pages/Customers';
import Inventory from './pages/Inventory';
import Vendors from './pages/Vendors';
import Users from './pages/Users';
import Roles from './pages/Roles';
import Purchases from './pages/Purchases';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Shifts from './pages/Shifts';
import RolesPage from './pages/Roles';
import AuditLogs from './pages/AuditLogs';
import StockCounts from './pages/StockCounts';
import Transfers from './pages/Transfers';
import Claims from './pages/Claims';
import Targets from './pages/Targets';
import Commissions from './pages/Commissions';
import DailyRecords from './pages/DailyRecords';
import WhatsApp from './pages/WhatsApp';
import Backups from './pages/Backups';
import DataImport from './pages/DataImport';
import ProductVariants from './pages/ProductVariants';
import OpeningStock from './pages/OpeningStock';
import SalesReturns from './pages/SalesReturns';
import QuickKeys from './pages/QuickKeys';
import KeyboardShortcuts from './pages/KeyboardShortcuts';
import POSSettings from './pages/POSSettings';
import CustomerPayments from './pages/CustomerPayments';
import StockCountDetail from './pages/StockCountDetail';
import TransferDetail from './pages/TransferDetail';
import ClaimDetail from './pages/ClaimDetail';
import DailyRecordDetail from './pages/DailyRecordDetail';

import {
  IconDashboard,
  IconPackage,
  IconTag,
  IconFolder,
  IconScale,
  IconWarehouse,
  IconDownload,
  IconClipboardCheck,
  IconArrowsRightLeft,
  IconShoppingCart,
  IconUsers,
  IconFactory,
  IconUser,
  IconKey,
  IconReceipt,
  IconUndo,
  IconClock,
  IconCalendar,
  IconBanknotes,
  IconDocumentText,
  IconTarget,
  IconCoins,
  IconTrendingUp,
  IconKeyboard,
  IconWrench,
  IconBarcode,
  IconCreditCard,
  IconSettings,
  IconChat,
  IconCloud,
  IconUpload,
  IconShield,
  IconLogOut,
  IconSearch,
} from './components/Icons';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<any>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [searchFilter, setSearchFilter] = useState('');

  const navGroups: NavGroup[] = [
    {
      label: 'Main',
      items: [
        { path: '/dashboard', label: 'Dashboard', icon: IconDashboard },
      ],
    },
    {
      label: 'Catalog',
      items: [
        { path: '/products', label: 'Products', icon: IconPackage },
        { path: '/variants', label: 'Variants', icon: IconTag },
        { path: '/categories', label: 'Categories', icon: IconFolder },
        { path: '/units', label: 'Units', icon: IconScale },
      ],
    },
    {
      label: 'Inventory',
      items: [
        { path: '/inventory', label: 'Stock Ledger', icon: IconWarehouse },
        { path: '/opening-stock', label: 'Opening Stock', icon: IconDownload },
        { path: '/stock-counts', label: 'Stock Counts', icon: IconClipboardCheck },
        { path: '/transfers', label: 'Stock Transfers', icon: IconArrowsRightLeft },
        { path: '/purchases', label: 'Purchase Orders', icon: IconShoppingCart },
      ],
    },
    {
      label: 'People & Access',
      items: [
        { path: '/customers', label: 'Customers', icon: IconUsers },
        { path: '/vendors', label: 'Vendors', icon: IconFactory },
        { path: '/users', label: 'Staff Users', icon: IconUser },
        { path: '/roles', label: 'Roles & RBAC', icon: IconKey },
      ],
    },
    {
      label: 'Operations',
      items: [
        { path: '/sales', label: 'Sales Records', icon: IconReceipt },
        { path: '/sales-returns', label: 'Returns & Voids', icon: IconUndo },
        { path: '/shifts', label: 'Cashier Shifts', icon: IconClock },
        { path: '/daily-records', label: 'Daily Records', icon: IconCalendar },
        { path: '/expenses', label: 'Expenses', icon: IconBanknotes },
        { path: '/claims', label: 'Supplier Claims', icon: IconDocumentText },
      ],
    },
    {
      label: 'Performance',
      items: [
        { path: '/targets', label: 'Sales Targets', icon: IconTarget },
        { path: '/commissions', label: 'Commissions', icon: IconCoins },
        { path: '/reports', label: 'Analytics Reports', icon: IconTrendingUp },
      ],
    },
    {
      label: 'POS Configuration',
      items: [
        { path: '/quick-keys', label: 'Quick Keys', icon: IconKeyboard },
        { path: '/shortcuts', label: 'Shortcuts', icon: IconWrench },
        { path: '/pos-settings', label: 'Terminal & Offline', icon: IconBarcode },
        { path: '/customer-payments', label: 'Credit Payments', icon: IconCreditCard },
      ],
    },
    {
      label: 'System',
      items: [
        { path: '/settings', label: 'Store Settings', icon: IconSettings },
        { path: '/whatsapp', label: 'WhatsApp Alerts', icon: IconChat },
        { path: '/backups', label: 'Cloud Backups', icon: IconCloud },
        { path: '/import', label: 'Data Import / Export', icon: IconUpload },
        { path: '/audit-logs', label: 'Audit Trails', icon: IconShield },
      ],
    },
  ];

  const filteredGroups = searchFilter.trim()
    ? navGroups.map(group => ({
        ...group,
        items: group.items.filter(item =>
          item.label.toLowerCase().includes(searchFilter.toLowerCase())
        ),
      })).filter(group => group.items.length > 0)
    : navGroups;

  // Active item title
  const currentItem = navGroups.flatMap(g => g.items).find(i => location.pathname === i.path || location.pathname.startsWith(i.path + '/'));
  const pageTitle = currentItem ? currentItem.label : 'Management Console';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 250,
          background: 'var(--color-sidebar)',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 40,
          borderRight: '1px solid #1e293b',
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            padding: '20px 18px 16px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 14,
                  letterSpacing: -0.5,
                  color: '#ffffff',
                }}
              >
                B
              </div>
              <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3, color: '#f8fafc' }}>
                BEVERAGE POS
              </h1>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, fontWeight: 500 }}>
              Enterprise Admin Suite
            </div>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#1e293b',
              color: '#94a3b8',
              letterSpacing: 0.5,
            }}
          >
            v1.0
          </span>
        </div>

        {/* Sidebar Search */}
        <div style={{ padding: '12px 14px 6px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#1e293b',
              borderRadius: 6,
              padding: '6px 10px',
              gap: 8,
              border: '1px solid #334155',
            }}
          >
            <IconSearch size={14} color="#94a3b8" />
            <input
              type="text"
              placeholder="Quick navigation..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f8fafc',
                fontSize: 12,
                width: '100%',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Navigation Links */}
        <nav
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px 12px 16px',
          }}
        >
          {filteredGroups.map(group => (
            <div key={group.label} style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#64748b',
                  padding: '4px 10px 4px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {group.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {group.items.map(item => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path + '/'));
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '7px 10px',
                        borderRadius: 6,
                        color: isActive ? '#ffffff' : '#94a3b8',
                        textDecoration: 'none',
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 500,
                        background: isActive ? 'var(--color-sidebar-hover)' : 'transparent',
                        borderLeft: isActive ? '3px solid var(--color-primary)' : '3px solid transparent',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <Icon size={16} stroke={isActive ? 'var(--color-primary)' : '#64748b'} />
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Footer */}
        <div
          style={{
            padding: '12px 14px',
            borderTop: '1px solid #1e293b',
            background: '#090d16',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: '#334155',
                  color: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {user?.fullName?.charAt(0) || 'U'}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.fullName || 'Administrator'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {user?.roleName || 'Administrator'}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '7px 10px',
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              transition: 'background 0.15s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = '#334155')}
            onMouseOut={(e) => (e.currentTarget.style.background = '#1e293b')}
          >
            <IconLogOut size={14} color="#94a3b8" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, marginLeft: 250, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Header */}
        <header
          style={{
            height: 56,
            background: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 28px',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-subtle)', fontWeight: 500 }}>
              Administration
            </span>
            <span style={{ color: 'var(--color-border-strong)' }}>/</span>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-main)' }}>
              {pageTitle}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Store Status Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 9999,
                background: 'var(--color-success-bg)',
                border: '1px solid var(--color-success-border)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-success)',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} />
              <span>System Online</span>
            </div>

            {/* Currency Pill */}
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                background: 'var(--color-surface-hover)',
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid var(--color-border)',
              }}
            >
              PKR (Rs.)
            </span>

            {/* Open POS terminal shortcut */}
            <a
              href={import.meta.env.VITE_POS_URL || 'http://localhost:5173'}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'var(--color-primary)',
                color: '#ffffff',
                textDecoration: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <IconBarcode size={14} color="#ffffff" />
              <span>Launch POS</span>
            </a>
          </div>
        </header>

        {/* Main Body */}
        <main style={{ flex: 1, padding: 28, maxWidth: 1440, width: '100%', margin: '0 auto' }}>
          <div className="fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg)',
          color: 'var(--color-text-subtle)',
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Authenticating session...
      </div>
    );
  }
  return user ? <Layout>{children}</Layout> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/products" element={<PrivateRoute><Products /></PrivateRoute>} />
          <Route path="/products/new" element={<PrivateRoute><ProductForm /></PrivateRoute>} />
          <Route path="/products/:id/edit" element={<PrivateRoute><ProductForm /></PrivateRoute>} />
          <Route path="/categories" element={<PrivateRoute><Categories /></PrivateRoute>} />
          <Route path="/units" element={<PrivateRoute><Units /></PrivateRoute>} />
          <Route path="/inventory" element={<PrivateRoute><Inventory /></PrivateRoute>} />
          <Route path="/stock-counts" element={<PrivateRoute><StockCounts /></PrivateRoute>} />
          <Route path="/transfers" element={<PrivateRoute><Transfers /></PrivateRoute>} />
          <Route path="/customers" element={<PrivateRoute><Customers /></PrivateRoute>} />
          <Route path="/vendors" element={<PrivateRoute><Vendors /></PrivateRoute>} />
          <Route path="/users" element={<PrivateRoute><Users /></PrivateRoute>} />
          <Route path="/roles" element={<PrivateRoute><RolesPage /></PrivateRoute>} />
          <Route path="/purchases" element={<PrivateRoute><Purchases /></PrivateRoute>} />
          <Route path="/expenses" element={<PrivateRoute><Expenses /></PrivateRoute>} />
          <Route path="/claims" element={<PrivateRoute><Claims /></PrivateRoute>} />
          <Route path="/sales" element={<PrivateRoute><Sales /></PrivateRoute>} />
          <Route path="/shifts" element={<PrivateRoute><Shifts /></PrivateRoute>} />
          <Route path="/daily-records" element={<PrivateRoute><DailyRecords /></PrivateRoute>} />
          <Route path="/targets" element={<PrivateRoute><Targets /></PrivateRoute>} />
          <Route path="/commissions" element={<PrivateRoute><Commissions /></PrivateRoute>} />
          <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="/whatsapp" element={<PrivateRoute><WhatsApp /></PrivateRoute>} />
          <Route path="/backups" element={<PrivateRoute><Backups /></PrivateRoute>} />
          <Route path="/import" element={<PrivateRoute><DataImport /></PrivateRoute>} />
          <Route path="/audit-logs" element={<PrivateRoute><AuditLogs /></PrivateRoute>} />
          <Route path="/variants" element={<PrivateRoute><ProductVariants /></PrivateRoute>} />
          <Route path="/opening-stock" element={<PrivateRoute><OpeningStock /></PrivateRoute>} />
          <Route path="/sales-returns" element={<PrivateRoute><SalesReturns /></PrivateRoute>} />
          <Route path="/quick-keys" element={<PrivateRoute><QuickKeys /></PrivateRoute>} />
          <Route path="/shortcuts" element={<PrivateRoute><KeyboardShortcuts /></PrivateRoute>} />
          <Route path="/pos-settings" element={<PrivateRoute><POSSettings /></PrivateRoute>} />
          <Route path="/customer-payments" element={<PrivateRoute><CustomerPayments /></PrivateRoute>} />
          <Route path="/stock-counts/:id" element={<PrivateRoute><StockCountDetail /></PrivateRoute>} />
          <Route path="/transfers/:id" element={<PrivateRoute><TransferDetail /></PrivateRoute>} />
          <Route path="/claims/:id" element={<PrivateRoute><ClaimDetail /></PrivateRoute>} />
          <Route path="/daily-records/:id" element={<PrivateRoute><DailyRecordDetail /></PrivateRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

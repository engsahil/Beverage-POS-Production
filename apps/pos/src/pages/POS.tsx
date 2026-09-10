import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import ShiftManager from '../components/ShiftManager';
import CustomerSelector from '../components/CustomerSelector';
import ReceiptPreview from '../components/ReceiptPreview';
import SalesHistory from '../components/SalesHistory';
import HoldSaleModal from '../components/HoldSaleModal';
import {
  IconSearch,
  IconBarcode,
  IconClock,
  IconWifi,
  IconWifiOff,
  IconLogOut,
  IconPlus,
  IconMinus,
  IconTrash,
  IconCheckCircle,
  IconAlertTriangle,
  IconPackage,
  IconReceipt,
  IconCreditCard,
  IconUsers,
  IconTag,
  IconRefresh,
} from '../components/Icons';
import { Link } from 'react-router-dom';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sellingPrice: number;
  taxEnabled: boolean;
  taxRate: number;
  discountAllowed: boolean;
  maxDiscountPercent: number;
  category?: { name: string };
  variants?: Array<{
    id: string;
    name: string;
    sellingPrice: number;
  }>;
}

interface CartItem {
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  creditLimit: number;
  currentBalance: number;
  status: string;
}

interface Shift {
  id: string;
  status: string;
  openingAmount: number;
}

interface Payment {
  method: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
  amount: number;
  referenceNumber?: string;
  cashReceived?: number;
}

export default function POS() {
  const { user, logout } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showReceipt, setShowReceipt] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountType, setOrderDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('FIXED');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Payment state
  const [payments, setPayments] = useState<Payment[]>([{ method: 'CASH', amount: 0 }]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    loadProducts();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Keyboard Shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setCart([]);
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0 && activeShift) {
          handleProceedToPayment();
        }
      } else if (e.key === 'F5') {
        e.preventDefault();
        if (cart.length > 0) {
          setShowHoldModal(true);
        }
      } else if (e.key === 'F8') {
        e.preventDefault();
        setShowHistory(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cart, activeShift]);

  const loadProducts = async () => {
    try {
      const { data } = await api.get('/products', { params: { limit: 200, isActive: true } });
      // Prisma Decimals serialize as strings — normalize so cart math/rendering
      // never crashes on undefined .toFixed or string concatenation.
      const prods: Product[] = (data.data || []).map((p: any) => ({
        ...p,
        sellingPrice: Number(p.sellingPrice ?? 0),
        taxRate: Number(p.taxRate ?? 0),
        maxDiscountPercent: Number(p.maxDiscountPercent ?? 0),
        variants: (p.variants || []).map((v: any) => ({
          ...v,
          sellingPrice: Number(v.sellingPrice ?? 0),
        })),
      }));
      setProducts(prods);

      const cats = Array.from(
        new Set(prods.map((p) => p.category?.name).filter(Boolean))
      ) as string[];
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load products:', err);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search);
    const matchesCategory = selectedCategory === 'ALL' || p.category?.name === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (product: Product) => {
    if (!activeShift) {
      setError('Please open a shift before ringing sales');
      return;
    }

    const existing = cart.find((item) => item.productId === product.id);

    if (existing) {
      setCart(
        cart.map((item) => {
          if (item.productId === product.id) {
            const newQty = item.quantity + 1;
            const subtotal = newQty * item.unitPrice;
            const discountAmount = subtotal * (item.discountPercent / 100);
            const taxableAmount = subtotal - discountAmount;
            const taxAmount = taxableAmount * (item.taxRate / 100);
            const total = taxableAmount + taxAmount;
            return { ...item, quantity: newQty, discountAmount, taxAmount, total };
          }
          return item;
        })
      );
    } else {
      const taxRate = product.taxEnabled ? product.taxRate || 0 : 0;
      const taxAmount = product.sellingPrice * (taxRate / 100);
      setCart([
        ...cart,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: product.sellingPrice,
          discountPercent: 0,
          discountAmount: 0,
          taxRate,
          taxAmount,
          total: product.sellingPrice + taxAmount,
        },
      ]);
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(
      cart.map((item) => {
        if (item.productId === productId) {
          const newQty = Math.max(1, item.quantity + delta);
          const subtotal = newQty * item.unitPrice;
          const discountAmount = subtotal * (item.discountPercent / 100);
          const taxableAmount = subtotal - discountAmount;
          const taxAmount = taxableAmount * (item.taxRate / 100);
          const total = taxableAmount + taxAmount;
          return { ...item, quantity: newQty, discountAmount, taxAmount, total };
        }
        return item;
      })
    );
  };

  const updateItemDiscount = (productId: string, percent: number) => {
    setCart(
      cart.map((item) => {
        if (item.productId === productId) {
          const subtotal = item.quantity * item.unitPrice;
          const discountAmount = subtotal * (percent / 100);
          const taxableAmount = subtotal - discountAmount;
          const taxAmount = taxableAmount * (item.taxRate / 100);
          const total = taxableAmount + taxAmount;
          return { ...item, discountPercent: percent, discountAmount, taxAmount, total };
        }
        return item;
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.productId !== productId));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const itemDiscounts = cart.reduce((sum, item) => sum + item.discountAmount, 0);
  const orderDiscountAmount =
    orderDiscountType === 'PERCENTAGE'
      ? (subtotal - itemDiscounts) * (orderDiscount / 100)
      : orderDiscount;
  const totalDiscount = itemDiscounts + orderDiscountAmount;
  const taxableAmount = Math.max(0, subtotal - totalDiscount);
  const totalTax = cart.reduce((sum, item) => {
    const itemSubtotal = item.quantity * item.unitPrice;
    const itemAfterDiscount =
      itemSubtotal - item.discountAmount - orderDiscountAmount * (itemSubtotal / subtotal || 0);
    return sum + itemAfterDiscount * (item.taxRate / 100);
  }, 0);
  const total = taxableAmount + totalTax;

  const handleProceedToPayment = () => {
    if (!activeShift) {
      setError('Please open a shift before completing sales');
      return;
    }
    if (cart.length === 0) {
      setError('Active cart is empty');
      return;
    }
    setPayments([{ method: 'CASH', amount: total, cashReceived: total }]);
    setShowPaymentModal(true);
    setError('');
  };

  const addPaymentLine = () => {
    const paidSoFar = payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, total - paidSoFar);
    setPayments([...payments, { method: 'CASH', amount: remaining, cashReceived: remaining }]);
  };

  const removePaymentLine = (index: number) => {
    if (payments.length > 1) {
      setPayments(payments.filter((_, i) => i !== index));
    }
  };

  const updatePayment = (index: number, field: keyof Payment, value: any) => {
    setPayments(payments.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const setCashReceivedQuick = (amount: number) => {
    setPayments([
      {
        method: 'CASH',
        amount: total,
        cashReceived: amount,
      },
    ]);
  };

  const handleCheckout = async () => {
    setLoading(true);
    setError('');

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    if (totalPaid < total) {
      setError(
        `Payment balance (Rs. ${totalPaid.toFixed(2)}) is less than grand total (Rs. ${total.toFixed(2)})`
      );
      setLoading(false);
      return;
    }

    const paymentData = payments.map((p) => ({
      paymentMethod: p.method,
      amount: p.amount,
      referenceNumber: p.referenceNumber || null,
      cashReceived: p.method === 'CASH' ? p.cashReceived || p.amount : null,
      cashChange: p.method === 'CASH' ? Math.max(0, (p.cashReceived || p.amount) - p.amount) : null,
    }));

    const checkoutPayload = {
      items: cart.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        })),
      saleDiscount:
        orderDiscount > 0
          ? { discountType: orderDiscountType, discountValue: orderDiscount }
          : undefined,
      payments: paymentData,
      customerId: selectedCustomer?.id || null,
      shiftId: activeShift?.id,
    };

    try {
      const { data } = await api.post('/sales/checkout', checkoutPayload);

      setShowReceipt(data.data.id);
      setCart([]);
      setSearch('');
      setSelectedCustomer(null);
      setOrderDiscount(0);
      setPayments([{ method: 'CASH', amount: 0 }]);
      setShowPaymentModal(false);
    } catch (err: any) {
      // Network failure (offline): queue the sale locally so it can be synced
      // later from the Offline Queue page instead of losing the transaction.
      const isNetworkError = !err.response && (err.request || !navigator.onLine);
      if (isNetworkError) {
        try {
          const KEY = 'pos_offline_queue_v1';
          const raw = localStorage.getItem(KEY);
          const queued = raw ? JSON.parse(raw) : [];
          queued.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            operation: 'SALE_CREATE',
            payload: {
              ...checkoutPayload,
              payments: paymentData.map((p: any) => ({
                ...p,
                reference: p.referenceNumber || undefined,
              })),
            },
            createdAt: new Date().toISOString(),
            retries: 0,
            lastError: null,
          });
          localStorage.setItem(KEY, JSON.stringify(queued));
          setError('You are offline. Sale queued — it will sync from the Offline Queue page.');
          setCart([]);
          setSearch('');
          setSelectedCustomer(null);
          setOrderDiscount(0);
          setPayments([{ method: 'CASH', amount: 0 }]);
          setShowPaymentModal(false);
        } catch {
          setError('Transaction checkout failed (offline, queue unavailable)');
        }
      } else {
        setError(err.response?.data?.error?.message || 'Transaction checkout failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (activeShift) {
      if (!confirm('You have an active shift open. Please close your shift before logging off.')) {
        return;
      }
    }
    logout();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-main)' }}>
      {/* Top Application Bar */}
      <header
        style={{
          height: 52,
          background: 'var(--surface-dark)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid #1e293b',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 14,
                color: '#ffffff',
              }}
            >
              B
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3, color: '#f8fafc' }}>
              BEVPOS TERMINAL
            </span>
          </div>

          <span style={{ color: '#334155' }}>|</span>

          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Cashier: <strong style={{ color: '#f8fafc' }}>{user?.fullName || 'Cashier'}</strong>
          </div>

          <span style={{ color: '#334155' }}>|</span>

          {/* Shift Status Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              background: activeShift ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: activeShift ? '#34d399' : '#fbbf24',
              border: activeShift ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            <IconClock size={12} />
            <span>{activeShift ? 'Shift Active' : 'Shift Inactive'}</span>
          </div>
        </div>

        {/* Top Right Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Sales History Shortcut */}
          <button
            onClick={() => setShowHistory(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 4,
              background: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
              fontSize: 12,
              fontWeight: 500,
            }}
            title="Receipt Log [F8]"
          >
            <IconReceipt size={14} />
            <span>History (F8)</span>
          </button>

          {/* Held Sales Shortcut */}
          <button
            onClick={() => setShowHoldModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 4,
              background: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
              fontSize: 12,
              fontWeight: 500,
            }}
            title="Held Orders [F5]"
          >
            <IconClock size={14} />
            <span>Hold / Recall (F5)</span>
          </button>

          {/* Offline Queue Inspector */}
          <Link
            to="/offline-queue"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 4,
              background: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <IconPackage size={14} />
            <span>Sync Queue</span>
          </Link>

          {/* Online/Offline Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 8px',
              borderRadius: 9999,
              background: isOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: isOnline ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              fontSize: 11,
              fontWeight: 700,
              color: isOnline ? '#34d399' : '#f87171',
            }}
          >
            {isOnline ? <IconWifi size={12} /> : <IconWifiOff size={12} />}
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 4,
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              fontSize: 12,
            }}
          >
            <IconLogOut size={13} />
            <span>Exit</span>
          </button>
        </div>
      </header>

      {/* Shift Banner & Float Component */}
      <ShiftManager onShiftChange={setActiveShift} />

      {/* Main Terminal Workspace */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Side: Product Catalog & Search */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>
          {/* Product Search & Barcode Bar */}
          <div style={{ padding: '12px 16px 8px', background: '#ffffff', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  background: '#f1f5f9',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 12px',
                  gap: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <IconSearch size={16} color="#64748b" />
                <input
                  type="text"
                  placeholder="Search product name, SKU, or scan barcode (F2 clear, Ctrl+F focus)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: 13,
                    width: '100%',
                    color: 'var(--text-main)',
                  }}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{ color: '#94a3b8', padding: 2 }}>
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Chips */}
            {categories.length > 0 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 10, paddingBottom: 2 }}>
                <button
                  onClick={() => setSelectedCategory('ALL')}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 9999,
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    background: selectedCategory === 'ALL' ? 'var(--primary)' : 'var(--surface-subtle)',
                    color: selectedCategory === 'ALL' ? '#ffffff' : 'var(--text-muted)',
                    border: selectedCategory === 'ALL' ? '1px solid var(--primary)' : '1px solid var(--border)',
                  }}
                >
                  All Categories ({products.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      background: selectedCategory === cat ? 'var(--primary)' : 'var(--surface-subtle)',
                      color: selectedCategory === cat ? '#ffffff' : 'var(--text-muted)',
                      border: selectedCategory === cat ? '1px solid var(--primary)' : '1px solid var(--border)',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Grid */}
          <div style={{ flex: 1, padding: 14, overflowY: 'auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))',
                gap: 10,
              }}
            >
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={!activeShift}
                  style={{
                    padding: '12px 14px',
                    background: '#ffffff',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'left',
                    cursor: activeShift ? 'pointer' : 'not-allowed',
                    opacity: activeShift ? 1 : 0.6,
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 110,
                    transition: 'all 0.12s ease',
                  }}
                  onMouseOver={(e) => {
                    if (activeShift) {
                      e.currentTarget.style.borderColor = 'var(--primary)';
                      e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (activeShift) {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                    }
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 3,
                          background: '#f1f5f9',
                          color: '#64748b',
                        }}
                      >
                        {product.category?.name || 'Beverage'}
                      </span>
                      {product.sku && (
                        <span style={{ fontSize: 10, color: '#94a3b8' }} className="mono">
                          {product.sku}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: 'var(--text-main)',
                        lineHeight: 1.3,
                        marginBottom: 6,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {product.name}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }} className="mono">
                      Rs. {Number(product.sellingPrice).toFixed(2)}
                    </div>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        background: 'var(--primary-light)',
                        color: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IconPlus size={13} />
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {filteredProducts.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-subtle)' }}>
                <IconPackage size={36} color="#cbd5e1" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>No matching beverages found</div>
                <div style={{ fontSize: 12, marginTop: 2 }}>Try searching with a barcode or product keyword</div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Active Cart, Customer & Checkout */}
        <div
          style={{
            width: 420,
            background: '#ffffff',
            borderLeft: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
          {/* Cart Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconReceipt size={16} color="var(--primary)" />
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                Active Order Cart
              </h2>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 9999,
                  background: cart.length > 0 ? 'var(--primary-light)' : '#e2e8f0',
                  color: cart.length > 0 ? 'var(--primary)' : '#64748b',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {cart.reduce((sum, item) => sum + item.quantity, 0)} items
              </span>
            </div>

            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 6px',
                  borderRadius: 4,
                }}
              >
                <IconTrash size={12} />
                <span>Clear (F2)</span>
              </button>
            )}
          </div>

          {/* Customer Selector Bar */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: '#ffffff' }}>
            <CustomerSelector selectedCustomer={selectedCustomer} onSelectCustomer={setSelectedCustomer} />
          </div>

          {/* Cart Line Items List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-subtle)' }}>
                <IconReceipt size={36} color="#cbd5e1" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Cart is empty</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>Scan an item or click catalog products to begin</div>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.productId}
                  style={{
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 13, flex: 1, paddingRight: 8 }}>
                      {item.productName}
                    </div>
                    <button
                      onClick={() => removeFromCart(item.productId)}
                      style={{ color: 'var(--danger)', padding: 2 }}
                      title="Remove item"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* Quantity Stepper */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: '#ffffff',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <button
                        onClick={() => updateQuantity(item.productId, -1)}
                        style={{ padding: '3px 8px', color: 'var(--text-muted)' }}
                      >
                        <IconMinus size={11} />
                      </button>
                      <span style={{ fontWeight: 700, fontSize: 12, minWidth: 24, textAlign: 'center' }} className="mono">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.productId, 1)}
                        style={{ padding: '3px 8px', color: 'var(--text-muted)' }}
                      >
                        <IconPlus size={11} />
                      </button>
                    </div>

                    {/* Unit Price and Line Total */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)' }} className="mono">
                        Rs. {item.unitPrice.toFixed(2)} × {item.quantity}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }} className="mono">
                        Rs. {item.total.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Line Discount Input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingTop: 6, borderTop: '1px dashed #e2e8f0' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Discount:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={item.discountPercent || ''}
                      placeholder="0"
                      onChange={(e) => updateItemDiscount(item.productId, parseFloat(e.target.value) || 0)}
                      style={{
                        width: 44,
                        padding: '2px 4px',
                        border: '1px solid var(--border)',
                        borderRadius: 3,
                        fontSize: 11,
                        textAlign: 'center',
                      }}
                      className="mono"
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>%</span>
                    {item.taxRate > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--success)', marginLeft: 'auto', fontWeight: 600 }}>
                        +{item.taxRate}% tax
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Calculation Breakdown & Pay Trigger */}
          <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', background: '#f8fafc' }}>
            {/* Global Order Discount */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>Order Discount</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={orderDiscount || ''}
                  placeholder="0"
                  onChange={(e) => setOrderDiscount(parseFloat(e.target.value) || 0)}
                  style={{
                    width: 60,
                    padding: '3px 6px',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    fontSize: 12,
                    textAlign: 'right',
                  }}
                  className="mono"
                />
                <select
                  value={orderDiscountType}
                  onChange={(e) => setOrderDiscountType(e.target.value as any)}
                  style={{
                    padding: '3px 6px',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    fontSize: 12,
                    background: '#ffffff',
                  }}
                >
                  <option value="FIXED">PKR</option>
                  <option value="PERCENTAGE">%</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Subtotal</span>
              <span className="mono">Rs. {subtotal.toFixed(2)}</span>
            </div>

            {totalDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--success)', marginBottom: 4, fontWeight: 600 }}>
                <span>Total Discounts</span>
                <span className="mono">-Rs. {totalDiscount.toFixed(2)}</span>
              </div>
            )}

            {totalTax > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                <span>Sales Tax</span>
                <span className="mono">+Rs. {totalTax.toFixed(2)}</span>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingTop: 8,
                marginTop: 6,
                borderTop: '1px solid var(--border)',
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>Payable Total</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }} className="mono">
                Rs. {total.toFixed(2)}
              </span>
            </div>

            {error && (
              <div
                style={{
                  background: 'var(--danger-bg)',
                  border: '1px solid var(--danger-border)',
                  color: 'var(--danger)',
                  padding: '8px 10px',
                  borderRadius: 4,
                  fontSize: 11,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <IconAlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleProceedToPayment}
              disabled={cart.length === 0 || loading || !activeShift}
              style={{
                width: '100%',
                padding: '13px',
                background: cart.length === 0 || loading || !activeShift ? '#cbd5e1' : 'var(--primary)',
                color: '#ffffff',
                borderRadius: 'var(--radius-sm)',
                fontSize: 15,
                fontWeight: 700,
                cursor: cart.length === 0 || loading || !activeShift ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: cart.length > 0 && activeShift ? '0 2px 8px rgba(220, 38, 38, 0.25)' : 'none',
              }}
            >
              <IconCreditCard size={18} />
              <span>{loading ? 'Processing...' : `Charge Rs. ${total.toFixed(2)} (F4)`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Multi-tender Payment Modal */}
      {showPaymentModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
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
              maxWidth: 520,
              width: '90%',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                Checkout & Tender Payment
              </h2>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }} className="mono">
                Rs. {total.toFixed(2)}
              </span>
            </div>

            {selectedCustomer && (
              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--info-bg)',
                  border: '1px solid var(--info-border)',
                  borderRadius: 4,
                  fontSize: 12,
                  color: '#1e40af',
                  marginBottom: 14,
                }}
              >
                Customer Account: <strong>{selectedCustomer.name}</strong> | Ledger Balance: Rs. {Number(selectedCustomer.currentBalance).toFixed(2)}
              </div>
            )}

            {/* Quick Cash Suggestions */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: 6 }}>
                Quick Cash Preset
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000].map(
                  (preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCashReceivedQuick(preset)}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        background: '#f1f5f9',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-main)',
                      }}
                      className="mono"
                    >
                      Rs. {preset.toFixed(0)}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Payment lines */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {payments.map((payment, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    padding: '8px 10px',
                    background: '#f8fafc',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                  }}
                >
                  <select
                    value={payment.method}
                    onChange={(e) => updatePayment(index, 'method', e.target.value)}
                    style={{ padding: '7px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, background: '#ffffff' }}
                  >
                    <option value="CASH">Cash Drawer</option>
                    <option value="CARD">Debit / Credit Card</option>
                    <option value="BANK_TRANSFER">Bank Online Transfer</option>
                    <option value="OTHER">Other / Voucher</option>
                  </select>

                  <input
                    type="number"
                    step="0.01"
                    value={payment.amount || ''}
                    placeholder="Tendered Amount"
                    onChange={(e) => updatePayment(index, 'amount', parseFloat(e.target.value) || 0)}
                    style={{ flex: 1, padding: '7px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, textAlign: 'right' }}
                    className="mono"
                  />

                  {payment.method === 'CASH' && (
                    <input
                      type="number"
                      step="0.01"
                      value={payment.cashReceived || ''}
                      placeholder="Cash Given"
                      onChange={(e) => updatePayment(index, 'cashReceived', parseFloat(e.target.value) || 0)}
                      style={{ width: 90, padding: '7px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, textAlign: 'right' }}
                      className="mono"
                    />
                  )}

                  {payment.method !== 'CASH' && (
                    <input
                      type="text"
                      value={payment.referenceNumber || ''}
                      placeholder="Card/Ref #"
                      onChange={(e) => updatePayment(index, 'referenceNumber', e.target.value)}
                      style={{ width: 100, padding: '7px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
                    />
                  )}

                  {payments.length > 1 && (
                    <button onClick={() => removePaymentLine(index)} style={{ color: 'var(--danger)', padding: 2 }}>
                      <IconTrash size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={addPaymentLine}
              style={{
                width: '100%',
                padding: '6px',
                background: '#ffffff',
                border: '1px dashed var(--border-strong)',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: 16,
              }}
            >
              + Add Split Payment Method
            </button>

            {/* Reconciliation Totals */}
            {(() => {
              const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
              const totalCashGiven = payments
                .filter((p) => p.method === 'CASH')
                .reduce((sum, p) => sum + (p.cashReceived || p.amount), 0);
              const cashDue = payments
                .filter((p) => p.method === 'CASH')
                .reduce((sum, p) => sum + p.amount, 0);
              const change = totalCashGiven - cashDue;

              return (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f8fafc', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Tendered Total:</span>
                    <span className="mono" style={{ fontWeight: 600 }}>Rs. {totalPaid.toFixed(2)}</span>
                  </div>
                  {payments.some((p) => p.method === 'CASH') && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: change >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      <span>Cash Change Due:</span>
                      <span className="mono">Rs. {Math.max(0, change).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowPaymentModal(false)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCheckout}
                disabled={loading || payments.reduce((s, p) => s + p.amount, 0) < total}
                style={{
                  flex: 2,
                  padding: '10px 20px',
                  background: loading || payments.reduce((s, p) => s + p.amount, 0) < total ? '#cbd5e1' : 'var(--primary)',
                  color: '#ffffff',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: loading || payments.reduce((s, p) => s + p.amount, 0) < total ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Completing Transaction...' : 'Complete & Print Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales History Modal */}
      {showHistory && <SalesHistory onClose={() => setShowHistory(false)} />}

      {/* Hold Sale Modal */}
      {showHoldModal && (
        <HoldSaleModal
          cart={cart}
          selectedCustomer={selectedCustomer}
          onRecall={(heldCart, customer) => {
            setCart(heldCart);
            setSelectedCustomer(customer);
            setShowHoldModal(false);
          }}
          onClose={() => setShowHoldModal(false)}
        />
      )}

      {/* Receipt Modal */}
      {showReceipt && <ReceiptPreview saleId={showReceipt} onClose={() => setShowReceipt(null)} />}
    </div>
  );
}

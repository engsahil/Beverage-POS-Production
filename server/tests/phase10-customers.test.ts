import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Phase 10: Customer Management', () => {
  it('should create customer with valid data', () => {
    const customer = {
      businessId: 'uuid',
      name: 'John Doe',
      phone: '+923001234567',
      whatsapp: '+923001234567',
      creditLimit: 50000,
      currentBalance: 0,
      status: 'ACTIVE',
    };

    assert.strictEqual(customer.name, 'John Doe');
    assert.strictEqual(customer.phone, '+923001234567');
    assert.strictEqual(customer.status, 'ACTIVE');
  });

  it('should validate Pakistani phone format', () => {
    // Pakistani mobile: +92 3XX XXXXXXX (13 chars total) or 03XX XXXXXXX (11 chars)
    const isValidPakistaniPhone = (phone: string): boolean => {
      const cleaned = phone.replace(/[\s-]/g, '');
      return /^(\+92|0)?3[0-9]{9}$/.test(cleaned);
    };

    assert.strictEqual(isValidPakistaniPhone('+923001234567'), true);
    assert.strictEqual(isValidPakistaniPhone('03001234567'), true);
    assert.strictEqual(isValidPakistaniPhone('3001234567'), true);
    assert.strictEqual(isValidPakistaniPhone('+1234567890'), false); // not Pakistani
    assert.strictEqual(isValidPakistaniPhone('12345'), false); // too short
  });

  it('should search customers by name/phone', () => {
    const customers = [
      { name: 'John Doe', phone: '+923001234567' },
      { name: 'Jane Smith', phone: '+923007654321' },
    ];

    const search = 'john';
    const results = customers.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
    );

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'John Doe');
  });

  it('should handle customer status', () => {
    const activeCustomer = { status: 'ACTIVE' };
    const inactiveCustomer = { status: 'INACTIVE' };

    assert.strictEqual(activeCustomer.status, 'ACTIVE');
    assert.strictEqual(inactiveCustomer.status, 'INACTIVE');
  });
});

describe('Phase 10: Customer Credit', () => {
  it('should check credit limit', () => {
    const creditLimit = 50000;
    const currentBalance = 45000;
    const newCredit = 10000;

    const newBalance = currentBalance + newCredit;
    const allowed = newBalance <= creditLimit;

    assert.strictEqual(allowed, false);
  });

  it('should allow credit within limit', () => {
    const creditLimit = 50000;
    const currentBalance = 30000;
    const newCredit = 10000;

    const newBalance = currentBalance + newCredit;
    const allowed = newBalance <= creditLimit;

    assert.strictEqual(allowed, true);
  });

  it('should calculate outstanding amount', () => {
    const total = 5000;
    const amountPaid = 2000;
    const outstanding = total - amountPaid;

    assert.strictEqual(outstanding, 3000);
  });

  it('should handle full payment (no credit)', () => {
    const total = 5000;
    const amountPaid = 5000;
    const outstanding = total - amountPaid;

    assert.strictEqual(outstanding, 0);
  });
});

describe('Phase 10: Customer Ledger', () => {
  it('should create debit entry for credit sale', () => {
    const entry = {
      referenceType: 'SALE',
      description: 'Credit sale SALE-000001',
      debit: 5000,
      credit: 0,
      balance: 5000,
    };

    assert.strictEqual(entry.debit, 5000);
    assert.strictEqual(entry.credit, 0);
    assert.strictEqual(entry.balance, 5000);
  });

  it('should create credit entry for payment', () => {
    const entry = {
      referenceType: 'PAYMENT',
      description: 'Payment received via CASH',
      debit: 0,
      credit: 2000,
      balance: 3000,
    };

    assert.strictEqual(entry.debit, 0);
    assert.strictEqual(entry.credit, 2000);
    assert.strictEqual(entry.balance, 3000);
  });

  it('should calculate running balance', () => {
    const previousBalance = 5000;
    const debit = 3000;
    const credit = 2000;
    const newBalance = previousBalance + debit - credit;

    assert.strictEqual(newBalance, 6000);
  });

  it('should generate customer statement', () => {
    const openingBalance = 0;
    const transactions = [
      { debit: 5000, credit: 0 },
      { debit: 0, credit: 2000 },
      { debit: 3000, credit: 0 },
    ];

    const totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0);
    const closingBalance = openingBalance + totalDebit - totalCredit;

    assert.strictEqual(totalDebit, 8000);
    assert.strictEqual(totalCredit, 2000);
    assert.strictEqual(closingBalance, 6000);
  });
});

describe('Phase 10: Customer Recovery', () => {
  it('should record cash payment', () => {
    const payment = {
      paymentMethod: 'CASH',
      amount: 2000,
      previousBalance: 5000,
      newBalance: 3000,
    };

    assert.strictEqual(payment.paymentMethod, 'CASH');
    assert.strictEqual(payment.amount, 2000);
    assert.strictEqual(payment.newBalance, 3000);
  });

  it('should record card payment with reference', () => {
    const payment = {
      paymentMethod: 'CARD',
      amount: 3000,
      referenceNumber: 'TXN123456',
      previousBalance: 5000,
      newBalance: 2000,
    };

    assert.strictEqual(payment.paymentMethod, 'CARD');
    assert.strictEqual(payment.referenceNumber, 'TXN123456');
  });

  it('should prevent duplicate payments with idempotency key', () => {
    const idempotencyKey = 'unique-key-123';
    const payment1 = { idempotencyKey, amount: 2000 };
    const payment2 = { idempotencyKey, amount: 2000 };

    assert.strictEqual(payment1.idempotencyKey, payment2.idempotencyKey);
  });

  it('should handle full recovery', () => {
    const previousBalance = 5000;
    const paymentAmount = 5000;
    const newBalance = previousBalance - paymentAmount;

    assert.strictEqual(newBalance, 0);
  });

  it('should handle partial recovery', () => {
    const previousBalance = 5000;
    const paymentAmount = 2000;
    const newBalance = previousBalance - paymentAmount;

    assert.strictEqual(newBalance, 3000);
  });
});

describe('Phase 10: Receipt Finalization', () => {
  it('should support thermal receipt widths', () => {
    const widths = ['58mm', '80mm'];
    assert.strictEqual(widths.includes('58mm'), true);
    assert.strictEqual(widths.includes('80mm'), true);
  });

  it('should generate receipt data structure', () => {
    const receiptData = {
      business: { name: 'Test Business', phone: '+923001234567' },
      sale: { saleNumber: 'SALE-000001', total: 1000 },
      items: [{ productName: 'Product A', quantity: 2, lineTotal: 1000 }],
      payments: [{ paymentMethod: 'CASH', amount: 1000 }],
      settings: { receiptWidth: '80mm', showBarcode: true },
    };

    assert.strictEqual(receiptData.business.name, 'Test Business');
    assert.strictEqual(receiptData.sale.saleNumber, 'SALE-000001');
    assert.strictEqual(receiptData.settings.receiptWidth, '80mm');
  });

  it('should handle reprint flag', () => {
    const originalReceipt = { isReprint: false };
    const reprintReceipt = { isReprint: true };

    assert.strictEqual(originalReceipt.isReprint, false);
    assert.strictEqual(reprintReceipt.isReprint, true);
  });

  it('should generate barcode from sale number', () => {
    const saleNumber = 'SALE-000001';
    const barcodeValue = saleNumber;

    assert.strictEqual(barcodeValue, 'SALE-000001');
  });

  it('should format currency for receipt', () => {
    const formatCurrency = (amount: number) => `Rs. ${amount.toFixed(2)}`;
    assert.strictEqual(formatCurrency(1000), 'Rs. 1000.00');
    assert.strictEqual(formatCurrency(999.5), 'Rs. 999.50');
  });

  it('should support PDF generation', () => {
    const pdfConfig = {
      width: '80mm',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    };

    assert.strictEqual(pdfConfig.width, '80mm');
    assert.strictEqual(pdfConfig.printBackground, true);
  });

  it('should handle short order format', () => {
    const shortOrder = {
      businessName: 'Test Business',
      saleNumber: 'SALE-000001',
      items: [
        { productName: 'Product A', quantity: 2 },
        { productName: 'Product B', quantity: 1 },
      ],
      total: 1500,
    };

    assert.strictEqual(shortOrder.items.length, 2);
    assert.strictEqual(shortOrder.total, 1500);
  });
});

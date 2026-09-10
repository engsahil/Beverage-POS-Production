import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  toDecimal,
  calculateLineTotal,
  calculateDiscount,
  calculateTax,
  calculateCartTotals,
  calculateCashChange,
  validatePayment,
  isDiscountAllowed,
  roundCurrency,
} from '../src/services/calculationService.js';

describe('Phase 8: Calculation Service', () => {
  it('should calculate cash change correctly', () => {
    const result = calculateCashChange(850, 1000);
    assert.strictEqual(result.change.toNumber(), 150);
    assert.strictEqual(result.isValid, true);
  });

  it('should validate payments', () => {
    const result = validatePayment(1000, [{ amount: 600 }, { amount: 400 }]);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.paidAmount.toNumber(), 1000);
  });

  it('should detect underpayment', () => {
    const result = validatePayment(1000, [{ amount: 800 }]);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.remaining.toNumber(), 200);
  });

  it('should calculate discounts', () => {
    const result = calculateDiscount(1000, 'PERCENTAGE', 10);
    assert.strictEqual(result.toNumber(), 100);
  });

  it('should calculate tax', () => {
    const result = calculateTax(1000, 17);
    assert.strictEqual(result.toNumber(), 170);
  });

  it('should avoid floating-point errors', () => {
    const result = toDecimal(0.1).plus(toDecimal(0.2));
    assert.strictEqual(result.toNumber(), 0.3);
  });

  it('should check discount limits', () => {
    assert.strictEqual(isDiscountAllowed(50, 1000, 10), true);
    assert.strictEqual(isDiscountAllowed(150, 1000, 10), false);
  });

  it('should round currency', () => {
    assert.strictEqual(roundCurrency(100.456).toNumber(), 100.46);
    assert.strictEqual(roundCurrency(100.454).toNumber(), 100.45);
  });
});

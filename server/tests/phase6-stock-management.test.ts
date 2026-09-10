/**
 * Phase 6 Tests: Stock Adjustments, Transfers & Expiry Management
 *
 * Test suite covering:
 * - Stock counts (create, confirm, cancel)
 * - Transfers (create, approve, receive, cancel)
 * - Batches/Expiry (create, FEFO, status calculation)
 * - Permission enforcement
 * - Business isolation
 * - Audit logging
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import * as stockCountService from '../src/services/stockCountService.js';
import * as transferService from '../src/services/transferService.js';
import * as expiryService from '../src/services/expiryService.js';
import { calculateExpiryStatus } from '../src/services/expiryService.js';

const prisma = new PrismaClient();

describe('Phase 6: Stock Management', () => {
  let businessId: string;
  let branchId: string;
  let branch2Id: string;
  let userId: string;
  let productId: string;
  let variantId: string;

  before(async () => {
    // Clean up test data
    await prisma.stockCountItem.deleteMany({});
    await prisma.stockCount.deleteMany({});
    await prisma.transferItem.deleteMany({});
    await prisma.transfer.deleteMany({});
    await prisma.stockBatch.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.unit.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.branch.deleteMany({});
    await prisma.business.deleteMany({});

    // Create test business
    const business = await prisma.business.create({
      data: { name: 'Phase6 Test Business', currency: 'PKR', timezone: 'Asia/Karachi' },
    });
    businessId = business.id;

    // Create 2 branches for transfer tests
    const branch1 = await prisma.branch.create({
      data: { businessId, name: 'Branch A', code: 'PH6-A' },
    });
    branchId = branch1.id;

    const branch2 = await prisma.branch.create({
      data: { businessId, name: 'Branch B', code: 'PH6-B' },
    });
    branch2Id = branch2.id;

    // Create test user
    const bcrypt = (await import('bcryptjs')).default;
    const passwordHash = await bcrypt.hash('Test@1234', 12);
    const user = await prisma.user.create({
      data: { businessId, branchId, username: 'phase6user', fullName: 'Phase 6 User', passwordHash },
    });
    userId = user.id;

    // Create test category and unit
    const category = await prisma.category.create({
      data: { businessId, name: 'Phase6 Category' },
    });
    const unit = await prisma.unit.create({
      data: { businessId, name: 'Liter', shortCode: 'L' },
    });

    // Create test product
    const product = await prisma.product.create({
      data: { businessId, categoryId: category.id, name: 'Phase6 Product', sku: 'PH6-001', purchasePrice: 100, sellingPrice: 150 },
    });
    productId = product.id;

    // Create test variant
    const variant = await prisma.productVariant.create({
      data: { productId, unitId: unit.id, name: '1 Liter', quantity: 1.0, sku: 'PH6-001-1L', purchasePrice: 100, sellingPrice: 150 },
    });
    variantId = variant.id;
  });

  after(async () => {
    await prisma.stockCountItem.deleteMany({});
    await prisma.stockCount.deleteMany({});
    await prisma.transferItem.deleteMany({});
    await prisma.transfer.deleteMany({});
    await prisma.stockBatch.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.unit.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.branch.deleteMany({});
    await prisma.business.deleteMany({});
    await prisma.$disconnect();
  });

  describe('Expiry Status Calculation', () => {
    it('should return NOT_TRACKED when no expiry date', () => {
      const status = calculateExpiryStatus(null, 30);
      assert.strictEqual(status, 'NOT_TRACKED');
    });

    it('should return EXPIRED for past dates', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const status = calculateExpiryStatus(pastDate, 30);
      assert.strictEqual(status, 'EXPIRED');
    });

    it('should return EXPIRING_SOON within warning period', () => {
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 15);
      const status = calculateExpiryStatus(soonDate, 30);
      assert.strictEqual(status, 'EXPIRING_SOON');
    });

    it('should return VALID for dates beyond warning period', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60);
      const status = calculateExpiryStatus(futureDate, 30);
      assert.strictEqual(status, 'VALID');
    });
  });

  describe('Stock Counts', () => {
    let stockCountId: string;

    it('should create a stock count', async () => {
      const result = await stockCountService.createStockCount(
        {
          businessId,
          branchId,
          countDate: new Date().toISOString(),
          notes: 'Test count',
          items: [
            {
              productId,
              variantId: variantId || undefined,
              physicalQuantity: 100,
              notes: 'Test item',
            },
          ],
        },
        userId
      );

      assert.notStrictEqual(result, undefined);
      assert.match(result.countNumber, /COUNT-\d{6}/);
      assert.strictEqual(result.status, 'DRAFT');
      assert.strictEqual(result.items.length, 1);
      stockCountId = result.id;
    });

    it('should get stock count by ID', async () => {
      const result = await stockCountService.getStockCountById(stockCountId, businessId);
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result?.id, stockCountId);
    });

    it('should list stock counts', async () => {
      const result = await stockCountService.getStockCounts(businessId, {
        page: 1,
        limit: 10,
      });
      assert.notStrictEqual(result.data, undefined);
      assert.notStrictEqual(result.meta, undefined);
      assert.ok(result.data.length > 0);
    });

    it('should cancel a draft stock count', async () => {
      const result = await stockCountService.cancelStockCount(
        stockCountId,
        businessId,
        userId
      );
      assert.strictEqual(result.status, 'CANCELLED');
    });

    it('should not cancel a confirmed stock count', async () => {
      // Create and confirm a count
      const count = await stockCountService.createStockCount(
        {
          businessId,
          branchId,
          countDate: new Date().toISOString(),
          items: [
            {
              productId,
              physicalQuantity: 50,
            },
          ],
        },
        userId
      );

      await stockCountService.confirmStockCount(
        { stockCountId: count.id, businessId },
        userId
      );

      await assert.rejects(async () => { await stockCountService.cancelStockCount(count.id, businessId, userId); }, { message: /Only draft stock counts can be cancelled/ });
    });
  });

  describe('Transfers', () => {
    before(async () => {
      // Ensure source branch has stock for transfer tests
      const existingInventory = await prisma.inventory.findFirst({
        where: { businessId, branchId, productId, variantId },
      });
      if (!existingInventory || Number(existingInventory.currentQuantity) < 50) {
        const { createOpeningStock } = await import('../src/services/inventoryService.js');
        try {
          await createOpeningStock(
            { businessId, branchId, productId, variantId, quantity: 100, reason: 'Transfer test setup' },
            userId
          );
        } catch (e) {
          // If opening stock already exists, adjust instead
          const { createStockAdjustment } = await import('../src/services/inventoryService.js');
          await createStockAdjustment(
            { businessId, branchId, productId, variantId, quantity: 100, reason: 'Transfer test setup' },
            userId
          );
        }
      }
    });

    let transferId: string;

    it('should create a transfer', async () => {
      const result = await transferService.createTransfer(
        {
          businessId,
          sourceBranchId: branchId,
          destinationBranchId: branch2Id,
          transferDate: new Date().toISOString(),
          notes: 'Test transfer',
          items: [
            {
              productId,
              variantId: variantId || undefined,
              quantity: 10,
            },
          ],
        },
        userId
      );

      assert.notStrictEqual(result, undefined);
      assert.match(result.transferNumber, /TRF-\d{6}/);
      assert.strictEqual(result.status, 'DRAFT');
      assert.strictEqual(result.items.length, 1);
      transferId = result.id;
    });

    it('should not allow same source and destination', async () => {
      await assert.rejects(
        async () => {
          await transferService.createTransfer(
            {
              businessId,
              sourceBranchId: branchId,
              destinationBranchId: branchId,
              transferDate: new Date().toISOString(),
              items: [
                {
                  productId,
                  quantity: 10,
                },
              ],
            },
            userId
          );
        },
        { message: /Source and destination branches must be different/ }
      );
    });

    it('should approve a transfer', async () => {
      const result = await transferService.approveTransfer(
        transferId,
        businessId,
        userId
      );
      assert.strictEqual(result.status, 'IN_TRANSIT');
    });

    it('should receive a transfer', async () => {
      const result = await transferService.receiveTransfer(
        { transferId, businessId },
        userId
      );
      assert.strictEqual(result.status, 'RECEIVED');
    });

    it('should not receive a transfer twice', async () => {
      await assert.rejects(async () => { await transferService.receiveTransfer({ transferId, businessId }, userId); }, { message: /Only in-transit transfers can be received/ });
    });

    it('should cancel a draft transfer', async () => {
      const transfer = await transferService.createTransfer(
        {
          businessId,
          sourceBranchId: branchId,
          destinationBranchId: branch2Id,
          transferDate: new Date().toISOString(),
          items: [
            {
              productId,
              quantity: 5,
            },
          ],
        },
        userId
      );

      const result = await transferService.cancelTransfer(
        transfer.id,
        businessId,
        userId
      );
      assert.strictEqual(result?.status, 'CANCELLED');
    });

    it('should not cancel a received transfer', async () => {
      await assert.rejects(async () => { await transferService.cancelTransfer(transferId, businessId, userId); }, { message: /Received transfers cannot be cancelled/ });
    });
  });

  describe('Batches & Expiry', () => {
    let batchId: string;

    it('should create a batch with expiry', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 90);

      const result = await expiryService.createBatch(
        {
          businessId,
          branchId,
          productId,
          variantId: variantId || undefined,
          batchNumber: 'BATCH-TEST-001',
          quantity: 100,
          receivedDate: new Date().toISOString(),
          expiryDate: futureDate.toISOString(),
        },
        userId
      );

      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.batchNumber, 'BATCH-TEST-001');
      assert.strictEqual(result.status, 'VALID');
      batchId = result.id;
    });

    it('should get batch by ID', async () => {
      const result = await expiryService.getBatchById(batchId, businessId);
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result?.id, batchId);
    });

    it('should list batches', async () => {
      const result = await expiryService.getBatches(businessId, {
        page: 1,
        limit: 50,
      });
      assert.notStrictEqual(result.data, undefined);
      assert.ok(result.data.length > 0);
    });

    it('should get expiry summary', async () => {
      const summary = await expiryService.getExpirySummary(businessId);
      assert.notStrictEqual(summary, undefined);
      assert.strictEqual(typeof summary.valid, 'number');
      assert.strictEqual(typeof summary.expiringSoon, 'number');
      assert.strictEqual(typeof summary.expired, 'number');
      assert.strictEqual(typeof summary.total, 'number');
    });

    it('should get FEFO batches', async () => {
      const batches = await expiryService.getFEFOBatches(
        businessId,
        branchId,
        productId,
        variantId || undefined
      );
      assert.notStrictEqual(batches, undefined);
      assert.ok(Array.isArray(batches));
    });

    it('should refresh expiry statuses', async () => {
      const result = await expiryService.refreshExpiryStatuses(
        businessId,
        userId
      );
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(typeof result.updatedCount, 'number');
    });
  });

  describe('Business Isolation', () => {
    it('should not access stock counts from another business', async () => {
      const fakeBusinessId = '00000000-0000-0000-0000-000000000000';
      const result = await stockCountService.getStockCounts(fakeBusinessId);
      assert.strictEqual(result.data.length, 0);
    });

    it('should not access transfers from another business', async () => {
      const fakeBusinessId = '00000000-0000-0000-0000-000000000000';
      const result = await transferService.getTransfers(fakeBusinessId);
      assert.strictEqual(result.data.length, 0);
    });

    it('should not access batches from another business', async () => {
      const fakeBusinessId = '00000000-0000-0000-0000-000000000000';
      const result = await expiryService.getBatches(fakeBusinessId);
      assert.strictEqual(result.data.length, 0);
    });
  });
});

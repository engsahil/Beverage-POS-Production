import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import * as inventoryService from '../src/services/inventoryService.js';

const prisma = new PrismaClient();

describe('Phase 4 - Core Inventory & Stock Ledger', () => {
  let businessId: string;
  let branchId: string;
  let categoryId: string;
  let unitId: string;
  let productId: string;
  let variantId: string;
  let userId: string;

  before(async () => {
    // Clean up test data
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
      data: {
        name: 'Test Business',
        currency: 'PKR',
        timezone: 'Asia/Karachi',
      },
    });
    businessId = business.id;

    // Create test branch
    const branch = await prisma.branch.create({
      data: {
        businessId,
        name: 'Main Branch',
        code: 'MAIN',
      },
    });
    branchId = branch.id;

    // Create test user
    const bcrypt = (await import('bcryptjs')).default;
    const passwordHash = await bcrypt.hash('Test@1234', 12);
    const user = await prisma.user.create({
      data: {
        businessId,
        branchId,
        username: 'testuser',
        fullName: 'Test User',
        passwordHash,
      },
    });
    userId = user.id;

    // Create test category
    const category = await prisma.category.create({
      data: {
        businessId,
        name: 'Test Category',
      },
    });
    categoryId = category.id;

    // Create test unit
    const unit = await prisma.unit.create({
      data: {
        businessId,
        name: 'Liter',
        shortCode: 'L',
      },
    });
    unitId = unit.id;

    // Create test product
    const product = await prisma.product.create({
      data: {
        businessId,
        categoryId,
        name: 'Test Product',
        sku: 'TEST-001',
        purchasePrice: 100,
        sellingPrice: 150,
        minStockThreshold: 10,
        maxStockThreshold: 100,
      },
    });
    productId = product.id;

    // Create test variant
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        unitId,
        name: '1 Liter',
        quantity: 1.0,
        sku: 'TEST-001-1L',
        purchasePrice: 100,
        sellingPrice: 150,
      },
    });
    variantId = variant.id;
  });

  after(async () => {
    // Clean up
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

  describe('Stock Status Calculation', () => {
    it('should return OUT_OF_STOCK when quantity is 0', () => {
      
      const status = inventoryService.calculateStockStatus(0, 10, 100);
      assert.strictEqual(status, 'OUT_OF_STOCK');
    });

    it('should return OUT_OF_STOCK when quantity is negative', () => {
      
      const status = inventoryService.calculateStockStatus(-5, 10, 100);
      assert.strictEqual(status, 'OUT_OF_STOCK');
    });

    it('should return LOW_STOCK when quantity <= minThreshold', () => {
      
      const status = inventoryService.calculateStockStatus(10, 10, 100);
      assert.strictEqual(status, 'LOW_STOCK');
    });

    it('should return NORMAL when quantity is between thresholds', () => {
      
      const status = inventoryService.calculateStockStatus(50, 10, 100);
      assert.strictEqual(status, 'NORMAL');
    });

    it('should return OVERSTOCKED when quantity > maxThreshold', () => {
      
      const status = inventoryService.calculateStockStatus(150, 10, 100);
      assert.strictEqual(status, 'OVERSTOCKED');
    });

    it('should handle null thresholds', () => {
      
      const status = inventoryService.calculateStockStatus(50, null, null);
      assert.strictEqual(status, 'NORMAL');
    });
  });

  describe('Opening Stock', () => {
    it('should create opening stock successfully', async () => {
      

      const result = await inventoryService.createOpeningStock(
        {
          businessId,
          branchId,
          productId,
          variantId,
          quantity: 100,
          reason: 'Initial stock',
        },
        userId
      );

      assert.ok(result.inventory);
      assert.ok(result.movement);
      assert.strictEqual(Number(result.inventory.currentQuantity), 100);
      assert.strictEqual(result.movement.movementType, 'OPENING_STOCK');
      assert.strictEqual(Number(result.movement.quantity), 100);
      assert.strictEqual(Number(result.movement.previousQuantity), 0);
      assert.strictEqual(Number(result.movement.resultingQuantity), 100);
    });

    it('should reject duplicate opening stock', async () => {
      

      try {
        await inventoryService.createOpeningStock(
          {
            businessId,
            branchId,
            productId,
            variantId,
            quantity: 50,
            reason: 'Another opening stock',
          },
          userId
        );
        assert.fail('Should have thrown error for duplicate opening stock');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('already exists'));
      }
    });

    it('should create audit log for opening stock', async () => {
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          businessId,
          action: 'INVENTORY_OPENING_STOCK',
          entityType: 'inventory',
        },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(auditLog);
      assert.strictEqual(auditLog.userId, userId);
    });
  });

  describe('Stock Adjustments', () => {
    it('should increase stock with positive adjustment', async () => {
      

      const result = await inventoryService.createStockAdjustment(
        {
          businessId,
          branchId,
          productId,
          variantId,
          quantity: 20,
          reason: 'Stock count correction',
        },
        userId
      );

      assert.ok(result.inventory);
      assert.ok(result.movement);
      assert.strictEqual(Number(result.inventory.currentQuantity), 120);
      assert.strictEqual(result.movement.movementType, 'ADJUSTMENT_IN');
      assert.strictEqual(Number(result.movement.quantity), 20);
    });

    it('should decrease stock with negative adjustment', async () => {
      

      const result = await inventoryService.createStockAdjustment(
        {
          businessId,
          branchId,
          productId,
          variantId,
          quantity: -10,
          reason: 'Damaged goods',
        },
        userId
      );

      assert.ok(result.inventory);
      assert.ok(result.movement);
      assert.strictEqual(Number(result.inventory.currentQuantity), 110);
      assert.strictEqual(result.movement.movementType, 'ADJUSTMENT_OUT');
      assert.strictEqual(Number(result.movement.quantity), -10);
    });

    it('should reject zero adjustment', async () => {
      

      try {
        await inventoryService.createStockAdjustment(
          {
            businessId,
            branchId,
            productId,
            variantId,
            quantity: 0,
            reason: 'Zero adjustment',
          },
          userId
        );
        assert.fail('Should have thrown error for zero adjustment');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('cannot be zero') || 
                   (error as Error).message.includes('Invalid'));
      }
    });

    it('should reject adjustment that would create negative stock', async () => {
      

      try {
        await inventoryService.createStockAdjustment(
          {
            businessId,
            branchId,
            productId,
            variantId,
            quantity: -200,
            reason: 'Excessive deduction',
          },
          userId
        );
        assert.fail('Should have thrown error for insufficient stock');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Insufficient stock'));
      }
    });
  });

  describe('Stock Movement Ledger', () => {
    it('should create immutable movement', async () => {
      const movements = await prisma.stockMovement.findMany({
        where: {
          businessId,
          productId,
          variantId,
        },
        orderBy: { createdAt: 'asc' },
      });

      assert.ok(movements.length >= 3); // opening + 2 adjustments
      
      // Verify first movement (opening stock)
      assert.strictEqual(movements[0].movementType, 'OPENING_STOCK');
      assert.strictEqual(Number(movements[0].previousQuantity), 0);
      assert.strictEqual(Number(movements[0].resultingQuantity), 100);
      
      // Verify second movement (increase)
      assert.strictEqual(movements[1].movementType, 'ADJUSTMENT_IN');
      assert.strictEqual(Number(movements[1].previousQuantity), 100);
      assert.strictEqual(Number(movements[1].resultingQuantity), 120);
      
      // Verify third movement (decrease)
      assert.strictEqual(movements[2].movementType, 'ADJUSTMENT_OUT');
      assert.strictEqual(Number(movements[2].previousQuantity), 120);
      assert.strictEqual(Number(movements[2].resultingQuantity), 110);
    });

    it('should track all movement details', async () => {
      const movement = await prisma.stockMovement.findFirst({
        where: {
          businessId,
          movementType: 'OPENING_STOCK',
        },
      });

      assert.ok(movement);
      assert.strictEqual(movement.businessId, businessId);
      assert.strictEqual(movement.branchId, branchId);
      assert.strictEqual(movement.productId, productId);
      assert.strictEqual(movement.variantId, variantId);
      assert.strictEqual(movement.performedBy, userId);
      assert.ok(movement.reason);
      assert.ok(movement.createdAt);
    });
  });

  describe('Inventory Queries', () => {
    it('should get inventory by product/variant', async () => {
      

      const inventory = await inventoryService.getInventory(businessId, branchId, productId, variantId);

      assert.ok(inventory);
      assert.strictEqual(Number(inventory.currentQuantity), 110);
      assert.strictEqual(inventory.stockStatus, 'OVERSTOCKED');
      assert.ok(inventory.product);
      assert.ok(inventory.variant);
      assert.ok(inventory.branch);
    });

    it('should get all inventories with filtering', async () => {
      

      const result = await inventoryService.getInventories(businessId, {
        page: 1,
        limit: 10,
      });

      assert.ok(result.data);
      assert.ok(result.meta);
      assert.ok(result.data.length > 0);
    });

    it('should get stock movements with filtering', async () => {
      

      const result = await inventoryService.getStockMovements(businessId, {
        productId,
        variantId,
        page: 1,
        limit: 10,
      });

      assert.ok(result.data);
      assert.ok(result.meta);
      assert.ok(result.data.length >= 3);
    });

    it('should get inventory summary', async () => {
      

      const summary = await inventoryService.getInventorySummary(businessId, branchId);

      assert.ok(summary);
      assert.ok(typeof summary.totalItems === 'number');
      assert.ok(typeof summary.outOfStock === 'number');
      assert.ok(typeof summary.lowStock === 'number');
      assert.ok(typeof summary.normal === 'number');
      assert.ok(typeof summary.overstocked === 'number');
    });
  });

  describe('Tenant Isolation', () => {
    let business2Id: string;

    before(async () => {
      const business2 = await prisma.business.create({
        data: {
          name: 'Test Business 2',
          currency: 'PKR',
          timezone: 'Asia/Karachi',
        },
      });
      business2Id = business2.id;
    });

    it('should not allow cross-business inventory access', async () => {
      

      const result = await inventoryService.getInventories(business2Id, {});

      assert.strictEqual(result.data.length, 0);
    });

    it('should not allow cross-business stock movements', async () => {
      

      const result = await inventoryService.getStockMovements(business2Id, {});

      assert.strictEqual(result.data.length, 0);
    });
  });

  describe('Concurrency Safety', () => {
    it('should handle concurrent stock adjustments correctly', async () => {
      

      // Create a new product for this test
      const product2 = await prisma.product.create({
        data: {
          businessId,
          categoryId,
          name: 'Concurrency Test Product',
          sku: 'CONC-001',
          purchasePrice: 100,
          sellingPrice: 150,
        },
      });

      // Create opening stock
      await inventoryService.createStockAdjustment(
        {
          businessId,
          branchId,
          productId: product2.id,
          quantity: 100,
          reason: 'Opening stock for concurrency test',
        },
        userId
      );

      // Simulate concurrent adjustments
      const adjustments = Array(5).fill(null).map(() =>
        inventoryService.createStockAdjustment(
          {
            businessId,
            branchId,
            productId: product2.id,
            quantity: -10,
            reason: 'Concurrent deduction',
          },
          userId
        )
      );

      const results = await Promise.all(adjustments);

      // Verify final stock is correct
      const finalInventory = await prisma.inventory.findFirst({
        where: {
          businessId,
          branchId,
          productId: product2.id,
        },
      });

      assert.ok(finalInventory);
      assert.strictEqual(Number(finalInventory.currentQuantity), 50); // 100 - (5 * 10)

      // Verify all movements were recorded
      const movements = await prisma.stockMovement.findMany({
        where: {
          businessId,
          productId: product2.id,
        },
      });

      assert.strictEqual(movements.length, 6); // 1 opening + 5 adjustments
    });
  });

  describe('Negative Stock Configuration', () => {
    it('should block negative stock by default', async () => {
      

      // Create a new product
      const product3 = await prisma.product.create({
        data: {
          businessId,
          categoryId,
          name: 'Negative Stock Test',
          sku: 'NEG-001',
          purchasePrice: 100,
          sellingPrice: 150,
        },
      });

      // Create opening stock
      await inventoryService.createStockAdjustment(
        {
          businessId,
          branchId,
          productId: product3.id,
          quantity: 10,
          reason: 'Opening stock',
        },
        userId
      );

      // Try to deduct more than available
      try {
        await inventoryService.createStockAdjustment(
          {
            businessId,
            branchId,
            productId: product3.id,
            quantity: -20,
            reason: 'Excessive deduction',
          },
          userId
        );
        assert.fail('Should have blocked negative stock');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Insufficient stock'));
      }
    });

    it('should allow negative stock when configured', async () => {
      // Enable negative stock
      await prisma.setting.upsert({
        where: {
          businessId_key: {
            businessId,
            key: 'allow_negative_stock',
          },
        },
        update: {
          value: true,
        },
        create: {
          businessId,
          key: 'allow_negative_stock',
          value: true,
        },
      });

      

      // Create a new product
      const product4 = await prisma.product.create({
        data: {
          businessId,
          categoryId,
          name: 'Negative Stock Allowed',
          sku: 'NEG-002',
          purchasePrice: 100,
          sellingPrice: 150,
        },
      });

      // Create opening stock
      await inventoryService.createStockAdjustment(
        {
          businessId,
          branchId,
          productId: product4.id,
          quantity: 10,
          reason: 'Opening stock',
        },
        userId
      );

      // Deduct more than available (should work now)
      const result = await inventoryService.createStockAdjustment(
        {
          businessId,
          branchId,
          productId: product4.id,
          quantity: -20,
          reason: 'Negative stock allowed',
        },
        userId
      );

      assert.strictEqual(Number(result.inventory.currentQuantity), -10);
    });
  });
});

console.log('[PASS] All Phase 4 tests defined!');

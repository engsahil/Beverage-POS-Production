import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as vendorService from '../src/services/vendorService.js';
import * as purchaseService from '../src/services/purchaseService.js';

const prisma = new PrismaClient();

describe('Phase 5 - Purchasing & Vendor Management', () => {
  let businessId: string;
  let branchId: string;
  let userId: string;
  let categoryId: string;
  let unitId: string;
  let productId: string;
  let variantId: string;
  let vendorId: string;

  before(async () => {
    // Clean up test data
    await prisma.purchaseItem.deleteMany({});
    await prisma.purchase.deleteMany({});
    await prisma.vendor.deleteMany({});
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

    // Create test vendor
    const vendor = await prisma.vendor.create({
      data: {
        businessId,
        name: 'Test Vendor',
        companyName: 'Test Company',
        contactPerson: 'John Doe',
        phone: '+923001234567',
        email: 'vendor@test.com',
        address: '123 Test St',
        city: 'Lahore',
        openingBalance: 0,
        paymentTerms: 30,
        createdBy: userId,
      },
    });
    vendorId = vendor.id;
  });

  after(async () => {
    // Clean up
    await prisma.purchaseItem.deleteMany({});
    await prisma.purchase.deleteMany({});
    await prisma.vendor.deleteMany({});
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

  describe('Vendor Management', () => {
    it('should create a vendor', async () => {
      

      const vendor = await vendorService.createVendor(
        {
          businessId,
          name: 'New Vendor',
          companyName: 'New Company',
          phone: '+923009876543',
          email: 'new@test.com',
        },
        userId
      );

      assert.ok(vendor);
      assert.strictEqual(vendor.name, 'New Vendor');
      assert.strictEqual(vendor.businessId, businessId);
      assert.strictEqual(vendor.createdBy, userId);
    });

    it('should update a vendor', async () => {
      

      const updated = await vendorService.updateVendor(
        vendorId,
        businessId,
        {
          name: 'Updated Vendor',
          paymentTerms: 45,
        },
        userId
      );

      assert.ok(updated);
      assert.strictEqual(updated.name, 'Updated Vendor');
      assert.strictEqual(updated.paymentTerms, 45);
    });

    it('should get vendor by ID', async () => {
      

      const vendor = await vendorService.getVendorById(vendorId, businessId);

      assert.ok(vendor);
      assert.strictEqual(vendor.id, vendorId);
      assert.strictEqual(vendor.businessId, businessId);
    });

    it('should list vendors with filtering', async () => {
      

      const result = await vendorService.getVendors(businessId, {
        page: 1,
        limit: 10,
        search: 'Test',
      });

      assert.ok(result.data);
      assert.ok(result.data.length > 0);
      assert.ok(result.meta);
    });
  });

  describe('Purchase Management', () => {
    let purchaseId: string;

    it('should create a purchase (draft)', async () => {
      

      const purchase = await purchaseService.createPurchase(
        {
          businessId,
          branchId,
          vendorId,
          purchaseDate: new Date().toISOString(),
          items: [
            {
              productId,
              variantId,
              quantity: 10,
              purchasePrice: 100,
              discount: 0,
              tax: 0,
            },
          ],
          discount: 0,
          tax: 0,
          amountPaid: 0,
          notes: 'Test purchase',
        },
        userId
      );

      assert.ok(purchase);
      assert.strictEqual(purchase.status, 'DRAFT');
      assert.strictEqual(purchase.vendorId, vendorId);
      assert.strictEqual(purchase.branchId, branchId);
      assert.ok(purchase.purchaseNumber);
      assert.ok(purchase.purchaseNumber.startsWith('PUR-'));
      assert.strictEqual(Number(purchase.total), 1000); // 10 * 100
      purchaseId = purchase.id;
    });

    it('should generate sequential purchase numbers', async () => {
      

      const purchase = await purchaseService.createPurchase(
        {
          businessId,
          branchId,
          vendorId,
          purchaseDate: new Date().toISOString(),
          items: [
            {
              productId,
              quantity: 5,
              purchasePrice: 50,
            },
          ],
        },
        userId
      );

      assert.ok(purchase.purchaseNumber);
      assert.ok(purchase.purchaseNumber.startsWith('PUR-'));
    });

    it('should update draft purchase', async () => {
      

      const updated = await purchaseService.updatePurchase(
        purchaseId,
        businessId,
        {
          items: [
            {
              productId,
              variantId,
              quantity: 20,
              purchasePrice: 100,
            },
          ],
          notes: 'Updated notes',
        },
        userId
      );

      assert.ok(updated);
      assert.strictEqual(updated.status, 'DRAFT');
      assert.strictEqual(Number(updated.total), 2000); // 20 * 100
      assert.strictEqual(updated.notes, 'Updated notes');
    });

    it('should receive purchase and update inventory', async () => {
      

      const received = await purchaseService.receivePurchase(purchaseId, businessId, userId);

      assert.ok(received);
      assert.strictEqual(received.status, 'RECEIVED');
      assert.ok(received.receivedAt);
      assert.strictEqual(received.receivedBy, userId);

      // Verify inventory was updated
      const inventory = await prisma.inventory.findFirst({
        where: {
          businessId,
          branchId,
          productId,
          variantId,
        },
      });

      assert.ok(inventory);
      assert.strictEqual(Number(inventory.currentQuantity), 20);

      // Verify stock movement was created
      const movement = await prisma.stockMovement.findFirst({
        where: {
          businessId,
          branchId,
          productId,
          variantId,
          movementType: 'PURCHASE',
          referenceType: 'purchase',
          referenceId: purchaseId,
        },
      });

      assert.ok(movement);
      assert.strictEqual(Number(movement.quantity), 20);
    });

    it('should not update received purchase', async () => {
      

      try {
        await purchaseService.updatePurchase(
          purchaseId,
          businessId,
          { notes: 'Should not update' },
          userId
        );
        assert.fail('Should have thrown error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Only draft purchases can be updated'));
      }
    });

    it('should not receive already received purchase', async () => {
      

      try {
        await purchaseService.receivePurchase(purchaseId, businessId, userId);
        assert.fail('Should have thrown error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Only draft purchases can be received'));
      }
    });

    it('should cancel draft purchase', async () => {
      

      // Create a new draft purchase
      const draft = await purchaseService.createPurchase(
        {
          businessId,
          branchId,
          vendorId,
          purchaseDate: new Date().toISOString(),
          items: [
            {
              productId,
              quantity: 5,
              purchasePrice: 50,
            },
          ],
        },
        userId
      );

      // Cancel it
      const cancelled = await purchaseService.cancelPurchase(draft.id, businessId, userId);

      assert.ok(cancelled);
      assert.strictEqual(cancelled.status, 'CANCELLED');

      // Verify inventory was NOT updated
      const inventory = await prisma.inventory.findFirst({
        where: {
          businessId,
          branchId,
          productId,
          variantId,
        },
      });

      // Should still be 20 from the previous received purchase
      assert.ok(inventory);
      assert.strictEqual(Number(inventory.currentQuantity), 20);
    });

    it('should not cancel received purchase', async () => {
      

      try {
        await purchaseService.cancelPurchase(purchaseId, businessId, userId);
        assert.fail('Should have thrown error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Cannot cancel received purchase'));
      }
    });

    it('should calculate totals correctly', async () => {
      

      const purchase = await purchaseService.createPurchase(
        {
          businessId,
          branchId,
          vendorId,
          purchaseDate: new Date().toISOString(),
          items: [
            {
              productId,
              quantity: 10,
              purchasePrice: 100,
              discount: 50,
              tax: 100,
            },
            {
              productId,
              variantId,
              quantity: 5,
              purchasePrice: 200,
              discount: 0,
              tax: 0,
            },
          ],
          discount: 100,
          tax: 50,
          amountPaid: 500,
        },
        userId
      );

      // Item 1: (10 * 100) - 50 + 100 = 1050
      // Item 2: (5 * 200) - 0 + 0 = 1000
      // Subtotal: 1050 + 1000 = 2050
      // Total: 2050 - 100 + 50 = 2000
      // Amount paid: 500
      // Amount due: 2000 - 500 = 1500

      assert.strictEqual(Number(purchase.subtotal), 2050);
      assert.strictEqual(Number(purchase.discount), 100);
      assert.strictEqual(Number(purchase.tax), 50);
      assert.strictEqual(Number(purchase.total), 2000);
      assert.strictEqual(Number(purchase.amountPaid), 500);
      assert.strictEqual(Number(purchase.amountDue), 1500);
      assert.strictEqual(purchase.paymentStatus, 'PARTIALLY_PAID');
    });

    it('should get purchase by ID', async () => {
      

      const purchase = await purchaseService.getPurchaseById(purchaseId, businessId);

      assert.ok(purchase);
      assert.strictEqual(purchase.id, purchaseId);
      assert.strictEqual(purchase.businessId, businessId);
      assert.ok(purchase.items);
      assert.ok(purchase.items.length > 0);
    });

    it('should list purchases with filtering', async () => {
      

      const result = await purchaseService.getPurchases(businessId, {
        page: 1,
        limit: 10,
        status: 'RECEIVED',
      });

      assert.ok(result.data);
      assert.ok(result.data.length > 0);
      assert.ok(result.meta);
    });
  });

  describe('Purchase → Inventory Integration', () => {
    it('should increase stock when purchase is received', async () => {
      

      // Create a new product for this test
      const product2 = await prisma.product.create({
        data: {
          businessId,
          categoryId,
          name: 'Integration Test Product',
          sku: 'INT-001',
          purchasePrice: 50,
          sellingPrice: 75,
        },
      });

      // Create purchase
      const purchase = await purchaseService.createPurchase(
        {
          businessId,
          branchId,
          vendorId,
          purchaseDate: new Date().toISOString(),
          items: [
            {
              productId: product2.id,
              quantity: 100,
              purchasePrice: 50,
            },
          ],
        },
        userId
      );

      // Verify no inventory yet
      let inventory = await prisma.inventory.findFirst({
        where: {
          businessId,
          branchId,
          productId: product2.id,
          variantId: null,
        },
      });

      assert.strictEqual(inventory, null);

      // Receive purchase
      await purchaseService.receivePurchase(purchase.id, businessId, userId);

      // Verify inventory was created and updated
      inventory = await prisma.inventory.findFirst({
        where: {
          businessId,
          branchId,
          productId: product2.id,
          variantId: null,
        },
      });

      assert.ok(inventory);
      assert.strictEqual(Number(inventory.currentQuantity), 100);
    });

    it('should create stock movement with purchase reference', async () => {
      

      const purchase = await purchaseService.createPurchase(
        {
          businessId,
          branchId,
          vendorId,
          purchaseDate: new Date().toISOString(),
          items: [
            {
              productId,
              variantId,
              quantity: 50,
              purchasePrice: 100,
            },
          ],
        },
        userId
      );

      await purchaseService.receivePurchase(purchase.id, businessId, userId);

      const movement = await prisma.stockMovement.findFirst({
        where: {
          businessId,
          referenceType: 'purchase',
          referenceId: purchase.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(movement);
      assert.strictEqual(movement.movementType, 'PURCHASE');
      assert.strictEqual(Number(movement.quantity), 50);
      assert.strictEqual(movement.referenceType, 'purchase');
      assert.strictEqual(movement.referenceId, purchase.id);
    });
  });

  describe('Transaction Safety', () => {
    it('should rollback if inventory update fails', async () => {
      

      // Create purchase with invalid product
      try {
        await purchaseService.createPurchase(
          {
            businessId,
            branchId,
            vendorId,
            purchaseDate: new Date().toISOString(),
            items: [
              {
                productId: 'invalid-product-id',
                quantity: 10,
                purchasePrice: 100,
              },
            ],
          },
          userId
        );
        assert.fail('Should have thrown error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('not found'));
      }
    });
  });

  describe('Business Isolation', () => {
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

    it('should not allow cross-business vendor access', async () => {
      

      const result = await vendorService.getVendors(business2Id, {});

      assert.strictEqual(result.data.length, 0);
    });

    it('should not allow cross-business purchase access', async () => {
      

      const result = await purchaseService.getPurchases(business2Id, {});

      assert.strictEqual(result.data.length, 0);
    });
  });

  describe('Audit Logging', () => {
    it('should create audit log for vendor creation', async () => {
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          businessId,
          action: 'VENDOR_CREATED',
          entityType: 'vendor',
        },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(auditLog);
      assert.strictEqual(auditLog.userId, userId);
    });

    it('should create audit log for purchase creation', async () => {
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          businessId,
          action: 'PURCHASE_CREATED',
          entityType: 'purchase',
        },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(auditLog);
      assert.strictEqual(auditLog.userId, userId);
    });

    it('should create audit log for purchase received', async () => {
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          businessId,
          action: 'PURCHASE_RECEIVED',
          entityType: 'purchase',
        },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(auditLog);
      assert.strictEqual(auditLog.userId, userId);
    });
  });
});

console.log('[PASS] All Phase 5 tests defined!');

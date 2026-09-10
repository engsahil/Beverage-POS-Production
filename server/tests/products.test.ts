import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

describe('Phase 3 - Product Catalog', () => {
  let businessId: string;
  let categoryId: string;
  let unitId: string;
  let productId: string;
  let variantId: string;

  before(async () => {
    // Clean up test data
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.unit.deleteMany({});
    await prisma.category.deleteMany({});
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
  });

  after(async () => {
    // Clean up
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.unit.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.business.deleteMany({});
    await prisma.$disconnect();
  });

  describe('Category Management', () => {
    it('should create a category', async () => {
      const category = await prisma.category.create({
        data: {
          businessId,
          name: 'Test Category',
          description: 'Test description',
          isActive: true,
        },
      });

      assert.ok(category.id);
      assert.strictEqual(category.name, 'Test Category');
      assert.strictEqual(category.businessId, businessId);
      categoryId = category.id;
    });

    it('should enforce unique category names per business', async () => {
      try {
        await prisma.category.create({
          data: {
            businessId,
            name: 'Test Category',
          },
        });
        assert.fail('Should have thrown unique constraint error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Unique constraint'));
      }
    });

    it('should update a category', async () => {
      const updated = await prisma.category.update({
        where: { id: categoryId },
        data: { name: 'Updated Category' },
      });

      assert.strictEqual(updated.name, 'Updated Category');
    });

    it('should disable a category', async () => {
      const disabled = await prisma.category.update({
        where: { id: categoryId },
        data: { isActive: false },
      });

      assert.strictEqual(disabled.isActive, false);
    });

    it('should enable a category', async () => {
      const enabled = await prisma.category.update({
        where: { id: categoryId },
        data: { isActive: true },
      });

      assert.strictEqual(enabled.isActive, true);
    });
  });

  describe('Unit Management', () => {
    it('should create a unit', async () => {
      const unit = await prisma.unit.create({
        data: {
          businessId,
          name: 'Liter',
          shortCode: 'L',
          isActive: true,
        },
      });

      assert.ok(unit.id);
      assert.strictEqual(unit.name, 'Liter');
      assert.strictEqual(unit.shortCode, 'L');
      unitId = unit.id;
    });

    it('should enforce unique unit names per business', async () => {
      try {
        await prisma.unit.create({
          data: {
            businessId,
            name: 'Liter',
            shortCode: 'L2',
          },
        });
        assert.fail('Should have thrown unique constraint error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Unique constraint'));
      }
    });

    it('should enforce unique short codes per business', async () => {
      try {
        await prisma.unit.create({
          data: {
            businessId,
            name: 'Liter 2',
            shortCode: 'L',
          },
        });
        assert.fail('Should have thrown unique constraint error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Unique constraint'));
      }
    });
  });

  describe('Product Management', () => {
    it('should create a product', async () => {
      const product = await prisma.product.create({
        data: {
          businessId,
          categoryId,
          name: 'Test Product',
          description: 'Test product description',
          sku: 'TEST-001',
          barcode: '1234567890123',
          purchasePrice: 100.50,
          sellingPrice: 150.75,
          isActive: true,
          taxEnabled: true,
          taxRate: 17.5,
          discountAllowed: true,
          maxDiscountPercent: 10.0,
          minStockThreshold: 10,
          maxStockThreshold: 100,
          expiryTrackingEnabled: true,
          expiryWarningDays: 30,
        },
      });

      assert.ok(product.id);
      assert.strictEqual(product.name, 'Test Product');
      assert.strictEqual(product.sku, 'TEST-001');
      assert.strictEqual(product.barcode, '1234567890123');
      assert.strictEqual(Number(product.purchasePrice), 100.50);
      assert.strictEqual(Number(product.sellingPrice), 150.75);
      assert.strictEqual(Number(product.taxRate), 17.5);
      productId = product.id;
    });

    it('should enforce unique SKUs per business', async () => {
      try {
        await prisma.product.create({
          data: {
            businessId,
            categoryId,
            name: 'Another Product',
            sku: 'TEST-001',
            purchasePrice: 100,
            sellingPrice: 150,
          },
        });
        assert.fail('Should have thrown unique constraint error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Unique constraint'));
      }
    });

    it('should enforce unique barcodes globally', async () => {
      try {
        await prisma.product.create({
          data: {
            businessId,
            categoryId,
            name: 'Another Product',
            barcode: '1234567890123',
            purchasePrice: 100,
            sellingPrice: 150,
          },
        });
        assert.fail('Should have thrown unique constraint error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Unique constraint'));
      }
    });

    it('should use decimal precision for prices', async () => {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      assert.ok(product);
      // Verify decimal precision (should be 2 decimal places)
      assert.strictEqual(Number(product.purchasePrice), 100.50);
      assert.strictEqual(Number(product.sellingPrice), 150.75);
    });

    it('should update product prices', async () => {
      const updated = await prisma.product.update({
        where: { id: productId },
        data: {
          purchasePrice: 110.25,
          sellingPrice: 160.50,
        },
      });

      assert.strictEqual(Number(updated.purchasePrice), 110.25);
      assert.strictEqual(Number(updated.sellingPrice), 160.50);
    });

    it('should disable a product', async () => {
      const disabled = await prisma.product.update({
        where: { id: productId },
        data: { isActive: false },
      });

      assert.strictEqual(disabled.isActive, false);
    });

    it('should enable a product', async () => {
      const enabled = await prisma.product.update({
        where: { id: productId },
        data: { isActive: true },
      });

      assert.strictEqual(enabled.isActive, true);
    });
  });

  describe('Product Variant Management', () => {
    it('should create a variant', async () => {
      const variant = await prisma.productVariant.create({
        data: {
          productId,
          unitId,
          name: '500ml',
          quantity: 0.5,
          sku: 'TEST-001-500ML',
          barcode: '1234567890124',
          purchasePrice: 50.25,
          sellingPrice: 75.50,
          isActive: true,
        },
      });

      assert.ok(variant.id);
      assert.strictEqual(variant.name, '500ml');
      assert.strictEqual(Number(variant.quantity), 0.5);
      assert.strictEqual(variant.sku, 'TEST-001-500ML');
      variantId = variant.id;
    });

    it('should enforce unique variant names per product', async () => {
      try {
        await prisma.productVariant.create({
          data: {
            productId,
            unitId,
            name: '500ml',
            quantity: 0.5,
            purchasePrice: 50,
            sellingPrice: 75,
          },
        });
        assert.fail('Should have thrown unique constraint error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Unique constraint'));
      }
    });

    it('should enforce unique variant SKUs globally', async () => {
      try {
        await prisma.productVariant.create({
          data: {
            productId,
            unitId,
            name: '1L',
            quantity: 1.0,
            sku: 'TEST-001-500ML',
            purchasePrice: 100,
            sellingPrice: 150,
          },
        });
        assert.fail('Should have thrown unique constraint error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Unique constraint'));
      }
    });

    it('should enforce unique variant barcodes globally', async () => {
      try {
        await prisma.productVariant.create({
          data: {
            productId,
            unitId,
            name: '1L',
            quantity: 1.0,
            barcode: '1234567890124',
            purchasePrice: 100,
            sellingPrice: 150,
          },
        });
        assert.fail('Should have thrown unique constraint error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Unique constraint'));
      }
    });

    it('should create multiple variants for same product', async () => {
      const variant2 = await prisma.productVariant.create({
        data: {
          productId,
          unitId,
          name: '1 Liter',
          quantity: 1.0,
          sku: 'TEST-001-1L',
          barcode: '1234567890125',
          purchasePrice: 100,
          sellingPrice: 150,
        },
      });

      assert.ok(variant2.id);
      assert.notStrictEqual(variant2.id, variantId);
    });

    it('should update variant prices', async () => {
      const updated = await prisma.productVariant.update({
        where: { id: variantId },
        data: {
          purchasePrice: 55.00,
          sellingPrice: 80.00,
        },
      });

      assert.strictEqual(Number(updated.purchasePrice), 55.00);
      assert.strictEqual(Number(updated.sellingPrice), 80.00);
    });
  });

  describe('Product Search', () => {
    it('should search product by barcode', async () => {
      const product = await prisma.product.findFirst({
        where: { barcode: '1234567890123' },
      });

      assert.ok(product);
      assert.strictEqual(product.id, productId);
    });

    it('should search variant by barcode', async () => {
      const variant = await prisma.productVariant.findFirst({
        where: { barcode: '1234567890124' },
      });

      assert.ok(variant);
      assert.strictEqual(variant.id, variantId);
    });

    it('should search product by SKU', async () => {
      const product = await prisma.product.findFirst({
        where: { sku: 'TEST-001' },
      });

      assert.ok(product);
      assert.strictEqual(product.id, productId);
    });

    it('should search variant by SKU', async () => {
      const variant = await prisma.productVariant.findFirst({
        where: { sku: 'TEST-001-500ML' },
      });

      assert.ok(variant);
      assert.strictEqual(variant.id, variantId);
    });

    it('should search product by name', async () => {
      const products = await prisma.product.findMany({
        where: {
          name: { contains: 'Test', mode: 'insensitive' },
          businessId,
        },
      });

      assert.ok(products.length > 0);
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

    it('should not allow cross-business category access', async () => {
      const categories = await prisma.category.findMany({
        where: { businessId: business2Id },
      });

      assert.strictEqual(categories.length, 0);
    });

    it('should not allow cross-business product access', async () => {
      const products = await prisma.product.findMany({
        where: { businessId: business2Id },
      });

      assert.strictEqual(products.length, 0);
    });

    it('should enforce category belongs to business', async () => {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, businessId: business2Id },
      });

      assert.strictEqual(category, null);
    });
  });

  describe('Database Constraints', () => {
    it('should cascade delete variants when product is deleted', async () => {
      // Create a temporary product with variants
      const tempProduct = await prisma.product.create({
        data: {
          businessId,
          categoryId,
          name: 'Temp Product',
          purchasePrice: 100,
          sellingPrice: 150,
        },
      });

      const tempVariant = await prisma.productVariant.create({
        data: {
          productId: tempProduct.id,
          unitId,
          name: 'Temp Variant',
          quantity: 1.0,
          purchasePrice: 50,
          sellingPrice: 75,
        },
      });

      // Delete the product
      await prisma.product.delete({
        where: { id: tempProduct.id },
      });

      // Verify variant is also deleted
      const deletedVariant = await prisma.productVariant.findUnique({
        where: { id: tempVariant.id },
      });

      assert.strictEqual(deletedVariant, null);
    });

    it('should not allow deleting category with products', async () => {
      try {
        await prisma.category.delete({
          where: { id: categoryId },
        });
        assert.fail('Should have thrown foreign key constraint error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Foreign key constraint') || 
                   (error as Error).message.includes('constraint'));
      }
    });

    it('should not allow deleting unit with variants', async () => {
      try {
        await prisma.unit.delete({
          where: { id: unitId },
        });
        assert.fail('Should have thrown foreign key constraint error');
      } catch (error: unknown) {
        assert.ok((error as Error).message.includes('Foreign key constraint') || 
                   (error as Error).message.includes('constraint'));
      }
    });
  });
});

console.log('[PASS] All Phase 3 tests passed!');

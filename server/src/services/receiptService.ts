import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { getReceiptSettings as getSettingsFromService } from './settingsService.js';

export interface ReceiptData {
  business: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    whatsapp: string | null;
    taxNumber: string | null;
  };
  branch: {
    name: string;
    code: string;
  };
  sale: {
    id: string;
    saleNumber: string;
    saleDate: Date;
    status: string;
    subtotal: number;
    discountAmount: number;
    discountType: string | null;
    discountValue: number | null;
    taxAmount: number;
    total: number;
    notes: string | null;
  };
  cashier: {
    id: string;
    username: string;
    fullName: string;
  };
  items: Array<{
    productId: string;
    productName: string;
    variantId: string | null;
    variantName: string | null;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxAmount: number;
    lineTotal: number;
  }>;
  payments: Array<{
    paymentMethod: string;
    amount: number;
    referenceNumber: string | null;
    cashReceived: number | null;
    cashChange: number | null;
  }>;
  settings: {
    showLogo: boolean;
    showAddress: boolean;
    showPhone: boolean;
    showWhatsApp: boolean;
    showTax: boolean;
    showDiscount: boolean;
    showCashier: boolean;
    showBranch: boolean;
    showBarcode: boolean;
    barcodeValue: string | null;
    headerText: string | null;
    footerText: string | null;
    receiptWidth: '58mm' | '80mm';
  };
  isReprint: boolean;
}

/**
 * Generate receipt data from sale
 */
export async function generateReceiptData(
  saleId: string,
  businessId: string,
  isReprint: boolean = false
): Promise<ReceiptData> {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, businessId },
    include: {
      business: true,
      branch: true,
      cashier: { select: { id: true, username: true, fullName: true } },
      items: {
        include: {
          product: { select: { name: true } },
          variant: { select: { name: true } },
        },
      },
      payments: true,
    },
  });

  if (!sale) {
    throw new Error('Sale not found');
  }

  // Get receipt settings
  const settings = await getReceiptSettings(businessId);

  return {
    business: {
      name: sale.business.name,
      logoUrl: sale.business.logoUrl,
      address: sale.business.address,
      phone: sale.business.phone,
      whatsapp: sale.business.whatsapp,
      taxNumber: sale.business.taxNumber,
    },
    branch: {
      name: sale.branch.name,
      code: sale.branch.code,
    },
    sale: {
      id: sale.id,
      saleNumber: sale.saleNumber,
      saleDate: sale.saleDate,
      status: sale.status,
      subtotal: Number(sale.subtotal),
      discountAmount: Number(sale.discountAmount),
      discountType: sale.discountType,
      discountValue: sale.discountValue ? Number(sale.discountValue) : null,
      taxAmount: Number(sale.taxAmount),
      total: Number(sale.total),
      notes: sale.notes,
    },
    cashier: sale.cashier,
    items: sale.items.map(item => ({
      productId: item.productId,
      productName: item.product.name,
      variantId: item.variantId,
      variantName: item.variant?.name || null,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discountAmount: Number(item.discountAmount),
      taxAmount: Number(item.taxAmount),
      lineTotal: Number(item.lineTotal),
    })),
    payments: sale.payments.map(payment => ({
      paymentMethod: payment.paymentMethod,
      amount: Number(payment.amount),
      referenceNumber: payment.referenceNumber,
      cashReceived: payment.cashReceived ? Number(payment.cashReceived) : null,
      cashChange: payment.cashChange ? Number(payment.cashChange) : null,
    })),
    settings,
    isReprint,
  };
}

/**
 * Generate short order data (compact version)
 */
export async function generateShortOrderData(
  saleId: string,
  businessId: string
): Promise<ShortOrderData> {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, businessId },
    include: {
      business: { select: { name: true } },
      branch: { select: { name: true } },
      cashier: { select: { fullName: true } },
      items: {
        include: {
          product: { select: { name: true } },
          variant: { select: { name: true } },
        },
      },
    },
  });

  if (!sale) {
    throw new Error('Sale not found');
  }

  return {
    businessName: sale.business.name,
    branchName: sale.branch.name,
    saleNumber: sale.saleNumber,
    saleDate: sale.saleDate,
    cashierName: sale.cashier.fullName,
    items: sale.items.map(item => ({
      productName: item.product.name,
      variantName: item.variant?.name || null,
      quantity: Number(item.quantity),
    })),
    total: Number(sale.total),
    notes: sale.notes,
  };
}

export interface ShortOrderData {
  businessName: string;
  branchName: string;
  saleNumber: string;
  saleDate: Date;
  cashierName: string;
  items: Array<{
    productName: string;
    variantName: string | null;
    quantity: number;
  }>;
  total: number;
  notes: string | null;
}

/**
 * Get receipt settings for business
 * Uses centralized settingsService for consistency
 */
async function getReceiptSettings(businessId: string) {
  const settings = await getSettingsFromService(businessId);
  
  // Map new settings format to legacy format expected by receiptService
  return {
    showLogo: settings.showLogo,
    showAddress: settings.showAddress,
    showPhone: settings.showPhone,
    showWhatsApp: settings.showWhatsApp,
    showTax: settings.showTax,
    showDiscount: settings.showDiscount,
    showCashier: settings.showCashier,
    showBranch: settings.showBranch,
    showBarcode: settings.showBarcode,
    barcodeValue: null as string | null,
    headerText: settings.headerText || null,
    footerText: settings.footerText || 'Thank you for your business!',
    receiptWidth: settings.paperSize,
  };
}

/**
 * Log receipt generation
 */
export async function logReceiptGeneration(
  saleId: string,
  businessId: string,
  userId: string,
  isReprint: boolean,
  ipAddress?: string,
  userAgent?: string
) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { saleNumber: true },
  });

  await createAuditLog({
    businessId,
    userId,
    action: isReprint ? AuditActions.RECEIPT_REPRINTED : AuditActions.RECEIPT_GENERATED,
    entityType: 'sale',
    entityId: saleId,
    newValues: {
      saleNumber: sale?.saleNumber,
      isReprint,
    },
    ipAddress,
    userAgent,
  });
}

/**
 * Log short order print
 */
export async function logShortOrderPrint(
  saleId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { saleNumber: true },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.SHORT_ORDER_PRINTED,
    entityType: 'sale',
    entityId: saleId,
    newValues: {
      saleNumber: sale?.saleNumber,
    },
    ipAddress,
    userAgent,
  });
}

/**
 * Log PDF generation
 */
export async function logPdfGeneration(
  saleId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { saleNumber: true },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.RECEIPT_PDF_GENERATED,
    entityType: 'sale',
    entityId: saleId,
    newValues: {
      saleNumber: sale?.saleNumber,
    },
    ipAddress,
    userAgent,
  });
}

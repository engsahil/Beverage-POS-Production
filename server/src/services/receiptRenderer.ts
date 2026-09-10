import puppeteer from 'puppeteer';
import bwipjs from 'bwip-js';
import { ReceiptData, ShortOrderData } from './receiptService.js';

/**
 * Generate barcode as base64 PNG
 */
export async function generateBarcode(value: string, _width: number = 200, height: number = 50): Promise<string> {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer({
      bcid: 'code128',
      text: value,
      scale: 2,
      height: height / 10,
      includetext: false,
      textxalign: 'center',
    }, (err: string | Error | null, png: Buffer) => {
      if (err) {
        reject(err);
      } else {
        resolve(`data:image/png;base64,${png.toString('base64')}`);
      }
    });
  });
}

/**
 * Generate receipt HTML
 */
export async function generateReceiptHTML(data: ReceiptData): Promise<string> {
  const { business, sale, cashier, items, payments, settings, isReprint } = data;
  
  // Generate barcode if enabled
  let barcodeImage = '';
  if (settings.showBarcode) {
    const barcodeValue = settings.barcodeValue || sale.saleNumber;
    try {
      barcodeImage = await generateBarcode(barcodeValue);
    } catch (error) {
      console.error('Failed to generate barcode:', error);
    }
  }

  const formatCurrency = (amount: number) => `Rs. ${amount.toFixed(2)}`;
  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleString('en-PK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt ${sale.saleNumber}</title>
  <style>
    @page {
      size: ${settings.receiptWidth} auto;
      margin: 0;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.4;
      width: ${settings.receiptWidth};
      padding: 10px;
      color: #000;
      background: #fff;
    }
    
    .receipt {
      width: 100%;
    }
    
    .header {
      text-align: center;
      margin-bottom: 15px;
      border-bottom: 2px dashed #000;
      padding-bottom: 10px;
    }
    
    .logo {
      max-width: 120px;
      max-height: 60px;
      margin-bottom: 10px;
    }
    
    .business-name {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .business-info {
      font-size: 11px;
      line-height: 1.3;
    }
    
    .sale-info {
      margin: 15px 0;
      border-bottom: 1px dashed #000;
      padding-bottom: 10px;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      font-size: 11px;
    }
    
    .info-label {
      font-weight: bold;
    }
    
    .items {
      margin: 15px 0;
      border-bottom: 1px dashed #000;
      padding-bottom: 10px;
    }
    
    .item-header {
      display: flex;
      justify-content: space-between;
      font-weight: bold;
      font-size: 11px;
      border-bottom: 1px solid #000;
      padding-bottom: 5px;
      margin-bottom: 5px;
    }
    
    .item {
      margin: 8px 0;
      page-break-inside: avoid;
    }
    
    .item-name {
      font-weight: bold;
      font-size: 12px;
      margin-bottom: 2px;
    }
    
    .item-variant {
      font-size: 10px;
      color: #666;
      margin-bottom: 2px;
    }
    
    .item-details {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
    }
    
    .totals {
      margin: 15px 0;
      border-top: 2px dashed #000;
      padding-top: 10px;
    }
    
    .total-row {
      display: flex;
      justify-content: space-between;
      margin: 5px 0;
      font-size: 12px;
    }
    
    .total-row.grand-total {
      font-size: 16px;
      font-weight: bold;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 8px 0;
      margin-top: 10px;
    }
    
    .payments {
      margin: 15px 0;
      border-top: 1px dashed #000;
      padding-top: 10px;
    }
    
    .payment-row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      font-size: 11px;
    }
    
    .barcode {
      text-align: center;
      margin: 20px 0;
    }
    
    .barcode img {
      max-width: 100%;
      height: 50px;
    }
    
    .footer {
      text-align: center;
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px dashed #000;
      font-size: 11px;
    }
    
    .reprint-notice {
      text-align: center;
      font-weight: bold;
      color: #d32f2f;
      margin: 10px 0;
      padding: 5px;
      border: 2px solid #d32f2f;
    }
    
    @media print {
      body {
        padding: 5px;
      }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      ${settings.showLogo && business.logoUrl ? `<img src="${business.logoUrl}" alt="Logo" class="logo" />` : ''}
      <div class="business-name">${business.name}</div>
      ${settings.showAddress && business.address ? `<div class="business-info">${business.address}</div>` : ''}
      ${settings.showPhone && business.phone ? `<div class="business-info">${business.phone}</div>` : ''}
      ${settings.showWhatsApp && business.whatsapp ? `<div class="business-info">WhatsApp: ${business.whatsapp}</div>` : ''}
    </div>
    
    ${isReprint ? '<div class="reprint-notice">*** REPRINT ***</div>' : ''}
    
    <div class="sale-info">
      <div class="info-row">
        <span class="info-label">Invoice #:</span>
        <span>${sale.saleNumber}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Date:</span>
        <span>${formatDate(sale.saleDate)}</span>
      </div>
      ${settings.showCashier ? `<div class="info-row">
        <span class="info-label">Cashier:</span>
        <span>${cashier.fullName}</span>
      </div>` : ''}
      ${settings.showBranch ? `<div class="info-row">
        <span class="info-label">Branch:</span>
        <span>${data.branch.name}</span>
      </div>` : ''}
    </div>
    
    <div class="items">
      <div class="item-header">
        <span>Item</span>
        <span>Total</span>
      </div>
      ${items.map(item => `
        <div class="item">
          <div class="item-name">${item.productName}</div>
          ${item.variantName ? `<div class="item-variant">${item.variantName}</div>` : ''}
          <div class="item-details">
            <span>${item.quantity} × ${formatCurrency(item.unitPrice)}</span>
            <span>${formatCurrency(item.lineTotal)}</span>
          </div>
        </div>
      `).join('')}
    </div>
    
    <div class="totals">
      <div class="total-row">
        <span>Subtotal:</span>
        <span>${formatCurrency(sale.subtotal)}</span>
      </div>
      ${settings.showDiscount && sale.discountAmount > 0 ? `
        <div class="total-row">
          <span>Discount${sale.discountType ? ` (${sale.discountType === 'PERCENTAGE' ? sale.discountValue + '%' : 'Fixed'})` : ''}:</span>
          <span>-${formatCurrency(sale.discountAmount)}</span>
        </div>
      ` : ''}
      ${settings.showTax && sale.taxAmount > 0 ? `
        <div class="total-row">
          <span>Tax:</span>
          <span>${formatCurrency(sale.taxAmount)}</span>
        </div>
      ` : ''}
      <div class="total-row grand-total">
        <span>TOTAL:</span>
        <span>${formatCurrency(sale.total)}</span>
      </div>
    </div>
    
    <div class="payments">
      ${payments.map(payment => `
        <div class="payment-row">
          <span>${payment.paymentMethod}:</span>
          <span>${formatCurrency(payment.amount)}</span>
        </div>
        ${payment.paymentMethod === 'CASH' && payment.cashReceived ? `
          <div class="payment-row">
            <span>Cash Received:</span>
            <span>${formatCurrency(payment.cashReceived)}</span>
          </div>
          <div class="payment-row">
            <span>Change:</span>
            <span>${formatCurrency(payment.cashChange || 0)}</span>
          </div>
        ` : ''}
        ${payment.referenceNumber ? `
          <div class="payment-row">
            <span>Ref #:</span>
            <span>${payment.referenceNumber}</span>
          </div>
        ` : ''}
      `).join('')}
    </div>
    
    ${barcodeImage ? `
      <div class="barcode">
        <img src="${barcodeImage}" alt="Barcode" />
      </div>
    ` : ''}
    
    <div class="footer">
      ${settings.headerText ? `<p>${settings.headerText}</p>` : ''}
      ${settings.footerText ? `<p>${settings.footerText}</p>` : ''}
    </div>
  </div>
</body>
</html>
  `;

  return html;
}

/**
 * Generate short order HTML
 */
export function generateShortOrderHTML(data: ShortOrderData): string {
  const { businessName, branchName, saleNumber, saleDate, cashierName, items, total, notes } = data;
  
  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleString('en-PK', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Short Order ${saleNumber}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Courier New', monospace;
      font-size: 14px;
      line-height: 1.3;
      width: 80mm;
      padding: 8px;
      color: #000;
      background: #fff;
    }
    
    .order {
      width: 100%;
    }
    
    .header {
      text-align: center;
      margin-bottom: 10px;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
    }
    
    .business-name {
      font-size: 16px;
      font-weight: bold;
    }
    
    .order-number {
      font-size: 20px;
      font-weight: bold;
      margin: 5px 0;
    }
    
    .order-info {
      font-size: 11px;
      margin: 3px 0;
    }
    
    .items {
      margin: 10px 0;
    }
    
    .item {
      margin: 8px 0;
      padding: 5px 0;
      border-bottom: 1px dashed #000;
    }
    
    .item-name {
      font-weight: bold;
      font-size: 14px;
    }
    
    .item-variant {
      font-size: 11px;
      color: #666;
    }
    
    .item-qty {
      font-size: 16px;
      font-weight: bold;
      text-align: right;
    }
    
    .notes {
      margin: 10px 0;
      padding: 8px;
      background: #fff3cd;
      border: 2px solid #ffc107;
      font-weight: bold;
    }
    
    .footer {
      text-align: center;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 2px solid #000;
      font-size: 12px;
    }
    
    @media print {
      body {
        padding: 5px;
      }
    }
  </style>
</head>
<body>
  <div class="order">
    <div class="header">
      <div class="business-name">${businessName}</div>
      <div class="order-number">#${saleNumber}</div>
      <div class="order-info">${branchName} • ${formatDate(saleDate)}</div>
      <div class="order-info">Cashier: ${cashierName}</div>
    </div>
    
    <div class="items">
      ${items.map(item => `
        <div class="item">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <div class="item-name">${item.productName}</div>
              ${item.variantName ? `<div class="item-variant">${item.variantName}</div>` : ''}
            </div>
            <div class="item-qty">${item.quantity}×</div>
          </div>
        </div>
      `).join('')}
    </div>
    
    ${notes ? `<div class="notes">NOTE: ${notes}</div>` : ''}
    
    <div class="footer">
      <div style="font-size: 14px; font-weight: bold;">
        Total: Rs. ${total.toFixed(2)}
      </div>
    </div>
  </div>
</body>
</html>
  `;

  return html;
}

/**
 * Generate PDF from HTML
 */
export async function generatePDF(html: string, width: string = '80mm'): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });

    const pdf = await page.pdf({
      width,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

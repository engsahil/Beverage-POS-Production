/**
 * Phase 20: WhatsApp Service
 * Handles WhatsApp notifications for shift closing
 */

import prisma from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { MetaCloudAPIProvider } from './metaProvider.js';
import { WhatsAppProvider, MessageStatusType } from './types.js';
import { Decimal } from '@prisma/client/runtime/library.js';

export interface SendShiftClosingReportInput {
  businessId: string;
  shiftId: string;
  userId: string;
}

export interface SendTestMessageInput {
  businessId: string;
  userId: string;
}

export interface RetryMessageInput {
  messageId: string;
  businessId: string;
  userId: string;
}

/**
 * Send shift closing report via WhatsApp
 */
export async function sendShiftClosingReport(input: SendShiftClosingReportInput) {
  const { businessId, shiftId } = input;

  try {
    // 1. Get WhatsApp config
    const config = await prisma.whatsAppConfig.findUnique({
      where: { businessId },
    });

    if (!config || !config.enabled) {
      logger.info('WhatsApp not enabled for business', { businessId });
      return { success: false, reason: 'WhatsApp not configured or disabled' };
    }

    if (!config.adminPhoneNumber) {
      logger.warn('Admin phone number not configured', { businessId });
      return { success: false, reason: 'Admin phone number not configured' };
    }

    // 2. Check idempotency - prevent duplicate messages for same shift
    const idempotencyKey = `shift_closing_${shiftId}`;
    const existingMessage = await prisma.whatsAppMessage.findUnique({
      where: { idempotencyKey },
    });

    if (existingMessage) {
      logger.info('Shift closing message already sent', { shiftId, messageId: existingMessage.id });
      return { success: true, messageId: existingMessage.id, duplicate: true };
    }

    // 3. Get shift data
    const shift = await prisma.cashierShift.findUnique({
      where: { id: shiftId },
      include: {
        business: true,
        branch: true,
        cashier: true,
        closer: true,
      },
    });

    if (!shift) {
      throw new Error('Shift not found');
    }

    // 4. Generate closing report
    const reportText = await generateShiftClosingReport(shift);

    // 5. Create message record
    const message = await prisma.whatsAppMessage.create({
      data: {
        businessId,
        shiftId,
        messageType: 'SHIFT_CLOSING',
        recipient: config.adminPhoneNumber,
        messageContent: reportText,
        status: 'QUEUED',
        idempotencyKey,
      },
    });

    // 6. Send message (async, don't block)
    sendWhatsAppMessage(message.id, config).catch((error) => {
      logger.error('Failed to send WhatsApp message', {
        messageId: message.id,
        error: String(error),
      });
    });

    return { success: true, messageId: message.id };
  } catch (error) {
    logger.error('Error sending shift closing report', {
      businessId,
      shiftId,
      error: String(error),
    });
    throw error;
  }
}

/**
 * Generate shift closing report text
 */
async function generateShiftClosingReport(shift: any): Promise<string> {
  const business = shift.business;
  const branch = shift.branch;
  const cashier = shift.cashier;

  // Format currency
  const formatCurrency = (amount: Decimal | null) => {
    if (!amount) return 'Rs. 0';
    const num = Number(amount);
    return `Rs. ${num.toLocaleString('en-PK')}`;
  };

  // Format date/time
  const formatDateTime = (date: Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Calculate cash status
  const difference = Number(shift.cashDifference || 0);
  const cashStatus = difference > 0 ? 'OVER' : difference < 0 ? 'SHORT' : 'BALANCED';

  // Build report
  const lines = [
    '*SHIFT CLOSED*',
    '',
    `*Business:* ${business.name}`,
    `*Branch:* ${branch.name}`,
    `*Shift:* ${shift.shiftNumber}`,
    `*Cashier:* ${cashier.fullName}`,
    `*Opened:* ${formatDateTime(shift.openingDate)}`,
    `*Closed:* ${formatDateTime(shift.closingDate)}`,
    '',
    '*SALES SUMMARY*',
    `Total Sales: ${formatCurrency(shift.salesTotal)}`,
    `Cash Sales: ${formatCurrency(shift.cashSales)}`,
    `Card Sales: ${formatCurrency(shift.cardSales)}`,
    `Bank Transfer: ${formatCurrency(shift.bankTransferSales)}`,
    `Other: ${formatCurrency(shift.otherSales)}`,
    '',
    '*ADJUSTMENTS*',
    `Refunds: ${formatCurrency(shift.refundTotal)}`,
    `Voids: ${formatCurrency(shift.voidTotal)}`,
    '',
    '*CASH RECONCILIATION*',
    `Opening Cash: ${formatCurrency(shift.openingCash)}`,
    `Expected Cash: ${formatCurrency(shift.expectedCash)}`,
    `Actual Cash: ${formatCurrency(shift.actualCash)}`,
    `Difference: ${formatCurrency(shift.cashDifference)} (${cashStatus})`,
  ];

  // Add difference reason if provided
  if (shift.differenceReason) {
    lines.push(`Reason: ${shift.differenceReason}`);
  }

  // Add closing notes if provided
  if (shift.closingNotes) {
    lines.push('');
    lines.push('*NOTES*');
    lines.push(shift.closingNotes);
  }

  lines.push('');
  lines.push(`*Status:* ${shift.status}`);
  lines.push(`*Closed by:* ${shift.closer?.fullName || cashier.fullName}`);

  return lines.join('\n');
}

/**
 * Send WhatsApp message via provider
 */
async function sendWhatsAppMessage(messageId: string, config: any) {
  try {
    // Update status to SENDING
    await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: { status: 'SENDING' },
    });

    // Get provider
    const provider = getWhatsAppProvider(config);
    if (!provider) {
      throw new Error('WhatsApp provider not configured');
    }

    // Get message
    const message = await prisma.whatsAppMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    // Send message
    const result = await provider.sendTextMessage(message.recipient, message.messageContent);

    if (result.success && result.messageId) {
      // Update to SENT
      await prisma.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          status: 'SENT',
          providerMessageId: result.messageId,
          sentAt: new Date(),
        },
      });

      logger.info('WhatsApp message sent', { messageId, providerMessageId: result.messageId });
    } else {
      // Update to FAILED
      await prisma.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          status: 'FAILED',
          errorMessage: result.error,
          retryCount: { increment: 1 },
        },
      });

      logger.error('WhatsApp message failed', { messageId, error: result.error });
    }
  } catch (error) {
    logger.error('Error sending WhatsApp message', { messageId, error: String(error) });

    // Update to FAILED
    await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        retryCount: { increment: 1 },
      },
    });
  }
}

/**
 * Get WhatsApp provider instance
 */
function getWhatsAppProvider(config: any): WhatsAppProvider | null {
  if (!config.provider || config.provider !== 'meta') {
    logger.warn('Unsupported WhatsApp provider', { provider: config.provider });
    return null;
  }

  // Get credentials from environment
  const accessToken = process.env.WHATSAPP_META_ACCESS_TOKEN;
  const phoneNumberId = config.providerPhoneNumberId || process.env.WHATSAPP_META_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    logger.warn('WhatsApp Meta credentials not configured');
    return null;
  }

  return new MetaCloudAPIProvider({
    provider: 'meta',
    accessToken,
    phoneNumberId,
  });
}

/**
 * Send test message
 */
export async function sendTestMessage(input: SendTestMessageInput) {
  const { businessId } = input;

  try {
    // Get config
    const config = await prisma.whatsAppConfig.findUnique({
      where: { businessId },
    });

    if (!config || !config.adminPhoneNumber) {
      return { success: false, error: 'WhatsApp not configured' };
    }

    // Get provider
    const provider = getWhatsAppProvider(config);
    if (!provider) {
      return { success: false, error: 'WhatsApp provider not available' };
    }

    // Send test message
    const testMessage = '[SUCCESS] WhatsApp integration test successful.\n\nThis is a test message from your POS system.';
    const result = await provider.sendTextMessage(config.adminPhoneNumber, testMessage);

    // Update config
    await prisma.whatsAppConfig.update({
      where: { businessId },
      data: {
        lastTestSentAt: new Date(),
        lastTestStatus: result.success ? 'SUCCESS' : 'FAILED',
      },
    });

    // Create message record
    await prisma.whatsAppMessage.create({
      data: {
        businessId,
        messageType: 'TEST',
        recipient: config.adminPhoneNumber,
        messageContent: testMessage,
        status: result.success ? 'SENT' : 'FAILED',
        providerMessageId: result.messageId,
        errorMessage: result.error,
        sentAt: result.success ? new Date() : null,
      },
    });

    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    logger.error('Error sending test message', { businessId, error: String(error) });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Retry failed message
 */
export async function retryMessage(input: RetryMessageInput) {
  const { messageId, businessId } = input;

  try {
    // Get message
    const message = await prisma.whatsAppMessage.findFirst({
      where: { id: messageId, businessId },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    if (message.status !== 'FAILED') {
      throw new Error('Only failed messages can be retried');
    }

    if (message.retryCount >= message.maxRetries) {
      throw new Error('Maximum retry limit reached');
    }

    // Get config
    const config = await prisma.whatsAppConfig.findUnique({
      where: { businessId },
    });

    if (!config) {
      throw new Error('WhatsApp not configured');
    }

    // Reset status and retry
    await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: { status: 'QUEUED' },
    });

    // Send message
    await sendWhatsAppMessage(messageId, config);

    return { success: true };
  } catch (error) {
    logger.error('Error retrying message', { messageId, error: String(error) });
    throw error;
  }
}

/**
 * Update message status from webhook
 */
export async function updateMessageStatus(
  providerMessageId: string,
  status: MessageStatusType,
  timestamp?: Date
) {
  try {
    const message = await prisma.whatsAppMessage.findFirst({
      where: { providerMessageId },
    });

    if (!message) {
      logger.warn('Message not found for webhook update', { providerMessageId });
      return;
    }

    const updateData: any = { status };

    if (status === 'DELIVERED') {
      updateData.deliveredAt = timestamp || new Date();
    } else if (status === 'READ') {
      updateData.readAt = timestamp || new Date();
    }

    await prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: updateData,
    });

    logger.info('Message status updated', { messageId: message.id, status });
  } catch (error) {
    logger.error('Error updating message status', { providerMessageId, error: String(error) });
  }
}

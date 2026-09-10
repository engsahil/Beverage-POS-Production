/**
 * Phase 20: WhatsApp Webhook Routes
 * Handles delivery status updates from Meta WhatsApp Cloud API
 */

import { Router } from 'express';
import { updateMessageStatus } from '../../services/whatsapp/whatsappService.js';
import { logger } from '../../lib/logger.js';
import { MessageStatusType } from '../../services/whatsapp/types.js';

const router = Router();

/**
 * GET /webhooks/whatsapp
 * Webhook verification endpoint (Meta requires this)
 */
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('WhatsApp webhook verified');
    return res.status(200).send(challenge);
  } else {
    logger.warn('WhatsApp webhook verification failed', { mode, token });
    return res.status(403).json({ error: 'Verification failed' });
  }
});

/**
 * POST /webhooks/whatsapp
 * Receive webhook events from Meta
 */
router.post('/whatsapp', async (req, res) => {
  try {
    const body = req.body;

    // Verify webhook is from Meta
    if (body.object !== 'whatsapp_business_account') {
      return res.status(400).json({ error: 'Invalid webhook object' });
    }

    // Process each entry
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === 'messages') {
          await processMessageWebhook(change.value);
        }
      }
    }

    // Always return 200 to acknowledge receipt
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error processing WhatsApp webhook', { error: String(error) });
    // Still return 200 to prevent retries
    return res.status(200).json({ success: false });
  }
});

/**
 * Process message status webhook
 */
async function processMessageWebhook(value: any) {
  try {
    // Handle message status updates
    if (value.statuses) {
      for (const status of value.statuses) {
        const messageId = status.id;
        const whatsappStatus = status.status;
        const timestamp = status.timestamp
          ? new Date(parseInt(status.timestamp) * 1000)
          : new Date();

        // Map Meta status to our status
        let mappedStatus: MessageStatusType | null = null;

        switch (whatsappStatus) {
          case 'sent':
            mappedStatus = 'SENT';
            break;
          case 'delivered':
            mappedStatus = 'DELIVERED';
            break;
          case 'read':
            mappedStatus = 'READ';
            break;
          case 'failed':
            mappedStatus = 'FAILED';
            break;
        }

        if (mappedStatus) {
          await updateMessageStatus(messageId, mappedStatus, timestamp);
        }
      }
    }

    // Handle incoming messages (future enhancement)
    if (value.messages) {
      logger.info('Received incoming WhatsApp message', {
        count: value.messages.length,
      });
      // Future: process incoming messages
    }
  } catch (error) {
    logger.error('Error processing message webhook', { error: String(error) });
  }
}

export default router;

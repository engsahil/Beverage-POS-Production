/**
 * Phase 20: Meta WhatsApp Cloud API Provider
 * Official WhatsApp Business Platform integration
 */

import { WhatsAppProvider, SendMessageResult, MessageStatus, WhatsAppProviderConfig } from './types.js';
import { logger } from '../../lib/logger.js';

export class MetaCloudAPIProvider implements WhatsAppProvider {
  private accessToken: string;
  private phoneNumberId: string;
  private apiVersion: string;
  private baseUrl: string;

  constructor(config: WhatsAppProviderConfig) {
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.apiVersion = config.apiVersion || 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

    logger.info('Meta WhatsApp Cloud API provider initialized', {
      phoneNumberId: this.phoneNumberId,
      apiVersion: this.apiVersion,
    });
  }

  async sendTextMessage(to: string, message: string): Promise<SendMessageResult> {
    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: this.formatPhoneNumber(to),
          type: 'text',
          text: {
            body: message,
          },
        }),
      });

      const data: any = await response.json();

      if (!response.ok) {
        logger.error('Meta WhatsApp API error', {
          status: response.status,
          error: data.error,
        });

        return {
          success: false,
          error: data.error?.message || 'Failed to send message',
          errorCode: data.error?.code?.toString(),
        };
      }

      logger.info('WhatsApp message sent successfully', {
        messageId: data.messages?.[0]?.id,
        to,
      });

      return {
        success: true,
        messageId: data.messages?.[0]?.id,
      };
    } catch (error) {
      logger.error('Meta WhatsApp API request failed', { error: String(error) });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async sendDocument(
    to: string,
    documentUrl: string,
    caption?: string,
    filename?: string
  ): Promise<SendMessageResult> {
    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: this.formatPhoneNumber(to),
          type: 'document',
          document: {
            link: documentUrl,
            caption: caption || undefined,
            filename: filename || undefined,
          },
        }),
      });

      const data: any = await response.json();

      if (!response.ok) {
        logger.error('Meta WhatsApp API document error', {
          status: response.status,
          error: data.error,
        });

        return {
          success: false,
          error: data.error?.message || 'Failed to send document',
          errorCode: data.error?.code?.toString(),
        };
      }

      logger.info('WhatsApp document sent successfully', {
        messageId: data.messages?.[0]?.id,
        to,
      });

      return {
        success: true,
        messageId: data.messages?.[0]?.id,
      };
    } catch (error) {
      logger.error('Meta WhatsApp API document request failed', { error: String(error) });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getMessageStatus(messageId: string): Promise<MessageStatus> {
    // Meta WhatsApp Cloud API doesn't provide a direct message status endpoint
    // Status updates come via webhooks
    // For now, return a placeholder
    return {
      messageId,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test by fetching phone number details
      const url = `${this.baseUrl}/${this.phoneNumberId}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        logger.error('Meta WhatsApp API connection test failed', {
          status: response.status,
        });
        return false;
      }

      const data: any = await response.json();
      logger.info('Meta WhatsApp API connection test successful', {
        phoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
      });

      return true;
    } catch (error) {
      logger.error('Meta WhatsApp API connection test error', { error: String(error) });
      return false;
    }
  }

  /**
   * Format phone number to international format (remove + and spaces)
   */
  private formatPhoneNumber(phone: string): string {
    return phone.replace(/[\s\-\+]/g, '');
  }
}

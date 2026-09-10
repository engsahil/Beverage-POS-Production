/**
 * Phase 20: WhatsApp Provider Types
 */

export interface WhatsAppProvider {
  /**
   * Send text message
   */
  sendTextMessage(to: string, message: string): Promise<SendMessageResult>;

  /**
   * Send document (PDF, etc.)
   */
  sendDocument(to: string, documentUrl: string, caption?: string, filename?: string): Promise<SendMessageResult>;

  /**
   * Get message status
   */
  getMessageStatus(messageId: string): Promise<MessageStatus>;

  /**
   * Test connection
   */
  testConnection(): Promise<boolean>;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

export interface MessageStatus {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp?: Date;
  error?: string;
}

export interface WhatsAppProviderConfig {
  provider: 'meta';
  accessToken: string;
  phoneNumberId: string;
  businessAccountId?: string;
  apiVersion?: string;
}

export type MessageStatusType = 
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'RETRY_REQUIRED';

export type MessageType = 'SHIFT_CLOSING' | 'TEST' | 'MANUAL';

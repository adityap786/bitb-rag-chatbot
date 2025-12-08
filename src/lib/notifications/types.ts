/**
 * Notification Service Types
 * 
 * Unified types for Email, SMS, and Push notifications.
 */

export type NotificationChannel = 'email' | 'sms' | 'push';
export type NotificationProvider = 'sendgrid' | 'twilio' | 'firebase';
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'unsubscribed';

export interface NotificationRecipient {
  id?: string;
  email?: string;
  phone?: string;
  deviceToken?: string;
  name?: string;
  timezone?: string;
  preferences?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
    quiet_hours?: { start: string; end: string };
  };
}

export interface EmailContent {
  subject: string;
  text?: string;
  html?: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
  from?: { email: string; name?: string };
  replyTo?: { email: string; name?: string };
  attachments?: Array<{
    filename: string;
    content: string;
    type: string;
    disposition?: 'attachment' | 'inline';
    contentId?: string;
  }>;
  categories?: string[];
  headers?: Record<string, string>;
}

export interface SMSContent {
  body: string;
  mediaUrls?: string[];
  from?: string;
  statusCallback?: string;
  validityPeriod?: number;
}

export interface PushContent {
  title: string;
  body: string;
  icon?: string;
  image?: string;
  badge?: string;
  sound?: string;
  data?: Record<string, unknown>;
  clickAction?: string;
  tag?: string;
  priority?: 'high' | 'normal';
  ttl?: number;
}

export interface NotificationRequest {
  id?: string;
  channel: NotificationChannel;
  recipient: NotificationRecipient;
  content: EmailContent | SMSContent | PushContent;
  scheduledAt?: Date;
  metadata?: Record<string, unknown>;
  trackOpens?: boolean;
  trackClicks?: boolean;
  priority?: 'low' | 'normal' | 'high';
}

export interface NotificationResult {
  success: boolean;
  id?: string;
  providerId?: string;
  status: NotificationStatus;
  error?: string;
  sentAt?: Date;
  timestamp?: Date;
  channel?: NotificationChannel;
  messageId?: string;
  providerResponse?: unknown;
  cost?: number;
}

export interface EmailNotification {
  channel: 'email';
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body?: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
  attachments?: Array<{
    filename: string;
    content: string;
    type: string;
    disposition?: 'attachment' | 'inline';
    contentId?: string;
  }>;
  headers?: Record<string, string>;
  priority?: 'low' | 'normal' | 'high';
}

export interface SMSNotification {
  channel: 'sms';
  to: string;
  body: string;
  mediaUrls?: string[];
  from?: string;
  statusCallback?: string;
  validityPeriod?: number;
  priority?: 'low' | 'normal' | 'high';
}

export interface PushNotification {
  channel: 'push';
  to: string;
  title: string;
  body: string;
  icon?: string;
  image?: string;
  actions?: Array<{ action: string; title: string }>;
  data?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
}

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: NotificationChannel;
  provider: NotificationProvider;
  subject?: string;
  body: string;
  htmlBody?: string;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationEvent {
  id: string;
  notificationId: string;
  event: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

// Webhook payload types
export interface SendGridWebhookEvent {
  email: string;
  timestamp: number;
  event: 'processed' | 'dropped' | 'delivered' | 'deferred' | 'bounce' | 'open' | 'click' | 'spam_report' | 'unsubscribe';
  sg_message_id: string;
  sg_event_id: string;
  category?: string[];
  reason?: string;
  url?: string;
  ip?: string;
  useragent?: string;
}

export interface TwilioWebhookEvent {
  SmsSid: string;
  SmsStatus: 'queued' | 'sending' | 'sent' | 'failed' | 'delivered' | 'undelivered' | 'received';
  MessageStatus: string;
  To: string;
  From: string;
  Body?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

// Templates for common notification types
export const NOTIFICATION_TEMPLATES = {
  ORDER_CONFIRMATION: 'order_confirmation',
  ORDER_SHIPPED: 'order_shipped',
  ORDER_DELIVERED: 'order_delivered',
  APPOINTMENT_CONFIRMATION: 'appointment_confirmation',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  APPOINTMENT_CANCELLED: 'appointment_cancelled',
  PASSWORD_RESET: 'password_reset',
  WELCOME: 'welcome',
  ACCOUNT_VERIFICATION: 'account_verification',
  PAYMENT_RECEIPT: 'payment_receipt',
  PAYMENT_FAILED: 'payment_failed',
  SUBSCRIPTION_RENEWAL: 'subscription_renewal',
  CUSTOM: 'custom',
} as const;

export type NotificationTemplateType = typeof NOTIFICATION_TEMPLATES[keyof typeof NOTIFICATION_TEMPLATES];

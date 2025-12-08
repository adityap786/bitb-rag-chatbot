/**
 * Twilio SMS Service Integration
 * 
 * Production-ready integration with Twilio Messaging API.
 * Features:
 * - SMS sending with international support
 * - MMS support with media
 * - Message status tracking
 * - Webhook handling
 * - Number lookup and validation
 */

import {
  NotificationRecipient,
  SMSContent,
  NotificationResult,
  NotificationStatus,
  TwilioWebhookEvent,
} from './types';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

interface TwilioMessage {
  sid: string;
  date_created: string;
  date_updated: string;
  date_sent: string | null;
  account_sid: string;
  to: string;
  from: string;
  messaging_service_sid?: string;
  body: string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'delivered' | 'undelivered' | 'received';
  num_segments: string;
  num_media: string;
  direction: 'outbound-api' | 'inbound' | 'outbound-call' | 'outbound-reply';
  api_version: string;
  price: string | null;
  price_unit: string;
  error_code: number | null;
  error_message: string | null;
  uri: string;
}

interface TwilioLookup {
  caller_name?: {
    caller_name: string;
    caller_type: string;
    error_code: number | null;
  };
  country_code: string;
  phone_number: string;
  national_format: string;
  carrier?: {
    mobile_country_code: string;
    mobile_network_code: string;
    name: string;
    type: 'mobile' | 'landline' | 'voip';
    error_code: number | null;
  };
  add_ons?: Record<string, unknown>;
  url: string;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  defaultFromNumber: string;
  messagingServiceSid?: string;
  webhookUrl?: string;
  statusCallbackUrl?: string;
}

export class TwilioSMSService {
  private config: TwilioConfig;
  private authHeader: string;

  constructor(config: TwilioConfig) {
    this.config = config;
    this.authHeader = 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${TWILIO_API_BASE}/Accounts/${this.config.accountSid}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json() as { message?: string };
      throw new Error(`Twilio API error: ${response.status} - ${error.message || 'Unknown error'}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Send an SMS message
   */
  async sendSMS(
    recipient: NotificationRecipient,
    content: SMSContent
  ): Promise<NotificationResult> {
    if (!recipient.phone) {
      return {
        success: false,
        status: 'failed',
        error: 'Recipient phone number is required',
      };
    }

    try {
      const formData = new URLSearchParams({
        To: this.normalizePhoneNumber(recipient.phone),
        Body: content.body,
      });

      // Use messaging service or specific from number
      if (this.config.messagingServiceSid) {
        formData.set('MessagingServiceSid', this.config.messagingServiceSid);
      } else {
        formData.set('From', content.from || this.config.defaultFromNumber);
      }

      // Add media URLs for MMS
      if (content.mediaUrls?.length) {
        content.mediaUrls.forEach((url, index) => {
          formData.set(`MediaUrl${index}`, url);
        });
      }

      // Add status callback
      if (content.statusCallback || this.config.statusCallbackUrl) {
        formData.set('StatusCallback', content.statusCallback || this.config.statusCallbackUrl!);
      }

      // Add validity period
      if (content.validityPeriod) {
        formData.set('ValidityPeriod', content.validityPeriod.toString());
      }

      const message = await this.request<TwilioMessage>('/Messages.json', {
        method: 'POST',
        body: formData.toString(),
      });

      return {
        success: true,
        id: message.sid,
        providerId: message.sid,
        status: this.mapTwilioStatus(message.status),
        sentAt: message.date_sent ? new Date(message.date_sent) : new Date(),
        cost: message.price ? Math.abs(parseFloat(message.price)) : undefined,
      };
    } catch (error) {
      return {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to send SMS',
      };
    }
  }

  /**
   * Send bulk SMS messages
   */
  async sendBulkSMS(
    recipients: NotificationRecipient[],
    content: SMSContent
  ): Promise<NotificationResult[]> {
    // Twilio doesn't have native bulk SMS, so we send individually
    // For high volume, consider using Twilio Messaging Service with queuing
    const results = await Promise.allSettled(
      recipients.map(recipient => this.sendSMS(recipient, content))
    );

    return results.map(result => 
      result.status === 'fulfilled' 
        ? result.value 
        : { success: false, status: 'failed' as NotificationStatus, error: 'Send failed' }
    );
  }

  /**
   * Get message status
   */
  async getMessageStatus(messageSid: string): Promise<{
    status: NotificationStatus;
    errorCode?: number;
    errorMessage?: string;
    price?: number;
  }> {
    const message = await this.request<TwilioMessage>(`/Messages/${messageSid}.json`);

    return {
      status: this.mapTwilioStatus(message.status),
      errorCode: message.error_code || undefined,
      errorMessage: message.error_message || undefined,
      price: message.price ? Math.abs(parseFloat(message.price)) : undefined,
    };
  }

  /**
   * List messages
   */
  async listMessages(options?: {
    to?: string;
    from?: string;
    dateSent?: Date;
    dateSentAfter?: Date;
    dateSentBefore?: Date;
    pageSize?: number;
  }): Promise<TwilioMessage[]> {
    const params = new URLSearchParams();
    
    if (options?.to) params.set('To', options.to);
    if (options?.from) params.set('From', options.from);
    if (options?.dateSent) params.set('DateSent', options.dateSent.toISOString().split('T')[0]);
    if (options?.dateSentAfter) params.set('DateSent>', options.dateSentAfter.toISOString().split('T')[0]);
    if (options?.dateSentBefore) params.set('DateSent<', options.dateSentBefore.toISOString().split('T')[0]);
    if (options?.pageSize) params.set('PageSize', options.pageSize.toString());

    const response = await this.request<{ messages: TwilioMessage[] }>(
      `/Messages.json?${params}`
    );

    return response.messages;
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageSid: string): Promise<boolean> {
    try {
      await fetch(`${TWILIO_API_BASE}/Accounts/${this.config.accountSid}/Messages/${messageSid}.json`, {
        method: 'DELETE',
        headers: {
          'Authorization': this.authHeader,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Lookup phone number information
   */
  async lookupNumber(phoneNumber: string, options?: {
    type?: ('carrier' | 'caller-name')[];
  }): Promise<{
    valid: boolean;
    phoneNumber: string;
    nationalFormat: string;
    countryCode: string;
    carrier?: {
      name: string;
      type: 'mobile' | 'landline' | 'voip';
    };
    callerName?: string;
  }> {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    const params = new URLSearchParams();
    
    if (options?.type?.length) {
      params.set('Type', options.type.join(','));
    }

    try {
      const response = await fetch(
        `https://lookups.twilio.com/v1/PhoneNumbers/${encodeURIComponent(normalized)}?${params}`,
        {
          headers: {
            'Authorization': this.authHeader,
          },
        }
      );

      if (!response.ok) {
        return {
          valid: false,
          phoneNumber: normalized,
          nationalFormat: phoneNumber,
          countryCode: '',
        };
      }

      const data = await response.json() as TwilioLookup;

      return {
        valid: true,
        phoneNumber: data.phone_number,
        nationalFormat: data.national_format,
        countryCode: data.country_code,
        carrier: data.carrier ? {
          name: data.carrier.name,
          type: data.carrier.type,
        } : undefined,
        callerName: data.caller_name?.caller_name,
      };
    } catch {
      return {
        valid: false,
        phoneNumber: normalized,
        nationalFormat: phoneNumber,
        countryCode: '',
      };
    }
  }

  /**
   * Validate phone number format
   */
  validatePhoneNumber(phoneNumber: string): {
    valid: boolean;
    normalized?: string;
    error?: string;
  } {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    
    // Basic E.164 validation
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    
    if (!e164Regex.test(normalized)) {
      return {
        valid: false,
        error: 'Phone number must be in E.164 format (+1234567890)',
      };
    }

    return {
      valid: true,
      normalized,
    };
  }

  /**
   * Process webhook events
   */
  processWebhookEvent(event: TwilioWebhookEvent): {
    messageSid: string;
    status: NotificationStatus;
    to: string;
    from: string;
    body?: string;
    errorCode?: string;
    errorMessage?: string;
  } {
    return {
      messageSid: event.SmsSid,
      status: this.mapTwilioStatus(event.SmsStatus),
      to: event.To,
      from: event.From,
      body: event.Body,
      errorCode: event.ErrorCode,
      errorMessage: event.ErrorMessage,
    };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    url: string,
    params: Record<string, string>,
    signature: string
  ): boolean {
    const crypto = require('crypto');
    
    // Sort parameters and build string
    const sortedKeys = Object.keys(params).sort();
    let dataString = url;
    
    for (const key of sortedKeys) {
      dataString += key + params[key];
    }

    const expectedSignature = crypto
      .createHmac('sha1', this.config.authToken)
      .update(Buffer.from(dataString, 'utf-8'))
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  // Helper methods
  private normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters except leading +
    let normalized = phoneNumber.replace(/[^\d+]/g, '');
    
    // Add + prefix if missing
    if (!normalized.startsWith('+')) {
      // Assume US number if no country code
      if (normalized.length === 10) {
        normalized = '+1' + normalized;
      } else if (normalized.length === 11 && normalized.startsWith('1')) {
        normalized = '+' + normalized;
      } else {
        normalized = '+' + normalized;
      }
    }

    return normalized;
  }

  private mapTwilioStatus(status: TwilioMessage['status']): NotificationStatus {
    const statusMap: Record<TwilioMessage['status'], NotificationStatus> = {
      queued: 'pending',
      sending: 'pending',
      sent: 'sent',
      failed: 'failed',
      delivered: 'delivered',
      undelivered: 'failed',
      received: 'delivered',
    };

    return statusMap[status] || 'pending';
  }
}

// SMS Templates with variable substitution
export interface SMSTemplate {
  id: string;
  name: string;
  body: string;
  variables: string[];
}

export function renderSMSTemplate(
  template: SMSTemplate,
  data: Record<string, string>
): string {
  let body = template.body;
  
  for (const variable of template.variables) {
    const value = data[variable] || '';
    body = body.replace(new RegExp(`{{${variable}}}`, 'g'), value);
  }

  return body;
}

// Common SMS templates
export const SMS_TEMPLATES: Record<string, SMSTemplate> = {
  ORDER_CONFIRMATION: {
    id: 'order_confirmation',
    name: 'Order Confirmation',
    body: 'Hi {{name}}, your order #{{orderNumber}} has been confirmed. Total: {{total}}. Track: {{trackingUrl}}',
    variables: ['name', 'orderNumber', 'total', 'trackingUrl'],
  },
  ORDER_SHIPPED: {
    id: 'order_shipped',
    name: 'Order Shipped',
    body: 'Good news {{name}}! Your order #{{orderNumber}} has shipped. Track your package: {{trackingUrl}}',
    variables: ['name', 'orderNumber', 'trackingUrl'],
  },
  APPOINTMENT_REMINDER: {
    id: 'appointment_reminder',
    name: 'Appointment Reminder',
    body: 'Reminder: You have an appointment scheduled for {{date}} at {{time}}. Reply CONFIRM to confirm or CANCEL to cancel.',
    variables: ['date', 'time'],
  },
  VERIFICATION_CODE: {
    id: 'verification_code',
    name: 'Verification Code',
    body: 'Your verification code is: {{code}}. Valid for {{expiry}} minutes. Do not share this code.',
    variables: ['code', 'expiry'],
  },
  PAYMENT_CONFIRMATION: {
    id: 'payment_confirmation',
    name: 'Payment Confirmation',
    body: 'Payment of {{amount}} received for order #{{orderNumber}}. Thank you for your purchase!',
    variables: ['amount', 'orderNumber'],
  },
};

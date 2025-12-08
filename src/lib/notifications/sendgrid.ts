/**
 * SendGrid Email Service Integration
 * 
 * Production-ready integration with SendGrid API v3.
 * Features:
 * - Transactional email sending
 * - Dynamic template support
 * - Attachment handling
 * - Bounce/unsubscribe handling
 * - Webhook verification
 */

import {
  NotificationRecipient,
  EmailContent,
  NotificationResult,
  NotificationStatus,
  SendGridWebhookEvent,
} from './types';

const SENDGRID_API_BASE = 'https://api.sendgrid.com/v3';

interface SendGridMailRequest {
  personalizations: Array<{
    to: Array<{ email: string; name?: string }>;
    cc?: Array<{ email: string; name?: string }>;
    bcc?: Array<{ email: string; name?: string }>;
    subject?: string;
    headers?: Record<string, string>;
    dynamic_template_data?: Record<string, unknown>;
    custom_args?: Record<string, string>;
  }>;
  from: { email: string; name?: string };
  reply_to?: { email: string; name?: string };
  subject?: string;
  content?: Array<{
    type: 'text/plain' | 'text/html';
    value: string;
  }>;
  attachments?: Array<{
    content: string;
    type: string;
    filename: string;
    disposition?: 'attachment' | 'inline';
    content_id?: string;
  }>;
  template_id?: string;
  categories?: string[];
  headers?: Record<string, string>;
  tracking_settings?: {
    click_tracking?: { enable: boolean; enable_text?: boolean };
    open_tracking?: { enable: boolean; substitution_tag?: string };
    subscription_tracking?: { enable: boolean };
  };
  mail_settings?: {
    sandbox_mode?: { enable: boolean };
    bypass_list_management?: { enable: boolean };
  };
}

export interface SendGridConfig {
  apiKey: string;
  defaultFromEmail: string;
  defaultFromName?: string;
  sandboxMode?: boolean;
  webhookVerificationKey?: string;
}

export class SendGridEmailService {
  private config: SendGridConfig;

  constructor(config: SendGridConfig) {
    this.config = config;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${SENDGRID_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SendGrid API error: ${response.status} - ${error}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) as T : {} as T;
  }

  /**
   * Send a single email
   */
  async sendEmail(
    recipient: NotificationRecipient,
    content: EmailContent,
    options?: {
      trackOpens?: boolean;
      trackClicks?: boolean;
      sandbox?: boolean;
    }
  ): Promise<NotificationResult> {
    if (!recipient.email) {
      return {
        success: false,
        status: 'failed',
        error: 'Recipient email is required',
      };
    }

    try {
      const mailRequest = this.buildMailRequest(recipient, content, options);

      const response = await fetch(`${SENDGRID_API_BASE}/mail/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mailRequest),
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          status: 'failed',
          error: `SendGrid error: ${error}`,
        };
      }

      // SendGrid returns 202 Accepted with X-Message-Id header
      const messageId = response.headers.get('X-Message-Id');

      return {
        success: true,
        id: messageId || undefined,
        providerId: messageId || undefined,
        status: 'sent',
        sentAt: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  /**
   * Send bulk emails (up to 1000 recipients per request)
   */
  async sendBulkEmails(
    recipients: NotificationRecipient[],
    content: EmailContent,
    options?: {
      trackOpens?: boolean;
      trackClicks?: boolean;
    }
  ): Promise<NotificationResult[]> {
    // Split into batches of 1000
    const batchSize = 1000;
    const results: NotificationResult[] = [];

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      const mailRequest: SendGridMailRequest = {
        personalizations: batch.map(recipient => ({
          to: [{ email: recipient.email!, name: recipient.name }],
          dynamic_template_data: content.templateData,
        })),
        from: {
          email: content.from?.email || this.config.defaultFromEmail,
          name: content.from?.name || this.config.defaultFromName,
        },
        subject: content.subject,
        template_id: content.templateId,
        tracking_settings: {
          click_tracking: { enable: options?.trackClicks !== false },
          open_tracking: { enable: options?.trackOpens !== false },
        },
      };

      if (!content.templateId) {
        mailRequest.content = [];
        if (content.text) {
          mailRequest.content.push({ type: 'text/plain', value: content.text });
        }
        if (content.html) {
          mailRequest.content.push({ type: 'text/html', value: content.html });
        }
      }

      try {
        const response = await fetch(`${SENDGRID_API_BASE}/mail/send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mailRequest),
        });

        if (response.ok) {
          const messageId = response.headers.get('X-Message-Id');
          batch.forEach(() => {
            results.push({
              success: true,
              providerId: messageId || undefined,
              status: 'sent',
              sentAt: new Date(),
            });
          });
        } else {
          const error = await response.text();
          batch.forEach(() => {
            results.push({
              success: false,
              status: 'failed',
              error,
            });
          });
        }
      } catch (error) {
        batch.forEach(() => {
          results.push({
            success: false,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Batch send failed',
          });
        });
      }
    }

    return results;
  }

  /**
   * Schedule an email for later delivery
   */
  async scheduleEmail(
    recipient: NotificationRecipient,
    content: EmailContent,
    sendAt: Date,
    options?: {
      trackOpens?: boolean;
      trackClicks?: boolean;
    }
  ): Promise<NotificationResult> {
    if (!recipient.email) {
      return {
        success: false,
        status: 'failed',
        error: 'Recipient email is required',
      };
    }

    try {
      const mailRequest = this.buildMailRequest(recipient, content, options);
      (mailRequest as unknown as Record<string, unknown>).send_at = Math.floor(sendAt.getTime() / 1000);

      const response = await fetch(`${SENDGRID_API_BASE}/mail/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mailRequest),
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          status: 'failed',
          error: `SendGrid error: ${error}`,
        };
      }

      const messageId = response.headers.get('X-Message-Id');

      return {
        success: true,
        id: messageId || undefined,
        providerId: messageId || undefined,
        status: 'pending',
      };
    } catch (error) {
      return {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to schedule email',
      };
    }
  }

  /**
   * Cancel a scheduled email
   */
  async cancelScheduledEmail(batchId: string): Promise<boolean> {
    try {
      await this.request(`/user/scheduled_sends/${batchId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancel' }),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Add email to suppression list (global unsubscribe)
   */
  async addToSuppressionList(email: string): Promise<void> {
    await this.request('/asm/suppressions/global', {
      method: 'POST',
      body: JSON.stringify({ recipient_emails: [email] }),
    });
  }

  /**
   * Remove email from suppression list
   */
  async removeFromSuppressionList(email: string): Promise<void> {
    await this.request(`/asm/suppressions/global/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    });
  }

  /**
   * Check if email is suppressed
   */
  async isEmailSuppressed(email: string): Promise<boolean> {
    try {
      await this.request(`/suppression/unsubscribes/${encodeURIComponent(email)}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get email statistics
   */
  async getStats(
    startDate: Date,
    endDate?: Date,
    aggregatedBy?: 'day' | 'week' | 'month'
  ): Promise<Array<{
    date: string;
    stats: {
      requests: number;
      delivered: number;
      opens: number;
      clicks: number;
      bounces: number;
      spam_reports: number;
      unsubscribes: number;
    };
  }>> {
    const params = new URLSearchParams({
      start_date: startDate.toISOString().split('T')[0],
    });

    if (endDate) {
      params.set('end_date', endDate.toISOString().split('T')[0]);
    }
    if (aggregatedBy) {
      params.set('aggregated_by', aggregatedBy);
    }

    const response = await this.request<Array<{
      date: string;
      stats: Array<{ metrics: Record<string, number> }>;
    }>>(`/stats?${params}`);

    return response.map(item => ({
      date: item.date,
      stats: {
        requests: item.stats[0]?.metrics?.requests || 0,
        delivered: item.stats[0]?.metrics?.delivered || 0,
        opens: item.stats[0]?.metrics?.opens || 0,
        clicks: item.stats[0]?.metrics?.clicks || 0,
        bounces: item.stats[0]?.metrics?.bounces || 0,
        spam_reports: item.stats[0]?.metrics?.spam_reports || 0,
        unsubscribes: item.stats[0]?.metrics?.unsubscribes || 0,
      },
    }));
  }

  /**
   * Process webhook events
   */
  processWebhookEvents(events: SendGridWebhookEvent[]): Array<{
    email: string;
    status: NotificationStatus;
    providerId: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
  }> {
    const statusMap: Record<SendGridWebhookEvent['event'], NotificationStatus> = {
      processed: 'pending',
      dropped: 'failed',
      delivered: 'delivered',
      deferred: 'pending',
      bounce: 'bounced',
      open: 'delivered',
      click: 'delivered',
      spam_report: 'failed',
      unsubscribe: 'unsubscribed',
    };

    return events.map(event => ({
      email: event.email,
      status: statusMap[event.event] || 'pending',
      providerId: event.sg_message_id,
      timestamp: new Date(event.timestamp * 1000),
      metadata: {
        event: event.event,
        reason: event.reason,
        url: event.url,
        ip: event.ip,
        useragent: event.useragent,
        category: event.category,
      },
    }));
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    publicKey: string,
    payload: string,
    signature: string,
    timestamp: string
  ): boolean {
    if (!this.config.webhookVerificationKey) {
      console.warn('Webhook verification key not configured');
      return false;
    }

    const crypto = require('crypto');
    const verifier = crypto.createVerify('sha256');
    verifier.update(timestamp + payload);
    
    try {
      return verifier.verify(publicKey, signature, 'base64');
    } catch {
      return false;
    }
  }

  // Helper methods
  private buildMailRequest(
    recipient: NotificationRecipient,
    content: EmailContent,
    options?: {
      trackOpens?: boolean;
      trackClicks?: boolean;
      sandbox?: boolean;
    }
  ): SendGridMailRequest {
    const mailRequest: SendGridMailRequest = {
      personalizations: [{
        to: [{ email: recipient.email!, name: recipient.name }],
        dynamic_template_data: content.templateData,
      }],
      from: {
        email: content.from?.email || this.config.defaultFromEmail,
        name: content.from?.name || this.config.defaultFromName,
      },
      subject: content.subject,
      tracking_settings: {
        click_tracking: { enable: options?.trackClicks !== false },
        open_tracking: { enable: options?.trackOpens !== false },
      },
    };

    if (content.replyTo) {
      mailRequest.reply_to = content.replyTo;
    }

    if (content.templateId) {
      mailRequest.template_id = content.templateId;
    } else {
      mailRequest.content = [];
      if (content.text) {
        mailRequest.content.push({ type: 'text/plain', value: content.text });
      }
      if (content.html) {
        mailRequest.content.push({ type: 'text/html', value: content.html });
      }
    }

    if (content.attachments) {
      mailRequest.attachments = content.attachments.map(att => ({
        content: att.content,
        type: att.type,
        filename: att.filename,
        disposition: att.disposition,
        content_id: att.contentId,
      }));
    }

    if (content.categories) {
      mailRequest.categories = content.categories;
    }

    if (options?.sandbox || this.config.sandboxMode) {
      mailRequest.mail_settings = { sandbox_mode: { enable: true } };
    }

    return mailRequest;
  }
}

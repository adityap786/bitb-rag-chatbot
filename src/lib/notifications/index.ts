/**
 * Notification Service
 * 
 * Unified notification service supporting Email, SMS, and Push.
 * Features:
 * - Multi-channel delivery
 * - Template rendering
 * - Scheduling and queueing
 * - Preference-aware delivery
 * - Retry with backoff
 */

import {
  NotificationChannel,
  NotificationRequest,
  NotificationResult,
  NotificationRecipient,
  EmailContent,
  SMSContent,
  PushContent,
  NotificationTemplateType,
  NOTIFICATION_TEMPLATES,
} from './types';
import { SendGridEmailService, SendGridConfig } from './sendgrid';
import { TwilioSMSService, TwilioConfig, SMS_TEMPLATES, renderSMSTemplate } from './twilio';

export interface NotificationServiceConfig {
  email?: SendGridConfig;
  sms?: TwilioConfig;
  push?: {
    // Firebase config - to be implemented
    projectId: string;
    privateKey: string;
    clientEmail: string;
  };
  defaultTimezone?: string;
  retryAttempts?: number;
  retryDelayMs?: number;
}

interface ScheduledNotification {
  id: string;
  request: NotificationRequest;
  scheduledAt: Date;
  attempts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class NotificationService {
  private config: NotificationServiceConfig;
  private emailService?: SendGridEmailService;
  private smsService?: TwilioSMSService;
  private scheduledQueue: Map<string, ScheduledNotification> = new Map();
  private schedulerInterval?: ReturnType<typeof setInterval>;

  constructor(config: NotificationServiceConfig) {
    this.config = config;

    if (config.email) {
      this.emailService = new SendGridEmailService(config.email);
    }

    if (config.sms) {
      this.smsService = new TwilioSMSService(config.sms);
    }

    // Start scheduler
    this.startScheduler();
  }

  /**
   * Send a notification through the appropriate channel
   */
  async send(request: NotificationRequest): Promise<NotificationResult> {
    // Check user preferences
    if (!this.checkUserPreferences(request.recipient, request.channel)) {
      return {
        success: false,
        status: 'failed',
        error: 'User has opted out of this notification channel',
      };
    }

    // Check quiet hours
    if (this.isQuietHours(request.recipient)) {
      // Schedule for after quiet hours end
      const sendAt = this.getQuietHoursEnd(request.recipient);
      return this.schedule({ ...request, scheduledAt: sendAt });
    }

    // If scheduled for future, add to queue
    if (request.scheduledAt && request.scheduledAt > new Date()) {
      return this.schedule(request);
    }

    // Send immediately
    return this.sendImmediate(request);
  }

  /**
   * Send notification immediately
   */
  private async sendImmediate(request: NotificationRequest): Promise<NotificationResult> {
    const retryAttempts = this.config.retryAttempts || 3;
    const retryDelay = this.config.retryDelayMs || 1000;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        let result: NotificationResult;

        switch (request.channel) {
          case 'email':
            result = await this.sendEmail(request);
            break;
          case 'sms':
            result = await this.sendSMS(request);
            break;
          case 'push':
            result = await this.sendPush(request);
            break;
          default:
            throw new Error(`Unsupported notification channel: ${request.channel}`);
        }

        if (result.success) {
          return result;
        }

        // Don't retry for permanent failures
        if (result.status === 'unsubscribed' || result.status === 'bounced') {
          return result;
        }

        if (attempt < retryAttempts) {
          await this.delay(retryDelay * Math.pow(2, attempt - 1));
        }
      } catch (error) {
        if (attempt === retryAttempts) {
          return {
            success: false,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Send failed',
          };
        }
        await this.delay(retryDelay * Math.pow(2, attempt - 1));
      }
    }

    return {
      success: false,
      status: 'failed',
      error: 'Max retry attempts exceeded',
    };
  }

  /**
   * Send email notification
   */
  private async sendEmail(request: NotificationRequest): Promise<NotificationResult> {
    if (!this.emailService) {
      return {
        success: false,
        status: 'failed',
        error: 'Email service not configured',
      };
    }

    const content = request.content as EmailContent;
    return this.emailService.sendEmail(
      request.recipient,
      content,
      {
        trackOpens: request.trackOpens,
        trackClicks: request.trackClicks,
      }
    );
  }

  /**
   * Send SMS notification
   */
  private async sendSMS(request: NotificationRequest): Promise<NotificationResult> {
    if (!this.smsService) {
      return {
        success: false,
        status: 'failed',
        error: 'SMS service not configured',
      };
    }

    const content = request.content as SMSContent;
    return this.smsService.sendSMS(request.recipient, content);
  }

  /**
   * Send push notification
   */
  private async sendPush(_request: NotificationRequest): Promise<NotificationResult> {
    // Push notifications to be implemented with Firebase
    return {
      success: false,
      status: 'failed',
      error: 'Push notifications not yet implemented',
    };
  }

  /**
   * Schedule a notification for later delivery
   */
  async schedule(request: NotificationRequest): Promise<NotificationResult> {
    const id = request.id || this.generateId();
    const scheduledNotification: ScheduledNotification = {
      id,
      request: { ...request, id },
      scheduledAt: request.scheduledAt || new Date(),
      attempts: 0,
      status: 'pending',
    };

    this.scheduledQueue.set(id, scheduledNotification);

    return {
      success: true,
      id,
      status: 'pending',
    };
  }

  /**
   * Cancel a scheduled notification
   */
  cancelScheduled(notificationId: string): boolean {
    return this.scheduledQueue.delete(notificationId);
  }

  /**
   * Get scheduled notification status
   */
  getScheduledStatus(notificationId: string): ScheduledNotification | undefined {
    return this.scheduledQueue.get(notificationId);
  }

  /**
   * Send notification using a template
   */
  async sendFromTemplate(
    templateType: NotificationTemplateType,
    recipient: NotificationRecipient,
    channel: NotificationChannel,
    data: Record<string, unknown>,
    options?: {
      scheduledAt?: Date;
      trackOpens?: boolean;
      trackClicks?: boolean;
    }
  ): Promise<NotificationResult> {
    let content: EmailContent | SMSContent | PushContent;

    switch (channel) {
      case 'email':
        content = this.buildEmailFromTemplate(templateType, data);
        break;
      case 'sms':
        content = this.buildSMSFromTemplate(templateType, data);
        break;
      case 'push':
        content = this.buildPushFromTemplate(templateType, data);
        break;
      default:
        throw new Error(`Unsupported channel: ${channel}`);
    }

    return this.send({
      channel,
      recipient,
      content,
      scheduledAt: options?.scheduledAt,
      trackOpens: options?.trackOpens,
      trackClicks: options?.trackClicks,
    });
  }

  /**
   * Send multi-channel notification
   */
  async sendMultiChannel(
    recipient: NotificationRecipient,
    channels: NotificationChannel[],
    contents: {
      email?: EmailContent;
      sms?: SMSContent;
      push?: PushContent;
    }
  ): Promise<Record<NotificationChannel, NotificationResult>> {
    const results: Record<string, NotificationResult> = {};

    await Promise.all(
      channels.map(async channel => {
        const content = contents[channel];
        if (content) {
          results[channel] = await this.send({
            channel,
            recipient,
            content,
          });
        } else {
          results[channel] = {
            success: false,
            status: 'failed',
            error: `No content provided for ${channel}`,
          };
        }
      })
    );

    return results as Record<NotificationChannel, NotificationResult>;
  }

  /**
   * Send order confirmation notification
   */
  async sendOrderConfirmation(
    recipient: NotificationRecipient,
    orderDetails: {
      orderNumber: string;
      items: Array<{ name: string; quantity: number; price: number }>;
      total: number;
      trackingUrl?: string;
      estimatedDelivery?: Date;
    },
    channels: NotificationChannel[] = ['email', 'sms']
  ): Promise<Record<NotificationChannel, NotificationResult>> {
    const contents: { email?: EmailContent; sms?: SMSContent } = {};

    if (channels.includes('email')) {
      contents.email = {
        subject: `Order Confirmation #${orderDetails.orderNumber}`,
        html: this.renderOrderConfirmationEmail(recipient, orderDetails),
        templateData: {
          ...orderDetails,
          customerName: recipient.name,
        },
      };
    }

    if (channels.includes('sms') && recipient.phone) {
      contents.sms = {
        body: renderSMSTemplate(SMS_TEMPLATES.ORDER_CONFIRMATION, {
          name: recipient.name || 'Customer',
          orderNumber: orderDetails.orderNumber,
          total: `$${orderDetails.total.toFixed(2)}`,
          trackingUrl: orderDetails.trackingUrl || 'N/A',
        }),
      };
    }

    return this.sendMultiChannel(recipient, channels, contents);
  }

  /**
   * Send appointment reminder
   */
  async sendAppointmentReminder(
    recipient: NotificationRecipient,
    appointment: {
      date: Date;
      service: string;
      location?: string;
      provider?: string;
      confirmUrl?: string;
      cancelUrl?: string;
    },
    channels: NotificationChannel[] = ['email', 'sms']
  ): Promise<Record<NotificationChannel, NotificationResult>> {
    const timezone = recipient.timezone || this.config.defaultTimezone || 'UTC';
    const formattedDate = appointment.date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    });
    const formattedTime = appointment.date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    });

    const contents: { email?: EmailContent; sms?: SMSContent } = {};

    if (channels.includes('email')) {
      contents.email = {
        subject: `Appointment Reminder: ${appointment.service}`,
        html: this.renderAppointmentReminderEmail(recipient, appointment, formattedDate, formattedTime),
      };
    }

    if (channels.includes('sms') && recipient.phone) {
      contents.sms = {
        body: renderSMSTemplate(SMS_TEMPLATES.APPOINTMENT_REMINDER, {
          date: formattedDate,
          time: formattedTime,
        }),
      };
    }

    return this.sendMultiChannel(recipient, channels, contents);
  }

  /**
   * Cleanup and stop scheduler
   */
  shutdown(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }
  }

  // Private helper methods
  private startScheduler(): void {
    // Check scheduled queue every 10 seconds
    this.schedulerInterval = setInterval(() => {
      this.processScheduledQueue();
    }, 10000);
  }

  private async processScheduledQueue(): Promise<void> {
    const now = new Date();

    for (const [id, notification] of this.scheduledQueue) {
      if (notification.status === 'pending' && notification.scheduledAt <= now) {
        notification.status = 'processing';
        notification.attempts++;

        try {
          const result = await this.sendImmediate(notification.request);
          
          if (result.success) {
            notification.status = 'completed';
            this.scheduledQueue.delete(id);
          } else if (notification.attempts >= (this.config.retryAttempts || 3)) {
            notification.status = 'failed';
          } else {
            notification.status = 'pending';
            // Exponential backoff
            notification.scheduledAt = new Date(
              now.getTime() + (this.config.retryDelayMs || 1000) * Math.pow(2, notification.attempts)
            );
          }
        } catch {
          notification.status = 'pending';
          if (notification.attempts >= (this.config.retryAttempts || 3)) {
            notification.status = 'failed';
          }
        }
      }
    }
  }

  private checkUserPreferences(
    recipient: NotificationRecipient,
    channel: NotificationChannel
  ): boolean {
    if (!recipient.preferences) return true;
    return recipient.preferences[channel] !== false;
  }

  private isQuietHours(recipient: NotificationRecipient): boolean {
    if (!recipient.preferences?.quiet_hours) return false;

    const { start, end } = recipient.preferences.quiet_hours;
    const timezone = recipient.timezone || this.config.defaultTimezone || 'UTC';
    
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    });
    
    const currentTime = formatter.format(now);
    return currentTime >= start || currentTime < end;
  }

  private getQuietHoursEnd(recipient: NotificationRecipient): Date {
    if (!recipient.preferences?.quiet_hours) return new Date();

    const { end } = recipient.preferences.quiet_hours;
    const [hours, minutes] = end.split(':').map(Number);
    
    const endTime = new Date();
    endTime.setHours(hours, minutes, 0, 0);
    
    if (endTime < new Date()) {
      endTime.setDate(endTime.getDate() + 1);
    }

    return endTime;
  }

  private generateId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private buildEmailFromTemplate(
    templateType: NotificationTemplateType,
    data: Record<string, unknown>
  ): EmailContent {
    // Map template types to SendGrid template IDs or build inline content
    const templateSubjects: Record<string, string> = {
      [NOTIFICATION_TEMPLATES.ORDER_CONFIRMATION]: 'Order Confirmation',
      [NOTIFICATION_TEMPLATES.ORDER_SHIPPED]: 'Your Order Has Shipped',
      [NOTIFICATION_TEMPLATES.APPOINTMENT_CONFIRMATION]: 'Appointment Confirmed',
      [NOTIFICATION_TEMPLATES.APPOINTMENT_REMINDER]: 'Appointment Reminder',
      [NOTIFICATION_TEMPLATES.WELCOME]: 'Welcome!',
    };

    return {
      subject: templateSubjects[templateType] || 'Notification',
      templateData: data,
    };
  }

  private buildSMSFromTemplate(
    templateType: NotificationTemplateType,
    data: Record<string, unknown>
  ): SMSContent {
    const template = SMS_TEMPLATES[templateType.toUpperCase()];
    if (template) {
      return {
        body: renderSMSTemplate(template, data as Record<string, string>),
      };
    }

    return {
      body: `Notification: ${JSON.stringify(data)}`,
    };
  }

  private buildPushFromTemplate(
    templateType: NotificationTemplateType,
    data: Record<string, unknown>
  ): PushContent {
    const titles: Record<string, string> = {
      [NOTIFICATION_TEMPLATES.ORDER_CONFIRMATION]: 'Order Confirmed',
      [NOTIFICATION_TEMPLATES.ORDER_SHIPPED]: 'Order Shipped',
      [NOTIFICATION_TEMPLATES.APPOINTMENT_REMINDER]: 'Appointment Reminder',
    };

    return {
      title: titles[templateType] || 'Notification',
      body: (data['message'] as string) || 'You have a new notification',
      data: data,
    };
  }

  private renderOrderConfirmationEmail(
    recipient: NotificationRecipient,
    orderDetails: {
      orderNumber: string;
      items: Array<{ name: string; quantity: number; price: number }>;
      total: number;
      trackingUrl?: string;
      estimatedDelivery?: Date;
    }
  ): string {
    const itemsHtml = orderDetails.items
      .map(item => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${item.price.toFixed(2)}</td>
        </tr>
      `)
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">Order Confirmation</h1>
        <p>Hi ${recipient.name || 'Customer'},</p>
        <p>Thank you for your order! Here are the details:</p>
        
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <strong>Order Number:</strong> ${orderDetails.orderNumber}
        </div>
        
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 10px; text-align: left;">Item</th>
              <th style="padding: 10px; text-align: center;">Qty</th>
              <th style="padding: 10px; text-align: right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding: 10px; text-align: right;"><strong>Total:</strong></td>
              <td style="padding: 10px; text-align: right;"><strong>$${orderDetails.total.toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
        
        ${orderDetails.estimatedDelivery ? `
          <p><strong>Estimated Delivery:</strong> ${orderDetails.estimatedDelivery.toLocaleDateString()}</p>
        ` : ''}
        
        ${orderDetails.trackingUrl ? `
          <p><a href="${orderDetails.trackingUrl}" style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">Track Your Order</a></p>
        ` : ''}
        
        <p>Thank you for shopping with us!</p>
      </body>
      </html>
    `;
  }

  private renderAppointmentReminderEmail(
    recipient: NotificationRecipient,
    appointment: {
      date: Date;
      service: string;
      location?: string;
      provider?: string;
      confirmUrl?: string;
      cancelUrl?: string;
    },
    formattedDate: string,
    formattedTime: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">Appointment Reminder</h1>
        <p>Hi ${recipient.name || 'there'},</p>
        <p>This is a reminder about your upcoming appointment:</p>
        
        <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Service:</strong> ${appointment.service}</p>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${formattedDate}</p>
          <p style="margin: 5px 0;"><strong>Time:</strong> ${formattedTime}</p>
          ${appointment.location ? `<p style="margin: 5px 0;"><strong>Location:</strong> ${appointment.location}</p>` : ''}
          ${appointment.provider ? `<p style="margin: 5px 0;"><strong>Provider:</strong> ${appointment.provider}</p>` : ''}
        </div>
        
        <div style="text-align: center; margin: 20px 0;">
          ${appointment.confirmUrl ? `
            <a href="${appointment.confirmUrl}" style="display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 4px; margin-right: 10px;">Confirm</a>
          ` : ''}
          ${appointment.cancelUrl ? `
            <a href="${appointment.cancelUrl}" style="display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 4px;">Cancel</a>
          ` : ''}
        </div>
        
        <p>We look forward to seeing you!</p>
      </body>
      </html>
    `;
  }
}

export * from './types';
export { SendGridEmailService, type SendGridConfig } from './sendgrid';
export { TwilioSMSService, type TwilioConfig, SMS_TEMPLATES, renderSMSTemplate } from './twilio';

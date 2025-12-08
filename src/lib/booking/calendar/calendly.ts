/**
 * Calendly Integration
 * 
 * Production-ready integration with Calendly API v2.
 * Features:
 * - Event type management
 * - Scheduled events retrieval
 * - Availability checking
 * - Webhook subscriptions
 */

import {
  CalendarCredentials,
  CalendarEvent,
  TimeSlot,
  BookingRequest,
  BookingResult,
  EventAttendee,
} from './types';

const CALENDLY_API_BASE = 'https://api.calendly.com';

interface CalendlyEventType {
  uri: string;
  name: string;
  active: boolean;
  slug: string;
  scheduling_url: string;
  duration: number;
  kind: string;
  pooling_type: string | null;
  type: string;
  color: string;
  description_plain?: string;
  description_html?: string;
  internal_note?: string;
}

interface CalendlyScheduledEvent {
  uri: string;
  name: string;
  status: 'active' | 'canceled';
  start_time: string;
  end_time: string;
  event_type: string;
  location: {
    type: string;
    location?: string;
    join_url?: string;
    data?: {
      id?: string;
      settings?: object;
    };
  };
  invitees_counter: {
    total: number;
    active: number;
    limit: number;
  };
  created_at: string;
  updated_at: string;
  event_memberships: Array<{
    user: string;
  }>;
  event_guests: Array<{
    email: string;
    created_at: string;
    updated_at: string;
  }>;
  meeting_notes_plain?: string;
  meeting_notes_html?: string;
  cancellation?: {
    canceled_by: string;
    reason?: string;
    canceler_type: string;
  };
}

interface CalendlyInvitee {
  uri: string;
  email: string;
  name: string;
  status: 'active' | 'canceled';
  questions_and_answers: Array<{
    question: string;
    answer: string;
    position: number;
  }>;
  timezone: string;
  event: string;
  created_at: string;
  updated_at: string;
  tracking?: {
    utm_campaign?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_content?: string;
    utm_term?: string;
  };
  text_reminder_number?: string;
  rescheduled: boolean;
  old_invitee?: string;
  new_invitee?: string;
  cancel_url: string;
  reschedule_url: string;
  routing_form_submission?: string;
  payment?: {
    external_id: string;
    provider: string;
    amount: number;
    currency: string;
    terms: string;
    successful: boolean;
  };
  no_show?: {
    uri: string;
    created_at: string;
  };
  reconfirmation?: {
    created_at: string;
    confirmed_at?: string;
  };
}

interface CalendlyUser {
  uri: string;
  name: string;
  slug: string;
  email: string;
  scheduling_url: string;
  timezone: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  current_organization: string;
}

interface CalendlyAvailabilitySchedule {
  uri: string;
  default: boolean;
  name: string;
  user: string;
  timezone: string;
  rules: Array<{
    type: 'wday' | 'date';
    intervals: Array<{
      from: string;
      to: string;
    }>;
    wday?: 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
    date?: string;
  }>;
}

interface CalendlyWebhook {
  uri: string;
  callback_url: string;
  created_at: string;
  updated_at: string;
  retry_started_at?: string;
  state: 'active' | 'disabled';
  events: string[];
  organization: string;
  user?: string;
  creator: string;
  scope: 'user' | 'organization';
}

export class CalendlyConnector {
  private credentials: CalendarCredentials;
  private userUri: string | null = null;
  private organizationUri: string | null = null;

  constructor(credentials: CalendarCredentials) {
    this.credentials = credentials;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${CALENDLY_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Calendly API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Initialize the connector by fetching user details
   */
  async connect(): Promise<CalendlyUser> {
    const response = await this.request<{ resource: CalendlyUser }>('/users/me');
    this.userUri = response.resource.uri;
    this.organizationUri = response.resource.current_organization;
    return response.resource;
  }

  /**
   * Get current user details
   */
  async getCurrentUser(): Promise<CalendlyUser> {
    const response = await this.request<{ resource: CalendlyUser }>('/users/me');
    return response.resource;
  }

  /**
   * List event types for the user
   */
  async listEventTypes(options?: {
    active?: boolean;
    count?: number;
  }): Promise<CalendlyEventType[]> {
    if (!this.userUri) {
      await this.connect();
    }

    const params = new URLSearchParams({
      user: this.userUri!,
    });

    if (options?.active !== undefined) {
      params.set('active', options.active.toString());
    }
    if (options?.count) {
      params.set('count', options.count.toString());
    }

    const response = await this.request<{
      collection: CalendlyEventType[];
      pagination: { count: number; next_page?: string };
    }>(`/event_types?${params}`);

    return response.collection;
  }

  /**
   * Get a specific event type by URI
   */
  async getEventType(eventTypeUri: string): Promise<CalendlyEventType | null> {
    try {
      const uuid = this.extractUuid(eventTypeUri);
      const response = await this.request<{ resource: CalendlyEventType }>(
        `/event_types/${uuid}`
      );
      return response.resource;
    } catch {
      return null;
    }
  }

  /**
   * List scheduled events
   */
  async listScheduledEvents(options?: {
    minStartTime?: Date;
    maxStartTime?: Date;
    status?: 'active' | 'canceled';
    eventType?: string;
    count?: number;
  }): Promise<CalendarEvent[]> {
    if (!this.userUri) {
      await this.connect();
    }

    const params = new URLSearchParams({
      user: this.userUri!,
    });

    if (options?.minStartTime) {
      params.set('min_start_time', options.minStartTime.toISOString());
    }
    if (options?.maxStartTime) {
      params.set('max_start_time', options.maxStartTime.toISOString());
    }
    if (options?.status) {
      params.set('status', options.status);
    }
    if (options?.eventType) {
      params.set('event_type', options.eventType);
    }
    if (options?.count) {
      params.set('count', options.count.toString());
    }

    const response = await this.request<{
      collection: CalendlyScheduledEvent[];
      pagination: { count: number; next_page?: string };
    }>(`/scheduled_events?${params}`);

    return Promise.all(
      response.collection.map(event => this.mapCalendlyEvent(event))
    );
  }

  /**
   * Get a specific scheduled event
   */
  async getScheduledEvent(eventUri: string): Promise<CalendarEvent | null> {
    try {
      const uuid = this.extractUuid(eventUri);
      const response = await this.request<{ resource: CalendlyScheduledEvent }>(
        `/scheduled_events/${uuid}`
      );
      return this.mapCalendlyEvent(response.resource);
    } catch {
      return null;
    }
  }

  /**
   * List invitees for a scheduled event
   */
  async listEventInvitees(eventUri: string): Promise<EventAttendee[]> {
    const uuid = this.extractUuid(eventUri);

    const response = await this.request<{
      collection: CalendlyInvitee[];
    }>(`/scheduled_events/${uuid}/invitees`);

    return response.collection.map(invitee => ({
      email: invitee.email,
      name: invitee.name,
      status: invitee.status === 'active' ? 'accepted' : 'declined',
    }));
  }

  /**
   * Cancel a scheduled event
   */
  async cancelEvent(eventUri: string, reason?: string): Promise<boolean> {
    try {
      const uuid = this.extractUuid(eventUri);
      await this.request(`/scheduled_events/${uuid}/cancellation`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Mark invitee as no-show
   */
  async markNoShow(inviteeUri: string): Promise<boolean> {
    try {
      await this.request('/invitee_no_shows', {
        method: 'POST',
        body: JSON.stringify({ invitee: inviteeUri }),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Unmark invitee as no-show
   */
  async unmarkNoShow(noShowUri: string): Promise<boolean> {
    try {
      const uuid = this.extractUuid(noShowUri);
      await this.request(`/invitee_no_shows/${uuid}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get user availability schedules
   */
  async getAvailabilitySchedules(): Promise<CalendlyAvailabilitySchedule[]> {
    if (!this.userUri) {
      await this.connect();
    }

    const response = await this.request<{
      collection: CalendlyAvailabilitySchedule[];
    }>(`/user_availability_schedules?user=${encodeURIComponent(this.userUri!)}`);

    return response.collection;
  }

  /**
   * Get available time slots for an event type
   * Note: This uses Calendly's scheduling link approach
   */
  async getAvailableSlots(
    eventTypeUri: string,
    startDate: Date,
    endDate: Date,
    timezone: string
  ): Promise<TimeSlot[]> {
    // Get event type details
    const eventType = await this.getEventType(eventTypeUri);
    if (!eventType) {
      throw new Error('Event type not found');
    }

    // Get existing scheduled events
    const scheduledEvents = await this.listScheduledEvents({
      minStartTime: startDate,
      maxStartTime: endDate,
      status: 'active',
      eventType: eventTypeUri,
    });

    // Get availability schedules
    const schedules = await this.getAvailabilitySchedules();
    const defaultSchedule = schedules.find(s => s.default) || schedules[0];

    if (!defaultSchedule) {
      return [];
    }

    // Generate slots based on availability rules
    const slots: TimeSlot[] = [];
    const current = new Date(startDate);
    const duration = eventType.duration;

    while (current < endDate) {
      const dayOfWeek = current.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
      const dayRule = defaultSchedule.rules.find(
        r => r.type === 'wday' && r.wday === dayOfWeek
      );

      if (dayRule) {
        for (const interval of dayRule.intervals) {
          const [fromHour, fromMin] = interval.from.split(':').map(Number);
          const [toHour, toMin] = interval.to.split(':').map(Number);

          const slotStart = new Date(current);
          slotStart.setHours(fromHour, fromMin, 0, 0);

          const intervalEnd = new Date(current);
          intervalEnd.setHours(toHour, toMin, 0, 0);

          while (slotStart < intervalEnd) {
            const slotEnd = new Date(slotStart.getTime() + duration * 60000);
            if (slotEnd > intervalEnd) break;

            // Check if slot conflicts with scheduled events
            const isBooked = scheduledEvents.some(event =>
              slotStart < event.endTime && slotEnd > event.startTime
            );

            slots.push({
              start: new Date(slotStart),
              end: new Date(slotEnd),
              available: !isBooked && slotStart > new Date(),
              timezone,
            });

            slotStart.setTime(slotEnd.getTime());
          }
        }
      }

      current.setDate(current.getDate() + 1);
    }

    return slots;
  }

  /**
   * Get scheduling link for an event type
   */
  getSchedulingLink(eventType: CalendlyEventType): string {
    return eventType.scheduling_url;
  }

  /**
   * Create a webhook subscription
   */
  async createWebhook(
    callbackUrl: string,
    events: string[],
    scope: 'user' | 'organization' = 'user',
    signingKey?: string
  ): Promise<CalendlyWebhook> {
    if (!this.userUri || !this.organizationUri) {
      await this.connect();
    }

    const body: Record<string, unknown> = {
      url: callbackUrl,
      events,
      organization: this.organizationUri,
      scope,
    };

    if (scope === 'user') {
      body.user = this.userUri;
    }

    if (signingKey) {
      body.signing_key = signingKey;
    }

    const response = await this.request<{ resource: CalendlyWebhook }>(
      '/webhook_subscriptions',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    return response.resource;
  }

  /**
   * List webhook subscriptions
   */
  async listWebhooks(scope?: 'user' | 'organization'): Promise<CalendlyWebhook[]> {
    if (!this.organizationUri) {
      await this.connect();
    }

    const params = new URLSearchParams({
      organization: this.organizationUri!,
    });

    if (scope) {
      params.set('scope', scope);
    }

    if (scope === 'user' && this.userUri) {
      params.set('user', this.userUri);
    }

    const response = await this.request<{
      collection: CalendlyWebhook[];
    }>(`/webhook_subscriptions?${params}`);

    return response.collection;
  }

  /**
   * Delete a webhook subscription
   */
  async deleteWebhook(webhookUri: string): Promise<boolean> {
    try {
      const uuid = this.extractUuid(webhookUri);
      await this.request(`/webhook_subscriptions/${uuid}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    signingKey: string
  ): boolean {
    // Implementation depends on crypto library
    // Calendly uses HMAC-SHA256
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', signingKey)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Book through Calendly (returns scheduling URL)
   * Note: Calendly doesn't support direct API booking, users must use the scheduling page
   */
  async initiateBooking(request: BookingRequest): Promise<BookingResult> {
    try {
      // Get event types
      const eventTypes = await this.listEventTypes({ active: true });
      
      if (eventTypes.length === 0) {
        return {
          success: false,
          error: 'No active event types available',
        };
      }

      // Find matching event type by duration or use first available
      const matchingType = eventTypes.find(
        et => et.duration === Math.round((request.endTime.getTime() - request.startTime.getTime()) / 60000)
      ) || eventTypes[0];

      // Return scheduling URL with prefilled data
      const prefillParams = new URLSearchParams({
        name: request.attendee.name,
        email: request.attendee.email,
      });

      if (request.attendee.phone) {
        prefillParams.set('a1', request.attendee.phone);
      }

      return {
        success: true,
        booking: {
          id: matchingType.uri,
          eventId: matchingType.uri,
          status: 'pending',
          startTime: request.startTime,
          endTime: request.endTime,
          timezone: request.timezone,
        },
        schedulingUrl: `${matchingType.scheduling_url}?${prefillParams}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initiate booking',
      };
    }
  }

  // Helper methods
  private extractUuid(uri: string): string {
    const parts = uri.split('/');
    return parts[parts.length - 1];
  }

  private async mapCalendlyEvent(event: CalendlyScheduledEvent): Promise<CalendarEvent> {
    // Fetch invitees for this event
    const invitees = await this.listEventInvitees(event.uri);

    return {
      id: event.uri,
      providerId: this.extractUuid(event.uri),
      provider: 'calendly',
      title: event.name,
      description: event.meeting_notes_plain,
      location: event.location?.location,
      startTime: new Date(event.start_time),
      endTime: new Date(event.end_time),
      timezone: 'UTC', // Calendly stores in UTC
      isAllDay: false,
      status: event.status === 'active' ? 'confirmed' : 'cancelled',
      attendees: invitees,
      conferenceData: event.location?.join_url ? {
        type: 'zoom', // Most common, but could be other providers
        url: event.location.join_url,
      } : undefined,
      metadata: {
        eventType: event.event_type,
        inviteesCount: event.invitees_counter,
        cancellation: event.cancellation,
      },
      createdAt: new Date(event.created_at),
      updatedAt: new Date(event.updated_at),
    };
  }
}

// Webhook event types
export const CALENDLY_WEBHOOK_EVENTS = {
  INVITEE_CREATED: 'invitee.created',
  INVITEE_CANCELED: 'invitee.canceled',
  ROUTING_FORM_SUBMISSION_CREATED: 'routing_form_submission.created',
} as const;

export type CalendlyWebhookEventType = typeof CALENDLY_WEBHOOK_EVENTS[keyof typeof CALENDLY_WEBHOOK_EVENTS];

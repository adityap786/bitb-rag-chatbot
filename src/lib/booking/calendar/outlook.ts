/**
 * Microsoft Outlook/Office 365 Calendar Integration
 * 
 * Production-ready integration with Microsoft Graph API.
 * Features:
 * - OAuth2 authentication with automatic token refresh
 * - Event CRUD operations
 * - Scheduling assistant (find meeting times)
 * - Teams meeting integration
 */

import {
  CalendarCredentials,
  CalendarEvent,
  TimeSlot,
  FreeBusyRequest,
  FreeBusyResponse,
  BookingRequest,
  BookingResult,
  EventAttendee,
} from './types';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
const OAUTH_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

interface OutlookEvent {
  id: string;
  subject: string;
  body?: { contentType: string; content: string };
  bodyPreview?: string;
  location?: { displayName: string; address?: object };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay: boolean;
  showAs: string;
  attendees?: Array<{
    emailAddress: { address: string; name?: string };
    status: { response: string };
    type: string;
  }>;
  organizer?: { emailAddress: { address: string; name?: string } };
  onlineMeeting?: {
    joinUrl: string;
    conferenceId?: string;
  };
  onlineMeetingProvider?: string;
  isOnlineMeeting?: boolean;
  recurrence?: {
    pattern: { type: string; interval: number; daysOfWeek?: string[] };
    range: { type: string; startDate: string; endDate?: string; numberOfOccurrences?: number };
  };
  createdDateTime: string;
  lastModifiedDateTime: string;
}

interface ScheduleItem {
  scheduleId: string;
  availabilityView: string;
  scheduleItems: Array<{
    isPrivate: boolean;
    status: string;
    subject: string;
    location: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
  }>;
  workingHours: {
    daysOfWeek: string[];
    startTime: string;
    endTime: string;
    timeZone: { name: string };
  };
}

export class OutlookCalendarConnector {
  private credentials: CalendarCredentials;
  private calendarId: string;

  constructor(credentials: CalendarCredentials) {
    this.credentials = credentials;
    this.calendarId = credentials.calendarId || 'me/calendar';
  }

  /**
   * Refresh access token if expired
   */
  private async ensureValidToken(): Promise<string> {
    if (this.credentials.expiresAt && new Date() >= this.credentials.expiresAt) {
      if (!this.credentials.refreshToken || !this.credentials.clientId || !this.credentials.clientSecret) {
        throw new Error('Cannot refresh token: missing credentials');
      }

      const response = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
          refresh_token: this.credentials.refreshToken,
          grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/.default',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to refresh token: ${response.status}`);
      }

      const data = await response.json() as { access_token: string; expires_in: number };
      this.credentials.accessToken = data.access_token;
      this.credentials.expiresAt = new Date(Date.now() + data.expires_in * 1000);
    }

    return this.credentials.accessToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.ensureValidToken();

    const response = await fetch(`${GRAPH_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Microsoft Graph API error: ${response.status} - ${error}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) as T : {} as T;
  }

  /**
   * List events in a time range
   */
  async listEvents(
    timeMin: Date,
    timeMax: Date,
    options?: { maxResults?: number }
  ): Promise<CalendarEvent[]> {
    const filter = `start/dateTime ge '${timeMin.toISOString()}' and end/dateTime le '${timeMax.toISOString()}'`;
    const top = options?.maxResults || 50;

    const response = await this.request<{ value: OutlookEvent[] }>(
      `/${this.calendarId}/events?$filter=${encodeURIComponent(filter)}&$top=${top}&$orderby=start/dateTime`
    );

    return (response.value || []).map(event => this.mapOutlookEvent(event));
  }

  /**
   * Get a single event by ID
   */
  async getEvent(eventId: string): Promise<CalendarEvent | null> {
    try {
      const event = await this.request<OutlookEvent>(
        `/${this.calendarId}/events/${eventId}`
      );
      return this.mapOutlookEvent(event);
    } catch {
      return null;
    }
  }

  /**
   * Create a new event
   */
  async createEvent(event: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const outlookEvent = this.toOutlookEvent(event);

    const created = await this.request<OutlookEvent>(
      `/${this.calendarId}/events`,
      {
        method: 'POST',
        body: JSON.stringify(outlookEvent),
      }
    );

    return this.mapOutlookEvent(created);
  }

  /**
   * Update an existing event
   */
  async updateEvent(eventId: string, updates: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const outlookEvent = this.toOutlookEvent(updates);

    const updated = await this.request<OutlookEvent>(
      `/${this.calendarId}/events/${eventId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(outlookEvent),
      }
    );

    return this.mapOutlookEvent(updated);
  }

  /**
   * Delete an event
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      await this.request(
        `/${this.calendarId}/events/${eventId}`,
        { method: 'DELETE' }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Query free/busy information using Schedule API
   */
  async getFreeBusy(request: FreeBusyRequest): Promise<FreeBusyResponse> {
    const schedules = request.calendars || ['me'];

    const response = await this.request<{ value: ScheduleItem[] }>(
      '/me/calendar/getSchedule',
      {
        method: 'POST',
        body: JSON.stringify({
          schedules,
          startTime: {
            dateTime: request.timeMin.toISOString(),
            timeZone: request.timezone,
          },
          endTime: {
            dateTime: request.timeMax.toISOString(),
            timeZone: request.timezone,
          },
          availabilityViewInterval: 30,
        }),
      }
    );

    const calendars: FreeBusyResponse['calendars'] = {};
    
    for (const schedule of response.value) {
      calendars[schedule.scheduleId] = {
        busy: schedule.scheduleItems
          .filter(item => item.status !== 'free')
          .map(item => ({
            start: new Date(item.start.dateTime),
            end: new Date(item.end.dateTime),
          })),
      };
    }

    return { calendars };
  }

  /**
   * Find meeting times using Microsoft's scheduling assistant
   */
  async findMeetingTimes(
    attendees: string[],
    duration: number,
    timeConstraint: { start: Date; end: Date },
    timezone: string
  ): Promise<TimeSlot[]> {
    const response = await this.request<{
      meetingTimeSuggestions: Array<{
        confidence: number;
        meetingTimeSlot: {
          start: { dateTime: string; timeZone: string };
          end: { dateTime: string; timeZone: string };
        };
        attendeeAvailability: Array<{
          attendee: { emailAddress: { address: string } };
          availability: string;
        }>;
      }>;
    }>('/me/findMeetingTimes', {
      method: 'POST',
      body: JSON.stringify({
        attendees: attendees.map(email => ({
          emailAddress: { address: email },
          type: 'required',
        })),
        timeConstraint: {
          activityDomain: 'work',
          timeSlots: [{
            start: {
              dateTime: timeConstraint.start.toISOString(),
              timeZone: timezone,
            },
            end: {
              dateTime: timeConstraint.end.toISOString(),
              timeZone: timezone,
            },
          }],
        },
        meetingDuration: `PT${duration}M`,
        returnSuggestionReasons: true,
        minimumAttendeePercentage: 100,
      }),
    });

    return response.meetingTimeSuggestions.map(suggestion => ({
      start: new Date(suggestion.meetingTimeSlot.start.dateTime),
      end: new Date(suggestion.meetingTimeSlot.end.dateTime),
      available: suggestion.confidence >= 50,
      timezone,
    }));
  }

  /**
   * Get available time slots
   */
  async getAvailableSlots(
    startDate: Date,
    endDate: Date,
    slotDuration: number,
    timezone: string,
    options?: {
      startHour?: number;
      endHour?: number;
      bufferMinutes?: number;
    }
  ): Promise<TimeSlot[]> {
    const startHour = options?.startHour ?? 9;
    const endHour = options?.endHour ?? 17;
    const buffer = options?.bufferMinutes ?? 0;

    // Get busy times
    const freeBusy = await this.getFreeBusy({
      timeMin: startDate,
      timeMax: endDate,
      timezone,
    });

    const busyTimes = freeBusy.calendars['me']?.busy || [];

    // Generate slots
    const slots: TimeSlot[] = [];
    const current = new Date(startDate);

    while (current < endDate) {
      // Skip weekends
      if (current.getDay() === 0 || current.getDay() === 6) {
        current.setDate(current.getDate() + 1);
        continue;
      }

      const dayStart = new Date(current);
      dayStart.setHours(startHour, 0, 0, 0);
      
      const dayEnd = new Date(current);
      dayEnd.setHours(endHour, 0, 0, 0);

      let slotStart = new Date(dayStart);

      while (slotStart < dayEnd) {
        const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);
        
        if (slotEnd > dayEnd) break;

        const slotStartWithBuffer = new Date(slotStart.getTime() - buffer * 60000);
        const slotEndWithBuffer = new Date(slotEnd.getTime() + buffer * 60000);

        const isBusy = busyTimes.some(busy =>
          (slotStartWithBuffer < busy.end && slotEndWithBuffer > busy.start)
        );

        slots.push({
          start: new Date(slotStart),
          end: new Date(slotEnd),
          available: !isBusy && slotStart > new Date(),
          timezone,
        });

        slotStart = new Date(slotEnd);
      }

      current.setDate(current.getDate() + 1);
    }

    return slots;
  }

  /**
   * Book an appointment
   */
  async bookAppointment(request: BookingRequest): Promise<BookingResult> {
    try {
      // Create Teams meeting if requested
      const isOnlineMeeting = request.conferenceType === 'teams';

      const event = await this.createEvent({
        title: `Appointment with ${request.attendee.name}`,
        description: request.attendee.notes,
        startTime: request.startTime,
        endTime: request.endTime,
        timezone: request.timezone,
        location: request.location,
        attendees: [{
          email: request.attendee.email,
          name: request.attendee.name,
          status: 'needsAction',
        }],
        conferenceData: isOnlineMeeting ? {
          type: 'teams',
          url: '',
        } : undefined,
      });

      return {
        success: true,
        booking: {
          id: event.id,
          eventId: event.providerId,
          status: 'confirmed',
          startTime: event.startTime,
          endTime: event.endTime,
          timezone: event.timezone,
          conferenceUrl: event.conferenceData?.url,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to book appointment',
      };
    }
  }

  /**
   * Set up webhook subscription for event notifications
   */
  async createSubscription(
    webhookUrl: string,
    expirationMinutes: number = 4230 // Max ~3 days
  ): Promise<{
    subscriptionId: string;
    expiration: Date;
  }> {
    const expiration = new Date(Date.now() + expirationMinutes * 60000);

    const response = await this.request<{
      id: string;
      expirationDateTime: string;
    }>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        changeType: 'created,updated,deleted',
        notificationUrl: webhookUrl,
        resource: `/${this.calendarId}/events`,
        expirationDateTime: expiration.toISOString(),
        clientState: process.env.WEBHOOK_CLIENT_STATE || 'calendar-webhook',
      }),
    });

    return {
      subscriptionId: response.id,
      expiration: new Date(response.expirationDateTime),
    };
  }

  /**
   * Renew a subscription
   */
  async renewSubscription(
    subscriptionId: string,
    expirationMinutes: number = 4230
  ): Promise<Date> {
    const expiration = new Date(Date.now() + expirationMinutes * 60000);

    const response = await this.request<{ expirationDateTime: string }>(
      `/subscriptions/${subscriptionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          expirationDateTime: expiration.toISOString(),
        }),
      }
    );

    return new Date(response.expirationDateTime);
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(subscriptionId: string): Promise<void> {
    await this.request(`/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
    });
  }

  // Helper methods
  private mapOutlookEvent(event: OutlookEvent): CalendarEvent {
    const attendeeStatusMap: Record<string, EventAttendee['status']> = {
      'accepted': 'accepted',
      'declined': 'declined',
      'tentativelyAccepted': 'tentative',
      'notResponded': 'needsAction',
      'none': 'needsAction',
    };

    return {
      id: event.id,
      providerId: event.id,
      provider: 'outlook',
      title: event.subject || '',
      description: event.bodyPreview,
      location: event.location?.displayName,
      startTime: new Date(event.start.dateTime),
      endTime: new Date(event.end.dateTime),
      timezone: event.start.timeZone,
      isAllDay: event.isAllDay,
      status: event.showAs === 'free' ? 'tentative' : 'confirmed',
      attendees: (event.attendees || []).map(a => ({
        email: a.emailAddress.address,
        name: a.emailAddress.name,
        status: attendeeStatusMap[a.status.response] || 'needsAction',
      })),
      organizer: event.organizer ? {
        email: event.organizer.emailAddress.address,
        name: event.organizer.emailAddress.name,
        status: 'accepted',
        organizer: true,
      } : undefined,
      conferenceData: event.onlineMeeting ? {
        type: 'teams',
        url: event.onlineMeeting.joinUrl,
        conferenceId: event.onlineMeeting.conferenceId,
      } : undefined,
      createdAt: new Date(event.createdDateTime),
      updatedAt: new Date(event.lastModifiedDateTime),
    };
  }

  private toOutlookEvent(event: Partial<CalendarEvent>): Partial<OutlookEvent> {
    const outlookEvent: Record<string, unknown> = {};

    if (event.title) outlookEvent.subject = event.title;
    if (event.description) {
      outlookEvent.body = {
        contentType: 'text',
        content: event.description,
      };
    }
    if (event.location) {
      outlookEvent.location = { displayName: event.location };
    }

    if (event.startTime) {
      outlookEvent.start = {
        dateTime: event.startTime.toISOString(),
        timeZone: event.timezone || 'UTC',
      };
    }

    if (event.endTime) {
      outlookEvent.end = {
        dateTime: event.endTime.toISOString(),
        timeZone: event.timezone || 'UTC',
      };
    }

    if (event.isAllDay !== undefined) {
      outlookEvent.isAllDay = event.isAllDay;
    }

    if (event.attendees) {
      outlookEvent.attendees = event.attendees.map(a => ({
        emailAddress: {
          address: a.email,
          name: a.name,
        },
        type: a.optional ? 'optional' : 'required',
      }));
    }

    // Enable Teams meeting
    if (event.conferenceData?.type === 'teams') {
      outlookEvent.isOnlineMeeting = true;
      outlookEvent.onlineMeetingProvider = 'teamsForBusiness';
    }

    return outlookEvent as Partial<OutlookEvent>;
  }
}

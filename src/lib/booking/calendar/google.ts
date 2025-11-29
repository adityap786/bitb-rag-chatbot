/**
 * Google Calendar Integration
 * 
 * Production-ready integration with Google Calendar API v3.
 * Features:
 * - OAuth2 authentication with automatic token refresh
 * - Event CRUD operations
 * - Free/busy queries
 * - Watch notifications via webhooks
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

const GOOGLE_API_BASE = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface GoogleEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
    optional?: boolean;
    organizer?: boolean;
  }>;
  organizer?: { email: string; displayName?: string };
  conferenceData?: {
    conferenceId: string;
    conferenceSolution: { name: string; key: { type: string } };
    entryPoints: Array<{ entryPointType: string; uri: string; label?: string }>;
  };
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
  recurrence?: string[];
  created: string;
  updated: string;
}

export class GoogleCalendarConnector {
  private credentials: CalendarCredentials;
  private calendarId: string;

  constructor(credentials: CalendarCredentials) {
    this.credentials = credentials;
    this.calendarId = credentials.calendarId || 'primary';
  }

  /**
   * Refresh access token if expired
   */
  private async ensureValidToken(): Promise<string> {
    if (this.credentials.expiresAt && new Date() >= this.credentials.expiresAt) {
      if (!this.credentials.refreshToken || !this.credentials.clientId || !this.credentials.clientSecret) {
        throw new Error('Cannot refresh token: missing credentials');
      }

      const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
          refresh_token: this.credentials.refreshToken,
          grant_type: 'refresh_token',
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

    const response = await fetch(`${GOOGLE_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Calendar API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * List events in a time range
   */
  async listEvents(
    timeMin: Date,
    timeMax: Date,
    options?: { maxResults?: number; showDeleted?: boolean }
  ): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      ...(options?.maxResults && { maxResults: String(options.maxResults) }),
      ...(options?.showDeleted && { showDeleted: 'true' }),
    });

    const response = await this.request<{ items: GoogleEvent[] }>(
      `/calendars/${encodeURIComponent(this.calendarId)}/events?${params}`
    );

    return (response.items || []).map(event => this.mapGoogleEvent(event));
  }

  /**
   * Get a single event by ID
   */
  async getEvent(eventId: string): Promise<CalendarEvent | null> {
    try {
      const event = await this.request<GoogleEvent>(
        `/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}`
      );
      return this.mapGoogleEvent(event);
    } catch {
      return null;
    }
  }

  /**
   * Create a new event
   */
  async createEvent(event: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const googleEvent = this.toGoogleEvent(event);

    const created = await this.request<GoogleEvent>(
      `/calendars/${encodeURIComponent(this.calendarId)}/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        body: JSON.stringify(googleEvent),
      }
    );

    return this.mapGoogleEvent(created);
  }

  /**
   * Update an existing event
   */
  async updateEvent(eventId: string, updates: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const googleEvent = this.toGoogleEvent(updates);

    const updated = await this.request<GoogleEvent>(
      `/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}?conferenceDataVersion=1`,
      {
        method: 'PATCH',
        body: JSON.stringify(googleEvent),
      }
    );

    return this.mapGoogleEvent(updated);
  }

  /**
   * Delete an event
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      await this.request(
        `/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}`,
        { method: 'DELETE' }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Query free/busy information
   */
  async getFreeBusy(request: FreeBusyRequest): Promise<FreeBusyResponse> {
    const response = await this.request<{
      calendars: Record<string, { busy: Array<{ start: string; end: string }>; errors?: Array<{ reason: string }> }>;
    }>('/freeBusy', {
      method: 'POST',
      body: JSON.stringify({
        timeMin: request.timeMin.toISOString(),
        timeMax: request.timeMax.toISOString(),
        timeZone: request.timezone,
        items: (request.calendars || [this.calendarId]).map(id => ({ id })),
      }),
    });

    const calendars: FreeBusyResponse['calendars'] = {};
    for (const [calId, data] of Object.entries(response.calendars)) {
      calendars[calId] = {
        busy: data.busy.map(b => ({
          start: new Date(b.start),
          end: new Date(b.end),
        })),
        errors: data.errors,
      };
    }

    return { calendars };
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

    const busyTimes = freeBusy.calendars[this.calendarId]?.busy || [];

    // Generate slots
    const slots: TimeSlot[] = [];
    const current = new Date(startDate);

    while (current < endDate) {
      const dayStart = new Date(current);
      dayStart.setHours(startHour, 0, 0, 0);
      
      const dayEnd = new Date(current);
      dayEnd.setHours(endHour, 0, 0, 0);

      let slotStart = new Date(dayStart);

      while (slotStart < dayEnd) {
        const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);
        
        if (slotEnd > dayEnd) break;

        // Check if slot conflicts with any busy time (including buffer)
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
      // Verify slot is available
      const freeBusy = await this.getFreeBusy({
        timeMin: request.startTime,
        timeMax: request.endTime,
        timezone: request.timezone,
      });

      const busyTimes = freeBusy.calendars[this.calendarId]?.busy || [];
      const isConflict = busyTimes.some(busy =>
        request.startTime < busy.end && request.endTime > busy.start
      );

      if (isConflict) {
        return {
          success: false,
          error: 'The requested time slot is no longer available',
        };
      }

      // Create the event
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
        conferenceData: request.conferenceType === 'google_meet' ? {
          type: 'hangoutsMeet',
          url: '', // Will be populated by Google
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
   * Set up webhook for event notifications
   */
  async watchCalendar(webhookUrl: string, channelId: string): Promise<{
    resourceId: string;
    expiration: Date;
  }> {
    const response = await this.request<{
      resourceId: string;
      expiration: string;
    }>(`/calendars/${encodeURIComponent(this.calendarId)}/events/watch`, {
      method: 'POST',
      body: JSON.stringify({
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
      }),
    });

    return {
      resourceId: response.resourceId,
      expiration: new Date(parseInt(response.expiration)),
    };
  }

  /**
   * Stop watching a calendar
   */
  async stopWatch(channelId: string, resourceId: string): Promise<void> {
    await this.request('/channels/stop', {
      method: 'POST',
      body: JSON.stringify({
        id: channelId,
        resourceId,
      }),
    });
  }

  // Helper methods
  private mapGoogleEvent(event: GoogleEvent): CalendarEvent {
    const isAllDay = !event.start.dateTime;
    const startTime = isAllDay 
      ? new Date(event.start.date!)
      : new Date(event.start.dateTime!);
    const endTime = isAllDay
      ? new Date(event.end.date!)
      : new Date(event.end.dateTime!);

    const statusMap: Record<string, CalendarEvent['status']> = {
      'confirmed': 'confirmed',
      'tentative': 'tentative',
      'cancelled': 'cancelled',
    };

    const attendeeStatusMap: Record<string, EventAttendee['status']> = {
      'accepted': 'accepted',
      'declined': 'declined',
      'tentative': 'tentative',
      'needsAction': 'needsAction',
    };

    return {
      id: event.id,
      providerId: event.id,
      provider: 'google',
      title: event.summary || '',
      description: event.description,
      location: event.location,
      startTime,
      endTime,
      timezone: event.start.timeZone || 'UTC',
      isAllDay,
      status: statusMap[event.status] || 'confirmed',
      attendees: (event.attendees || []).map(a => ({
        email: a.email,
        name: a.displayName,
        status: attendeeStatusMap[a.responseStatus] || 'needsAction',
        optional: a.optional,
        organizer: a.organizer,
      })),
      organizer: event.organizer ? {
        email: event.organizer.email,
        name: event.organizer.displayName,
        status: 'accepted',
        organizer: true,
      } : undefined,
      conferenceData: event.conferenceData ? {
        type: event.conferenceData.conferenceSolution.key.type === 'hangoutsMeet' ? 'hangoutsMeet' : 'other',
        url: event.conferenceData.entryPoints.find(e => e.entryPointType === 'video')?.uri || '',
        conferenceId: event.conferenceData.conferenceId,
      } : undefined,
      reminders: event.reminders?.overrides?.map(r => ({
        method: r.method as 'email' | 'popup',
        minutes: r.minutes,
      })),
      createdAt: new Date(event.created),
      updatedAt: new Date(event.updated),
    };
  }

  private toGoogleEvent(event: Partial<CalendarEvent>): Partial<GoogleEvent> {
    const googleEvent: Partial<GoogleEvent> = {};

    if (event.title) googleEvent.summary = event.title;
    if (event.description) googleEvent.description = event.description;
    if (event.location) googleEvent.location = event.location;

    if (event.startTime) {
      if (event.isAllDay) {
        googleEvent.start = { date: event.startTime.toISOString().split('T')[0] };
      } else {
        googleEvent.start = {
          dateTime: event.startTime.toISOString(),
          timeZone: event.timezone || 'UTC',
        };
      }
    }

    if (event.endTime) {
      if (event.isAllDay) {
        googleEvent.end = { date: event.endTime.toISOString().split('T')[0] };
      } else {
        googleEvent.end = {
          dateTime: event.endTime.toISOString(),
          timeZone: event.timezone || 'UTC',
        };
      }
    }

    if (event.attendees) {
      googleEvent.attendees = event.attendees.map(a => ({
        email: a.email,
        displayName: a.name,
        responseStatus: a.status,
        optional: a.optional,
      }));
    }

    // Request Google Meet if conferenceData type is hangoutsMeet
    if (event.conferenceData?.type === 'hangoutsMeet') {
      (googleEvent as Record<string, unknown>).conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    return googleEvent;
  }
}

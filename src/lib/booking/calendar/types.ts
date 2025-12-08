/**
 * Calendar Integration Types
 * 
 * Unified types for calendar integrations (Google, Outlook, Calendly).
 */

export interface CalendarCredentials {
  provider: 'google' | 'outlook' | 'calendly';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  clientId?: string;
  clientSecret?: string;
  calendarId?: string;
  webhookUrl?: string;
}

export type CalendarProvider = 'google' | 'outlook' | 'calendly';

export interface CalendarEvent {
  id: string;
  providerId: string;
  provider: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  isAllDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  attendees: EventAttendee[];
  organizer?: EventAttendee;
  conferenceData?: ConferenceData;
  reminders?: EventReminder[];
  recurrence?: RecurrenceRule;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventAttendee {
  email: string;
  name?: string;
  status: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  optional?: boolean;
  organizer?: boolean;
}

export interface ConferenceData {
  type: 'hangoutsMeet' | 'teams' | 'zoom' | 'other';
  url: string;
  conferenceId?: string;
  dialInNumbers?: Array<{ label: string; number: string }>;
}

export interface EventReminder {
  method: 'email' | 'popup' | 'sms';
  minutes: number;
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  count?: number;
  until?: Date;
  byDay?: string[]; // ['MO', 'WE', 'FR']
  byMonth?: number[];
  byMonthDay?: number[];
}

export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
  timezone: string;
}

export interface FreeBusyRequest {
  timeMin: Date;
  timeMax: Date;
  timezone: string;
  calendars?: string[];
}

export interface FreeBusyResponse {
  calendars: Record<string, {
    busy: Array<{ start: Date; end: Date }>;
    errors?: Array<{ reason: string }>;
  }>;
}

export interface SchedulingLink {
  id: string;
  name: string;
  slug: string;
  duration: number; // minutes
  bufferBefore?: number;
  bufferAfter?: number;
  availabilityRules: AvailabilityRule[];
  bookingLimits?: BookingLimits;
  confirmationUrl?: string;
  cancelUrl?: string;
  rescheduleUrl?: string;
}

export interface AvailabilityRule {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  timezone: string;
}

export interface BookingLimits {
  maxPerDay?: number;
  maxPerWeek?: number;
  minNotice: number; // minutes
  maxFutureDays: number;
}

export interface BookingRequest {
  eventTypeId?: string;
  schedulingLinkId?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  attendee: {
    email: string;
    name: string;
    phone?: string;
    notes?: string;
    customFields?: Record<string, string>;
  };
  location?: string;
  conferenceType?: 'google_meet' | 'zoom' | 'teams' | 'phone' | 'in_person';
  metadata?: Record<string, unknown>;
}

export interface BookingResult {
  success: boolean;
  booking?: {
    id: string;
    eventId: string;
    status: 'confirmed' | 'pending';
    startTime: Date;
    endTime: Date;
    timezone: string;
    conferenceUrl?: string;
    cancelUrl?: string;
    rescheduleUrl?: string;
  };
  schedulingUrl?: string;
  error?: string;
}

export interface CalendarWebhookPayload {
  provider: string;
  eventType: 'created' | 'updated' | 'deleted' | 'started' | 'ended';
  eventId: string;
  calendarId: string;
  timestamp: Date;
  payload: unknown;
}

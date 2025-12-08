/**
 * Calendar Integration Index
 * 
 * Unified exports and factory for calendar integrations.
 */

export * from './types';
export { GoogleCalendarConnector } from './google';
export { OutlookCalendarConnector } from './outlook';
export { CalendlyConnector, CALENDLY_WEBHOOK_EVENTS, type CalendlyWebhookEventType } from './calendly';

import { CalendarCredentials, CalendarProvider } from './types';
import { GoogleCalendarConnector } from './google';
import { OutlookCalendarConnector } from './outlook';
import { CalendlyConnector } from './calendly';

export type CalendarConnector = GoogleCalendarConnector | OutlookCalendarConnector | CalendlyConnector;

/**
 * Factory for creating calendar connectors
 */
export class CalendarFactory {
  /**
   * Create a calendar connector for the specified provider
   */
  static create(
    provider: CalendarProvider,
    credentials: CalendarCredentials
  ): CalendarConnector {
    switch (provider) {
      case 'google':
        return new GoogleCalendarConnector(credentials);
      case 'outlook':
        return new OutlookCalendarConnector(credentials);
      case 'calendly':
        return new CalendlyConnector(credentials);
      default:
        throw new Error(`Unsupported calendar provider: ${provider}`);
    }
  }

  /**
   * Get supported providers
   */
  static getSupportedProviders(): CalendarProvider[] {
    return ['google', 'outlook', 'calendly'];
  }

  /**
   * Get OAuth configuration for a provider
   */
  static getOAuthConfig(provider: CalendarProvider): {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
  } {
    switch (provider) {
      case 'google':
        return {
          authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          scopes: [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
          ],
        };
      case 'outlook':
        return {
          authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
          tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          scopes: [
            'https://graph.microsoft.com/Calendars.ReadWrite',
            'https://graph.microsoft.com/OnlineMeetings.ReadWrite',
          ],
        };
      case 'calendly':
        return {
          authUrl: 'https://auth.calendly.com/oauth/authorize',
          tokenUrl: 'https://auth.calendly.com/oauth/token',
          scopes: [],
        };
      default:
        throw new Error(`Unsupported calendar provider: ${provider}`);
    }
  }
}

/**
 * Multi-calendar manager for aggregating events across providers
 */
export class MultiCalendarManager {
  private connectors: Map<string, CalendarConnector> = new Map();

  /**
   * Add a calendar connector
   */
  addConnector(id: string, connector: CalendarConnector): void {
    this.connectors.set(id, connector);
  }

  /**
   * Remove a calendar connector
   */
  removeConnector(id: string): boolean {
    return this.connectors.delete(id);
  }

  /**
   * Get all connected calendar IDs
   */
  getConnectedCalendars(): string[] {
    return Array.from(this.connectors.keys());
  }

  /**
   * List events from all connected calendars
   */
  async listAllEvents(
    timeMin: Date,
    timeMax: Date,
    options?: { maxResults?: number }
  ): Promise<Array<{ calendarId: string; events: Awaited<ReturnType<GoogleCalendarConnector['listEvents']>> }>> {
    const results = await Promise.allSettled(
      Array.from(this.connectors.entries()).map(async ([id, connector]) => {
        if ('listEvents' in connector) {
          const events = await connector.listEvents(timeMin, timeMax, options);
          return { calendarId: id, events };
        }
        if ('listScheduledEvents' in connector) {
          const events = await (connector as CalendlyConnector).listScheduledEvents({
            minStartTime: timeMin,
            maxStartTime: timeMax,
            count: options?.maxResults,
          });
          return { calendarId: id, events };
        }
        return { calendarId: id, events: [] };
      })
    );

    return results
      .filter((r): r is PromiseFulfilledResult<{ calendarId: string; events: Awaited<ReturnType<GoogleCalendarConnector['listEvents']>> }> => 
        r.status === 'fulfilled'
      )
      .map(r => r.value);
  }

  /**
   * Check availability across all calendars
   */
  async checkAvailability(
    startDate: Date,
    endDate: Date,
    slotDuration: number,
    timezone: string
  ): Promise<Array<{ start: Date; end: Date; available: boolean; conflicts: string[] }>> {
    // Collect all events from all calendars
    const allCalendarEvents = await this.listAllEvents(startDate, endDate);
    
    // Flatten all events
    const allEvents = allCalendarEvents.flatMap(ce => 
      ce.events.map(e => ({ ...e, calendarId: ce.calendarId }))
    );

    // Generate slots and check for conflicts
    const slots: Array<{ start: Date; end: Date; available: boolean; conflicts: string[] }> = [];
    const current = new Date(startDate);

    while (current < endDate) {
      // Skip weekends
      if (current.getDay() === 0 || current.getDay() === 6) {
        current.setDate(current.getDate() + 1);
        continue;
      }

      const dayStart = new Date(current);
      dayStart.setHours(9, 0, 0, 0);
      
      const dayEnd = new Date(current);
      dayEnd.setHours(17, 0, 0, 0);

      let slotStart = new Date(dayStart);

      while (slotStart < dayEnd) {
        const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);
        if (slotEnd > dayEnd) break;

        // Find conflicting events
        const conflicts = allEvents
          .filter(event => 
            slotStart < new Date(event.endTime) && slotEnd > new Date(event.startTime)
          )
          .map(event => `${event.calendarId}: ${event.title}`);

        slots.push({
          start: new Date(slotStart),
          end: new Date(slotEnd),
          available: conflicts.length === 0 && slotStart > new Date(),
          conflicts,
        });

        slotStart = new Date(slotEnd);
      }

      current.setDate(current.getDate() + 1);
    }

    return slots;
  }
}

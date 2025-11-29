/**
 * Timezone Utilities
 * 
 * Comprehensive timezone handling for booking, notifications, and display.
 * Features:
 * - Timezone conversion
 * - DST awareness
 * - Business hours calculation
 * - User timezone detection
 * - Localized formatting
 */

// Common timezones with IANA identifiers
export const COMMON_TIMEZONES = {
  // Americas
  'America/New_York': { abbrev: 'ET', offset: -5, name: 'Eastern Time' },
  'America/Chicago': { abbrev: 'CT', offset: -6, name: 'Central Time' },
  'America/Denver': { abbrev: 'MT', offset: -7, name: 'Mountain Time' },
  'America/Los_Angeles': { abbrev: 'PT', offset: -8, name: 'Pacific Time' },
  'America/Anchorage': { abbrev: 'AKT', offset: -9, name: 'Alaska Time' },
  'Pacific/Honolulu': { abbrev: 'HST', offset: -10, name: 'Hawaii Time' },
  'America/Toronto': { abbrev: 'ET', offset: -5, name: 'Eastern Time (Canada)' },
  'America/Vancouver': { abbrev: 'PT', offset: -8, name: 'Pacific Time (Canada)' },
  'America/Mexico_City': { abbrev: 'CST', offset: -6, name: 'Central Standard Time (Mexico)' },
  'America/Sao_Paulo': { abbrev: 'BRT', offset: -3, name: 'Brasília Time' },
  
  // Europe
  'Europe/London': { abbrev: 'GMT', offset: 0, name: 'Greenwich Mean Time' },
  'Europe/Paris': { abbrev: 'CET', offset: 1, name: 'Central European Time' },
  'Europe/Berlin': { abbrev: 'CET', offset: 1, name: 'Central European Time' },
  'Europe/Moscow': { abbrev: 'MSK', offset: 3, name: 'Moscow Time' },
  
  // Asia
  'Asia/Dubai': { abbrev: 'GST', offset: 4, name: 'Gulf Standard Time' },
  'Asia/Kolkata': { abbrev: 'IST', offset: 5.5, name: 'India Standard Time' },
  'Asia/Bangkok': { abbrev: 'ICT', offset: 7, name: 'Indochina Time' },
  'Asia/Singapore': { abbrev: 'SGT', offset: 8, name: 'Singapore Time' },
  'Asia/Hong_Kong': { abbrev: 'HKT', offset: 8, name: 'Hong Kong Time' },
  'Asia/Shanghai': { abbrev: 'CST', offset: 8, name: 'China Standard Time' },
  'Asia/Tokyo': { abbrev: 'JST', offset: 9, name: 'Japan Standard Time' },
  'Asia/Seoul': { abbrev: 'KST', offset: 9, name: 'Korea Standard Time' },
  
  // Pacific
  'Australia/Sydney': { abbrev: 'AEST', offset: 10, name: 'Australian Eastern Time' },
  'Australia/Perth': { abbrev: 'AWST', offset: 8, name: 'Australian Western Time' },
  'Pacific/Auckland': { abbrev: 'NZST', offset: 12, name: 'New Zealand Time' },
  
  // Universal
  'UTC': { abbrev: 'UTC', offset: 0, name: 'Coordinated Universal Time' },
} as const;

export type TimezoneId = keyof typeof COMMON_TIMEZONES;

export interface TimezoneInfo {
  id: string;
  name: string;
  abbreviation: string;
  offset: number;
  offsetString: string;
  isDST: boolean;
}

export interface BusinessHours {
  start: string;  // HH:mm format
  end: string;    // HH:mm format
  days: number[]; // 0-6, Sunday = 0
}

export interface TimeSlotOptions {
  timezone: string;
  businessHours: BusinessHours;
  slotDurationMinutes: number;
  bufferMinutes?: number;
  daysToGenerate?: number;
  excludeDates?: Date[];
}

/**
 * Get timezone info for a given IANA timezone
 */
export function getTimezoneInfo(timezone: string): TimezoneInfo {
  const now = new Date();
  
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    
    // Calculate offset
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const offsetMinutes = (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
    const offsetHours = offsetMinutes / 60;
    
    // Format offset string
    const sign = offsetHours >= 0 ? '+' : '-';
    const absHours = Math.floor(Math.abs(offsetHours));
    const mins = Math.abs(offsetMinutes) % 60;
    const offsetString = `${sign}${String(absHours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    
    // Check DST
    const jan = new Date(now.getFullYear(), 0, 1);
    const jul = new Date(now.getFullYear(), 6, 1);
    const janOffset = getOffsetMinutes(jan, timezone);
    const julOffset = getOffsetMinutes(jul, timezone);
    const isDST = offsetMinutes !== Math.max(janOffset, julOffset);
    
    return {
      id: timezone,
      name: COMMON_TIMEZONES[timezone as TimezoneId]?.name || timezone,
      abbreviation: tzPart?.value || timezone,
      offset: offsetHours,
      offsetString: `UTC${offsetString}`,
      isDST,
    };
  } catch {
    // Invalid timezone, return UTC
    return {
      id: 'UTC',
      name: 'Coordinated Universal Time',
      abbreviation: 'UTC',
      offset: 0,
      offsetString: 'UTC+00:00',
      isDST: false,
    };
  }
}

function getOffsetMinutes(date: Date, timezone: string): number {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
}

/**
 * Convert a date from one timezone to another
 */
export function convertTimezone(
  date: Date,
  fromTimezone: string,
  toTimezone: string
): Date {
  // Get the date in the source timezone as a string
  const dateStr = date.toLocaleString('en-US', { 
    timeZone: fromTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  // Parse the string to get components
  const [datePart, timePart] = dateStr.split(', ');
  const [month, day, year] = datePart.split('/').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  
  // Create date in target timezone
  const targetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: toTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  // Calculate the difference and adjust
  const sourceOffset = getOffsetMinutes(date, fromTimezone);
  const targetOffset = getOffsetMinutes(date, toTimezone);
  const diffMinutes = targetOffset - sourceOffset;
  
  const result = new Date(year, month - 1, day, hour, minute, second);
  result.setMinutes(result.getMinutes() + diffMinutes);
  
  return result;
}

/**
 * Format a date in a specific timezone
 */
export function formatInTimezone(
  date: Date,
  timezone: string,
  options?: Intl.DateTimeFormatOptions & { locale?: string }
): string {
  const { locale = 'en-US', ...formatOptions } = options || {};
  
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    ...formatOptions,
  }).format(date);
}

/**
 * Format a date for display with timezone
 */
export function formatDateTimeWithTZ(
  date: Date,
  timezone: string,
  options?: {
    includeDate?: boolean;
    includeTime?: boolean;
    includeTZ?: boolean;
    locale?: string;
  }
): string {
  const {
    includeDate = true,
    includeTime = true,
    includeTZ = true,
    locale = 'en-US',
  } = options || {};
  
  const parts: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
  };
  
  if (includeDate) {
    parts.weekday = 'short';
    parts.year = 'numeric';
    parts.month = 'short';
    parts.day = 'numeric';
  }
  
  if (includeTime) {
    parts.hour = '2-digit';
    parts.minute = '2-digit';
    parts.hour12 = true;
  }
  
  if (includeTZ) {
    parts.timeZoneName = 'short';
  }
  
  return new Intl.DateTimeFormat(locale, parts).format(date);
}

/**
 * Check if a time is within business hours
 */
export function isWithinBusinessHours(
  date: Date,
  timezone: string,
  businessHours: BusinessHours
): boolean {
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  const dayOfWeek = tzDate.getDay();
  
  if (!businessHours.days.includes(dayOfWeek)) {
    return false;
  }
  
  const timeStr = formatInTimezone(date, timezone, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  return timeStr >= businessHours.start && timeStr < businessHours.end;
}

/**
 * Get the next business day
 */
export function getNextBusinessDay(
  date: Date,
  timezone: string,
  businessDays: number[] = [1, 2, 3, 4, 5]
): Date {
  const result = new Date(date);
  
  do {
    result.setDate(result.getDate() + 1);
    const tzDate = new Date(result.toLocaleString('en-US', { timeZone: timezone }));
    if (businessDays.includes(tzDate.getDay())) {
      return result;
    }
  } while (true);
}

/**
 * Generate available time slots
 */
export function generateTimeSlots(
  startDate: Date,
  options: TimeSlotOptions
): Array<{ start: Date; end: Date; formatted: string }> {
  const {
    timezone,
    businessHours,
    slotDurationMinutes,
    bufferMinutes = 0,
    daysToGenerate = 14,
    excludeDates = [],
  } = options;
  
  const slots: Array<{ start: Date; end: Date; formatted: string }> = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  
  const endDate = new Date(current);
  endDate.setDate(endDate.getDate() + daysToGenerate);
  
  const excludeDateStrings = excludeDates.map(d => 
    formatInTimezone(d, timezone, { year: 'numeric', month: '2-digit', day: '2-digit' })
  );
  
  while (current < endDate) {
    const dateStr = formatInTimezone(current, timezone, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    
    // Skip excluded dates
    if (excludeDateStrings.includes(dateStr)) {
      current.setDate(current.getDate() + 1);
      continue;
    }
    
    const tzDate = new Date(current.toLocaleString('en-US', { timeZone: timezone }));
    const dayOfWeek = tzDate.getDay();
    
    // Check if it's a business day
    if (businessHours.days.includes(dayOfWeek)) {
      const [startHour, startMin] = businessHours.start.split(':').map(Number);
      const [endHour, endMin] = businessHours.end.split(':').map(Number);
      
      const dayStart = new Date(current);
      dayStart.setHours(startHour, startMin, 0, 0);
      
      const dayEnd = new Date(current);
      dayEnd.setHours(endHour, endMin, 0, 0);
      
      const slotStart = new Date(dayStart);
      
      while (slotStart.getTime() + slotDurationMinutes * 60000 <= dayEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60000);
        
        // Only add if slot is in the future
        if (slotStart > new Date()) {
          slots.push({
            start: new Date(slotStart),
            end: new Date(slotEnd),
            formatted: formatDateTimeWithTZ(slotStart, timezone, {
              includeDate: true,
              includeTime: true,
              includeTZ: true,
            }),
          });
        }
        
        slotStart.setMinutes(slotStart.getMinutes() + slotDurationMinutes + bufferMinutes);
      }
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return slots;
}

/**
 * Detect user timezone from browser or use default
 */
export function detectUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Get all supported timezones grouped by region
 */
export function getTimezonesByRegion(): Record<string, Array<{ id: string; name: string; offset: string }>> {
  const regions: Record<string, Array<{ id: string; name: string; offset: string }>> = {
    'Americas': [],
    'Europe': [],
    'Asia': [],
    'Pacific': [],
    'Other': [],
  };
  
  for (const [id, info] of Object.entries(COMMON_TIMEZONES)) {
    const region = id.split('/')[0];
    const targetRegion = ['America', 'Pacific/Honolulu'].some(r => id.includes(r)) ? 'Americas'
      : region === 'Europe' ? 'Europe'
      : region === 'Asia' ? 'Asia'
      : region === 'Pacific' || region === 'Australia' ? 'Pacific'
      : 'Other';
    
    const tzInfo = getTimezoneInfo(id);
    regions[targetRegion].push({
      id,
      name: info.name,
      offset: tzInfo.offsetString,
    });
  }
  
  // Sort each region by offset
  for (const region of Object.keys(regions)) {
    regions[region].sort((a, b) => {
      const offsetA = parseInt(a.offset.replace('UTC', '').replace(':', '.'));
      const offsetB = parseInt(b.offset.replace('UTC', '').replace(':', '.'));
      return offsetA - offsetB;
    });
  }
  
  return regions;
}

/**
 * Calculate time difference between two timezones
 */
export function getTimezoneDifference(tz1: string, tz2: string): {
  hours: number;
  minutes: number;
  description: string;
} {
  const info1 = getTimezoneInfo(tz1);
  const info2 = getTimezoneInfo(tz2);
  
  const diffHours = info2.offset - info1.offset;
  const hours = Math.floor(Math.abs(diffHours));
  const minutes = Math.round((Math.abs(diffHours) - hours) * 60);
  
  let description: string;
  if (diffHours === 0) {
    description = 'Same timezone';
  } else if (diffHours > 0) {
    description = `${hours}h ${minutes}m ahead`;
  } else {
    description = `${hours}h ${minutes}m behind`;
  }
  
  return { hours, minutes, description };
}

/**
 * Parse a time string with timezone
 */
export function parseTimeWithTimezone(
  dateStr: string,
  timeStr: string,
  timezone: string
): Date {
  // Parse date components
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  
  // Create date in the specified timezone
  const date = new Date(year, month - 1, day, hour, minute);
  
  // Adjust for timezone offset
  const targetOffset = getOffsetMinutes(date, timezone);
  const localOffset = date.getTimezoneOffset() * -1;
  const adjustment = localOffset - targetOffset;
  
  date.setMinutes(date.getMinutes() + adjustment);
  
  return date;
}

export default {
  getTimezoneInfo,
  convertTimezone,
  formatInTimezone,
  formatDateTimeWithTZ,
  isWithinBusinessHours,
  getNextBusinessDay,
  generateTimeSlots,
  detectUserTimezone,
  getTimezonesByRegion,
  getTimezoneDifference,
  parseTimeWithTimezone,
  COMMON_TIMEZONES,
};

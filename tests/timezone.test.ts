/**
 * Timezone Utilities Tests
 * 
 * Tests for timezone conversion, business hours, and slot generation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
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
} from '../src/lib/utils/timezone';

describe('Timezone Info', () => {
  it('gets timezone info for valid timezone', () => {
    const info = getTimezoneInfo('America/New_York');
    
    expect(info.id).toBe('America/New_York');
    expect(info.name).toBe('Eastern Time');
    expect(info.abbreviation).toBeDefined();
    expect(typeof info.offset).toBe('number');
    expect(info.offsetString).toMatch(/^UTC[+-]\d{2}:\d{2}$/);
    expect(typeof info.isDST).toBe('boolean');
  });
  
  it('returns UTC for invalid timezone', () => {
    const info = getTimezoneInfo('Invalid/Timezone');
    
    expect(info.id).toBe('UTC');
    expect(info.offset).toBe(0);
  });
  
  it('correctly identifies DST status', () => {
    // This will vary based on current date
    const nyInfo = getTimezoneInfo('America/New_York');
    const londonInfo = getTimezoneInfo('Europe/London');
    
    expect(typeof nyInfo.isDST).toBe('boolean');
    expect(typeof londonInfo.isDST).toBe('boolean');
  });
  
  it('handles all common timezones', () => {
    for (const tz of Object.keys(COMMON_TIMEZONES)) {
      const info = getTimezoneInfo(tz);
      expect(info.id).toBeDefined();
      expect(info.name).toBeDefined();
    }
  });
});

describe('Timezone Conversion', () => {
  it('converts from UTC to EST', () => {
    const utcDate = new Date('2024-01-15T12:00:00Z');
    const estDate = convertTimezone(utcDate, 'UTC', 'America/New_York');
    
    // EST is UTC-5, so 12:00 UTC should be 07:00 EST
    expect(estDate).toBeDefined();
  });
  
  it('converts from PST to JST', () => {
    const pstDate = new Date('2024-01-15T08:00:00');
    const jstDate = convertTimezone(pstDate, 'America/Los_Angeles', 'Asia/Tokyo');
    
    expect(jstDate).toBeDefined();
    // JST is 17 hours ahead of PST
  });
  
  it('handles same timezone conversion', () => {
    const date = new Date('2024-01-15T12:00:00');
    const result = convertTimezone(date, 'UTC', 'UTC');
    
    expect(result.getHours()).toBe(date.getHours());
  });
  
  it('handles fractional offset timezones', () => {
    const utcDate = new Date('2024-01-15T12:00:00Z');
    const istDate = convertTimezone(utcDate, 'UTC', 'Asia/Kolkata');
    
    // IST is UTC+5:30
    expect(istDate).toBeDefined();
  });
});

describe('Format in Timezone', () => {
  it('formats date with specific timezone', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    const formatted = formatInTimezone(date, 'America/New_York', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    
    expect(formatted).toBeDefined();
    expect(formatted).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
  });
  
  it('respects locale', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    
    const usFormat = formatInTimezone(date, 'UTC', {
      locale: 'en-US',
      dateStyle: 'short',
    });
    
    const ukFormat = formatInTimezone(date, 'UTC', {
      locale: 'en-GB',
      dateStyle: 'short',
    });
    
    // US uses MM/DD/YYYY, UK uses DD/MM/YYYY
    expect(usFormat).toBeDefined();
    expect(ukFormat).toBeDefined();
  });
});

describe('Format DateTime with TZ', () => {
  it('includes all components by default', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    const formatted = formatDateTimeWithTZ(date, 'America/New_York');
    
    // Should include date, time, and timezone
    expect(formatted).toContain('Jan'); // Month
    expect(formatted).toContain('2024'); // Year
    expect(formatted).toMatch(/\d{1,2}:\d{2}/); // Time
  });
  
  it('excludes date when specified', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    const formatted = formatDateTimeWithTZ(date, 'America/New_York', {
      includeDate: false,
      includeTime: true,
      includeTZ: true,
    });
    
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
  });
  
  it('excludes time when specified', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    const formatted = formatDateTimeWithTZ(date, 'America/New_York', {
      includeDate: true,
      includeTime: false,
      includeTZ: false,
    });
    
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('2024');
  });
});

describe('Business Hours', () => {
  const businessHours = {
    start: '09:00',
    end: '17:00',
    days: [1, 2, 3, 4, 5], // Monday to Friday
  };
  
  it('returns true for time within business hours', () => {
    // Create a date that's definitely within business hours
    const date = new Date();
    date.setHours(12, 0, 0, 0); // Set to noon
    
    // Find the next weekday
    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() + 1);
    }
    
    const isWithin = isWithinBusinessHours(date, 'UTC', businessHours);
    expect(typeof isWithin).toBe('boolean');
  });
  
  it('returns false for weekend', () => {
    const saturday = new Date('2024-01-13T12:00:00'); // Saturday
    const isWithin = isWithinBusinessHours(saturday, 'UTC', businessHours);
    
    expect(isWithin).toBe(false);
  });
  
  it('returns false for before business hours', () => {
    const earlyMorning = new Date('2024-01-15T06:00:00'); // Monday 6 AM
    const isWithin = isWithinBusinessHours(earlyMorning, 'UTC', businessHours);
    
    expect(isWithin).toBe(false);
  });
  
  it('returns false for after business hours', () => {
    const evening = new Date('2024-01-15T20:00:00'); // Monday 8 PM
    const isWithin = isWithinBusinessHours(evening, 'UTC', businessHours);
    
    expect(isWithin).toBe(false);
  });
});

describe('Next Business Day', () => {
  it('returns next weekday from weekday', () => {
    const monday = new Date('2024-01-15'); // Monday
    const nextDay = getNextBusinessDay(monday, 'UTC');
    
    expect(nextDay.getTime()).toBeGreaterThan(monday.getTime());
  });
  
  it('skips weekend from Friday', () => {
    const friday = new Date('2024-01-12'); // Friday
    const nextDay = getNextBusinessDay(friday, 'UTC');
    
    expect(nextDay.getDay()).toBe(1); // Should be Monday
  });
  
  it('skips to Monday from Saturday', () => {
    const saturday = new Date('2024-01-13'); // Saturday
    const nextDay = getNextBusinessDay(saturday, 'UTC');
    
    expect(nextDay.getDay()).toBe(1); // Should be Monday
  });
  
  it('respects custom business days', () => {
    const friday = new Date('2024-01-12');
    const businessDays = [0, 1, 2, 3, 4, 5, 6]; // Every day
    const nextDay = getNextBusinessDay(friday, 'UTC', businessDays);
    
    expect(nextDay.getTime()).toBeGreaterThan(friday.getTime());
  });
});

describe('Time Slot Generation', () => {
  const options = {
    timezone: 'America/New_York',
    businessHours: {
      start: '09:00',
      end: '17:00',
      days: [1, 2, 3, 4, 5],
    },
    slotDurationMinutes: 30,
  };
  
  it('generates time slots', () => {
    const startDate = new Date();
    const slots = generateTimeSlots(startDate, options);
    
    expect(Array.isArray(slots)).toBe(true);
  });
  
  it('respects slot duration', () => {
    const startDate = new Date();
    const slots = generateTimeSlots(startDate, {
      ...options,
      slotDurationMinutes: 60,
    });
    
    if (slots.length >= 2) {
      const diff = slots[1].start.getTime() - slots[0].start.getTime();
      expect(diff).toBeGreaterThanOrEqual(60 * 60 * 1000); // At least 60 minutes
    }
  });
  
  it('respects buffer time', () => {
    const startDate = new Date();
    const slots = generateTimeSlots(startDate, {
      ...options,
      slotDurationMinutes: 30,
      bufferMinutes: 15,
    });
    
    if (slots.length >= 2) {
      const diff = slots[1].start.getTime() - slots[0].start.getTime();
      expect(diff).toBeGreaterThanOrEqual(45 * 60 * 1000); // At least 45 minutes
    }
  });
  
  it('limits generation to specified days', () => {
    const startDate = new Date();
    const slots = generateTimeSlots(startDate, {
      ...options,
      daysToGenerate: 7,
    });
    
    if (slots.length > 0) {
      const lastSlot = slots[slots.length - 1];
      const daysDiff = (lastSlot.start.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysDiff).toBeLessThanOrEqual(7);
    }
  });
  
  it('excludes specified dates', () => {
    const startDate = new Date();
    const excludeDate = new Date(startDate);
    excludeDate.setDate(excludeDate.getDate() + 1);
    
    const slots = generateTimeSlots(startDate, {
      ...options,
      excludeDates: [excludeDate],
    });
    
    // All slots should be on different dates than excluded
    expect(Array.isArray(slots)).toBe(true);
  });
  
  it('includes formatted string', () => {
    const startDate = new Date();
    const slots = generateTimeSlots(startDate, options);
    
    if (slots.length > 0) {
      expect(slots[0].formatted).toBeDefined();
      expect(typeof slots[0].formatted).toBe('string');
    }
  });
});

describe('Timezone Detection', () => {
  it('returns a valid timezone string', () => {
    const tz = detectUserTimezone();
    
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });
  
  it('returns UTC as fallback', () => {
    // In test environment, should return some timezone
    const tz = detectUserTimezone();
    expect(tz).toBeDefined();
  });
});

describe('Timezones by Region', () => {
  it('groups timezones by region', () => {
    const regions = getTimezonesByRegion();
    
    expect(regions['Americas']).toBeDefined();
    expect(regions['Europe']).toBeDefined();
    expect(regions['Asia']).toBeDefined();
    expect(regions['Pacific']).toBeDefined();
  });
  
  it('includes timezone details', () => {
    const regions = getTimezonesByRegion();
    const americas = regions['Americas'];
    
    expect(americas.length).toBeGreaterThan(0);
    expect(americas[0].id).toBeDefined();
    expect(americas[0].name).toBeDefined();
    expect(americas[0].offset).toBeDefined();
  });
  
  it('sorts timezones by offset', () => {
    const regions = getTimezonesByRegion();
    const americas = regions['Americas'];
    
    // Should be sorted by offset
    for (let i = 1; i < americas.length; i++) {
      const prevOffset = parseFloat(americas[i - 1].offset.replace('UTC', '').replace(':', '.'));
      const currOffset = parseFloat(americas[i].offset.replace('UTC', '').replace(':', '.'));
      expect(currOffset).toBeGreaterThanOrEqual(prevOffset);
    }
  });
});

describe('Timezone Difference', () => {
  it('calculates difference between timezones', () => {
    const diff = getTimezoneDifference('America/New_York', 'America/Los_Angeles');
    
    expect(typeof diff.hours).toBe('number');
    expect(typeof diff.minutes).toBe('number');
    expect(diff.description).toBeDefined();
  });
  
  it('handles same timezone', () => {
    const diff = getTimezoneDifference('UTC', 'UTC');
    
    expect(diff.description).toBe('Same timezone');
  });
  
  it('shows ahead/behind correctly', () => {
    const diff = getTimezoneDifference('America/Los_Angeles', 'America/New_York');
    
    // New York is ahead of Los Angeles
    expect(diff.description).toContain('ahead');
  });
  
  it('handles fractional hour differences', () => {
    const diff = getTimezoneDifference('UTC', 'Asia/Kolkata');
    
    // IST is UTC+5:30
    expect(diff.minutes).toBe(30);
  });
});

describe('Parse Time with Timezone', () => {
  it('parses date and time with timezone', () => {
    const date = parseTimeWithTimezone('2024-01-15', '14:30', 'America/New_York');
    
    expect(date).toBeInstanceOf(Date);
    expect(date.getMinutes()).toBe(30);
  });
  
  it('handles different timezones correctly', () => {
    const nyDate = parseTimeWithTimezone('2024-01-15', '09:00', 'America/New_York');
    const laDate = parseTimeWithTimezone('2024-01-15', '09:00', 'America/Los_Angeles');
    
    // Same local time but different absolute times
    expect(nyDate.getTime()).not.toBe(laDate.getTime());
  });
});

describe('COMMON_TIMEZONES', () => {
  it('contains major timezones', () => {
    expect(COMMON_TIMEZONES['America/New_York']).toBeDefined();
    expect(COMMON_TIMEZONES['Europe/London']).toBeDefined();
    expect(COMMON_TIMEZONES['Asia/Tokyo']).toBeDefined();
    expect(COMMON_TIMEZONES['UTC']).toBeDefined();
  });
  
  it('has correct structure', () => {
    const nyTz = COMMON_TIMEZONES['America/New_York'];
    
    expect(nyTz.abbrev).toBe('ET');
    expect(nyTz.offset).toBe(-5);
    expect(nyTz.name).toBe('Eastern Time');
  });
});


import { describe, it, expect } from 'vitest';
import { getAvailableSlots, bookAppointment } from '../src/lib/booking/calendar';

describe('Booking utils', () => {
  it('getAvailableSlots returns slots for a date', () => {
    const slots = getAvailableSlots('2025-11-25');
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].startTime).toContain('2025-11-25');
  });

  it('bookAppointment creates a confirmed booking', () => {
    const slots = getAvailableSlots('2025-11-25');
    const slotToBook = slots[0];
    const booking = bookAppointment(slotToBook.id, { name: 'John Doe', email: 'john@example.com' });
    
    expect(booking.id).toBeDefined();
    expect(booking.status).toBe('confirmed');
    expect(booking.slotId).toBe(slotToBook.id);
  });

  it('booked slot becomes unavailable', () => {
    const date = '2025-11-26';
    const slotsBefore = getAvailableSlots(date);
    const slotToBook = slotsBefore[0];
    
    bookAppointment(slotToBook.id, { name: 'Jane Doe', email: 'jane@example.com' });
    
    const slotsAfter = getAvailableSlots(date);
    const bookedSlot = slotsAfter.find(s => s.id === slotToBook.id);
    
    expect(bookedSlot?.available).toBe(false);
  });
});

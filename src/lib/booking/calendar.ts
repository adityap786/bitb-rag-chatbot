
/**
 * Booking & Calendar Management System
 * 
 * PRODUCTION NOTES:
 * - Currently uses in-memory storage for demo purposes
 * - TODO: Replace with Supabase/Postgres for production
 * - TODO: Add tenant isolation (multi-tenancy)
 * - TODO: Implement Redis caching for high-traffic scenarios
 * - TODO: Add timezone support
 */

export interface TimeSlot {
  id: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  available: boolean;
  tenantId?: string; // For multi-tenant isolation
}

export interface Booking {
  id: string;
  slotId: string;
  userId?: string;
  userName: string;
  userEmail: string;
  status: 'confirmed' | 'cancelled' | 'pending';
  createdAt: string;
  tenantId?: string; // For multi-tenant isolation
}

export class BookingError extends Error {
  constructor(
    message: string,
    public code: 'SLOT_UNAVAILABLE' | 'INVALID_INPUT' | 'DB_ERROR' | 'UNKNOWN',
    public details?: any
  ) {
    super(message);
    this.name = 'BookingError';
  }
}

/**
 * TEMPORARY: In-memory storage
 * WARNING: Data will be lost on server restart
 * Replace with persistent database in production
 */
const BOOKINGS: Booking[] = [];

/**
 * Get available time slots for a given date
 * 
 * @param date - Date in ISO format (YYYY-MM-DD)
 * @param options - Configuration options
 * @returns Array of time slots
 * @throws BookingError if date is invalid
 */
export function getAvailableSlots(
  date: string,
  options?: {
    tenantId?: string;
    startHour?: number;
    endHour?: number;
    slotDuration?: number; // in minutes
  }
): TimeSlot[] {
  // Input validation
  if (!date || typeof date !== 'string') {
    throw new BookingError('Date is required', 'INVALID_INPUT');
  }

  const baseDate = new Date(date);
  
  // Validate date
  if (isNaN(baseDate.getTime())) {
    throw new BookingError(`Invalid date format: ${date}`, 'INVALID_INPUT');
  }

  // Don't allow booking in the past
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (baseDate < now) {
    throw new BookingError('Cannot book slots in the past', 'INVALID_INPUT');
  }

  const slots: TimeSlot[] = [];
  const startHour = options?.startHour ?? 9;
  const endHour = options?.endHour ?? 17;
  const slotDuration = options?.slotDuration ?? 60; // Default 1 hour
  
  // Validate hours
  if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 24 || startHour >= endHour) {
    throw new BookingError('Invalid hour range', 'INVALID_INPUT');
  }

  try {
    for (let h = startHour; h < endHour; h++) {
      const startTime = new Date(baseDate);
      startTime.setHours(h, 0, 0, 0);
      
      const endTime = new Date(baseDate);
      endTime.setHours(h, slotDuration, 0, 0);
      
      const slotId = `slot_${startTime.getTime()}`;
      
      // Check if already booked (with tenant isolation)
      const isBooked = BOOKINGS.some(b => 
        b.slotId === slotId && 
        b.status === 'confirmed' &&
        (!options?.tenantId || b.tenantId === options.tenantId)
      );
      
      slots.push({
        id: slotId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        available: !isBooked,
        tenantId: options?.tenantId
      });
    }
    
    return slots;
  } catch (error) {
    throw new BookingError(
      'Failed to generate time slots',
      'DB_ERROR',
      error
    );
  }
}

/**
 * Book an appointment for a specific time slot
 * 
 * @param slotId - ID of the time slot to book
 * @param userDetails - User information
 * @param options - Additional options
 * @returns Confirmed booking
 * @throws BookingError if slot is unavailable or input is invalid
 */
export function bookAppointment(
  slotId: string,
  userDetails: { name: string; email: string; userId?: string },
  options?: { tenantId?: string }
): Booking {
  // Input validation
  if (!slotId || typeof slotId !== 'string') {
    throw new BookingError('Slot ID is required', 'INVALID_INPUT');
  }

  if (!userDetails?.name || !userDetails?.email) {
    throw new BookingError('User name and email are required', 'INVALID_INPUT');
  }

  // Email validation
  const emailRegex = /^[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(userDetails.email)) {
    throw new BookingError('Invalid email format', 'INVALID_INPUT');
  }

  // Check if slot is already booked
  const existingBooking = BOOKINGS.find(b => 
    b.slotId === slotId && 
    b.status === 'confirmed' &&
    (!options?.tenantId || b.tenantId === options.tenantId)
  );

  if (existingBooking) {
    throw new BookingError(
      'This time slot is no longer available',
      'SLOT_UNAVAILABLE',
      { slotId }
    );
  }

  try {
    const booking: Booking = {
      id: `bk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      slotId,
      userId: userDetails.userId,
      userName: userDetails.name.trim(),
      userEmail: userDetails.email.toLowerCase().trim(),
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      tenantId: options?.tenantId
    };
    
    // Atomic operation: push to array
    // TODO: Replace with database transaction in production
    BOOKINGS.push(booking);
    
    return booking;
  } catch (error) {
    throw new BookingError(
      'Failed to create booking',
      'DB_ERROR',
      error
    );
  }
}

/**
 * Cancel a booking
 * 
 * @param bookingId - ID of the booking to cancel
 * @param tenantId - Tenant ID for isolation
 * @returns Cancelled booking
 * @throws BookingError if booking not found
 */
export function cancelBooking(
  bookingId: string,
  tenantId?: string
): Booking {
  if (!bookingId) {
    throw new BookingError('Booking ID is required', 'INVALID_INPUT');
  }

  const booking = BOOKINGS.find(b => 
    b.id === bookingId &&
    (!tenantId || b.tenantId === tenantId)
  );

  if (!booking) {
    throw new BookingError(
      'Booking not found',
      'INVALID_INPUT',
      { bookingId }
    );
  }

  booking.status = 'cancelled';
  return booking;
}

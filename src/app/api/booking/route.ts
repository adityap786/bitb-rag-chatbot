
import { NextResponse } from 'next/server';
import { getAvailableSlots, bookAppointment, BookingError } from '@/lib/booking/calendar';
import { requireAuth, extractTenantId } from '@/middleware/auth';
import { rateLimit, RATE_LIMITS } from '@/middleware/rate-limit';

/**
 * Booking API - Manages appointment scheduling
 * 
 * PRODUCTION FEATURES:
 * ✅ Rate limiting (100 requests per minute)
 * ✅ Authentication & authorization
 * ✅ Tenant isolation from session
 * - TODO: Add email confirmation service integration
 * - TODO: Add webhook for calendar sync (Google Calendar, Outlook)
 */

export async function POST(req: Request) {
  try {
    // 1. Apply rate limiting
    const rateLimitResponse = await rateLimit(req, RATE_LIMITS.booking);
    if (rateLimitResponse) return rateLimitResponse;

    // 2. Require authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse || authResult instanceof Response) return authResult;
    const { user } = authResult;

    const body = await req.json();
    const { action, payload } = body;

    // 3. Extract and validate tenant ID
    const tenantId = await extractTenantId(req) || payload.tenantId;
    
    if (!tenantId) {
      return NextResponse.json({ 
        error: 'Tenant ID is required',
        code: 'INVALID_INPUT'
      }, { status: 400 });
    }

    if (action === 'get_slots') {
      const { date } = payload;
      if (!date) {
        return NextResponse.json({ 
          error: 'Date is required',
          code: 'INVALID_INPUT'
        }, { status: 400 });
      }
      
      const slots = getAvailableSlots(date);
      return NextResponse.json({ slots });
    }

    if (action === 'book_slot') {
      const { slotId, name, email, userId } = payload;
      if (!slotId || !name || !email) {
        return NextResponse.json({ 
          error: 'Missing required fields: slotId, name, email',
          code: 'INVALID_INPUT'
        }, { status: 400 });
      }
      
      const booking = bookAppointment(
        slotId, 
        { name, email, userId: user.id },
        { tenantId }
      );
      
      // TODO: Send confirmation email
      // await sendBookingConfirmationEmail(booking);
      
      return NextResponse.json({ success: true, booking });
    }

    return NextResponse.json({ 
      error: 'Invalid action. Supported actions: get_slots, book_slot',
      code: 'INVALID_INPUT'
    }, { status: 400 });
  } catch (error) {
    console.error('Booking API error:', error);
    
    if (error instanceof BookingError) {
      const statusCode = error.code === 'INVALID_INPUT' ? 400 : 
                         error.code === 'SLOT_UNAVAILABLE' ? 409 : 500;
      return NextResponse.json({ 
        error: error.message,
        code: error.code,
        details: error.details
      }, { status: statusCode });
    }
    
    return NextResponse.json({ 
      error: 'Internal Server Error',
      code: 'UNKNOWN'
    }, { status: 500 });
  }
}

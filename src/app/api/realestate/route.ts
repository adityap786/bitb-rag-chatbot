import { NextResponse } from 'next/server';
import { searchProperties, getListingById, scheduleViewing } from '@/lib/realestate/utils';

export async function POST(request: Request) {
  const body = await request.json();
  const { tenantId, action, payload } = body;

  if (action === 'property_search') {
    const query = payload?.query || '';
    const location = payload?.location || undefined;
    const minPrice = payload?.minPrice || undefined;
    const maxPrice = payload?.maxPrice || undefined;
    const bedrooms = payload?.bedrooms || undefined;
    const listings = searchProperties(query, { location, minPrice, maxPrice, bedrooms, limit: 10 });
    return NextResponse.json({ results: listings });
  }

  if (action === 'get_listing') {
    const listingId = payload?.listingId;
    if (!listingId) return NextResponse.json({ error: 'Missing listingId' }, { status: 400 });
    const listing = getListingById(listingId);
    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    return NextResponse.json({ listing });
  }

  if (action === 'schedule_viewing') {
    const listingId = payload?.listingId;
    const dateIso = payload?.date;
    const visitorName = payload?.visitorName;
    if (!listingId || !dateIso) return NextResponse.json({ error: 'Missing listingId or date' }, { status: 400 });
    const result = scheduleViewing(listingId, dateIso, visitorName);
    return NextResponse.json(result);
  }

  if (action === 'privacy_controls') {
    return NextResponse.json({ privacyLevel: 'high', controls: ['mask_contact_info', 'audit_log'], retentionDays: 30 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

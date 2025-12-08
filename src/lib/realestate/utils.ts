// Real estate utilities: property search, listing fetch, scheduling stub

export interface PropertyListing {
  id: string;
  title: string;
  price: number;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  areaSqFt?: number;
  address?: string;
  description?: string;
  images?: string[];
  source?: string;
}

export function searchProperties(query: string, options?: { location?: string; minPrice?: number; maxPrice?: number; bedrooms?: number; limit?: number; }): PropertyListing[] {
  // Stubbed search: return mocked results based on query/filters
  const limit = options?.limit || 5;
  const baseResults: PropertyListing[] = Array.from({ length: limit }).map((_, i) => ({
    id: `prop-${Date.now()}-${i}`,
    title: `${options?.location || 'Sample City'} ${query} - ${i + 1}BR Apartment`,
    price: (options?.minPrice || 1000) + (i * 250),
    currency: 'USD',
    bedrooms: options?.bedrooms || (i % 3) + 1,
    bathrooms: 1 + (i % 2),
    areaSqFt: 500 + i * 120,
    address: `${i + 1} Demo St, ${options?.location || 'Sample City'}`,
    description: `Mock listing for ${query} in ${options?.location || 'Sample City'}.`,
    images: [],
    source: 'mock'
  }));

  return baseResults;
}

export function getListingById(listingId: string): PropertyListing | null {
  if (!listingId) return null;
  // Return a mocked detailed listing
  return {
    id: listingId,
    title: `Detailed Listing ${listingId}`,
    price: 2500,
    currency: 'USD',
    bedrooms: 2,
    bathrooms: 2,
    areaSqFt: 950,
    address: '123 Example Ave, Demo City',
    description: 'This is a mocked detailed listing used for demo and testing.',
    images: [],
    source: 'mock'
  };
}

export function scheduleViewing(listingId: string, dateIso: string, visitorName?: string) {
  // Stub: simulate scheduling and return a confirmation
  const appointmentId = `view-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  return {
    success: true,
    appointmentId,
    message: `Viewing scheduled for listing ${listingId} on ${dateIso} for ${visitorName || 'Guest'}`
  };
}

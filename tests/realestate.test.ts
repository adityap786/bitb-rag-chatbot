import { describe, it, expect } from 'vitest';
import { searchProperties, getListingById, scheduleViewing } from '@/lib/realestate/utils';

describe('RealEstate utils', () => {
  it('searchProperties returns an array of listings', () => {
    const results = searchProperties('2 bedroom', { location: 'Demo City', minPrice: 1000, maxPrice: 5000, bedrooms: 2, limit: 3 });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('id');
    expect(results[0]).toHaveProperty('title');
  });

  it('getListingById returns a listing with matching id', () => {
    const id = 'prop-123';
    const listing = getListingById(id);
    expect(listing).not.toBeNull();
    expect(listing!.id).toBe(id);
  });

  it('scheduleViewing returns success and appointmentId', () => {
    const res = scheduleViewing('prop-abc', new Date().toISOString(), 'Tester');
    expect(res).toHaveProperty('success');
    expect(res.success).toBe(true);
    expect(res).toHaveProperty('appointmentId');
  });
});

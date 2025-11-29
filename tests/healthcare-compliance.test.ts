import { describe, it, expect } from 'vitest';
import { detectAndMaskPHI, isHIPAACompliant } from '../src/lib/healthcare/compliance';

describe('Healthcare Compliance Utils', () => {
  it('should detect and mask email addresses', () => {
    const text = 'Contact me at john.doe@example.com for details.';
    const { detected, types, maskedText } = detectAndMaskPHI(text);
    
    expect(detected).toBe(true);
    expect(types).toContain('email');
    expect(maskedText).toBe('Contact me at [EMAIL_REDACTED] for details.');
  });

  it('should detect and mask phone numbers', () => {
    const text = 'My number is 555-123-4567.';
    const { detected, types, maskedText } = detectAndMaskPHI(text);
    
    expect(detected).toBe(true);
    expect(types).toContain('phone');
    expect(maskedText).toBe('My number is [PHONE_REDACTED].');
  });

  it('should detect and mask SSNs', () => {
    const text = 'SSN: 123-45-6789';
    const { detected, types, maskedText } = detectAndMaskPHI(text);
    
    expect(detected).toBe(true);
    expect(types).toContain('ssn');
    expect(maskedText).toBe('SSN: [SSN_REDACTED]');
  });

  it('should return false for isHIPAACompliant if PHI is detected', () => {
    const text = 'My email is test@test.com';
    expect(isHIPAACompliant(text)).toBe(false);
  });

  it('should return true for isHIPAACompliant if no PHI is detected', () => {
    const text = 'I have a headache.';
    expect(isHIPAACompliant(text)).toBe(true);
  });

  it('should handle empty strings', () => {
    const { detected, maskedText } = detectAndMaskPHI('');
    expect(detected).toBe(false);
    expect(maskedText).toBe('');
  });
});

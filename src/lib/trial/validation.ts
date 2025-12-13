/**
 * Input validation utilities for trial system
 */

import { ValidationError } from './errors';

// Email validation - RFC 5322 simplified
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRICT_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Hex color validation
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

// URL validation
const URL_REGEX = /^https?:\/\/.+/;

// Business types
export const VALID_BUSINESS_TYPES = ['service', 'ecommerce', 'saas', 'other'] as const;
export type BusinessType = (typeof VALID_BUSINESS_TYPES)[number];

// Chat tones
export const VALID_CHAT_TONES = ['professional', 'friendly', 'casual'] as const;
export type ChatTone = (typeof VALID_CHAT_TONES)[number];

// Status values (includes pipeline states)
export const VALID_STATUSES = ['pending', 'processing', 'ready', 'failed', 'active', 'expired', 'upgraded', 'cancelled'] as const;
export type TrialStatus = (typeof VALID_STATUSES)[number];

// RAG statuses (subset for backward compatibility)
export const VALID_RAG_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type RAGStatus = (typeof VALID_RAG_STATUSES)[number];

/**
 * Validate email address
 */
export function validateEmail(email: string): void {
  if (!email || typeof email !== 'string') {
    throw new ValidationError('Email is required and must be a string');
  }

  if (email.length > 255) {
    throw new ValidationError('Email must be less than 255 characters');
  }

  if (!STRICT_EMAIL_REGEX.test(email)) {
    throw new ValidationError('Invalid email format');
  }

  // Check for common typos in popular domains
  const commonDomains = ['gmail.com', 'yahoo.com', 'outlook.com'];
  const domain = email.split('@')[1];
  const commonTypos: Record<string, string> = {
    'gmial.com': 'gmail.com',
    'gmai.com': 'gmail.com',
    'yahooo.com': 'yahoo.com',
    'outlok.com': 'outlook.com',
  };

  if (domain && commonTypos[domain]) {
    throw new ValidationError(`Did you mean ${email.replace(domain, commonTypos[domain])}?`);
  }
}

/**
 * Validate business name
 */
export function validateBusinessName(name: string): void {
  if (!name || typeof name !== 'string') {
    throw new ValidationError('Business name is required and must be a string');
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('Business name cannot be empty');
  }

  if (trimmed.length < 2) {
    throw new ValidationError('Business name must be at least 2 characters');
  }

  if (trimmed.length > 255) {
    throw new ValidationError('Business name must not exceed 255 characters');
  }

  // Check for potentially malicious input
  if (/<[^>]*>/g.test(trimmed)) {
    throw new ValidationError('Business name cannot contain HTML tags');
  }
}

/**
 * Validate business type
 */
export function validateBusinessType(type: unknown): asserts type is BusinessType {
  if (!VALID_BUSINESS_TYPES.includes(type as any)) {
    throw new ValidationError(`Invalid business type. Must be one of: ${VALID_BUSINESS_TYPES.join(', ')}`);
  }
}

/**
 * Validate hex color
 */
export function validateHexColor(color: string): void {
  if (!color || typeof color !== 'string') {
    throw new ValidationError('Color must be a string');
  }

  if (!HEX_COLOR_REGEX.test(color)) {
    throw new ValidationError('Color must be valid hex format (e.g., #6366f1)');
  }
}

/**
 * Validate chat tone
 */
export function validateChatTone(tone: unknown): asserts tone is ChatTone {
  if (!VALID_CHAT_TONES.includes(tone as any)) {
    throw new ValidationError(`Invalid chat tone. Must be one of: ${VALID_CHAT_TONES.join(', ')}`);
  }
}

/**
 * Validate welcome message
 */
export function validateWelcomeMessage(message: string): void {
  if (typeof message !== 'string') {
    throw new ValidationError('Welcome message must be a string');
  }

  if (message.length > 500) {
    throw new ValidationError('Welcome message must not exceed 500 characters');
  }

  if (message.trim().length === 0) {
    throw new ValidationError('Welcome message cannot be empty');
  }

  // Check for potentially malicious input
  if (/<[^>]*>/g.test(message)) {
    throw new ValidationError('Welcome message cannot contain HTML tags');
  }
}

/**
 * Validate company info text
 */
export function validateCompanyInfo(info: string, maxLength: number = 10000): void {
  if (!info || typeof info !== 'string') {
    throw new ValidationError('Company information is required and must be a string');
  }

  const trimmed = info.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('Company information cannot be empty');
  }

  if (trimmed.length > maxLength) {
    throw new ValidationError(`Company information must not exceed ${maxLength} characters`);
  }
}

/**
 * Validate FAQ items
 */
export function validateFAQs(faqs: unknown[]): void {
  if (!Array.isArray(faqs)) {
    throw new ValidationError('FAQs must be an array');
  }

  if (faqs.length > 100) {
    throw new ValidationError('Maximum 100 FAQs allowed');
  }

  for (let i = 0; i < faqs.length; i++) {
    const faq = faqs[i];
    if (!faq || typeof faq !== 'object') {
      throw new ValidationError(`FAQ ${i + 1} must be an object`);
    }

    const { question, answer } = faq as any;

    if (!question || typeof question !== 'string') {
      throw new ValidationError(`FAQ ${i + 1}: question is required and must be a string`);
    }

    if (question.length > 500) {
      throw new ValidationError(`FAQ ${i + 1}: question must not exceed 500 characters`);
    }

    if (!answer || typeof answer !== 'string') {
      throw new ValidationError(`FAQ ${i + 1}: answer is required and must be a string`);
    }

    if (answer.length > 2000) {
      throw new ValidationError(`FAQ ${i + 1}: answer must not exceed 2000 characters`);
    }
  }
}

/**
 * Validate URL for crawling
 */
export function validateStartUrl(url: string): void {
  if (!url || typeof url !== 'string') {
    throw new ValidationError('Start URL is required and must be a string');
  }

  if (!URL_REGEX.test(url)) {
    throw new ValidationError('Start URL must begin with http:// or https://');
  }

  if (url.length > 2048) {
    throw new ValidationError('URL must not exceed 2048 characters');
  }

  try {
    new URL(url);
  } catch {
    throw new ValidationError('Invalid URL format');
  }
}

/**
 * Validate crawl parameters
 */
export function validateCrawlParams(maxPages?: number, maxDepth?: number): void {
  if (maxPages !== undefined) {
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
      throw new ValidationError('maxPages must be between 1 and 100');
    }
  }

  if (maxDepth !== undefined) {
    if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 5) {
      throw new ValidationError('maxDepth must be between 1 and 5');
    }
  }
}

/**
 * Validate file upload parameters
 */
export function validateFileParams(
  fileCount: number,
  totalSize: number,
  maxFiles: number = 10,
  maxFileSize: number = 5 * 1024 * 1024,
  maxTotalSize: number = 50 * 1024 * 1024
): void {
  if (fileCount === 0) {
    throw new ValidationError('At least one file is required');
  }

  if (fileCount > maxFiles) {
    throw new ValidationError(`Maximum ${maxFiles} files allowed, got ${fileCount}`);
  }

  if (totalSize > maxTotalSize) {
    throw new ValidationError(`Total upload size (${totalSize} bytes) exceeds limit (${maxTotalSize} bytes)`);
  }
}

/**
 * Validate individual file
 */
export function validateFile(
  filename: string,
  fileSize: number,
  allowedTypes: string[] = ['.pdf', '.txt', '.md', '.docx', '.doc'],
  maxFileSize: number = 5 * 1024 * 1024
): void {
  if (!filename || typeof filename !== 'string') {
    throw new ValidationError('Filename must be a string');
  }

  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));

  if (!allowedTypes.includes(ext)) {
    throw new ValidationError(`File type ${ext} not allowed. Allowed types: ${allowedTypes.join(', ')}`);
  }

  if (fileSize > maxFileSize) {
    throw new ValidationError(
      `File size (${Math.round(fileSize / 1024)} KB) exceeds limit (${Math.round(maxFileSize / 1024)} KB)`
    );
  }
}

/**
 * Sanitize text input (basic XSS prevention)
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize JSON (prevent injection)
 */
export function sanitizeJSON(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeText(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeJSON);
  }

  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip dangerous keys
      if (!key.startsWith('__') && key !== 'constructor') {
        sanitized[key] = sanitizeJSON(value);
      }
    }
    return sanitized;
  }

  return obj;
}

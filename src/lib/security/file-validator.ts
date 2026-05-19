/**
 * File Validator & Sanitizer
 * 
 * Production-grade file validation for document uploads:
 * - Magic byte verification (not just extension)
 * - File size limits
 * - Content sanitization (HTML/SVG)
 * - XPIA prevention (strip embedded scripts/macros)
 * - Filename sanitization (path traversal prevention)
 */

import { logger } from '@/lib/observability/logger';
import crypto from 'crypto';

// ============================================================
// File Type Definitions
// ============================================================

export interface FileValidationResult {
    valid: boolean;
    sanitized: boolean;
    errors: string[];
    warnings: string[];
    fileType: string | null;
    mimeType: string | null;
    sanitizedContent?: Buffer;
    sanitizedFilename: string;
    hash: string;
}

export interface FileValidationOptions {
    /** Maximum file size in bytes */
    maxSizeBytes?: number;
    /** Allowed file types */
    allowedTypes?: AllowedFileType[];
    /** Enable content sanitization */
    sanitizeContent?: boolean;
    /** Check for embedded scripts/macros (XPIA prevention) */
    checkXPIA?: boolean;
    /** Custom filename prefix */
    filenamePrefix?: string;
}

export type AllowedFileType = 'pdf' | 'docx' | 'txt' | 'html' | 'md' | 'csv' | 'json';

// ============================================================
// Magic Bytes (File Signatures)
// ============================================================

const MAGIC_BYTES: Record<string, { bytes: number[]; offset?: number }[]> = {
    // PDF: %PDF
    pdf: [{ bytes: [0x25, 0x50, 0x44, 0x46] }],

    // DOCX/XLSX/PPTX: PK (ZIP format)
    docx: [{ bytes: [0x50, 0x4B, 0x03, 0x04] }],
    xlsx: [{ bytes: [0x50, 0x4B, 0x03, 0x04] }],
    pptx: [{ bytes: [0x50, 0x4B, 0x03, 0x04] }],

    // DOC (legacy): Microsoft Compound Document
    doc: [{ bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] }],

    // Plain text files (no magic bytes, validated by content)
    txt: [],
    md: [],
    csv: [],
    json: [],
    html: [],
};

// MIME types mapping
const MIME_TYPES: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    html: 'text/html',
};

// ============================================================
// Magic Byte Validation
// ============================================================

/**
 * Verify file magic bytes match expected type
 */
function verifyMagicBytes(content: Buffer, expectedType: string): boolean {
    const signatures = MAGIC_BYTES[expectedType];

    if (!signatures || signatures.length === 0) {
        // Text-based files don't have magic bytes
        return true;
    }

    for (const sig of signatures) {
        const offset = sig.offset || 0;
        let matches = true;

        for (let i = 0; i < sig.bytes.length; i++) {
            if (content[offset + i] !== sig.bytes[i]) {
                matches = false;
                break;
            }
        }

        if (matches) return true;
    }

    return false;
}

/**
 * Detect file type from magic bytes
 */
function detectFileType(content: Buffer): string | null {
    for (const [type, signatures] of Object.entries(MAGIC_BYTES)) {
        if (signatures.length === 0) continue;

        for (const sig of signatures) {
            const offset = sig.offset || 0;
            let matches = true;

            for (let i = 0; i < sig.bytes.length; i++) {
                if (content[offset + i] !== sig.bytes[i]) {
                    matches = false;
                    break;
                }
            }

            if (matches) return type;
        }
    }

    // Try to detect text-based formats
    const textContent = content.toString('utf8', 0, Math.min(content.length, 1000));

    if (textContent.trim().startsWith('{') || textContent.trim().startsWith('[')) {
        try {
            JSON.parse(content.toString('utf8'));
            return 'json';
        } catch { /* not valid JSON */ }
    }

    if (textContent.includes('<!DOCTYPE html') || textContent.includes('<html')) {
        return 'html';
    }

    // Check for CSV pattern
    const lines = textContent.split('\n').slice(0, 5);
    const commaCount = lines.map(l => (l.match(/,/g) || []).length);
    if (commaCount.length >= 2 && commaCount[0] > 0 && commaCount.every(c => c === commaCount[0])) {
        return 'csv';
    }

    // Check for markdown
    if (textContent.includes('# ') || textContent.includes('## ') || textContent.includes('```')) {
        return 'md';
    }

    // Default to plain text if it's valid UTF-8
    if (isValidUtf8(content)) {
        return 'txt';
    }

    return null;
}

/**
 * Check if buffer contains valid UTF-8 text
 */
function isValidUtf8(buffer: Buffer): boolean {
    try {
        const text = buffer.toString('utf8');
        // Check for control characters (except newline, tab, carriage return)
        const controlCharsRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
        return !controlCharsRegex.test(text.substring(0, Math.min(text.length, 10000)));
    } catch {
        return false;
    }
}

// ============================================================
// Filename Sanitization
// ============================================================

/**
 * Sanitize filename to prevent path traversal and other attacks
 */
export function sanitizeFilename(filename: string, prefix?: string): string {
    // Remove path components
    let sanitized = filename.replace(/^.*[\\\/]/, '');

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Remove path traversal attempts
    sanitized = sanitized.replace(/\.\./g, '');
    sanitized = sanitized.replace(/^\.+/, '');

    // Replace dangerous characters
    sanitized = sanitized.replace(/[<>:"/\\|?*]/g, '_');

    // Limit length
    const ext = sanitized.split('.').pop() || '';
    const name = sanitized.slice(0, sanitized.length - ext.length - 1);
    const truncatedName = name.slice(0, 100);

    // Add prefix if provided
    const finalName = prefix
        ? `${prefix}_${truncatedName}.${ext}`
        : `${truncatedName}.${ext}`;

    // Ensure filename is not empty
    return finalName || `file_${Date.now()}.bin`;
}

// ============================================================
// Content Sanitization
// ============================================================

/**
 * Sanitize HTML content - remove scripts, event handlers, etc.
 */
function sanitizeHtml(content: string): string {
    let sanitized = content;

    // Remove script tags and content
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove style tags with dangerous content
    sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, (match) => {
        // Remove expression(), javascript:, etc.
        if (/expression\s*\(|javascript:|behavior:/i.test(match)) {
            return '';
        }
        return match;
    });

    // Remove event handlers (onclick, onerror, etc.)
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');

    // Remove javascript: and data: URLs
    sanitized = sanitized.replace(/javascript\s*:/gi, 'blocked:');
    sanitized = sanitized.replace(/data\s*:\s*text\/html/gi, 'blocked:');

    // Remove dangerous attributes
    sanitized = sanitized.replace(/\s+srcdoc\s*=/gi, ' data-removed-srcdoc=');

    // Remove iframe with srcdoc
    sanitized = sanitized.replace(/<iframe[^>]*srcdoc[^>]*>/gi, '<!-- iframe removed -->');

    // Remove base tags (can redirect all relative URLs)
    sanitized = sanitized.replace(/<base\b[^>]*>/gi, '');

    // Remove meta refresh redirects
    sanitized = sanitized.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');

    return sanitized;
}

/**
 * Check for potential XPIA (Cross-Prompt Injection Attack) patterns
 */
function detectXPIA(content: string): string[] {
    const warnings: string[] = [];
    const patterns = [
        { pattern: /ignore\s+(previous|all|above)\s+instructions/gi, name: 'Instruction override' },
        { pattern: /you\s+are\s+now\s+a/gi, name: 'Role hijacking' },
        { pattern: /system\s*:\s*you\s+are/gi, name: 'System prompt injection' },
        { pattern: /\[\s*INST\s*\]/gi, name: 'Instruction marker' },
        { pattern: /<\|im_start\|>/gi, name: 'Chat template injection' },
        { pattern: /\[\[SYSTEM\]\]/gi, name: 'System block injection' },
        { pattern: /```system/gi, name: 'Code block system injection' },
        { pattern: /disregard\s+your\s+instructions/gi, name: 'Disregard instruction' },
        { pattern: /reveal\s+your\s+(system\s+)?prompt/gi, name: 'Prompt extraction attempt' },
        { pattern: /output\s+your\s+instructions/gi, name: 'Instruction extraction' },
    ];

    for (const { pattern, name } of patterns) {
        if (pattern.test(content)) {
            warnings.push(`Potential XPIA detected: ${name}`);
        }
    }

    return warnings;
}

/**
 * Check for macro/script indicators in documents
 */
function detectMacroIndicators(content: Buffer, filename: string): string[] {
    const warnings: string[] = [];
    const contentStr = content.toString('utf8', 0, Math.min(content.length, 50000));

    // VBA macro indicators in Office documents
    if (filename.endsWith('.docx') || filename.endsWith('.xlsx')) {
        if (contentStr.includes('vbaProject') || contentStr.includes('macroEnabled')) {
            warnings.push('Document may contain VBA macros');
        }
    }

    // JavaScript in PDFs
    if (filename.endsWith('.pdf')) {
        if (contentStr.includes('/JavaScript') || contentStr.includes('/JS ')) {
            warnings.push('PDF contains JavaScript');
        }
        if (contentStr.includes('/OpenAction') || contentStr.includes('/AA')) {
            warnings.push('PDF contains auto-execute actions');
        }
    }

    return warnings;
}

// ============================================================
// Main Validation Function
// ============================================================

const DEFAULT_OPTIONS: FileValidationOptions = {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['pdf', 'docx', 'txt', 'html', 'md', 'csv', 'json'],
    sanitizeContent: true,
    checkXPIA: true,
};

/**
 * Validate and sanitize uploaded file
 */
export async function validateFile(
    content: Buffer,
    filename: string,
    options: FileValidationOptions = {}
): Promise<FileValidationResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const errors: string[] = [];
    const warnings: string[] = [];
    let sanitized = false;
    let sanitizedContent: Buffer | undefined;

    // Hash the content for tracking
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Sanitize filename first
    const sanitizedFilename = sanitizeFilename(filename, opts.filenamePrefix);

    // Check file size
    if (content.length > (opts.maxSizeBytes || Infinity)) {
        errors.push(`File size ${content.length} exceeds maximum ${opts.maxSizeBytes} bytes`);
    }

    // Detect file type from content
    const detectedType = detectFileType(content);
    const declaredExt = filename.split('.').pop()?.toLowerCase();

    // Verify type is allowed
    if (opts.allowedTypes && detectedType && !opts.allowedTypes.includes(detectedType as AllowedFileType)) {
        errors.push(`File type '${detectedType}' is not allowed. Allowed: ${opts.allowedTypes.join(', ')}`);
    }

    // Check for type mismatch (potential attack)
    if (detectedType && declaredExt && detectedType !== declaredExt) {
        // Some mismatches are acceptable (e.g., txt/md)
        const acceptableMismatches = [
            ['txt', 'md'],
            ['txt', 'csv'],
        ];
        const isAcceptable = acceptableMismatches.some(
            pair => pair.includes(detectedType) && pair.includes(declaredExt)
        );

        if (!isAcceptable && detectedType !== 'txt') {
            warnings.push(`File extension '${declaredExt}' does not match detected type '${detectedType}'`);
        }
    }

    // Verify magic bytes for binary files
    if (detectedType && ['pdf', 'docx', 'doc'].includes(detectedType)) {
        if (!verifyMagicBytes(content, detectedType)) {
            errors.push(`File content does not match expected ${detectedType} format`);
        }
    }

    // Check for macro/script indicators
    const macroWarnings = detectMacroIndicators(content, filename);
    warnings.push(...macroWarnings);

    // Sanitize content if enabled
    if (opts.sanitizeContent && detectedType) {
        if (detectedType === 'html') {
            const originalContent = content.toString('utf8');
            const sanitizedHtml = sanitizeHtml(originalContent);
            if (sanitizedHtml !== originalContent) {
                sanitizedContent = Buffer.from(sanitizedHtml, 'utf8');
                sanitized = true;
                warnings.push('HTML content was sanitized (scripts/event handlers removed)');
            }
        }
    }

    // Check for XPIA in text content
    if (opts.checkXPIA && detectedType) {
        const textTypes = ['txt', 'md', 'html', 'json', 'csv'];
        if (textTypes.includes(detectedType)) {
            const xpiaWarnings = detectXPIA(content.toString('utf8'));
            warnings.push(...xpiaWarnings);
        }
    }

    const result: FileValidationResult = {
        valid: errors.length === 0,
        sanitized,
        errors,
        warnings,
        fileType: detectedType,
        mimeType: detectedType ? MIME_TYPES[detectedType] || 'application/octet-stream' : null,
        sanitizedContent: sanitizedContent || content,
        sanitizedFilename,
        hash,
    };

    // Log validation result
    logger.info('File validation completed', {
        filename: sanitizedFilename,
        originalFilename: filename,
        fileType: detectedType,
        size: content.length,
        valid: result.valid,
        sanitized: result.sanitized,
        errorsCount: errors.length,
        warningsCount: warnings.length,
        hash: hash.substring(0, 16),
    });

    if (!result.valid) {
        logger.warn('File validation failed', {
            filename,
            errors,
            warnings,
        });
    }

    return result;
}

/**
 * Validate base64-encoded file (for API uploads)
 */
export async function validateBase64File(
    base64Content: string,
    filename: string,
    options: FileValidationOptions = {}
): Promise<FileValidationResult> {
    try {
        // Remove data URL prefix if present
        const base64Data = base64Content.replace(/^data:[^;]+;base64,/, '');
        const content = Buffer.from(base64Data, 'base64');
        return validateFile(content, filename, options);
    } catch (error) {
        logger.error('Base64 decode error', {
            error: error instanceof Error ? error.message : String(error),
            filename,
        });

        return {
            valid: false,
            sanitized: false,
            errors: ['Invalid base64 content'],
            warnings: [],
            fileType: null,
            mimeType: null,
            sanitizedFilename: sanitizeFilename(filename),
            hash: '',
        };
    }
}

/**
 * Quick check if file extension is allowed (for early rejection)
 */
export function isAllowedExtension(
    filename: string,
    allowedTypes: AllowedFileType[] = DEFAULT_OPTIONS.allowedTypes!
): boolean {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext ? allowedTypes.includes(ext as AllowedFileType) : false;
}

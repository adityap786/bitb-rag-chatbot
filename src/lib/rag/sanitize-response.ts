/**
 * Response Sanitization Utilities
 * 
 * Cleans LLM-generated responses by removing citation markers and
 * normalizing whitespace for display in the chat UI.
 */

/**
 * Removes citation markers like [1], [2], [n] from LLM responses.
 * These markers reference context documents but should not appear in the UI.
 * 
 * @param text - Raw LLM response text
 * @returns Sanitized text with citation markers removed
 * 
 * @example
 * sanitizeCitationMarkers("Based on [1] and [2], the answer is...") 
 * // => "Based on and, the answer is..."
 * 
 * sanitizeCitationMarkers("According to the documentation [3], you should...")
 * // => "According to the documentation, you should..."
 */
export function sanitizeCitationMarkers(text: string): string {
    if (!text) return '';

    // Remove citation markers: [1], [2], [ 3 ], [12], etc.
    let result = text.replace(/\[\s*\d+\s*\]/g, '');

    // Remove [n] placeholder if LLM outputs it literally
    result = result.replace(/\[\s*n\s*\]/gi, '');

    // Clean up resulting double spaces and trim
    result = result.replace(/\s{2,}/g, ' ').trim();

    // Fix punctuation artifacts like ", ," or ". ."
    result = result.replace(/,\s*,/g, ',');
    result = result.replace(/\.\s*\./g, '.');
    result = result.replace(/\s+([,.!?;:])/g, '$1');

    return result;
}

/**
 * Extracts citation indices from text for source linking.
 * Use this when you need to map citations to their sources.
 * 
 * @param text - Raw LLM response text
 * @returns Array of unique citation indices found
 * 
 * @example
 * extractCitationIndices("Based on [1] and [2], see also [1]...")
 * // => [1, 2]
 */
export function extractCitationIndices(text: string): number[] {
    if (!text) return [];

    const matches = text.match(/\[\s*(\d+)\s*\]/g) || [];
    const indices = matches.map(m => {
        const numMatch = m.match(/\d+/);
        return numMatch ? parseInt(numMatch[0], 10) : 0;
    }).filter(n => n > 0);

    // Return unique sorted indices
    return [...new Set(indices)].sort((a, b) => a - b);
}

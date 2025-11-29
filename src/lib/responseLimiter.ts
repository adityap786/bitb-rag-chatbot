/**
 * Response Length Controller for Multi-Tenant RAG Chatbot
 * 
 * This utility provides intelligent character-based response limiting
 * for LLM outputs without affecting tool calls, embeddings, or MCP actions.
 * 
 * Supported Modes:
 * - 250 characters: For brief summaries and comparisons
 * - 450 characters: For moderate-length responses
 * - No limit (default): Full LLM response unchanged
 * 
 * Usage:
 * ```typescript
 * import { formatResponseByCharacterLimit } from '@/lib/responseLimiter';
 * 
 * // Enable 250-character limit
 * const limitedResponse = formatResponseByCharacterLimit(llmOutput, 250);
 * 
 * // Enable 450-character limit
 * const moderateResponse = formatResponseByCharacterLimit(llmOutput, 450);
 * 
 * // No limit (pass undefined or null)
 * const fullResponse = formatResponseByCharacterLimit(llmOutput);
 * ```
 * 
 * Integration:
 * - Add `responseCharacterLimit?: 250 | 450` parameter to RAG query requests
 * - Apply limiter to final LLM text output only, after RAG retrieval and tool execution
 * - Multi-tenant safe: Works across all tenants without affecting isolation or security
 */

export type ResponseCharacterLimit = 250 | 450 | undefined;

/**
 * Trims a text response to the specified character limit without cutting words mid-sentence.
 * Appends an ellipsis if the response was trimmed.
 * 
 * @param text - The full LLM response text
 * @param limit - Character limit (250, 450, or undefined for no limit)
 * @returns Trimmed response with clean word boundaries
 */
export function formatResponseByCharacterLimit(
  text: string,
  limit?: ResponseCharacterLimit
): string {
  // No limit specified or text is already within limit
  if (!limit || text.length <= limit) {
    return text;
  }

  // Find the last complete word boundary before the limit
  let trimIndex: number = limit;
  
  // Move back to find the last space or punctuation before the limit
  while (trimIndex > 0 && !/[\s.,;:!?]/.test(text[trimIndex])) {
    trimIndex--;
  }

  // If we couldn't find a good break point, just use the limit
  if (trimIndex <= 10) {
    trimIndex = limit;
  }

  // Trim and clean up
  let trimmed = text.slice(0, trimIndex).trim();
  
  // Remove trailing punctuation that might look awkward before ellipsis
  trimmed = trimmed.replace(/[,;:]$/, '');
  
  // Add ellipsis to indicate continuation
  return `${trimmed}...`;
}

/**
 * Validates if a given limit value is a supported character limit.
 * 
 * @param limit - The limit value to validate
 * @returns True if the limit is 250 or 450, false otherwise
 */
export function isValidCharacterLimit(limit: any): limit is ResponseCharacterLimit {
  return limit === 250 || limit === 450 || limit === undefined;
}

/**
 * Gets a human-readable description of the current limit mode.
 * 
 * @param limit - The active character limit
 * @returns Description string
 */
export function getLimitDescription(limit?: ResponseCharacterLimit): string {
  if (!limit) return 'No character limit (full response)';
  return `${limit}-character limit (brief ${limit === 250 ? 'summary' : 'response'})`;
}

/**
 * Calculates the effective character reduction from applying a limit.
 * 
 * @param originalLength - Original response length
 * @param limit - Applied character limit
 * @returns Object with reduction stats
 */
export function calculateReduction(
  originalLength: number,
  limit?: ResponseCharacterLimit
): { reduced: boolean; savedChars: number; percentSaved: number } {
  if (!limit || originalLength <= limit) {
    return { reduced: false, savedChars: 0, percentSaved: 0 };
  }

  const savedChars = originalLength - limit;
  const percentSaved = Math.round((savedChars / originalLength) * 100);

  return { reduced: true, savedChars, percentSaved };
}

/**
 * Example usage and test cases
 */
export const ResponseLimiterExamples = {
  basic250: () => {
    const longText = "This is a very long response that would normally exceed our character limit. We want to demonstrate how the limiter works by showing that it intelligently trims at word boundaries and adds an ellipsis to indicate there's more content available. The system should handle this gracefully across all tenants.";
    return formatResponseByCharacterLimit(longText, 250);
  },
  
  basic450: () => {
    const longText = "This is a comprehensive response that provides detailed information about the topic at hand. It includes multiple sentences and covers various aspects of the subject matter. The 450-character limit allows for more context than the 250-character option while still keeping responses concise and manageable. This is particularly useful for moderate-length explanations that need a bit more room to breathe but shouldn't become full essays. The limiter will trim this intelligently.";
    return formatResponseByCharacterLimit(longText, 450);
  },
  
  noLimit: () => {
    const text = "Short response.";
    return formatResponseByCharacterLimit(text); // Returns unchanged
  },
  
  alreadyWithinLimit: () => {
    const text = "This is short.";
    return formatResponseByCharacterLimit(text, 250); // Returns unchanged
  }
};

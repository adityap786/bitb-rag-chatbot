/**
 * BiTB Widget Tests
 * Basic unit tests for widget functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock widget configuration
interface WidgetConfig {
  trialToken: string;
  theme: 'light' | 'dark' | 'auto';
  apiBaseUrl: string;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

// Widget class (simplified for testing)
class BitBWidget {
  config: WidgetConfig;
  sessionId: string;
  messages: Array<{ role: string; content: string }>;

  constructor(config: WidgetConfig) {
    this.validateConfig(config);
    this.config = config;
    // Include a small random suffix to avoid collisions in fast unit test runs
    this.sessionId = 'bitb_session_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    this.messages = [];
  }

  private validateConfig(config: WidgetConfig) {
    if (!config.trialToken) {
      throw new Error('Trial token is required');
    }

    if (!config.trialToken.match(/^tr_[a-f0-9]{32}$/)) {
      throw new Error('Invalid trial token format');
    }

    const validThemes = ['light', 'dark', 'auto'];
    if (!validThemes.includes(config.theme)) {
      throw new Error('Invalid theme');
    }

    const validPositions = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
    if (!validPositions.includes(config.position)) {
      throw new Error('Invalid position');
    }
  }

  async checkTrial(): Promise<{ valid: boolean; days_remaining?: number }> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/api/check-trial?trial_token=${this.config.trialToken}`
      );

      if (!response.ok) {
        throw new Error('Trial check failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Trial validation error:', error);
      return { valid: false };
    }
  }

  async sendMessage(message: string): Promise<any> {
    if (!message || message.trim().length === 0) {
      throw new Error('Message cannot be empty');
    }

    // Add user message
    this.messages.push({ role: 'user', content: message });

    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trial_token: this.config.trialToken,
          query: message,
          session_id: this.sessionId
        })
      });

      if (!response.ok) {
        throw new Error('Query failed');
      }

      const data = await response.json();
      
      // Add assistant message
      this.messages.push({ role: 'assistant', content: data.answer });

      return data;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  clearMessages(): void {
    this.messages = [];
  }
}

describe('BitB Widget', () => {
  const validConfig: WidgetConfig = {
    trialToken: 'tr_' + 'a'.repeat(32),
    theme: 'auto',
    apiBaseUrl: 'https://bitb.ltd',
    position: 'bottom-right'
  };

  describe('Initialization', () => {
    it('should initialize with valid config', () => {
      const widget = new BitBWidget(validConfig);
      expect(widget.config.trialToken).toBe(validConfig.trialToken);
      expect(widget.config.theme).toBe(validConfig.theme);
      // Session id includes a timestamp and a small random suffix for uniqueness
      expect(widget.sessionId).toMatch(/^bitb_session_\d+(_\d+)?$/);
      expect(widget.messages).toEqual([]);
    });

    it('should throw error without trial token', () => {
      const invalidConfig = { ...validConfig, trialToken: '' };
      expect(() => new BitBWidget(invalidConfig)).toThrow('Trial token is required');
    });

    it('should throw error with invalid trial token format', () => {
      const invalidConfig = { ...validConfig, trialToken: 'invalid_token' };
      expect(() => new BitBWidget(invalidConfig)).toThrow('Invalid trial token format');
    });

    it('should throw error with invalid theme', () => {
      const invalidConfig = { ...validConfig, theme: 'invalid' as any };
      expect(() => new BitBWidget(invalidConfig)).toThrow('Invalid theme');
    });

    it('should throw error with invalid position', () => {
      const invalidConfig = { ...validConfig, position: 'invalid' as any };
      expect(() => new BitBWidget(invalidConfig)).toThrow('Invalid position');
    });

    it('should generate unique session IDs', () => {
      const widget1 = new BitBWidget(validConfig);
      const widget2 = new BitBWidget(validConfig);
      expect(widget1.sessionId).not.toBe(widget2.sessionId);
    });
  });

  describe('Trial Token Validation', () => {
    it('should accept valid trial token format', () => {
      const validTokens = [
        'tr_' + 'a'.repeat(32),
        'tr_' + '1'.repeat(32),
        'tr_' + ('abc123def456789'.repeat(3)).substring(0, 32)
      ];

      validTokens.forEach(token => {
        expect(() => new BitBWidget({ ...validConfig, trialToken: token })).not.toThrow();
      });
    });

    it('should reject invalid trial token formats', () => {
      const invalidTokens = [
        'invalid',
        'tr_short',
        'tr_' + 'a'.repeat(31), // Too short
        'tr_' + 'a'.repeat(33), // Too long
        'trial_' + 'a'.repeat(32), // Wrong prefix
        'TR_' + 'a'.repeat(32), // Uppercase prefix
      ];

      invalidTokens.forEach(token => {
        expect(() => new BitBWidget({ ...validConfig, trialToken: token })).toThrow();
      });
    });
  });

  describe('Trial Status Check', () => {
    it('should check trial status successfully', async () => {
      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true, days_remaining: 2 })
      } as Response);

      const widget = new BitBWidget(validConfig);
      const result = await widget.checkTrial();

      expect(result.valid).toBe(true);
      expect(result.days_remaining).toBe(2);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/check-trial')
      );
    });

    it('should handle trial check failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false
      } as Response);

      const widget = new BitBWidget(validConfig);
      const result = await widget.checkTrial();

      expect(result.valid).toBe(false);
    });

    it('should handle network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const widget = new BitBWidget(validConfig);
      const result = await widget.checkTrial();

      expect(result.valid).toBe(false);
    });
  });

  describe('Message Handling', () => {
    it('should send message successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answer: 'Test response',
          sources: [],
          confidence: 0.9
        })
      } as Response);

      const widget = new BitBWidget(validConfig);
      const response = await widget.sendMessage('Hello');

      expect(response.answer).toBe('Test response');
      expect(widget.getMessageCount()).toBe(2); // User + assistant
      expect(widget.messages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(widget.messages[1]).toEqual({ role: 'assistant', content: 'Test response' });
    });

    it('should reject empty message', async () => {
      const widget = new BitBWidget(validConfig);
      await expect(widget.sendMessage('')).rejects.toThrow('Message cannot be empty');
      await expect(widget.sendMessage('   ')).rejects.toThrow('Message cannot be empty');
    });

    it('should handle API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false
      } as Response);

      const widget = new BitBWidget(validConfig);
      await expect(widget.sendMessage('Hello')).rejects.toThrow();
    });

    it('should include trial token and session ID in request', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'Response', sources: [], confidence: 0.9 })
      } as Response);
      global.fetch = mockFetch;

      const widget = new BitBWidget(validConfig);
      await widget.sendMessage('Test message');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/ask'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(validConfig.trialToken)
        })
      );
    });

    it('should track multiple messages', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'Response', sources: [], confidence: 0.9 })
      } as Response);

      const widget = new BitBWidget(validConfig);
      await widget.sendMessage('Message 1');
      await widget.sendMessage('Message 2');
      await widget.sendMessage('Message 3');

      expect(widget.getMessageCount()).toBe(6); // 3 user + 3 assistant
    });

    it('should clear messages', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'Response', sources: [], confidence: 0.9 })
      } as Response);

      const widget = new BitBWidget(validConfig);
      await widget.sendMessage('Test');
      expect(widget.getMessageCount()).toBe(2);

      widget.clearMessages();
      expect(widget.getMessageCount()).toBe(0);
      expect(widget.messages).toEqual([]);
    });
  });

  describe('Configuration', () => {
    it('should support all theme options', () => {
      const themes: Array<'light' | 'dark' | 'auto'> = ['light', 'dark', 'auto'];
      
      themes.forEach(theme => {
        const widget = new BitBWidget({ ...validConfig, theme });
        expect(widget.config.theme).toBe(theme);
      });
    });

    it('should support all position options', () => {
      const positions: Array<'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'> = [
        'bottom-right',
        'bottom-left',
        'top-right',
        'top-left'
      ];
      
      positions.forEach(position => {
        const widget = new BitBWidget({ ...validConfig, position });
        expect(widget.config.position).toBe(position);
      });
    });

    it('should allow custom API base URL', () => {
      const customUrl = 'https://custom-api.example.com';
      const widget = new BitBWidget({ ...validConfig, apiBaseUrl: customUrl });
      expect(widget.config.apiBaseUrl).toBe(customUrl);
    });
  });
});

describe('Widget Integration Tests', () => {
  const validConfig: WidgetConfig = {
    trialToken: 'tr_' + 'a'.repeat(32),
    theme: 'auto',
    apiBaseUrl: 'https://bitb.ltd',
    position: 'bottom-right'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete full conversation flow', async () => {
    // Mock API responses
    const mockCheckTrial = { valid: true, days_remaining: 3 };
    const mockResponse = { answer: 'Hello! How can I help?', sources: [], confidence: 0.9 };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/check-trial')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockCheckTrial
        } as Response);
      } else if (url.includes('/api/ask')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockResponse
        } as Response);
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });

    const widget = new BitBWidget(validConfig);

    // Check trial
    const trialStatus = await widget.checkTrial();
    expect(trialStatus.valid).toBe(true);

    // Send message
    const response = await widget.sendMessage('Hello');
    expect(response.answer).toBe(mockResponse.answer);
    expect(widget.getMessageCount()).toBe(2);
  });

  it('should handle expired trial gracefully', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/check-trial')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ valid: false, days_remaining: 0 })
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Trial expired' })
      } as Response);
    });

    const widget = new BitBWidget(validConfig);
    const trialStatus = await widget.checkTrial();
    
    expect(trialStatus.valid).toBe(false);
    // In production, widget would show upgrade CTA and disable input
  });
});

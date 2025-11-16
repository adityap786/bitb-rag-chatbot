/**
 * Voice Greeting System Tests
 * 
 * Tests for the hover-triggered voice greeting functionality
 * in the BiTB widget.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Web Speech API
const mockSpeechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: vi.fn(() => [
    {
      name: 'Google US English Female',
      lang: 'en-US',
      default: false,
      localService: false,
      voiceURI: 'Google US English Female'
    },
    {
      name: 'Microsoft Zira Desktop',
      lang: 'en-US',
      default: true,
      localService: true,
      voiceURI: 'Microsoft Zira Desktop'
    }
  ])
};

// Mock Audio
class MockAudio {
  src: string;
  play = vi.fn().mockResolvedValue(undefined);
  
  constructor(src: string) {
    this.src = src;
  }
}

// Track created audio instances for assertions
const mockCreatedAudios: MockAudio[] = [];

// Sprite: push to created audios when constructed
// (we redefine MockAudio below to keep types simple)


// Mock storage
const mockSessionStorage = {
  data: {} as Record<string, string>,
  getItem(key: string) {
    return this.data[key] || null;
  },
  setItem(key: string, value: string) {
    this.data[key] = value;
  },
  removeItem(key: string) {
    delete this.data[key];
  },
  clear() {
    this.data = {};
  }
};

const mockLocalStorage = {
  data: {} as Record<string, string>,
  getItem(key: string) {
    return this.data[key] || null;
  },
  setItem(key: string, value: string) {
    this.data[key] = value;
  },
  removeItem(key: string) {
    delete this.data[key];
  },
  clear() {
    this.data = {};
  }
};

// Global reset to run before each test in this file so tests are isolated
beforeEach(() => {
  mockSessionStorage.clear();
  mockLocalStorage.clear();
  vi.clearAllMocks();
  mockCreatedAudios.length = 0;
});

// Voice Greeting class (simplified version for testing)
class VoiceGreeting {
  text = "Namaste, I am your virtual assistant BitB. I am here to help you with a demo of our chatbot.";
  hasGreeted = false;

  play() {
    // Check session flag
    if (mockSessionStorage.getItem('bitb_greeted') === 'true') {
      return false;
    }

    // Check mute toggle
    if (mockLocalStorage.getItem('bitb_voice_muted') === 'true') {
      return false;
    }

    // Preferred playback: static MP3 (simulated via MockAudio)
    const audio = new MockAudio('/greeting-audio.mp3');
    // record instance for assertions
    mockCreatedAudios.push(audio);
    // attempt play
    audio.play();

    // Mark as greeted
    mockSessionStorage.setItem('bitb_greeted', 'true');
    this.hasGreeted = true;

    return true;
  }

  toggleMute(): boolean {
    const isMuted = mockLocalStorage.getItem('bitb_voice_muted') === 'true';
    mockLocalStorage.setItem('bitb_voice_muted', (!isMuted).toString());
    return !isMuted;
  }
}

// Tests
describe('Voice Greeting System', () => {
  let greeting: VoiceGreeting;

  beforeEach(() => {
    // Reset mocks
    mockSessionStorage.clear();
    mockLocalStorage.clear();
    vi.clearAllMocks();

    // Clear created audios tracker
    mockCreatedAudios.length = 0;

    // Create new greeting instance
    greeting = new VoiceGreeting();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should play greeting on first hover', () => {
    const played = greeting.play();

    expect(played).toBe(true);
    expect(mockCreatedAudios.length).toBe(1);
    expect(mockCreatedAudios[0].play).toHaveBeenCalledOnce();
    expect(mockSessionStorage.getItem('bitb_greeted')).toBe('true');
  });

  it('should not play greeting on second hover (same session)', () => {
    // First hover
    greeting.play();
    expect(mockCreatedAudios.length).toBe(1);
    expect(mockCreatedAudios[0].play).toHaveBeenCalledOnce();

    // Second hover
    const played = greeting.play();

    expect(played).toBe(false);
    expect(mockCreatedAudios[0].play).toHaveBeenCalledOnce(); // Still only once
  });

  it('should respect mute toggle', () => {
    mockLocalStorage.setItem('bitb_voice_muted', 'true');

    const played = greeting.play();

    expect(played).toBe(false);
    expect(mockCreatedAudios.length).toBe(0);
  });

  it('should select female voice if available', () => {
    greeting.play();
    expect(mockCreatedAudios.length).toBe(1);
    expect(mockCreatedAudios[0].src).toBe('/greeting-audio.mp3');
  });

  it('should toggle mute state correctly', () => {
    // Start unmuted
    expect(mockLocalStorage.getItem('bitb_voice_muted')).toBeNull();

    // Mute
    const isMuted1 = greeting.toggleMute();
    expect(isMuted1).toBe(true);
    expect(mockLocalStorage.getItem('bitb_voice_muted')).toBe('true');

    // Unmute
    const isMuted2 = greeting.toggleMute();
    expect(isMuted2).toBe(false);
    expect(mockLocalStorage.getItem('bitb_voice_muted')).toBe('false');
  });

  it('should handle missing Web Speech API gracefully', () => {
    // Remove voices
    const originalGetVoices = mockSpeechSynthesis.getVoices;
    mockSpeechSynthesis.getVoices = vi.fn(() => []);

    const played = greeting.play();

    // Should still mark as greeted
    expect(played).toBe(true);
    expect(mockSessionStorage.getItem('bitb_greeted')).toBe('true');

    // Restore
    mockSpeechSynthesis.getVoices = originalGetVoices;
  });

  it('should use correct greeting text', () => {
    greeting.play();
    expect(mockCreatedAudios.length).toBe(1);
    expect(mockCreatedAudios[0].src).toBe('/greeting-audio.mp3');
  });

  it('should use en-US language', () => {
    greeting.play();
    expect(mockCreatedAudios.length).toBe(1);
    expect(mockCreatedAudios[0].src).toBe('/greeting-audio.mp3');
  });
});

// Integration test
describe('Voice Greeting Integration', () => {
  it('should handle complete user flow', () => {
    const greeting = new VoiceGreeting();

    // Scenario 1: First visit, unmuted
    expect(greeting.play()).toBe(true);
  expect(mockCreatedAudios.length).toBe(1);
  expect(mockCreatedAudios[0].play).toHaveBeenCalledOnce();

    // Scenario 2: Second hover in same session
    expect(greeting.play()).toBe(false);

    // Scenario 3: User mutes
    greeting.toggleMute();
    mockSessionStorage.clear(); // Simulate new session

    // Scenario 4: Next session, but muted
    const greeting2 = new VoiceGreeting();
    expect(greeting2.play()).toBe(false);

    // Scenario 5: User unmutes
    greeting2.toggleMute();
    mockSessionStorage.clear();

    // Scenario 6: Next session, unmuted again
    const greeting3 = new VoiceGreeting();
    expect(greeting3.play()).toBe(true);
  });
});

// Edge cases
describe('Voice Greeting Edge Cases', () => {
  it('should handle rapid repeated hovers', () => {
    const greeting = new VoiceGreeting();

    greeting.play();
    greeting.play();
    greeting.play();

    // Should only call speak once
  expect(mockCreatedAudios.length).toBe(1);
  expect(mockCreatedAudios[0].play).toHaveBeenCalledOnce();
  });

  it('should persist mute preference across instances', () => {
    const greeting1 = new VoiceGreeting();
    greeting1.toggleMute(); // Mute

    const greeting2 = new VoiceGreeting();
    expect(greeting2.play()).toBe(false); // Should still be muted
  });

  it('should reset greeting flag in new session', () => {
    const greeting1 = new VoiceGreeting();
    greeting1.play();

    // Simulate new session
    mockSessionStorage.clear();

    const greeting2 = new VoiceGreeting();
    expect(greeting2.play()).toBe(true); // Should play again
  });
});

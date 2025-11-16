/**
 * BiTB Voice Support API Route
 * GET /api/voicesupport
 * 
 * Returns voice greeting configuration
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const config = {
    web_speech_supported: true,
    preferred_voice: 'Google US English Female',
    fallback_audio_url: '/greeting-fallback.mp3',
    greeting_text: 'Namaste, I am your virtual assistant BitB. I am here to help you with a demo of our chatbot.',
    mute_option_available: true
  };

  return NextResponse.json(config);
}

/**
 * Widget Embed Code Generator
 * 
 * Generates production-ready embed snippets for various platforms.
 * Defaults to iframe-based embedding for universal compatibility.
 */

export interface WidgetConfig {
  colors?: {
    primary?: string;
    secondary?: string;
  };
  tone?: string;
  welcomeMessage?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

/**
 * Generate a universal iframe-based widget embed snippet.
 * Works on Wix, Shopify, WordPress, Framer, and any platform that supports HTML.
 */
export function getWidgetSnippet(tenantId: string, config: WidgetConfig = {}): string {
  // Use environment variable or fallback to relative path for self-hosted
  const baseUrl = process.env.NEXT_PUBLIC_WIDGET_BASE_URL || '';
  const position = config.position || 'bottom-right';

  const positionStyles: Record<string, string> = {
    'bottom-right': 'bottom: 24px; right: 24px;',
    'bottom-left': 'bottom: 24px; left: 24px;',
    'top-right': 'top: 24px; right: 24px;',
    'top-left': 'top: 24px; left: 24px;',
  };

  const positionStyle = positionStyles[position] || positionStyles['bottom-right'];

  return `<!-- BiTB Chatbot Widget -->
<div id="bitb-widget-container" style="position: fixed; ${positionStyle} width: 380px; height: 600px; z-index: 2147483647; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.2);">
  <iframe
    src="${baseUrl}/widget/${tenantId}"
    width="100%"
    height="100%"
    frameborder="0"
    allow="microphone"
    style="border: none; border-radius: 16px;"
    title="BiTB Chatbot"
  ></iframe>
</div>
<!-- End BiTB Widget -->`;
}

/**
 * Generate a script-based widget snippet for more dynamic control.
 * Supports open/close, resize, and message passing.
 */
export function getScriptWidgetSnippet(tenantId: string, config: WidgetConfig = {}): string {
  const baseUrl = process.env.NEXT_PUBLIC_WIDGET_BASE_URL || '';

  return `<!-- BiTB Chatbot Widget (Script) -->
<script src="${baseUrl}/bitb-widget.js" data-tenant-id="${tenantId}" data-position="${config.position || 'bottom-right'}" defer></script>
<!-- End BiTB Widget -->`;
}

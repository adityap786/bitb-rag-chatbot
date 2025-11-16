# BiTB Widget Embed Examples

This document provides examples of how to embed the BiTB chatbot widget on your website.

## Basic Embed

The simplest way to add the BiTB widget to your website:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>My Website</title>
</head>
<body>
    <!-- Your website content -->
    <h1>Welcome to My Business</h1>
    <p>We provide excellent services...</p>

    <!-- BiTB Widget (place before closing </body> tag) -->
    <script src="https://bitb.ltd/bitb-widget.js" 
            data-trial-token="tr_abc123xyz456789abcdef0123456789abc" 
            data-theme="auto"></script>
</body>
</html>
```

## Configuration Options

### Theme Customization

```html
<!-- Light theme -->
<script src="https://bitb.ltd/bitb-widget.js" 
        data-trial-token="tr_abc123xyz456789abcdef0123456789abc" 
        data-theme="light"></script>

<!-- Dark theme -->
<script src="https://bitb.ltd/bitb-widget.js" 
        data-trial-token="tr_abc123xyz456789abcdef0123456789abc" 
        data-theme="dark"></script>

<!-- Auto theme (follows system preference) -->
<script src="https://bitb.ltd/bitb-widget.js" 
        data-trial-token="tr_abc123xyz456789abcdef0123456789abc" 
        data-theme="auto"></script>
```

### Widget Position

```html
<!-- Bottom right (default) -->
<script src="https://bitb.ltd/bitb-widget.js" 
        data-trial-token="tr_xxx" 
        data-position="bottom-right"></script>

<!-- Bottom left -->
<script src="https://bitb.ltd/bitb-widget.js" 
        data-trial-token="tr_xxx" 
        data-position="bottom-left"></script>

<!-- Top right -->
<script src="https://bitb.ltd/bitb-widget.js" 
        data-trial-token="tr_xxx" 
        data-position="top-right"></script>

<!-- Top left -->
<script src="https://bitb.ltd/bitb-widget.js" 
        data-trial-token="tr_xxx" 
        data-position="top-left"></script>
```

### Custom API URL (Self-Hosted)

```html
<script src="https://your-domain.com/bitb-widget.js" 
        data-trial-token="tr_xxx" 
        data-api-url="https://your-domain.com"></script>
```

## Platform-Specific Integration

### WordPress

Add to your theme's `footer.php` before the closing `</body>` tag:

```php
<!-- BiTB Widget -->
<script src="https://bitb.ltd/bitb-widget.js" 
        data-trial-token="<?php echo get_option('bitb_trial_token'); ?>" 
        data-theme="auto"></script>
```

Or use a plugin like "Insert Headers and Footers" and add the script in the footer section.

### Shopify

1. Go to **Online Store → Themes**
2. Click **Actions → Edit code**
3. Find `theme.liquid`
4. Add before the closing `</body>` tag:

```liquid
<!-- BiTB Widget -->
<script src="https://bitb.ltd/bitb-widget.js" 
        data-trial-token="tr_xxx" 
        data-theme="auto"></script>
```

### Wix

1. Go to **Settings → Custom Code**
2. Click **+ Add Custom Code**
3. Paste the script code
4. Set **Place code in**: Body - End
5. Apply to **All pages** or specific pages

### Squarespace

1. Go to **Settings → Advanced → Code Injection**
2. Paste the script in the **Footer** section
3. Save

### Webflow

1. Go to **Project Settings → Custom Code**
2. Add the script to **Footer Code**
3. Publish your site

### React/Next.js Application

```jsx
import { useEffect } from 'react';

export default function Layout({ children }) {
  useEffect(() => {
    // Load BiTB widget script
    const script = document.createElement('script');
    script.src = 'https://bitb.ltd/bitb-widget.js';
    script.setAttribute('data-trial-token', 'tr_xxx');
    script.setAttribute('data-theme', 'auto');
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div>
      {children}
    </div>
  );
}
```

### Vue.js Application

```vue
<template>
  <div id="app">
    <!-- Your app content -->
  </div>
</template>

<script>
export default {
  name: 'App',
  mounted() {
    // Load BiTB widget script
    const script = document.createElement('script');
    script.src = 'https://bitb.ltd/bitb-widget.js';
    script.setAttribute('data-trial-token', 'tr_xxx');
    script.setAttribute('data-theme', 'auto');
    script.async = true;
    document.body.appendChild(script);
  }
}
</script>
```

## Advanced: Programmatic Control

If you need to programmatically control the widget (open/close, send messages):

```html
<script src="https://bitb.ltd/bitb-widget.js" 
        data-trial-token="tr_xxx" 
        id="bitb-widget"></script>

<script>
// Wait for widget to load
window.addEventListener('bitb:ready', () => {
  console.log('BiTB widget is ready');
  
  // Open widget programmatically
  document.getElementById('bitb-widget-button')?.click();
  
  // Listen for widget events
  window.addEventListener('bitb:message-sent', (event) => {
    console.log('User sent:', event.detail.message);
  });
  
  window.addEventListener('bitb:message-received', (event) => {
    console.log('Bot replied:', event.detail.message);
  });
});
</script>
```

## Testing the Widget

### Local Testing

For testing on localhost, use:

```html
<script src="http://localhost:3000/bitb-widget.js" 
        data-trial-token="tr_test123456789abcdef0123456789abc" 
        data-theme="auto"></script>
```

### Staging Environment

```html
<script src="https://staging.bitb.ltd/bitb-widget.js" 
        data-trial-token="tr_staging_xxx" 
        data-theme="auto"></script>
```

### Production

```html
<script src="https://bitb.ltd/bitb-widget.js" 
        data-trial-token="tr_xxx" 
        data-theme="auto"></script>
```

## Voice Greeting Configuration

The widget automatically plays a voice greeting on first hover per session. To control this:

### Mute Voice Greeting

The widget provides a mute button in the header. Users can also mute via localStorage:

```javascript
localStorage.setItem('bitb_voice_muted', 'true');
```

### Custom Greeting (Requires Backend Configuration)

Contact BiTB support to customize the greeting text or use a custom audio file.

## Troubleshooting

### Widget Not Appearing

1. Check browser console for errors
2. Verify trial token is correct and not expired
3. Check if script is blocked by ad blockers or CSP
4. Ensure script is placed before closing `</body>` tag

### Voice Greeting Not Playing

1. Check if browser supports Web Speech API
2. Check if browser blocked autoplay (shows play button)
3. Check if user has muted the widget
4. Check browser console for errors

### Widget Styling Issues

1. Check for CSS conflicts with existing styles
2. Verify theme setting (light/dark/auto)
3. Check if widget is covered by other elements (z-index)

### Trial Expired Message

1. Check trial expiry date via API: `/api/check-trial?trial_token=xxx`
2. Contact BiTB support to upgrade or extend trial

## Support

For additional help:
- Email: support@bitb.ltd
- Documentation: https://docs.bitb.ltd
- GitHub Issues: https://github.com/bitb/bitb-widget/issues

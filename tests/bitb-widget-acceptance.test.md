# BiTB Widget v2.0 - Acceptance Test Plan

## Test Date: 2025-01-04
## Version: 2.0.0

---

## Overview

This document contains manual acceptance tests for the fully functional BiTB chatbot widget with preview mode, slide animations, session persistence, and 10+ response depth.

---

## 1. Widget Initialization Tests

### Test 1.1: Preview Mode Initialization
**Steps:**
1. Open homepage at http://localhost:3000
2. Click "Preview BiTB Knowledge" button
3. Observe widget button appears in bottom-right corner

**Expected:**
- ✅ Blue circular widget button with brain icon visible
- ✅ Console shows: `[BiTB] Widget v2.0.0 initialized - Preview Mode`
- ✅ Button has proper hover effects (scale transform)

**Actual:** _[To be filled during test]_

---

### Test 1.2: Voice Greeting on Hover
**Steps:**
1. With preview mode active, hover over widget button
2. Listen for voice greeting

**Expected:**
- ✅ Voice speaks: "Namaste, I am your virtual assistant BitB..."
- ✅ Text greeting appears in toast/popup near button
- ✅ Greeting plays once per session only
- ✅ Subsequent hovers do not replay

**Actual:** _[To be filled during test]_

---

## 2. Slide Animation Tests

### Test 2.1: Initial Widget Open
**Steps:**
1. Click widget button
2. Observe opening animation

**Expected:**
- ✅ Chat panel slides down from bottom-right
- ✅ Smooth cubic-bezier easing (0.2, 0.9, 0.2, 1)
- ✅ Opacity fades from 0 to 1
- ✅ Transform from translateY(12px) scaleY(0.98) to translateY(0) scaleY(1)
- ✅ Animation completes in ~280ms
- ✅ Input field auto-focuses after animation

**Actual:** _[To be filled during test]_

---

### Test 2.2: Widget Slides Open on Bot Response (When Closed)
**Steps:**
1. Close widget by clicking X button
2. Type a message (widget should open automatically with first response)
3. Send message from browser console:
   ```javascript
   // Simulate external trigger
   document.querySelector('#bitb-widget-button').click();
   document.querySelector('#bitb-input').value = 'what is bitb';
   document.querySelector('#bitb-send-btn').click();
   ```
4. Observe behavior

**Expected:**
- ✅ Widget slides open automatically when response arrives
- ✅ Same smooth animation as manual open
- ✅ New message appears with slide-in animation
- ✅ Auto-scroll to bottom of messages

**Actual:** _[To be filled during test]_

---

### Test 2.3: Message Slide-In Animation
**Steps:**
1. Open widget
2. Send any message
3. Observe bot response animation

**Expected:**
- ✅ Bot message appears with slide-in effect
- ✅ Initial state: translateY(8px), opacity 0
- ✅ Final state: translateY(0), opacity 1
- ✅ Transition duration: ~180ms
- ✅ Smooth easing function

**Actual:** _[To be filled during test]_

---

### Test 2.4: Auto-Scroll After Every Response
**Steps:**
1. Send 5+ messages in quick succession
2. Observe scroll behavior

**Expected:**
- ✅ Messages container scrolls to bottom after EACH message
- ✅ Smooth scroll behavior (behavior: 'smooth')
- ✅ requestAnimationFrame + 40ms timeout pattern used
- ✅ No message is cut off or hidden

**Actual:** _[To be filled during test]_

---

## 3. Session Persistence Tests

### Test 3.1: Conversation Persists Across Page Reloads
**Steps:**
1. Open widget in preview mode
2. Send 3 messages, receive 3 responses
3. Refresh page (F5 or Cmd+R)
4. Click "Preview BiTB Knowledge" again
5. Open widget

**Expected:**
- ✅ All 6 messages (3 user + 3 bot) still visible
- ✅ Messages appear in correct order
- ✅ Source citations preserved
- ✅ Timestamps match original
- ✅ Conversation counter continues from previous count

**Actual:** _[To be filled during test]_

---

### Test 3.2: SessionStorage Key Format
**Steps:**
1. Open browser DevTools → Application → Session Storage
2. Look for key starting with `bitb_session_`

**Expected:**
- ✅ Key format: `bitb_session_preview` (for preview mode)
- ✅ Value is valid JSON with `messages`, `conversationDepth`, `lastActivity`
- ✅ `messages` array contains complete message objects
- ✅ Each message has: `role`, `content`, `timestamp`, optional `sources`

**Actual:** _[To be filled during test]_

---

## 4. Preview Mode - 10+ Response Tests

### Test 4.1: Pre-Seeded Knowledge Base Coverage
**Steps:**
1. Open widget in preview mode
2. Ask each of these questions sequentially:
   - "what is bits and bytes"
   - "what services do you offer"
   - "how does the trial work"
   - "what is rag"
   - "pricing plans"
   - "how to install widget"
   - "supported file types"
   - "multilingual support"
   - "voice greeting feature"
   - "data privacy and security"
   - "customization options"
   - "support and documentation"

**Expected:**
- ✅ All 12 questions return relevant, detailed answers
- ✅ Each answer is 3-5 sentences minimum
- ✅ Each answer cites specific URL (https://bitb.ltd/...)
- ✅ Answers are contextually appropriate
- ✅ No generic "I don't know" responses

**Actual:** _[To be filled during test]_

---

### Test 4.2: Keyword Matching Quality
**Steps:**
1. Ask: "tell me about pricing" (should match "pricing plans")
2. Ask: "how do I integrate this" (should match "install")
3. Ask: "what languages" (should match "multilingual")
4. Ask: "is my data safe" (should match "privacy")

**Expected:**
- ✅ Fuzzy keyword matching works correctly
- ✅ Scores by keyword relevance (2 points per keyword match)
- ✅ Returns best match, not just first match
- ✅ Confidence scores are reasonable (0.5-0.95)

**Actual:** _[To be filled during test]_

---

### Test 4.3: Conversational Follow-Ups
**Steps:**
1. Ask: "what is bitb"
2. Follow up: "how much does it cost"
3. Follow up: "can I try it for free"
4. Follow up: "how do I install it"

**Expected:**
- ✅ All follow-ups receive contextually relevant answers
- ✅ Each response maintains conversation thread
- ✅ Conversation depth counter increments (check status bar)
- ✅ Depth exceeds 10 responses easily

**Actual:** _[To be filled during test]_

---

### Test 4.4: Fallback Response for Unknown Queries
**Steps:**
1. Ask: "what is the weather today"
2. Ask: "tell me a joke"
3. Ask: "random gibberish asdfjkl"

**Expected:**
- ✅ Returns helpful fallback message
- ✅ Suggests relevant topics (services, pricing, trial, etc.)
- ✅ Provides list of suggested questions
- ✅ Confidence score is low (~0.3)

**Actual:** _[To be filled during test]_

---

## 5. Source Citation Tests

### Test 5.1: Source Links Display
**Steps:**
1. Send any query that returns sources
2. Observe source section below answer

**Expected:**
- ✅ "Sources:" label present
- ✅ URLs displayed as clickable links
- ✅ Links open in new tab (target="_blank")
- ✅ Links have noopener,noreferrer attributes
- ✅ Source score visible (not shown to user, but in console)

**Actual:** _[To be filled during test]_

---

## 6. UX Enhancement Tests

### Test 6.1: Mute Toggle Functionality
**Steps:**
1. Click mute button in widget header (🔊 icon)
2. Observe icon change to 🔇
3. Close and reopen widget
4. Hover over widget button

**Expected:**
- ✅ Icon toggles between 🔊 and 🔇
- ✅ Mute state persists in localStorage (`bitb_voice_muted`)
- ✅ Voice greeting respects mute setting
- ✅ No voice playback when muted

**Actual:** _[To be filled during test]_

---

### Test 6.2: Keyboard Accessibility
**Steps:**
1. Tab to widget button, press Enter
2. Tab through controls (input, send, mute, close)
3. Type message, press Enter to send
4. Press Escape key

**Expected:**
- ✅ All interactive elements focusable via Tab
- ✅ Visible focus indicators (outline: 2px solid #3b82f6)
- ✅ Enter key sends message
- ✅ Escape key closes widget
- ✅ Focus returns to button after close

**Actual:** _[To be filled during test]_

---

### Test 6.3: ARIA-Live Announcements
**Steps:**
1. Open browser screen reader (VoiceOver on Mac, NVDA on Windows)
2. Send a message
3. Listen for announcement

**Expected:**
- ✅ Screen reader announces: "Assistant says: [first 150 chars of response]"
- ✅ Announcement uses polite aria-live region
- ✅ Does not interrupt current reading
- ✅ Hidden visually (sr-only class)

**Actual:** _[To be filled during test]_

---

### Test 6.4: Mobile Responsive Design
**Steps:**
1. Open DevTools responsive mode
2. Test at 375px width (iPhone SE)
3. Test at 768px width (iPad)
4. Send messages and scroll

**Expected:**
- ✅ Widget width adjusts: calc(100vw - 16px) on mobile
- ✅ Messages max-width: 90% on mobile
- ✅ All buttons remain accessible
- ✅ No horizontal scroll
- ✅ Touch-friendly tap targets (min 44px)

**Actual:** _[To be filled during test]_

---

## 7. Trial Status Display Tests

### Test 7.1: Preview Mode Status Bar
**Steps:**
1. Open widget in preview mode
2. Send 3 messages
3. Observe status bar at bottom

**Expected:**
- ✅ Shows: "Preview Mode | Responses: 3 | Start your trial at..."
- ✅ Response counter increments with each bot reply
- ✅ Link to bitb.ltd is clickable
- ✅ Background color: #fef3c7 (yellow tint)

**Actual:** _[To be filled during test]_

---

### Test 7.2: Production Mode Status (Mock)
**Steps:**
1. Edit widget script tag: remove `data-preview="true"`
2. Add `data-trial-token="tr_abc123def456..."`
3. Refresh page and open widget

**Expected:**
- ✅ Shows: "Trial: 2 days remaining | Queries: 85 left"
- ✅ Counts down queries with each message
- ✅ No "Preview Mode" badge in header

**Actual:** _[To be filled during test]_

---

## 8. Edge Case Tests

### Test 8.1: Rapid Fire Messages
**Steps:**
1. Send 10 messages as fast as possible (spam Enter key)
2. Observe behavior

**Expected:**
- ✅ All messages queue correctly
- ✅ Loading indicators appear/disappear properly
- ✅ No race conditions or duplicate messages
- ✅ Scroll stays at bottom
- ✅ No UI freezing or lag

**Actual:** _[To be filled during test]_

---

### Test 8.2: Empty Message Handling
**Steps:**
1. Click send button with empty input
2. Type only spaces, click send
3. Observe behavior

**Expected:**
- ✅ Send button does nothing if input is empty
- ✅ Whitespace-only messages are rejected
- ✅ No error messages shown
- ✅ Input stays focused

**Actual:** _[To be filled during test]_

---

### Test 8.3: Very Long Message
**Steps:**
1. Paste 1000+ character message
2. Send message
3. Observe rendering

**Expected:**
- ✅ Long user message wraps properly
- ✅ Message bubble doesn't overflow
- ✅ Scroll works correctly
- ✅ Response is still relevant

**Actual:** _[To be filled during test]_

---

### Test 8.4: Special Characters & HTML Escaping
**Steps:**
1. Send message: `<script>alert('xss')</script>`
2. Send message: `Test & "quotes" 'apostrophes'`
3. Observe rendering

**Expected:**
- ✅ HTML tags are escaped (displayed as text, not executed)
- ✅ Special characters render correctly
- ✅ No XSS vulnerabilities
- ✅ escapeHtml() function works properly

**Actual:** _[To be filled during test]_

---

## 9. Production API Integration Tests

### Test 9.1: /api/check-trial Preview Mode
**Steps:**
1. Open browser DevTools → Network tab
2. Open widget in preview mode
3. Find request to `/api/check-trial?trial_token=preview`

**Expected:**
- ✅ Request sent with correct params
- ✅ Response: `{valid: true, preview: true, days_remaining: 999, ...}`
- ✅ Status code: 200
- ✅ No errors in console

**Actual:** _[To be filled during test]_

---

### Test 9.2: /api/ask Preview Mode
**Steps:**
1. Send message: "what is bitb"
2. Check Network tab for `/api/ask` POST request

**Expected:**
- ✅ Request body includes: `{trial_token: 'preview', query: 'what is bitb', ...}`
- ✅ Response includes: `{answer: '...', sources: [...], confidence: 0.85, preview: true}`
- ✅ Status code: 200
- ✅ Response time < 2 seconds

**Actual:** _[To be filled during test]_

---

## 10. Python Ingestion Worker Tests

### Test 10.1: Command Line Interface
**Steps:**
1. Open terminal
2. Run: `python python/ingest_worker.py --help`

**Expected:**
- ✅ Help text displays all arguments
- ✅ Shows usage examples
- ✅ No import errors

**Actual:** _[To be filled during test]_

---

### Test 10.2: URL Crawl (Dry Run with Mock)
**Steps:**
1. Create test HTML file: `test_page.html`
2. Run: `python python/ingest_worker.py --url file:///path/to/test_page.html --token test_token --depth 1`

**Expected:**
- ✅ Crawler initializes
- ✅ Extracts text content
- ✅ Creates chunks
- ✅ Generates embeddings (or shows HF API fallback)
- ✅ Saves FAISS index to `./data/faiss_indices/test_token.index`
- ✅ Saves metadata to `./data/faiss_indices/test_token.metadata.json`

**Actual:** _[To be filled during test]_

---

## 11. Performance Tests

### Test 11.1: Widget Load Time
**Steps:**
1. Open DevTools → Performance tab
2. Hard refresh page (Cmd+Shift+R)
3. Measure time from page load to widget button visible

**Expected:**
- ✅ Widget button appears within 500ms of page load
- ✅ Script size < 50KB (uncompressed)
- ✅ No blocking resources
- ✅ No layout shift (CLS score good)

**Actual:** _[To be filled during test]_

---

### Test 11.2: Message Rendering Performance
**Steps:**
1. Send 50 messages rapidly
2. Observe FPS and responsiveness

**Expected:**
- ✅ No dropped frames during animations
- ✅ UI remains responsive throughout
- ✅ Scroll performance smooth (60fps)
- ✅ No memory leaks (check DevTools Memory)

**Actual:** _[To be filled during test]_

---

## Summary Checklist

- [ ] All slide animations working smoothly
- [ ] Widget opens automatically on bot response
- [ ] Session persistence across reloads
- [ ] 10+ responses achievable in preview mode
- [ ] All 12 preview knowledge base topics covered
- [ ] Source citations display correctly
- [ ] Mute toggle works and persists
- [ ] Keyboard navigation fully functional
- [ ] ARIA-live announcements working
- [ ] Mobile responsive at all breakpoints
- [ ] No XSS vulnerabilities
- [ ] API endpoints return correct data
- [ ] Python worker executes successfully
- [ ] Performance metrics acceptable

---

## Sign-Off

**Tester Name:** ____________________  
**Date:** ____________________  
**Overall Status:** ☐ Pass  ☐ Fail  ☐ Pass with Issues  

**Issues Found:**  
1. _______________________________________
2. _______________________________________
3. _______________________________________

**Notes:**  
_______________________________________________
_______________________________________________
_______________________________________________

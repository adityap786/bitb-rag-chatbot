# BiTB - QA Testing Checklist

## Overview

This checklist provides comprehensive manual testing steps for the BiTB Fastify migration and "Try Widget — 3 Days Free Trial" implementation.

---

## Pre-Testing Setup

- [ ] Fastify server running on port 3001
- [ ] Next.js frontend running on port 3000
- [ ] Python environment configured with all dependencies
- [ ] Browser developer tools open (Console + Network tabs)
- [ ] Test files ready (PDF, DOCX, TXT samples)

---

## 1. Trial Creation Flow

### 1.1 Start Trial - Website URL

- [ ] Navigate to http://localhost:3000
- [ ] Click "Try Widget — 3 Days Free" button
- [ ] Modal opens with 4-step wizard
- [ ] **Step 1**: Select "Website URL" option
- [ ] Enter valid URL (e.g., https://bitsandbytes.ltd)
- [ ] Select crawl depth (2 levels)
- [ ] Click "Next: Customize Widget"
- [ ] **Step 2**: Choose primary color
- [ ] Enter chat name (e.g., "Support Assistant")
- [ ] Optional: Add avatar URL
- [ ] Select theme (light/dark/auto)
- [ ] Click "Next: Admin Details"
- [ ] **Step 3**: Enter admin email (valid format)
- [ ] Enter site name
- [ ] Enter site origin (e.g., https://example.com)
- [ ] Check "I agree to BiTB Terms of Service" checkbox
- [ ] Click "Create Trial"
- [ ] **Step 4**: See "Processing..." status with loading indicator
- [ ] Wait for ingestion to complete (1-5 minutes)
- [ ] See "Trial Created!" success message with checkmark
- [ ] Embed code displayed in code block
- [ ] Copy button visible next to embed code
- [ ] Click copy button → "Embed code copied!" toast appears
- [ ] Embed code format: `<script src="..." data-trial-token="tr_..." data-theme="..."></script>`

**Expected Result**: ✅ Trial created successfully with valid embed code

### 1.2 Start Trial - File Upload

- [ ] Repeat steps above but select "Upload Files" in Step 1
- [ ] Drag & drop zone appears
- [ ] Click zone or drag files (max 5 files, 10MB each)
- [ ] Upload PDF file → appears in file list
- [ ] Upload DOCX file → appears in file list
- [ ] Upload TXT file → appears in file list
- [ ] Try uploading 6th file → error message "Maximum 5 files allowed"
- [ ] Try uploading > 10MB file → error message "File too large"
- [ ] Remove file using X button → file removed from list
- [ ] Continue through steps 2-4 as above

**Expected Result**: ✅ Trial created with file upload ingestion

---

## 2. Widget Embedding & Preview Mode

### 2.1 Preview Mode on Homepage

- [ ] Click "Preview BiTB Knowledge" button on homepage
- [ ] Widget appears with green PREVIEW badge
- [ ] Widget status shows "Preview Mode"
- [ ] Ask: "what is bitb" → Receives company overview
- [ ] Ask: "trial information" → Receives 3-day trial details
- [ ] Ask: "what is rag" → Receives RAG explanation
- [ ] Ask 7+ more questions → Receives relevant answers
- [ ] Each response includes source citations (bitsandbytes.ltd URLs)
- [ ] Widget auto-opens when closed and response arrives
- [ ] Smooth slide-down animation (280ms cubic-bezier)

**Expected Result**: ✅ Preview mode works with 10+ knowledge base responses

---

## 3. Slide Animation on Every Response

### 3.1 Widget Auto-Open Behavior

- [ ] Widget is currently closed (only floating button visible)
- [ ] Type message in input (widget should be open to type)
- [ ] Send message
- [ ] Close widget immediately after sending
- [ ] Wait for bot response
- [ ] **Widget automatically slides open** when response arrives
- [ ] Message visible with smooth animation
- [ ] Auto-scrolls to bottom

### 3.2 Message Slide-In Animation

- [ ] Widget is open
- [ ] Send message
- [ ] User message appears with 180ms slide-in animation
- [ ] Bot response appears with slide-in animation after processing
- [ ] Each new message has subtle translateY animation
- [ ] Opacity fades in (0 → 1)
- [ ] Animations smooth at 60 FPS

**Expected Result**: ✅ Widget slides open after EVERY bot response

---

## 4. Session Persistence

### 4.1 Conversation Persists

- [ ] Send 5 messages in preview mode
- [ ] Check sessionStorage → `bitb_messages` array exists
- [ ] Refresh page (F5)
- [ ] Click widget → All 5 messages still visible
- [ ] Send new message → Conversation continues
- [ ] Close browser tab completely
- [ ] Reopen → New session starts (messages cleared)

**Expected Result**: ✅ Session persistence works correctly

---

## 5. Voice Greeting

### 5.1 First Hover

- [ ] Hover over widget button (first time)
- [ ] Female voice greeting plays via Web Speech API
- [ ] Message: "Hello! I'm here to help you..."
- [ ] sessionStorage key `bitb_greeting_played` = "true"

### 5.2 Mute Toggle

- [ ] Click volume icon in header → Mutes
- [ ] localStorage key `bitb_voice_muted` = "true"
- [ ] Refresh page → Voice still muted
- [ ] Click volume icon again → Unmutes
- [ ] Close and reopen → Voice plays

**Expected Result**: ✅ Voice greeting with persistent mute toggle

---

## 6. Mobile Responsive

### 6.1 Mobile Viewport (DevTools)

- [ ] Toggle device toolbar → iPhone 12 Pro (390x844)
- [ ] Widget button visible and sized correctly (56px)
- [ ] Click button → Panel opens full-width
- [ ] Panel adapts: calc(100vw - 20px) × calc(100vh - 90px)
- [ ] All UI elements usable
- [ ] Input field accessible
- [ ] Touch scrolling smooth
- [ ] No horizontal scroll

**Expected Result**: ✅ Mobile-friendly on all screen sizes

---

## 7. Accessibility

### 7.1 Keyboard Navigation

- [ ] Tab to widget button → Focus visible
- [ ] Enter → Opens widget
- [ ] Tab through controls → Focus moves correctly
- [ ] Type and Enter → Sends message
- [ ] ESC → Closes widget

### 7.2 Screen Reader

- [ ] Navigate to button → Announces "Open chat button"
- [ ] Open widget → Announces "BiTB Assistant dialog"
- [ ] Bot response → Announced via aria-live region
- [ ] No duplicate announcements

**Expected Result**: ✅ Fully accessible

---

## 8. Performance

### 8.1 Load Time

- [ ] Widget script loads in < 500ms
- [ ] Time to Interactive < 1 second
- [ ] Button visible immediately

### 8.2 Animation FPS

- [ ] Open Chrome DevTools → Performance tab
- [ ] Record opening/closing widget 5 times
- [ ] Check FPS → Consistently 60 FPS
- [ ] No jank or layout thrashing

**Expected Result**: ✅ Fast load, smooth 60 FPS animations

---

## 9. API Testing (curl)

### 9.1 Start Trial

```bash
curl -X POST http://localhost:3001/api/start-trial \
  -H "Content-Type: application/json" \
  -d '{
    "site_origin": "https://example.com",
    "admin_email": "admin@example.com",
    "display_name": "Support Assistant",
    "theme": {"primary": "#4f46e5"}
  }'
```

- [ ] Returns 200 OK
- [ ] Response includes `trial_token`, `expires_at`, `embed_code`

### 9.2 Check Trial

```bash
TRIAL_TOKEN="tr_xxx"
curl "http://localhost:3001/api/check-trial?trial_token=$TRIAL_TOKEN&origin=https://example.com"
```

- [ ] Returns `{"valid": true, "is_preview": false}`
- [ ] Shows usage count and limit

### 9.3 Ask Question

```bash
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "trial_token": "preview",
    "query": "What is BiTB?",
    "session_id": "test123"
  }'
```

- [ ] Returns answer with sources
- [ ] Response time < 2 seconds
- [ ] Sources include URLs and titles

**Expected Result**: ✅ All API endpoints respond correctly

---

## 10. Python Worker

### 10.1 Website Crawl

```bash
cd python
python ingest-worker.py --job job_test --trial tr_test --source https://bitsandbytes.ltd
```

- [ ] Respects robots.txt
- [ ] Crawls pages (depth 2, max 50)
- [ ] Extracts text from HTML
- [ ] Creates chunks (~600 tokens, 100 overlap)
- [ ] Generates embeddings (local sentence-transformers)
- [ ] Creates FAISS index: `./indexes/tr_test.faiss`
- [ ] Saves metadata: `./indexes/tr_test.json`
- [ ] Completes successfully

**Expected Result**: ✅ Ingestion worker processes content correctly

---

## Summary Checklist

### Critical Path (Must Pass)

- [ ] Trial creation works
- [ ] Widget embeds and initializes
- [ ] Preview mode provides 10+ responses
- [ ] Chat sends/receives messages
- [ ] Widget auto-opens on every bot response with slide animation
- [ ] Session persistence works
- [ ] Mobile responsive
- [ ] Accessibility (keyboard + screen reader)

### High Priority

- [ ] Voice greeting plays
- [ ] Mute toggle persists
- [ ] Cross-browser compatibility
- [ ] Performance (60 FPS, < 2s queries)
- [ ] Error handling

---

## Sign-Off

**Tester Name**: _______________  
**Date**: _______________  
**Tests Passed**: ___ / 10 sections  
**Critical Failures**: ___  
**Status**: ⬜ PASS ⬜ FAIL ⬜ NEEDS WORK  

---

**QA Checklist Version**: 1.0.0  
**Last Updated**: 2025-01-15

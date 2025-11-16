# GitHub Copilot Handoff Guide

This document provides essential context for GitHub Copilot to effectively continue development on this project.

---

## 🎯 Project Summary

**Name**: AI Chatbot Platform  
**Version**: 0.1.0  
**Quality Rating**: 7.5/10  
**Status**: MVP Complete, Ready for Enhancement

### What Works
- ✅ Fully functional chatbot widget with customization
- ✅ Comprehensive analytics dashboard (5 tabs)
- ✅ Multi-language support (English, Hindi, Hinglish)
- ✅ Dark mode and theme customization
- ✅ Export/share functionality
- ✅ 40+ UI components (shadcn/ui)

### What Needs Work
- ⚠️ Large components need refactoring (500+ lines)
- ⚠️ Mock data only (needs real backend)
- ⚠️ No test coverage
- ⚠️ Browser alert() needs replacement
- ⚠️ Performance optimizations needed

---

## 📚 Essential Reading

Before making changes, review these documents in order:

1. **[README.md](./README.md)** - Project overview and setup
2. **[REQUIREMENTS.md](./REQUIREMENTS.md)** - Comprehensive specifications
3. **[TODO.md](./TODO.md)** - Prioritized task list
4. **[CHANGELOG.md](./CHANGELOG.md)** - Version history

---

## 🏗️ Project Architecture

### Tech Stack
```
Next.js 15 (App Router) + React 19 + TypeScript
├── Styling: Tailwind CSS v4
├── Components: Radix UI + shadcn/ui
├── Animations: Framer Motion
├── Forms: React Hook Form + Zod
├── Markdown: react-markdown + remark-gfm
└── Charts: Recharts
```

### File Structure
```
src/
├── app/
│   ├── page.tsx                    # Homepage with chatbot
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Tailwind v4 styles
│   └── chatbot-admin/page.tsx      # Analytics dashboard
├── components/
│   ├── ui/                         # 40+ shadcn components
│   └── chatbot/
│       ├── ChatbotWidget.tsx       # Main component (NEEDS REFACTORING)
│       └── ChatbotSettings.tsx     # Settings panel
└── types/
    └── chatbot.ts                  # TypeScript interfaces
```

---

## 🎨 Design System

### Color Variables (Tailwind v4)
All colors use CSS variables defined in `globals.css`:
```css
--background, --foreground
--primary, --secondary, --muted, --accent
--border, --input, --ring
--destructive, --card, --popover
```

### Components
All UI components are from `@/components/ui/*` (shadcn/ui):
- Button, Card, Dialog, Tabs, Tooltip, ScrollArea, etc.
- Import from `@/components/ui/[component-name]`

### Styling Rules
- **Use**: Tailwind CSS classes exclusively
- **Never**: styled-jsx (breaks Next.js 15 + Server Components)
- **Dark mode**: `.dark` class with CSS variables

---

## 🔑 Key Components

### ChatbotWidget (`src/components/chatbot/ChatbotWidget.tsx`)

**Status**: ⚠️ NEEDS REFACTORING (500+ lines)

**Current responsibilities**:
- Message management (state, send, receive)
- UI rendering (button, window, messages, input)
- Configuration handling
- Export/share functionality
- Scroll behavior
- Loading states

**Suggested refactoring**:
```
ChatbotWidget.tsx (orchestrator)
├── ChatbotButton.tsx (floating button)
├── ChatbotHeader.tsx (title, controls)
├── ChatbotMessages.tsx (message list)
├── ChatbotInput.tsx (textarea + send)
└── hooks/
    ├── useChat.ts (message logic)
    ├── useChatConfig.ts (settings)
    └── useChatScroll.ts (auto-scroll)
```

**Known issues**:
- Line 282: Uses `alert()` → Replace with toast from `sonner`
- No memoization → Add `React.memo()`, `useCallback`, `useMemo`
- Response generation is mock → Needs real API integration

### ChatbotSettings (`src/components/chatbot/ChatbotSettings.tsx`)

**Status**: ✅ Working well

**Features**:
- Appearance: brand color, logo, font, theme
- Behavior: name, tone, language, fallback
- Layout: position, size
- Feature toggles

**Storage**: localStorage key `"chatbot-config"`

### Admin Dashboard (`src/app/chatbot-admin/page.tsx`)

**Status**: ✅ Working with mock data

**Tabs**:
1. Overview - KPIs and metrics
2. Topics - FAQ analysis
3. Feedback - Ratings and comments
4. Demographics - User distribution
5. Coverage Gaps - Unanswered questions

**Needs**: Real backend API integration

---

## 🚨 Critical Issues to Fix First

### 1. Replace alert() with toast (HIGH PRIORITY)
**Location**: `ChatbotWidget.tsx` line 282  
**Current code**:
```typescript
alert("Transcript copied to clipboard!");
```

**Fix**:
```typescript
import { toast } from "sonner";
toast.success("Transcript copied to clipboard!");
```

**Note**: Toaster component must be in layout.tsx

### 2. Refactor ChatbotWidget (HIGH PRIORITY)
See suggested structure above. Break into 4-5 components + 3 custom hooks.

### 3. Add Real API Integration (CRITICAL)
Create these API routes:
```
POST /api/chat              # Handle messages
GET  /api/chat/history      # Get history
POST /api/chat/feedback     # Submit feedback
GET  /api/analytics/*       # Analytics data
```

Replace mock functions:
- `generateResponse()` in ChatbotWidget
- `analyticsData` in chatbot-admin/page.tsx

---

## 💻 Development Commands

```bash
# Development
npm run dev          # Start dev server (port 3000)

# Production
npm run build        # Build for production
npm start            # Start production server

# Code Quality
npm run lint         # Run ESLint

# Testing (TO BE SETUP)
npm test             # Run tests
npm test:coverage    # Coverage report
```

---

## 🧪 Testing Strategy

**Current state**: Zero test coverage

**Setup needed**:
1. Install Vitest + React Testing Library
2. Configure test environment
3. Add test scripts to package.json

**Priority test cases**:
- ChatbotWidget: open/close, send message, settings
- ChatbotSettings: config changes, localStorage
- useChat hook: message state management
- Analytics: data rendering, tab switching

**Target**: 80%+ code coverage

---

## 📝 Coding Conventions

### Component Structure
```typescript
"use client"; // Only for interactive components

import { useState } from "react";
import { ComponentProps } from "@/types";

interface Props {
  // Define props
}

export const ComponentName = ({ prop1, prop2 }: Props) => {
  // Hooks
  const [state, setState] = useState();
  
  // Event handlers (prefix with handle*)
  const handleClick = () => {
    // ...
  };
  
  // Render
  return (
    <div className="tailwind-classes">
      {/* JSX */}
    </div>
  );
};
```

### Naming Conventions
- **Components**: PascalCase (`ChatbotWidget.tsx`)
- **Pages**: lowercase (`page.tsx`)
- **Hooks**: camelCase, prefix with `use` (`useChat.ts`)
- **Types**: PascalCase interfaces (`ChatMessage`)
- **Functions**: camelCase (`handleSendMessage`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_CONFIG`)

### Import Order
1. React and Next.js imports
2. Third-party libraries
3. UI components from `@/components/ui`
4. Custom components
5. Hooks and utilities
6. Types
7. Styles

### TypeScript Rules
- Always define interfaces for props
- Avoid `any` type
- Use strict mode
- Export types from files
- Use type inference when obvious

---

## 🔍 Common Tasks

### Adding a New UI Component

```bash
# Use shadcn CLI
npx shadcn@latest add [component-name]

# Example
npx shadcn@latest add dropdown-menu
```

### Adding a New Feature

1. Check TODO.md for context
2. Create feature branch: `git checkout -b feature/feature-name`
3. Implement with tests
4. Update CHANGELOG.md
5. Commit: `git commit -m "feat: description"`
6. Push and create PR

### Updating Styles

Edit `src/app/globals.css`:
- Uses Tailwind v4 syntax
- CSS variables in `:root` and `.dark`
- Follow existing color token patterns

### API Integration Pattern

```typescript
// In component
const [data, setData] = useState();
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  fetch("/api/endpoint")
    .then(res => res.json())
    .then(setData)
    .catch(setError)
    .finally(() => setIsLoading(false));
}, []);
```

---

## 🐛 Known Bugs & Quirks

1. **Iframe context**: App runs in iframe
   - Don't use `alert()`, `confirm()`, `prompt()`
   - Use relative API paths, not localhost URLs
   
2. **Dark mode flash**: Theme switches on load
   - Fixed by next-themes, but check implementation

3. **Scroll behavior on mobile**: May need refinement
   - Test on actual devices

4. **LocalStorage**: Configuration persists
   - Clear with: `localStorage.removeItem("chatbot-config")`

---

## 📦 Dependencies

### Essential (Don't remove)
- next, react, react-dom
- typescript
- @radix-ui/* (all packages)
- lucide-react
- tailwind-merge, clsx
- framer-motion

### For specific features
- **Forms**: react-hook-form, zod, @hookform/resolvers
- **Markdown**: react-markdown, remark-gfm
- **Charts**: recharts
- **Dates**: date-fns
- **Toasts**: sonner
- **Theme**: next-themes

### Already installed (don't reinstall)
- drizzle-orm, drizzle-kit (database - not yet used)
- better-auth (auth - not yet used)
- stripe, autumn-js (payments - not yet used)

---

## 🎯 Immediate Next Steps (Priority Order)

1. **Fix alert() bug** (5 minutes)
   - Replace with toast notification
   - Test in component

2. **Setup testing** (1-2 hours)
   - Install Vitest + React Testing Library
   - Write first test for ChatbotWidget
   - Add test scripts

3. **Refactor ChatbotWidget** (2-3 hours)
   - Extract 4 child components
   - Create 3 custom hooks
   - Test all functionality still works

4. **Create API routes** (3-4 hours)
   - POST /api/chat for messages
   - Connect to AI provider (OpenAI/Anthropic)
   - Add error handling

5. **Write tests** (2-3 hours)
   - ChatbotWidget tests
   - Settings tests
   - Hook tests
   - Aim for 50%+ coverage

---

## 🔐 Environment Variables (Future)

When adding backend:

```env
# API
NEXT_PUBLIC_API_URL=
OPENAI_API_KEY=           # or other AI provider

# Database (Turso)
DATABASE_URL=
DATABASE_AUTH_TOKEN=

# Auth (better-auth)
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=

# Analytics
NEXT_PUBLIC_ANALYTICS_ID=
```

---

## 🤝 Working with Copilot

### Best Practices

1. **Be specific in prompts**:
   - ✅ "Refactor ChatbotWidget: extract ChatbotHeader component with minimize/maximize/close buttons"
   - ❌ "Make the chatbot better"

2. **Reference files**:
   - "Update ChatbotWidget.tsx to use the new useChat hook"
   - "Add tests for the component in ChatbotWidget.test.tsx"

3. **Follow existing patterns**:
   - "Create a new tab in chatbot-admin following the existing tab structure"
   - "Add a new setting to ChatbotSettings matching the existing pattern"

4. **Check documentation first**:
   - REQUIREMENTS.md for specifications
   - TODO.md for planned features
   - README.md for setup context

### Useful Prompts

```
# Refactoring
"Break down the ChatbotWidget component into smaller, focused components following the suggested structure in COPILOT_HANDOFF.md"

# Testing
"Create unit tests for ChatbotWidget using Vitest and React Testing Library. Cover open/close, send message, and settings scenarios."

# API Integration
"Create a POST /api/chat route that accepts a message and returns an AI response. Use error handling and TypeScript types."

# Bug Fixes
"Replace the alert() on line 282 of ChatbotWidget with a sonner toast notification"

# Documentation
"Add JSDoc comments to all functions in ChatbotWidget.tsx explaining parameters and return values"
```

---

## 📊 Project Metrics

- **Total Components**: 45+ (40+ UI, 5+ custom)
- **Lines of Code**: ~6,000+
- **TypeScript Files**: 50+
- **Code Quality**: 7.5/10
- **Test Coverage**: 0% (needs setup)
- **Documentation**: 95% (comprehensive)

---

## 🔗 Useful Links

- [Next.js 15 Docs](https://nextjs.org/docs)
- [React 19 Docs](https://react.dev)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Radix UI](https://www.radix-ui.com)
- [Framer Motion](https://www.framer.com/motion)

---

## ✅ Pre-Flight Checklist

Before starting development:

- [ ] Read REQUIREMENTS.md thoroughly
- [ ] Review TODO.md for context
- [ ] Check CHANGELOG.md for recent changes
- [ ] Understand project structure
- [ ] Review design system in globals.css
- [ ] Test chatbot functionality locally
- [ ] Explore admin dashboard
- [ ] Check existing components in src/components/ui

---

## 🎉 You're Ready!

This project has:
- ✅ Solid foundation (Next.js 15 + React 19)
- ✅ Complete UI library (40+ components)
- ✅ Working features (chatbot + analytics)
- ✅ Comprehensive documentation
- ✅ Clear improvement path

**Next sprint focus**: Testing + Refactoring + API Integration

**Questions?** Check REQUIREMENTS.md or TODO.md for detailed context.

---

**Last Updated**: 2025-11-04  
**Handoff Version**: 0.1.0  
**Ready for**: GitHub Copilot / Team Collaboration

**Good luck! 🚀**

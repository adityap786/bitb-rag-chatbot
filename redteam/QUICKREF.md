# Red-Team Safety Testing — Quick Reference

**Version**: 1.0.0  
**Quick Links**: [Full Runbook](./REDTEAM_RUNBOOK.md) | [Test Vectors](./test-vectors.json) | [CI Logs](https://github.com/adityap786/bitb-rag-chatbot/actions/workflows/redteam.yml)

---

## 🚀 Quick Start

### Run Tests Locally
```bash
npm run redteam:test                    # All tests
npm run redteam:test -- --verbose       # Detailed output
npm run redteam:test -- --suite jailbreaks  # Specific suite
```

### Check CI Status
```bash
# On PR: Check "Checks" tab
# On main: https://github.com/adityap786/bitb-rag-chatbot/actions
```

### View Full Report
```bash
npm run redteam:report > report.json
cat report.json | jq '.summary'
```

---

## 🛡️ Safety Layers

| Layer | File | Purpose |
|---|---|---|
| **Input Sanitization** | `middleware.ts` | Normalize input, detect injection markers |
| **XPIA Prevention** | `middleware.ts` | Treat RAG docs as data, not instructions |
| **Context Validation** | `middleware.ts` | Enforce boundaries, detect contamination |
| **Prompt Anchoring** | `middleware.ts` | Lock system prompt against overrides |
| **Safety Re-ranking** | `rrf-reranker.ts` | Penalize suspicious documents |

---

## 🔍 Test Suite Summary

| Suite | Tests | Focus | Critical? |
|---|---|---|---|
| **Jailbreaks** | 5 | System prompt override attempts | ✅ YES |
| **Instruction Override** | 3 | Conflicting directives, authority spoofing | ✅ YES |
| **Prompt Injection** | 4 | Direct injection in user input | ✅ YES |
| **XPIA** | 3 | Injection via RAG documents | ✅ YES |
| **Synonym/Paraphrase** | 3 | Obfuscated attack variants | ⚠️ HIGH |
| **Multi-Turn XPIA** | 3 | Attack progression across turns | ✅ YES |
| **TOTAL** | **21** | — | — |

---

## ⚠️ Common Failures & Fixes

### "Injection patterns not detected"
```bash
# Problem: New attack variant bypassed detector
# Fix:
vim src/lib/safety/middleware.ts
# Add pattern to INJECTION_MARKERS or JAILBREAK_KEYWORDS
npm run redteam:test -- --verbose
```

### "XPIA document not sanitized"
```bash
# Problem: Malicious instruction in RAG doc executed
# Fix:
vim src/lib/safety/middleware.ts
# Update sanitizeRetrievedContext() to escape new markup
npm run redteam:test -- --suite cross_prompt_injection
```

### "Multi-turn attack succeeded"
```bash
# Problem: Constraints weakened across conversation
# Fix:
vim src/lib/safety/middleware.ts
# Verify anchorSystemPrompt() called every turn
# Check sanitizeSessionMemory() max_history
npm run redteam:test -- --suite xpia_multi_turn
```

### "False positive rate high"
```bash
# Problem: Test flags legitimate content
# Fix 1: Update keyword threshold
vim src/lib/safety/middleware.ts
# Change: require 3+ keywords instead of 1

# Fix 2: Disable overly sensitive pattern
# Comment out pattern in INJECTION_MARKERS

# Verify:
npm run redteam:test -- --verbose | grep "should_not_contain"
```

---

## 📊 Key Metrics

```bash
# Pass rate target: >95%
# Response time: <100ms per safety check
# False positive rate: <2%
# XPIA block rate: 100% (critical documents)
```

Monitor in CI/CD:
- GitHub Actions: Safety Tests job
- Slack: #security-alerts channel
- Dashboard: [Security Metrics](https://dashboards.internal.bitb.com/safety)

---

## 🚨 Severity Levels

| Level | Example | Response Time | Action |
|---|---|---|---|
| 🔴 **CRITICAL** | Injection succeeded, data leaked | 15 min | Block deployment, page on-call |
| 🟠 **HIGH** | Safety filter failure, major bypass | 30 min | Fix before merge, escalate to VP |
| 🟡 **MEDIUM** | Edge case vulnerability | 1 hour | Fix before merge |
| 🟢 **LOW** | Test flakiness, false positive | 4 hours | Document, update as needed |

---

## 🔗 Key Files

```
redteam/
├── test-vectors.json          ← All attack scenarios (21 tests)
├── test-runner.ts             ← Executes tests + generates reports
├── REDTEAM_RUNBOOK.md         ← Full procedures & playbooks
└── QUICKREF.md                ← This file

src/lib/safety/
├── middleware.ts              ← Input sanitization & injection detection
├── rrf-reranker.ts            ← Safety-aware re-ranking
└── (existing guardrails.ts)   ← PII masking & context limits

types/
├── redteam.ts                 ← Type definitions
└── safety.ts                  ← Safety check types

.github/workflows/
└── redteam.yml                ← CI/CD pipeline (runs on every push)
```

---

## 💡 Pro Tips

### Debug a Specific Test
```bash
npm run redteam:test -- --suite jailbreaks --verbose 2>&1 | grep "jb_001" -A 20
```

### Compare Before/After
```bash
git stash
npm run redteam:test > before.json
git stash pop
npm run redteam:test > after.json
npm run safety:compare before.json after.json
```

### Add a New Test
1. Edit `redteam/test-vectors.json`
2. Add to appropriate suite with unique ID (e.g., `jb_006`)
3. Include `attack`, `expected_behavior`, `assertion`
4. Run locally: `npm run redteam:test -- --suite jailbreaks`
5. Commit with reference: `git commit -m "test: add jb_006 for [attack type]"`

### Check Test Coverage
```bash
npm run redteam:test -- --verbose | grep -c "✓"  # Passed
npm run redteam:test -- --verbose | grep -c "✗"  # Failed
```

---

## 🔐 Security Properties Enforced

- ✅ **System prompt immutable** - Cannot be overridden by user/data
- ✅ **Instruction injection blocked** - Markers detected & sanitized
- ✅ **XPIA prevented** - Documents treated as data, not instructions
- ✅ **Context boundaries enforced** - No escape/confusion possible
- ✅ **Tenant isolation** - Cross-tenant data never mixed
- ✅ **PII protected** - Consistent redaction across all layers
- ✅ **Multi-turn safe** - Constraints don't weaken per turn

---

## 📝 Checklist: Pre-Deployment

Before merging to main:

- [ ] Run `npm run redteam:test` locally → All tests pass
- [ ] Check CI/CD pipeline → All green (safety + tests + linting)
- [ ] Review any failed tests → All addressed or documented
- [ ] No new warnings in `safety:compare` → No regressions
- [ ] Changelog updated → Describe security changes
- [ ] Security team sign-off → VP Security approves

---

## 🆘 Emergency Commands

```bash
# Immediate: Block deployment if tests fail
npm run redteam:test -- --fail-fast

# Immediate: Check for hardcoded bypass patterns
grep -r "SYSTEM OVERRIDE\|no_rules\|ignore_safety" src/

# Immediate: Revert unsafe changes
git revert --no-edit $(git log --oneline -n 1 | cut -d' ' -f1)

# Immediate: Notify security team
curl -X POST https://hooks.slack.com/... -d '{"text": "🚨 SECURITY ALERT"}'
```

---

## 📞 Get Help

- **Questions**: Post in #security-engineering Slack
- **Bug Report**: Open GitHub issue with `[red-team]` prefix
- **Emergency**: Page @security-on-call
- **Docs**: See [REDTEAM_RUNBOOK.md](./REDTEAM_RUNBOOK.md)

---

**Last Updated**: 2025-12-09  
**Status**: Active  
**Maintained By**: Security Team

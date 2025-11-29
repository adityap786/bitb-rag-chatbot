# Incident Response Runbook

## Severity Matrix
| Severity | Description | Response Time |
|----------|-------------|--------------|
| P0 (Critical) | Data breach, cross-tenant leakage, major outage | Immediate (0-15 min) |
| P1 (High)     | Unauthorized access, failed guardrails, high error rates | <1 hour |
| P2 (Medium)   | Minor security bug, non-critical anomaly | <4 hours |
| P3 (Low)      | Cosmetic or informational issue | <24 hours |

## Response Team Roles
- Incident Commander
- Security Lead
- Engineering Lead
- Legal
- Customer Success

## 5-Phase Process
1. **Detection & Triage (0-15min)**
   - Monitor alerts, triage severity, assign roles
2. **Containment (15-60min)**
   - Isolate affected systems, block malicious access
3. **Eradication (1-4hr)**
   - Remove threats, patch vulnerabilities
4. **Recovery (4-24hr)**
   - Restore services, validate integrity, notify users
5. **Post-Incident (1-7 days)**
   - Review, document, improve controls, regulatory notifications

## Regulatory Notifications
- GDPR: Notify within 72 hours
- CCPA, HIPAA, SOC 2: Follow respective timelines

## Contact List Template
- Store securely in encrypted vault
- Never commit to code or repo
- Include: Name, Role, Email, Phone, Backup Contact

## Notes
- All incidents logged in audit trail
- Runbook reviewed quarterly
- Emergency contacts updated monthly

# Audit Logging & Evidence Retention

> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323
> **Jurisdiction:** New York State / NYC

---

> ### FIELD AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)
> 1. **UCBA** governs everything. 2. **REBNY IDX Plus fields (902)** — single source of truth.
> 3. **REBNY overrides Cotality/IDX.** 4. **Cotality/IDX fills gaps.** 5. **INTERNAL-ONLY otherwise.** 6. **Fail closed = NON-DISPLAY.**

---

## 1. NY SHIELD Act — Data Security Requirements

### General Business Law 899-aa, 899-bb

| Category | Requirements |
|----------|-------------|
| **Administrative** | Employee training, vendor management, risk assessment, incident response plan |
| **Technical** | Encryption (transit + rest), access controls, intrusion detection, secure authentication |
| **Physical** | Secure disposal, facility access controls, environmental safeguards |

### Breach Notification

| Requirement | Detail |
|-------------|--------|
| Timeline | Within reasonable time, not to exceed 30 days |
| Who to notify | Affected individuals + NY Attorney General + DFS + DOCS |
| Method | Written notice (mail or email) |
| Content | Description of breach, type of data, contact info, steps taken |

### What Constitutes "Private Information"

- Social Security number
- Driver's license number
- Financial account numbers (with access codes)
- Biometric data
- Username + password combinations
- Credit/debit card numbers

---

## 2. What to Log

### Listing Data Access

| Event | Fields to Log |
|-------|---------------|
| Listing viewed | Timestamp, user ID, listing ID, IP address |
| Listing created | Timestamp, user ID, all field values |
| Listing edited | Timestamp, user ID, field changed, old value, new value |
| Listing status change | Timestamp, user ID, old status, new status |
| RLS submission | Timestamp, user ID, listing ID, success/failure, rejection reason |
| RLS rejection | Timestamp, listing ID, field, reason, rejection count |

### Gate Field Changes

| Event | Fields to Log |
|-------|---------------|
| IDX toggle change | Timestamp, user ID, old value, new value |
| Address display change | Timestamp, user ID, old value, new value |
| Owner Opt-Out set | Timestamp, user ID, form upload status |
| Participant Only set | Timestamp, user ID |
| InternetEntire cascade | Timestamp, all cascaded field changes |

### Client Data Access

| Event | Fields to Log |
|-------|---------------|
| Client record viewed | Timestamp, user ID, client ID |
| Client record created | Timestamp, user ID |
| Client record edited | Timestamp, user ID, fields changed |
| Client data exported | Timestamp, user ID, format, record count |
| Client data deleted | Timestamp, user ID, client ID, reason |

### Authentication

| Event | Fields to Log |
|-------|---------------|
| Login success | Timestamp, user ID, IP, user agent |
| Login failure | Timestamp, attempted user, IP, user agent |
| Password change | Timestamp, user ID |
| Role change | Timestamp, admin user, target user, old role, new role |
| Session timeout | Timestamp, user ID |
| Access revocation | Timestamp, admin user, target user, reason |

### Compliance Events

| Event | Fields to Log |
|-------|---------------|
| Fair Housing scan | Timestamp, listing ID, result (pass/fail), flagged terms |
| Fair Housing override | Timestamp, user ID, listing ID, flagged terms, justification |
| Content scan violation | Timestamp, listing ID, scanner type, flagged content |
| Rejection rate threshold | Timestamp, current rate, threshold, listings affected |
| Coming Soon expiration | Timestamp, listing ID, action taken |
| Protected period names | Timestamp, listing ID, names submitted, 90-day window dates |

---

## 3. Evidence Retention Schedule

| Data Type | Retention Period | Reason |
|-----------|-----------------|--------|
| Listing data (active) | Duration of listing + 3 years | UCBA compliance, statute of limitations |
| Listing data (closed) | 7 years from close date | NY DOS record retention |
| Listing agreements | 3 years from expiration | UCBA Art. IV (48hr inspection) |
| Buyer rep agreements | 3 years from expiration | UCBA Art. IV |
| Owner Opt-Out forms | 3 years from listing expiration | Gate 1 evidence |
| Coming Soon authorizations | 3 years | Gate 5 evidence |
| RUNDBA documents | 3 years | K1 compliance |
| Fair Housing scan logs | 5 years | Penalty defense |
| Rejection logs | 3 years | M13 quarterly rate defense |
| Client communications | 3 years | TCPA/CAN-SPAM |
| TCPA consent records | 5 years | TCPA defense |
| Authentication logs | 2 years | Security audit |
| Data access logs | 3 years | SHIELD Act |
| Financial transactions | 7 years | IRS / NY tax |

---

## 4. Log Format

### Standard Log Entry

```json
{
  "timestamp": "2026-02-21T14:30:00.000Z",
  "event_type": "listing.edit",
  "user_id": "agent_maya_allan",
  "user_role": "broker",
  "ip_address": "192.168.1.1",
  "resource_type": "listing",
  "resource_id": "RLS1234567",
  "action": "update",
  "details": {
    "field": "ListPrice",
    "old_value": "1500000",
    "new_value": "1450000"
  },
  "compliance_flags": ["price_change_24hr_sla"]
}
```

### Log Storage

| Tier | Period | Storage | Access |
|------|--------|---------|--------|
| Hot | 0-90 days | Application database | Real-time queries |
| Warm | 90 days - 1 year | Cloud storage (indexed) | On-demand queries |
| Cold | 1-7 years | Archive storage (compressed) | Batch retrieval |

---

## 5. UCBA-Specific Audit Requirements

### Agreement Inspection (G4)

- Must produce listing agreements and buyer rep agreements within 48 hours on RLS staff request
- Log: request received, document retrieved, document sent, response time

### Violation Defense Evidence

| Violation Type | Evidence to Maintain |
|----------------|---------------------|
| Fair Housing | Scan logs, override justifications, correction dates |
| Data quality | Original submission, rejection details, correction timestamps |
| Incurable (e.g., public display of opt-out) | Gate field values at time of display, display logs |
| Status timing | Status change timestamps, 24hr SLA compliance logs |
| Coming Soon | Exhibit G upload, 14-day expiration logs, showing prevention logs |

### Quarterly Rate Monitoring

- Calculate rejection rate monthly (not just quarterly)
- Alert at 4% (yellow), 5% (red)
- Maintain: total submissions, total rejections, per-field rejection counts, cure actions taken

---

## 6. Incident Response Plan

### Data Breach Response

| Step | Timeline | Action |
|------|----------|--------|
| 1. Detect | Immediate | Identify scope, type of data, number of records |
| 2. Contain | Within hours | Revoke compromised credentials, isolate affected systems |
| 3. Assess | Within 24hrs | Determine notification obligations |
| 4. Notify | Within 30 days | NY AG, DFS, DOCS, affected individuals |
| 5. Remediate | Ongoing | Fix vulnerability, update controls, retrain staff |
| 6. Document | Ongoing | Full incident report for compliance records |

### UCBA Violation Response

| Step | Timeline | Action |
|------|----------|--------|
| 1. Receive notice | Day 0 | Log violation notice, identify listing/issue |
| 2. Assess | Day 0-1 | Determine cure period (3d/2d/1d/none) |
| 3. Correct | Within cure period | Fix the violation, log all changes |
| 4. Respond | Within cure period | Submit correction evidence to RLS |
| 5. Monitor | Ongoing | Track violation count, escalation level |

---

## 7. Access Control Logging

### Portal-Level Access

| Portal | Can Access | Cannot Access |
|--------|-----------|---------------|
| Broker | All data, all logs, all reports | -- |
| Agent | Own listings, own clients, shared listings | Other agent clients, admin logs |
| Buyer | Own saved listings, own searches | Other clients, agent data |
| Seller | Own listing performance | Other listings, agent data |
| Renter | Own saved rentals, own searches | Other clients, agent data |
| Landlord | Own rental performance | Other listings, agent data |

### Log All Privilege Escalation

- Role changes (e.g., Agent promoted to Broker)
- Temporary access grants
- Cross-client data access
- Admin overrides

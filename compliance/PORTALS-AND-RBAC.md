# Portals & Role-Based Access Control (RBAC)

> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323
> **CRM:** Backend internal tool (not public-facing)

---

> ### FIELD AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)
> 1. **UCBA** governs everything. 2. **REBNY IDX Plus fields (902)** — single source of truth.
> 3. **REBNY overrides RESO/IDX.** 4. **RESO/IDX fills gaps.** 5. **INTERNAL-ONLY otherwise.** 6. **Fail closed = NON-DISPLAY.**

---

## 1. Portal Types (6)

| Portal | User Type | Authentication |
|--------|-----------|----------------|
| **Broker** | Brokerage owner/principal broker (Maya Allan) | Email + password + MFA |
| **Agent** | Licensed agents under the brokerage | Email + password |
| **Buyer** | Buyer clients | Email + password (or magic link) |
| **Seller** | Seller clients | Email + password (or magic link) |
| **Renter** | Renter clients | Email + password (or magic link) |
| **Landlord** | Landlord/property owner clients | Email + password (or magic link) |

---

## 2. Access Matrix

### Broker Portal (Full Admin)

| Feature | Access Level |
|---------|-------------|
| All listings (own + other agents) | Full CRUD |
| All agents | Full CRUD + manage |
| All clients | Full read + manage |
| Compliance dashboard | Full access |
| Rejection rate monitoring | Full access |
| RLS submission approval | Full access |
| Distribution gate overrides | Full access |
| Audit logs | Full read |
| Financial reports | Full access |
| Agent onboarding/offboarding | Full access |
| System settings | Full access |
| Violation management | Full access |
| Protected period tracking | Full access |
| Fair Housing scan overrides | Full access (with logging) |

### Agent Portal

| Feature | Access Level |
|---------|-------------|
| Own listings | Full CRUD |
| Other agents' listings | Read only (if IDX-eligible) |
| Own clients | Full CRUD |
| Other agents' clients | **No access** |
| RLS submission | Submit own listings |
| Distribution gates | Set on own listings |
| Own performance | Read |
| PrivateRemarks (all listings) | Read (AGT distribution) |
| ShowingInstructions (all listings) | Read (AGT distribution) |
| PropertyCondition (all listings) | Read (with disclaimer) |
| ExpirationDate | Own listings only |
| Participant Only listings | Read (RLS Participant view) |
| Owner Opt-Out listings | **No access** (unless assigned) |
| Compliance dashboard | **No access** |
| Audit logs | **No access** |

### Buyer Portal

| Feature | Access Level |
|---------|-------------|
| Active IDX-eligible listings | Read (search + browse) |
| Saved searches | Full CRUD |
| Saved/favorited listings | Full CRUD |
| Showing requests | Create + view own |
| Feedback on showings | Create + view own |
| Documents (own transaction) | Read |
| Own profile | Full CRUD |
| Other clients' data | **No access** |
| Agent-only fields | **No access** |
| Participant Only listings | **No access** |
| Owner Opt-Out listings | **No access** |
| ExpirationDate | **No access** |
| PrivateRemarks | **No access** |
| Seller/buyer identity | **No access** (until Closed) |

### Seller Portal

| Feature | Access Level |
|---------|-------------|
| Own listing(s) | Read (performance view) |
| Showing feedback (own listing) | Read |
| Offers received (own listing) | Read |
| Listing statistics (DOM, views) | Read |
| Documents (own transaction) | Read + upload |
| Own profile | Full CRUD |
| Other listings | **No access** |
| Other clients | **No access** |
| Agent-only fields | **No access** |

### Renter Portal

| Feature | Access Level |
|---------|-------------|
| Active IDX-eligible rentals | Read (search + browse) |
| Saved searches | Full CRUD |
| Saved/favorited rentals | Full CRUD |
| Showing requests | Create + view own |
| Application status | Read |
| Documents (own transaction) | Read |
| Own profile | Full CRUD |
| Owner Opt-Out listings | **No access** |
| Participant Only listings | **No access** |
| Agent-only fields | **No access** |

### Landlord Portal

| Feature | Access Level |
|---------|-------------|
| Own rental listing(s) | Read (performance view) |
| Tenant applications (own listing) | Read |
| Showing history (own listing) | Read |
| Rental income/financials (own) | Read |
| Documents (own transaction) | Read + upload |
| Own profile | Full CRUD |
| Other listings | **No access** |
| Other clients | **No access** |
| Agent-only fields | **No access** |

---

## 3. Field-Level Access Control

### Distribution-Based Field Access

| Distribution Code | Broker | Agent | Buyer/Renter | Seller/Landlord |
|-------------------|--------|-------|--------------|-----------------|
| **PUB** (Public) | Yes | Yes | Yes (IDX-eligible only) | Own listing only |
| **PUB-A** (Address-controlled) | Yes | Yes | If InternetAddressDisplayYN=True | Own listing |
| **AGT** (Agent-only) | Yes | Yes | **No** | **No** |
| **HID** (Hidden) | Yes | Own listings | **No** | **No** |
| **CTL** (Control flags) | Yes | Own listings | **No** | **No** |
| **SYS** (System) | Read | Read | **No** | **No** |
| **CLOSE** (Closing-only) | Yes | Involved in deal | If own deal | If own deal |
| **INT** (Internal CRM) | Yes | Own listings | **No** | **No** |

### Specific Restricted Fields

| Field | Who Can See | Who Cannot See |
|-------|------------|----------------|
| `ExpirationDate` | Broker, assigned agent | All clients, other agents |
| `PrivateRemarks` | Broker, all agents | All clients |
| `ShowingInstructions` | Broker, all agents | All clients |
| `PropertyCondition` | Broker, all agents (with disclaimer) | All clients |
| `ListingContractDate` | Broker, assigned agent | All clients |
| Seller/Buyer identity | Broker, agents (after Closed) | All clients (until Closed) |
| Compensation fields | **Nobody** — removed from RLS Aug 2025 | All |

---

## 4. UCBA-Specific Access Rules

### Suspended/Terminated Agents (O1, O2, N8)

| Action | Implementation |
|--------|----------------|
| Suspend agent | Immediately revoke all CRM access |
| Block listing edits | Agent cannot update/remove/post any listings |
| Reassign listings | Broker must reassign to another agent |
| Log access attempts | Track any login attempts post-suspension |
| Providing access to suspended agent | = unauthorized use violation (N8) |

### Protected Period (A6-A7)

| Access | Who |
|--------|-----|
| Submit 6 names | Assigned broker/agent only |
| View protected names | Broker + assigned agent only |
| 90-day tracking | Broker only |

### Coming Soon Restrictions

During Coming Soon status:
- Disable "Schedule Showing" for all users
- Disable "Open House" fields
- Block offer acceptance workflow
- Show badge to all viewers

---

## 5. Authentication Requirements

| Portal | Method | Session | MFA |
|--------|--------|---------|-----|
| Broker | Email + password | 24hr timeout | Required |
| Agent | Email + password | 8hr timeout | Recommended |
| Buyer | Email + password / magic link | 30-day cookie | Optional |
| Seller | Email + password / magic link | 30-day cookie | Optional |
| Renter | Email + password / magic link | 30-day cookie | Optional |
| Landlord | Email + password / magic link | 30-day cookie | Optional |

### Cookie-Based Auth (Current)

- Cookie name: `pc_auth`
- Protected by: `PRIVATE_COLLECTION_PASS` environment variable
- HttpOnly, Secure, SameSite=Strict

---

## 6. Data Isolation

### Multi-Tenancy Rules

| Rule | Implementation |
|------|----------------|
| Agent A cannot see Agent B's clients | Query filter by `agent_id` |
| Client A cannot see Client B's data | Query filter by `client_id` |
| Seller cannot see other sellers' listings | Query filter by `listing_id` + `client_id` |
| All queries include role check | Middleware validates role before data access |

### Cross-Portal Data Leaks to Prevent

| Leak Vector | Prevention |
|-------------|------------|
| URL manipulation (e.g., changing listing ID in URL) | Server-side ownership check |
| API endpoint without auth | Authentication middleware on all routes |
| Cached data from other users | Per-user cache keys |
| Error messages revealing data | Generic error messages |
| Search results bypassing gates | Server-side gate filtering |

---

## 7. Audit Trail per Portal

Every portal action must be logged:

| Portal | Critical Actions to Log |
|--------|------------------------|
| Broker | Role changes, gate overrides, compliance actions, agent management |
| Agent | Listing CRUD, status changes, RLS submissions, client access |
| Buyer/Renter | Search queries, saved listings, showing requests |
| Seller/Landlord | Document uploads, data views |
| All | Login/logout, password changes, profile updates |

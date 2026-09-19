# SendQueue — Comprehensive Architecture & Project Plan

## 1. Executive Summary & Vision

**SendQueue** is a reliable, high-deliverability email campaign and queue dispatch platform. It bridges the gap between simple transactional email APIs and heavyweight marketing suites. 

Rather than risking account bans or hitting hard limits by mass-sending through consumer SMTP or webmail accounts, SendQueue manages campaigns through a resilient, rate-regulated dispatch queue that interfaces with legitimate cloud email infrastructure (Amazon SES, Resend, SendGrid, Mailgun, or custom SMTP).

### Core Value Proposition
- **Predictable Deliverability:** Controlled delivery speed conforming strictly to provider quotas and domain warming schedules.
- **Queue Fault-Tolerance:** Power loss, process restarts, or rate limits do not cause duplicate emails or dropped messages.
- **Dynamic Personalization:** Template personalization with smart fallbacks (e.g., `{{name | "Valued Partner"}}`).
- **Contact Hygiene:** Instant CSV validation, field mapping, duplicate suppression, and global blacklist/unsubscribe management.
- **Provider Agnostic:** Swappable adapter layer (Amazon SES, SendGrid, Mailgun, Resend, or local Mock/Ethereal for testing).

---

## 2. System Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                  SendQueue Web Interface                │
│    (Dashboard, Contacts, Templates, Campaigns, Queue)    │
└────────────────────────────┬─────────────────────────────┘
                             │ REST API / SSE
┌────────────────────────────▼─────────────────────────────┐
│                    SendQueue Core API                    │
│      (Express.js + Middleware + Validation + Auth)       │
├────────────────────────────┬─────────────────────────────┤
│   Contact & Group Engine   │   Template & Render Engine  │
├────────────────────────────┼─────────────────────────────┤
│   Campaign Orchestrator    │   Suppression & Compliance  │
└────────────────────────────┬─────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│                 Queue & Worker Dispatcher                │
│   • Rate Limiter (Token Bucket / Sliding Window)         │
│   • Retry Engine (Exponential Backoff + Jitter)          │
│   • State Machine (PENDING → QUEUED → SENDING → SENT)    │
└────────────────────────────┬─────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│               Email Provider Adapter Layer               │
│   ├── Mock / Local SMTP (Testing & Staging)             │
│   ├── Resend Adapter                                     │
│   ├── Amazon SES Adapter                                 │
│   ├── SendGrid / Mailgun Adapter                         │
│   └── Custom SMTP Adapter                                │
└────────────────────────────┬─────────────────────────────┘
                             │ Webhook Ingestion
┌────────────────────────────▼─────────────────────────────┐
│               Event Ingestion & Analytics                │
│   (Delivered, Bounced, Complained, Opened, Unsubscribed) │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema (SQLite for v1, Postgres compatible)

### `users`
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PRIMARY KEY | UUID |
| `name` | TEXT NOT NULL | Admin full name |
| `email` | TEXT UNIQUE NOT NULL | Account email |
| `password_hash` | TEXT NOT NULL | Argon2id / bcrypt hash |
| `role` | TEXT DEFAULT 'admin' | Role-based access control |
| `created_at` | DATETIME | Timestamp |

### `contacts`
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PRIMARY KEY | UUID |
| `email` | TEXT UNIQUE NOT NULL | Normalized lowercase email |
| `first_name` | TEXT | First name |
| `last_name` | TEXT | Last name |
| `company` | TEXT | Organization name |
| `category` | TEXT | Customer type / Segment |
| `custom_attributes` | TEXT (JSON) | Arbitrary key-value metadata |
| `status` | TEXT DEFAULT 'active' | `active`, `unsubscribed`, `bounced`, `complained` |
| `created_at` | DATETIME | Timestamp |
| `updated_at` | DATETIME | Timestamp |

### `groups`
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PRIMARY KEY | UUID |
| `name` | TEXT UNIQUE NOT NULL | Group identifier (e.g. VIP Retailers) |
| `description` | TEXT | Optional details |
| `created_at` | DATETIME | Timestamp |

### `contact_groups`
| Column | Type | Description |
|---|---|---|
| `contact_id` | TEXT REFERENCES contacts(id) ON DELETE CASCADE |
| `group_id` | TEXT REFERENCES groups(id) ON DELETE CASCADE |
| PRIMARY KEY (`contact_id`, `group_id`) | |

### `templates`
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PRIMARY KEY | UUID |
| `name` | TEXT NOT NULL | Template name |
| `subject` | TEXT NOT NULL | Subject with placeholder tags |
| `body_html` | TEXT NOT NULL | HTML message body |
| `body_text` | TEXT | Fallback plain text body |
| `created_at` | DATETIME | Timestamp |
| `updated_at` | DATETIME | Timestamp |

### `campaigns`
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PRIMARY KEY | UUID |
| `name` | TEXT NOT NULL | Campaign reference name |
| `template_id` | TEXT REFERENCES templates(id) | Associated template |
| `subject` | TEXT NOT NULL | Snapshot of subject used |
| `body_html` | TEXT NOT NULL | Snapshot of HTML body used |
| `body_text` | TEXT | Snapshot of plain text used |
| `from_name` | TEXT NOT NULL | Display sender name |
| `from_email` | TEXT NOT NULL | Verified sender address |
| `reply_to` | TEXT | Optional reply-to address |
| `status` | TEXT DEFAULT 'DRAFT' | `DRAFT`, `SCHEDULED`, `QUEUED`, `SENDING`, `PAUSED`, `COMPLETED`, `FAILED` |
| `rate_limit_per_sec`| INTEGER DEFAULT 5 | Enforced dispatch speed |
| `total_recipients` | INTEGER DEFAULT 0 | Count of assigned recipients |
| `scheduled_at` | DATETIME | Null if sent immediately |
| `started_at` | DATETIME | When queue worker started |
| `completed_at` | DATETIME | When all recipients reached terminal state |
| `created_at` | DATETIME | Timestamp |
| `updated_at` | DATETIME | Timestamp |

### `campaign_recipients` (The Queue Table)
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PRIMARY KEY | UUID |
| `campaign_id` | TEXT REFERENCES campaigns(id) ON DELETE CASCADE |
| `contact_id` | TEXT REFERENCES contacts(id) |
| `recipient_email` | TEXT NOT NULL | Email at time of queue creation |
| `personalization_data`| TEXT (JSON) | Pre-rendered or resolved token parameters |
| `status` | TEXT DEFAULT 'PENDING' | `PENDING`, `QUEUED`, `SENDING`, `SENT`, `DELIVERED`, `BOUNCED`, `FAILED` |
| `attempt_count` | INTEGER DEFAULT 0 | Number of dispatch attempts |
| `max_attempts` | INTEGER DEFAULT 3 | Retries allowed |
| `next_attempt_at` | DATETIME | For exponential backoff scheduling |
| `error_message` | TEXT | Last failure diagnostics |
| `provider_message_id`| TEXT | ID returned by delivery provider |
| `sent_at` | DATETIME | When accepted by provider |
| `delivered_at` | DATETIME | Webhook confirmation time |
| `created_at` | DATETIME | Timestamp |

### `suppression_list`
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PRIMARY KEY | UUID |
| `email` | TEXT UNIQUE NOT NULL | Lowercase email |
| `reason` | TEXT NOT NULL | `unsubscribe`, `hard_bounce`, `complaint`, `manual` |
| `source_campaign_id` | TEXT | Campaign where event occurred |
| `created_at` | DATETIME | Timestamp |

### `audit_events`
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PRIMARY KEY | UUID |
| `campaign_id` | TEXT |
| `recipient_id` | TEXT |
| `event_type` | TEXT NOT NULL | `SENT`, `DELIVERED`, `BOUNCE_HARD`, `BOUNCE_SOFT`, `COMPLAINT`, `UNSUBSCRIBE` |
| `raw_payload` | TEXT (JSON) | Provider webhook payload |
| `created_at` | DATETIME | Timestamp |

---

## 4. Key Improvements Over Original Plan

1. **Pluggable Provider Architecture:**
   - Instead of hardcoding one provider, an abstract `EmailProvider` interface allows swapping between Resend, Amazon SES, SendGrid, Mailgun, or a local `MockProvider`.
   - The `MockProvider` enables 100% testability offline without consuming live email credits or requiring paid domain DNS setup during early development.

2. **Resilient Rate-Limiting & Queue State-Machine:**
   - Database-backed queue with atomic status transitions (`PENDING` → `SENDING` → `SENT`).
   - If the server restarts or crashes, any job left in `SENDING` is reclaimed safely without double-sending.
   - Configurable throughput rate (e.g. 2 emails/sec, 14 emails/sec) with token bucket pacing to avoid hitting provider throttling limits.

3. **Smart CSV Ingestion & Mapping:**
   - Auto-detects columns: automatically maps "Mail", "Email Address", "Recipient" to `email`, and "First Name", "Full Name" to `name`.
   - Dry-run validation: preview invalid emails, duplicates, and suppressed addresses before committing to the database.

4. **Compliance & Deliverability Guardrails:**
   - Automatic RFC 8058 `List-Unsubscribe` headers.
   - Built-in one-click unsubscribe endpoint that updates both the contact status and the global suppression table.
   - Automatic suppression check prior to enqueueing: zero wasted credits on previously bounced or unsubscribed users.

5. **Real-Time Dispatch Feedback:**
   - Server-Sent Events (SSE) stream campaign progress directly to the frontend dashboard, providing live status bars, delivery rates, and real-time failure alerts.

6. **Rich Personalization Engine:**
   - Supports fallback expressions: `{{first_name | "there"}}`, `{{company | "your organization"}}`.
   - Live sample recipient switcher in preview mode.

---

## 5. Phased Section-Wise Implementation Roadmap

```text
Phase 1: Project Skeleton, Environment & Database Core
Phase 2: Contact Management, Groups & Smart CSV Importer
Phase 3: Template Studio & Live Dynamic Personalization Preview
Phase 4: Multi-Provider Email Dispatcher & Test Sending
Phase 5: Queue Engine, Rate Limiter & Campaign Orchestrator
Phase 6: Compliance, Webhooks & Delivery Analytics
Phase 7: Frontend Polish, Live Telemetry & Production Hardening
```

### Phase 1 — Project Skeleton, Environment & Database Core
- Set up Node.js project structure, configuration management (`.env.example`), and logging.
- Initialize database schema with SQLite (WAL mode for concurrent read/write stability).
- Build database migration/seeding mechanism.
- Set up authentication & session security (JWT or secure session cookies, Argon2/bcrypt password hashing).

### Phase 2 — Contact Management, Groups & Smart CSV Importer
- Contact CRUD API and group assignment.
- CSV/XLSX streaming parser with column auto-detection and validation.
- Email syntax normalization and deduplication logic.
- Group filtering and segmented list counters.

### Phase 3 — Template Studio & Live Dynamic Personalization Preview
- Template CRUD with variable token extraction (`{{variable}}` detection).
- Fallback token resolution logic (`{{name | "Friend"}}`).
- Live dual-pane preview: HTML render alongside sample contact switcher.
- Test email trigger to send immediate one-off preview to admin inbox.

### Phase 4 — Multi-Provider Email Dispatcher & Test Sending
- Define standardized `EmailProvider` interface:
  - `sendMail({ to, from, subject, html, text, headers })`
  - `verifyCredentials()`
- Implement `MockProvider` (generates virtual inboxes / inspectable local preview).
- Implement production provider adapters (`Resend`, `Amazon SES`, `SendGrid`, `SMTP`).
- Admin settings UI to configure active provider and API keys.

### Phase 5 — Queue Engine, Rate Limiter & Campaign Orchestrator
- Campaign creator wizard (Name → Audience/Groups → Template → Review → Send/Schedule).
- Queue builder: expands campaign audience into atomic `campaign_recipients` records, skipping suppressed emails.
- Worker dispatch loop:
  - Token-bucket rate regulation.
  - Graceful shutdown handling (SIGTERM/SIGINT) saving queue state cleanly.
  - Automatic retry with exponential backoff for transient 429/5xx provider errors.
  - Campaign state management: `DRAFT` → `QUEUED` → `SENDING` → `COMPLETED` / `PAUSED`.

### Phase 6 — Compliance, Webhooks & Delivery Analytics
- One-click unsubscribe system (unique unsubscribe token per recipient + headers).
- Global suppression list manager.
- Webhook receiver for bounce, complaint, and delivery confirmations.
- Real-time SSE channel delivering live metrics to the campaign detail screen.

### Phase 7 — Frontend Polish, Live Telemetry & Production Hardening
- Modern, responsive dashboard with key performance indicators (Total Contacts, Active Campaigns, Delivery Success Rate, Bounce Rate).
- Dark/light mode UI with responsive layouts.
- Rate-limiting middleware on public endpoints.
- Health check endpoints and production deployment documentation.

---

## 6. Directory Structure

```text
SendQueue/
├── client/                     # Frontend Application
│   ├── public/                 # Static assets, icons, fonts
│   │   ├── index.html          # Main Dashboard
│   │   ├── contacts.html       # Contact & Group Management
│   │   ├── templates.html      # Template Studio
│   │   ├── campaigns.html      # Campaign List & Creator
│   │   ├── campaign-detail.html# Live Campaign Tracker & Telemetry
│   │   ├── settings.html       # Provider Configuration & API Keys
│   │   └── login.html          # Authentication
│   ├── css/
│   │   └── style.css           # Modern Design System (CSS tokens, dark mode)
│   └── js/
│       ├── api.js              # Centralized API client
│       ├── auth.js             # Auth state handler
│       ├── contacts.js         # Contact UI logic
│       ├── templates.js        # Template UI logic
│       ├── campaigns.js        # Campaign creation wizard
│       └── tracker.js          # Live SSE telemetry tracker
│
├── server/                     # Backend Application
│   ├── config/                 # Environment & app constants
│   ├── database/               # SQLite connection, schema & migrations
│   │   ├── schema.sql          # Core tables & indices
│   │   └── db.js               # Database connection manager
│   ├── middleware/             # Auth, validation, error handler
│   ├── controllers/            # Request handlers (auth, contacts, campaigns)
│   ├── providers/              # Email Provider Adapters
│   │   ├── base.provider.js    # Provider interface contract
│   │   ├── mock.provider.js    # Local test provider
│   │   ├── resend.provider.js  # Resend adapter
│   │   ├── ses.provider.js     # AWS SES adapter
│   │   ├── sendgrid.provider.js# SendGrid adapter
│   │   └── smtp.provider.js    # Standard SMTP adapter
│   ├── services/               # Business logic
│   │   ├── contact.service.js  # CSV import, validation, groups
│   │   ├── template.service.js # Token interpolation, preview
│   │   ├── campaign.service.js # Orchestration
│   │   └── suppression.service.js # Blacklist & unsubscribe logic
│   ├── queue/                  # Queue Engine
│   │   ├── queue.worker.js     # Dispatch worker
│   │   └── rate.limiter.js     # Token bucket rate controller
│   ├── routes/                 # Express API routes
│   └── server.js               # Server entrypoint
│
├── storage/                    # Local storage (SQLite DB, uploads)
├── .env.example                # Sample environment variables
├── package.json
└── README.md
```

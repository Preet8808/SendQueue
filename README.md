# SendQueue 🚀

**SendQueue** is an open-source, resilient, high-deliverability email campaign and queue dispatch platform. It is engineered to send bulk business and transactional emails through legitimate cloud email providers without hitting rate limits, getting blacklisted, or dropping messages.

---

## 💡 Why SendQueue?

Traditional bulk emailing tools either lock you into costly subscription tiers or resort to fragile scripts that trigger spam filters and account suspensions. SendQueue provides an enterprise-grade queue engine that bridges the gap:

- **Controlled Throughput:** Dispatches messages through a configurable token-bucket rate limiter that strictly honors provider limits and warming schedules.
- **Provider Agnostic:** Easily switch between **Amazon SES**, **Resend**, **SendGrid**, **Mailgun**, or standard **SMTP** using modular provider adapters. Includes a built-in **Mock Provider** for offline local development without spending credits.
- **Crash-Resilient State Machine:** Every recipient message is tracked atomically (`PENDING` → `QUEUED` → `SENDING` → `SENT` / `FAILED`). Server restarts automatically resume paused or interrupted queues with zero duplicate sends.
- **Audience & Hygiene Tools:** Smart CSV importer with auto column mapping, format validation, duplicate suppression, and automated unsubscribe header handling (RFC 8058).
- **Dynamic Personalization:** Template engine with fallback defaults (e.g., `{{first_name | "there"}}`) and instant dual-pane live preview with sample recipient switching.
- **Real-Time Dispatch Telemetry:** Live campaign monitoring powered by Server-Sent Events (SSE) tracking deliveries, bounces, and queue progress.

---

## 📐 System Architecture

```text
  [ Admin Web UI ]
         │
         ▼  (REST API + SSE)
  [ Express.js Core ]
    ├── Contact & List Segmenter (CSV import, validation)
    ├── Template Studio (token parser, live render)
    ├── Campaign Orchestrator
    └── Suppression Engine (unsubscribe / bounce guard)
         │
         ▼
  [ Database-Backed Dispatch Queue ]
    ├── Token Bucket Rate Limiter
    ├── Exponential Backoff & Retry Worker
    └── Idempotency Guard (no duplicate sends)
         │
         ▼
  [ Pluggable Provider Layer ]
    ├── Mock / Local Inbox (Zero-cost local testing)
    ├── Resend
    ├── Amazon SES
    ├── SendGrid / Mailgun
    └── Custom SMTP
```

---

## 🛠 Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** SQLite (with WAL mode for concurrent queue operations, upgradeable to PostgreSQL)
- **Frontend:** Vanilla HTML5, Modern CSS (Design tokens, glassmorphism, responsive, dark/light theme), Vanilla JS (ES Modules)
- **Real-Time Updates:** Server-Sent Events (SSE)
- **Security:** Argon2 / bcrypt password hashing, secure session management, rate-limited APIs

---

## 🗺 Implementation Roadmap

We are executing this project section-wise to ensure solid testing, architecture validation, and quality at every milestone:

- [x] **Phase 1: Project Skeleton, Environment & Database Core**
  - Node.js structure, environment config, SQLite schema, migration/seed mechanism, authentication.
- [x] **Phase 2: Contact Management, Groups & Smart CSV Importer**
  - Contact CRUD, auto-mapping CSV parser, deduplication, validation, contact segments.
- [x] **Phase 3: Template Studio & Live Dynamic Personalization Preview**
  - Template CRUD, token parser with fallbacks, side-by-side recipient preview, test email trigger.
- [x] **Phase 4: Multi-Provider Email Dispatcher & Test Sending**
  - Provider adapter interface, Mock provider, Resend / SES / SMTP adapters, provider configuration UI.
- [x] **Phase 5: Queue Engine, Rate Limiter & Campaign Orchestrator**
  - Campaign creation wizard, queue expansion, token bucket rate limiter, worker loop, resume on crash.
- [x] **Phase 6: Compliance, Webhooks & Delivery Analytics**
  - RFC 8058 one-click unsubscribe, global suppression list, webhook event ingestion, real-time telemetry.
- [x] **Phase 7: Frontend Polish, Live Telemetry & Production Hardening**
  - Unified dashboard, visual metrics, performance optimization, deployment guide.

For detailed technical specifications, refer to [SendQueue_Project_Plan.md](file:///d:/Preet/Others/Projects/SendQueue/SendQueue_Project_Plan.md).

---

## 📄 License
MIT License. Created for legitimate, opt-in email communications.

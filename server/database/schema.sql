-- SendQueue Database Schema (SQLite compatible, standard SQL)

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    company TEXT,
    category TEXT,
    custom_attributes TEXT, -- JSON format
    status TEXT DEFAULT 'active', -- active, unsubscribed, bounced, complained
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_groups (
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (contact_id, group_id)
);

CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    from_name TEXT NOT NULL,
    from_email TEXT NOT NULL,
    reply_to TEXT,
    status TEXT DEFAULT 'DRAFT', -- DRAFT, SCHEDULED, QUEUED, SENDING, PAUSED, COMPLETED, FAILED
    rate_limit_per_sec INTEGER DEFAULT 5,
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    scheduled_at DATETIME,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    personalization_data TEXT, -- JSON snapshot of resolved tokens
    status TEXT DEFAULT 'PENDING', -- PENDING, QUEUED, SENDING, SENT, DELIVERED, BOUNCED, FAILED
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    next_attempt_at DATETIME,
    error_message TEXT,
    provider_message_id TEXT,
    sent_at DATETIME,
    delivered_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppression_list (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    reason TEXT NOT NULL, -- unsubscribe, hard_bounce, complaint, manual
    source_campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
    recipient_id TEXT REFERENCES campaign_recipients(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- SENT, DELIVERED, BOUNCE, COMPLAINT, UNSUBSCRIBE
    raw_payload TEXT, -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_queue ON campaign_recipients(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_suppression_email ON suppression_list(email);

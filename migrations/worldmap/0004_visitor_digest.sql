CREATE TABLE IF NOT EXISTS visitor_digest_messages (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS visitor_digest_messages_at ON visitor_digest_messages(received_at);
CREATE TABLE IF NOT EXISTS visitor_digest_deliveries (
  day TEXT PRIMARY KEY,
  sent_at TEXT
);

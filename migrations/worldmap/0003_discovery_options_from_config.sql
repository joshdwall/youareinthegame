-- Options now live in config/communications.json (site-hub communications module). Drop the hard-coded CHECK list so a
-- new option is a config edit only. Same columns, same rows, same primary key (one answer per browser).
CREATE TABLE IF NOT EXISTS discovery_responses_v3 (
  browser_hash TEXT PRIMARY KEY,
  answer TEXT NOT NULL,
  answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO discovery_responses_v3 (browser_hash, answer, answered_at) SELECT browser_hash, answer, answered_at FROM discovery_responses;
DROP TABLE discovery_responses;
ALTER TABLE discovery_responses_v3 RENAME TO discovery_responses;

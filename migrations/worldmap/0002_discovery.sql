CREATE TABLE IF NOT EXISTS discovery_responses (
  browser_hash TEXT PRIMARY KEY,
  answer TEXT NOT NULL CHECK(answer IN ('random','word-of-mouth','search','social','link')),
  answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

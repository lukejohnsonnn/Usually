-- Same schema the Worker creates on first use (src/store/d1.js).
CREATE TABLE IF NOT EXISTS hd_daily_sets (
  date        TEXT PRIMARY KEY,
  ids         TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS hd_plays (
  id            TEXT PRIMARY KEY,
  player_id     TEXT NOT NULL,
  mode          TEXT NOT NULL,
  daily_key     TEXT UNIQUE,
  date          TEXT NOT NULL,
  question_ids  TEXT NOT NULL,
  snapshot      TEXT NOT NULL,
  results       TEXT NOT NULL,
  score         INTEGER NOT NULL DEFAULT 0,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS hd_plays_player ON hd_plays (player_id);

CREATE INDEX IF NOT EXISTS hd_plays_date ON hd_plays (date, mode);

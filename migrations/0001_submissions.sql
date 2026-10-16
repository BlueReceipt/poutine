-- Places visitors send, waiting for Alex's approval (Alex, 2026-10-15: every submission is approved
-- before it shows). Nothing here is shown on the map: approved places join data/places.json.
CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  -- pending, approved or rejected
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TEXT,
  name TEXT NOT NULL,
  housenumber TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  province TEXT NOT NULL DEFAULT '',
  postcode TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  -- address, street, me or hand: how the pin got where it is
  placed_by TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  -- A keyed hash of the sender's connection and the day, to stop spam; emptied after 30 days.
  -- Never the connection's address itself.
  sender TEXT NOT NULL DEFAULT ''
);

CREATE INDEX submissions_sender ON submissions (sender, created_at);
CREATE INDEX submissions_status ON submissions (status, created_at);

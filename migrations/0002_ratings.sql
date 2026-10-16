-- Ratings (Alex, 2026-10-16): 1 to 5 stars per place, shown at once, no approval. Written reviews
-- are switched off for now (REVIEWS_ON in src/domain/ratings.ts): comment stays empty until then.
CREATE TABLE ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The place's ID in the list: node/123, way/45, added/6
  place TEXT NOT NULL,
  -- A random ID the rater's browser keeps (no account): one rating per place each, changed in place
  rater TEXT NOT NULL,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- A keyed hash of the connection and the day, to stop spam; emptied after 30 days.
  sender TEXT NOT NULL DEFAULT '',
  -- Alex can hide a rating (npm run hide): it stops counting.
  hidden INTEGER NOT NULL DEFAULT 0,
  UNIQUE (place, rater)
);

CREATE INDEX ratings_sender ON ratings (sender, updated_at);
CREATE INDEX ratings_recent ON ratings (updated_at);

-- Each place's count and stars added up, kept with every rating: the map reads one row per place.
CREATE TABLE rating_totals (
  place TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  total INTEGER NOT NULL
);

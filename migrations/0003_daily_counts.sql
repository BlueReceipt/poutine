-- Daily counters (Alex, 2026-10-20: "Daily counters, nothing per person"): one row per day and
-- kind (share-place, share-story, share-photo, link-open, rating), only a number. No address, no
-- cookie, no browser ID.
CREATE TABLE daily_counts (
  -- YYYY-MM-DD, UTC
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);

-- Half stars (Alex, 2026-10-20: "can we do half a star too"): a rating gives ½ to 5 stars, in
-- halves. SQLite can't change a column's check, so the table is built again with the new one and
-- every rating copied over as it is (whole stars stay whole). rating_totals keeps its columns: a
-- total of half stars is stored as it comes (9.5).
CREATE TABLE ratings_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The place's ID in the list: node/123, way/45, added/6
  place TEXT NOT NULL,
  -- A random ID the rater's browser keeps (no account): one rating per place each, changed in place
  rater TEXT NOT NULL,
  -- ½ to 5, in halves
  stars REAL NOT NULL CHECK (stars BETWEEN 0.5 AND 5 AND stars * 2 = CAST(stars * 2 AS INTEGER)),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- A keyed hash of the connection and the day, to stop spam; emptied after 30 days.
  sender TEXT NOT NULL DEFAULT '',
  -- Alex can hide a rating (npm run hide): it stops counting.
  hidden INTEGER NOT NULL DEFAULT 0,
  -- "Did you have poutine here?": 1 yes, 0 no, NULL not asked or not answered (asked no longer)
  poutine INTEGER,
  UNIQUE (place, rater)
);

INSERT INTO ratings_new (id, place, rater, stars, comment, created_at, updated_at, sender, hidden, poutine)
  SELECT id, place, rater, stars, comment, created_at, updated_at, sender, hidden, poutine FROM ratings;

DROP TABLE ratings;

ALTER TABLE ratings_new RENAME TO ratings;

CREATE INDEX ratings_sender ON ratings (sender, updated_at);
CREATE INDEX ratings_recent ON ratings (updated_at);

-- "Add more info" and "Claim this spot" (Alex, 2026-10-20: "if we long press a poutine area, can
-- it open the function, add more info, and maybe claim a spot"): what a visitor corrects about a
-- place already on the map, or its owner's claim, waiting for Alex's approval on /admin. Nothing
-- here shows until he approves it; then `fix` holds what it lays over the place (src/domain/
-- changes.ts), shown at once and copied to data/fixes.json by `npm run fold`.
CREATE TABLE changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  -- pending, approved or rejected
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TEXT,
  -- The place's ID in the list: node/123, way/45, added/6.
  place TEXT NOT NULL,
  name TEXT NOT NULL,
  housenumber TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  postcode TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  facebook TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  hours TEXT NOT NULL DEFAULT '',
  closed INTEGER NOT NULL DEFAULT 0,
  claim INTEGER NOT NULL DEFAULT 0,
  -- An owner's phone or email, for Alex to confirm a claim; emptied once he decides.
  contact TEXT NOT NULL DEFAULT '',
  -- What the approved change lays over the place, as JSON (a fix).
  fix TEXT,
  -- A keyed hash of the sender's connection and the day, to stop spam; emptied after 30 days.
  sender TEXT NOT NULL DEFAULT ''
);

CREATE INDEX changes_sender ON changes (sender, created_at);
CREATE INDEX changes_status ON changes (status, created_at);

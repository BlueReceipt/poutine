-- Two visitors on the spot approve a place (Alex, 2026-10-22; src/domain/onTheSpot.ts): who sent a
-- place, as two keyed hashes only, its browser's random ID and its connection without the day (to
-- tell two people from one), both emptied after 30 days like `sender`. Never the address itself.
ALTER TABLE submissions ADD COLUMN visitor TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN connection TEXT NOT NULL DEFAULT '';
-- Who approved it: "alex", or "visitors" when two sends on the spot agreed; empty before this.
ALTER TABLE submissions ADD COLUMN approved_by TEXT NOT NULL DEFAULT '';
-- The send a second one confirmed (status "echo"): the first, approved with what this one adds.
-- A place Alex takes off after two visitors approved it is "removed".
ALTER TABLE submissions ADD COLUMN echo_of INTEGER;

CREATE INDEX submissions_spot ON submissions (status, placed_by, created_at);

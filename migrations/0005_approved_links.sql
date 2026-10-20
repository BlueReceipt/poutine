-- The approval page (Alex, 2026-10-20: "Approved places show from D1 at once, with no push"): an
-- approved place keeps its short link here, given when Alex approves it (src/domain/shortLinks.ts),
-- until `npm run fold` copies it to data/added.json and data/links.json. Fixes Alex makes before
-- approving are written over the row's own fields.
ALTER TABLE submissions ADD COLUMN link TEXT;

CREATE UNIQUE INDEX submissions_link ON submissions (link) WHERE link IS NOT NULL;

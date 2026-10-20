-- Ratings confirm the poutine (Alex, 2026-10-20): rating a place not confirmed yet asks "Did you
-- have poutine here?". Three yeses from different raters, and more yeses than noes, confirm it.
-- 1 yes, 0 no, NULL not asked or not answered.
ALTER TABLE ratings ADD COLUMN poutine INTEGER;

-- Kept with each place's count and stars, like them without hidden ratings.
ALTER TABLE rating_totals ADD COLUMN poutine_yes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rating_totals ADD COLUMN poutine_no INTEGER NOT NULL DEFAULT 0;

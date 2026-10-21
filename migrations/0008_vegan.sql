-- A vegan poutine on the menu (Alex, 2026-10-21: "can we have a vegan offering present tag. that
-- would make the aluminum plate green"): the box in Add more info. 1 or 0; empty for a change sent
-- before the box, which says nothing of it.
ALTER TABLE changes ADD COLUMN vegan INTEGER;

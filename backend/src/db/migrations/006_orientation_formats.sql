-- Expand the orientation CHECK constraint to include all new page-format keys.
-- The old constraint only allowed 'horizontal' and 'vertical'.
-- resolveFormat() in the frontend already maps those legacy values, so they
-- must remain valid; the new keys are added alongside them.

ALTER TABLE books
  DROP CONSTRAINT IF EXISTS books_orientation_check;

ALTER TABLE books
  ADD CONSTRAINT books_orientation_check
    CHECK (orientation IN (
      'horizontal',
      'vertical',
      'landscape-4-3',
      'portrait-2-3',
      'landscape-16-9',
      'portrait-3-4'
    ));

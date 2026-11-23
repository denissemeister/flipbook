-- Make the page_number range check deferrable so batch reorder can use
-- a temporary out-of-range offset within a transaction.
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_page_number_check;
ALTER TABLE pages ADD CONSTRAINT pages_page_number_check
  CHECK (page_number BETWEEN 1 AND 100) DEFERRABLE INITIALLY IMMEDIATE;

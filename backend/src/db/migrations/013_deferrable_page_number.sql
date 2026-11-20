ALTER TABLE pages DROP CONSTRAINT pages_book_id_page_number_key;
ALTER TABLE pages ADD CONSTRAINT pages_book_id_page_number_key
  UNIQUE (book_id, page_number) DEFERRABLE INITIALLY IMMEDIATE;

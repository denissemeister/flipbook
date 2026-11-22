-- Add 'media' as a valid element type (unified image/gif/video/audio element).

ALTER TABLE elements DROP CONSTRAINT IF EXISTS elements_type_check;
ALTER TABLE elements ADD CONSTRAINT elements_type_check
  CHECK (type IN ('text','image','gif','video','link','audio','bg','sfx','curvetext','media'));

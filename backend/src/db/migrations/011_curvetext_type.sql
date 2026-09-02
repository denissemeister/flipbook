-- Add 'curvetext' as a valid element type.

ALTER TABLE elements DROP CONSTRAINT IF EXISTS elements_type_check;
ALTER TABLE elements ADD CONSTRAINT elements_type_check
  CHECK (type IN ('text','image','gif','video','link','audio','bg','sfx','curvetext'));

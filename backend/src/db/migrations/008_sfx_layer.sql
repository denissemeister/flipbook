-- Add "Sound effects" as layer 5 and 'sfx' as a valid element type.

-- Extend the layer range from 1–4 to 1–5
ALTER TABLE elements DROP CONSTRAINT IF EXISTS elements_layer_check;
ALTER TABLE elements ADD CONSTRAINT elements_layer_check
  CHECK (layer BETWEEN 1 AND 5);

-- Add 'sfx' alongside the existing types
ALTER TABLE elements DROP CONSTRAINT IF EXISTS elements_type_check;
ALTER TABLE elements ADD CONSTRAINT elements_type_check
  CHECK (type IN ('text','image','gif','video','link','audio','bg','sfx'));

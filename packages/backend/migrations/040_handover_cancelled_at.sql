-- CON-05: Handover cancel window for commission hold
ALTER TABLE handovers ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

SELECT '040: handover cancelled_at added' AS status;

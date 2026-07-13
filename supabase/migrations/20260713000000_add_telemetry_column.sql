-- Add telemetry column to public.gameplay_records for replay input storage
ALTER TABLE public.gameplay_records ADD COLUMN IF NOT EXISTS telemetry JSONB;

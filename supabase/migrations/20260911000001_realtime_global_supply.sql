-- Enable Realtime on global_supply table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'global_supply'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.global_supply;
  END IF;
END $$;

ALTER TABLE public.global_supply REPLICA IDENTITY FULL;

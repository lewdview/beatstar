-- Create releases table
CREATE TABLE IF NOT EXISTS public.releases (
  id text PRIMARY KEY,
  day integer UNIQUE NOT NULL,
  date text,
  "fileName" text,
  title text,
  "canonicalTitle" text,
  "storageTitle" text,
  "manifestAudioPath" text,
  mood text,
  description text,
  "storedAudioUrl" text,
  "coverArt" text,
  "videoUrl" text,
  "customInfo" text,
  duration integer,
  "durationFormatted" text,
  tempo integer,
  key text,
  energy double precision,
  valence double precision,
  danceability double precision,
  acousticness double precision,
  instrumentalness double precision,
  loudness double precision,
  speechiness double precision,
  liveness double precision,
  "timeSignature" text,
  genre jsonb,
  tags jsonb,
  lyrics text,
  "lyricsSegments" jsonb,
  "lyricsWords" jsonb,
  status text NOT NULL DEFAULT 'released',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists
DROP POLICY IF EXISTS "Allow public read access to releases" ON public.releases;

-- Create policy to allow public select
CREATE POLICY "Allow public read access to releases" 
ON public.releases 
FOR SELECT 
TO public 
USING (status = 'released');

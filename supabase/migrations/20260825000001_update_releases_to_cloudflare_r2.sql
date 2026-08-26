-- Update all releases in database to point directly to Cloudflare R2 custom domain (th3scr1b3.art) with MP3 audio
UPDATE public.releases
SET 
  "storedAudioUrl" = REGEXP_REPLACE(
    REPLACE("storedAudioUrl", 'https://pznmptudgicrmljjafex.supabase.co/storage/v1/object/public/releaseready/', 'https://th3scr1b3.art/'),
    '\.wav$', '.mp3', 'i'
  ),
  "coverArt" = REPLACE("coverArt", 'https://pznmptudgicrmljjafex.supabase.co/storage/v1/object/public/releaseready/', 'https://th3scr1b3.art/');

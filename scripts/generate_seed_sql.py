#!/usr/bin/env python3
import json
from pathlib import Path

catalog_path = Path("artifacts/beatstar-vault/src/data/song_catalog.json")
with open(catalog_path, 'r', encoding='utf-8') as f:
    songs = json.load(f)

sql_lines = [
    "-- Ensure all columns exist on releases table",
    "ALTER TABLE public.releases",
    "  ADD COLUMN IF NOT EXISTS \"date\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS \"fileName\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS \"title\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS \"canonicalTitle\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS \"storageTitle\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS \"manifestAudioPath\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS \"mood\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS \"description\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS \"storedAudioUrl\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS \"coverArt\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS \"videoUrl\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS \"customInfo\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS duration INTEGER,",
    "  ADD COLUMN IF NOT EXISTS \"durationFormatted\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS tempo INTEGER,",
    "  ADD COLUMN IF NOT EXISTS key TEXT,",
    "  ADD COLUMN IF NOT EXISTS energy DOUBLE PRECISION,",
    "  ADD COLUMN IF NOT EXISTS valence DOUBLE PRECISION,",
    "  ADD COLUMN IF NOT EXISTS danceability DOUBLE PRECISION,",
    "  ADD COLUMN IF NOT EXISTS acousticness DOUBLE PRECISION,",
    "  ADD COLUMN IF NOT EXISTS instrumentalness DOUBLE PRECISION,",
    "  ADD COLUMN IF NOT EXISTS loudness DOUBLE PRECISION,",
    "  ADD COLUMN IF NOT EXISTS speechiness DOUBLE PRECISION,",
    "  ADD COLUMN IF NOT EXISTS liveness DOUBLE PRECISION,",
    "  ADD COLUMN IF NOT EXISTS \"timeSignature\" TEXT,",
    "  ADD COLUMN IF NOT EXISTS lyrics TEXT,",
    "  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'released';",
    "",
    "-- Seed releases table with all 365 catalog tracks",
    "INSERT INTO public.releases (day, date, title, \"canonicalTitle\", \"storageTitle\", mood, description, \"storedAudioUrl\", \"coverArt\", tempo, valence, energy, genre, tags, status)",
    "VALUES"
]

def to_sql_text_array(items):
    if not items:
        return "ARRAY[]::text[]"
    escaped = [f"'{str(x).replace("'", "''")}'" for x in items]
    return f"ARRAY[{', '.join(escaped)}]::text[]"

value_rows = []
for s in songs:
    day = s.get('day', 1)
    date = s.get('date', f"2026-01-{day:02d}")
    title = (s.get('title') or f"Day {day}").replace("'", "''")
    canonical_title = title
    storage_title = (s.get('storageTitle') or title).replace("'", "''")
    mood = s.get('mood', 'dark')
    desc = (s.get('description') or '').replace("'", "''")
    audio_url = (s.get('audioUrl') or '').replace("'", "''")
    cover_art = (s.get('coverArt') or '').replace("'", "''")
    tempo = int(s.get('bpm', 100))
    valence = float(s.get('valence', 0.5))
    energy = float(s.get('energy', 0.5))
    
    genres = s.get('genre', [])
    tags = s.get('moodTags') or s.get('tags') or []
    
    genre_sql = to_sql_text_array(genres)
    tags_sql = to_sql_text_array(tags)

    row = f"  ({day}, '{date}', '{title}', '{canonical_title}', '{storage_title}', '{mood}', '{desc}', '{audio_url}', '{cover_art}', {tempo}, {valence}, {energy}, {genre_sql}, {tags_sql}, 'released')"
    value_rows.append(row)

sql_lines.append(",\n".join(value_rows))
sql_lines.append("""
ON CONFLICT (day) DO UPDATE SET
  title = EXCLUDED.title,
  "canonicalTitle" = EXCLUDED."canonicalTitle",
  "storageTitle" = EXCLUDED."storageTitle",
  mood = EXCLUDED.mood,
  description = EXCLUDED.description,
  tempo = EXCLUDED.tempo,
  valence = EXCLUDED.valence,
  energy = EXCLUDED.energy,
  genre = EXCLUDED.genre,
  tags = EXCLUDED.tags,
  status = EXCLUDED.status;
""")

output_sql = Path("supabase/migrations/20260825000000_seed_365_releases.sql")
output_sql.write_text("\n".join(sql_lines), encoding='utf-8')
print(f"Generated {output_sql} with {len(songs)} song entries using text[] format.")

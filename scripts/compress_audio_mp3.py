#!/usr/bin/env python3
"""
PIM : th3v4ult — Master Audio Batch Compression Utility
Converts all uncompressed .wav audio files to studio-quality 320kbps MP3 while preserving all original WAV masters.
"""

import os
import sys
import time
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

SOURCE_DIR = Path("/Volumes/extremeUno/th3scr1b3-365-warp/365-releases/audio")
TARGET_DIR = Path("/Volumes/extremeUno/th3scr1b3-365-warp/365-releases/audio_mp3")
FFMPEG_PATH = "/opt/homebrew/bin/ffmpeg"
CONCURRENCY = min(8, os.cpu_count() or 4)

def format_bytes(size):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024:
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} TB"

def convert_file(src_path, dst_path):
    try:
        # Create parent directory if needed
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        
        src_size = src_path.stat().st_size
        
        # Skip if already converted and valid
        if dst_path.exists() and dst_path.stat().st_size > 1000:
            return {
                'status': 'skipped',
                'src': src_path,
                'dst': dst_path,
                'src_size': src_size,
                'dst_size': dst_path.stat().st_size
            }

        # Run ffmpeg to convert to 320k MP3 with 44.1kHz standard rate
        cmd = [
            FFMPEG_PATH,
            "-y",
            "-v", "error",
            "-i", str(src_path),
            "-vn",
            "-codec:a", "libmp3lame",
            "-b:a", "320k",
            "-ar", "44100",
            str(dst_path)
        ]

        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0:
            return {
                'status': 'error',
                'src': src_path,
                'error': res.stderr.strip(),
                'src_size': src_size,
                'dst_size': 0
            }

        dst_size = dst_path.stat().st_size
        return {
            'status': 'converted',
            'src': src_path,
            'dst': dst_path,
            'src_size': src_size,
            'dst_size': dst_size
        }
    except Exception as e:
        return {
            'status': 'error',
            'src': src_path,
            'error': str(e),
            'src_size': 0,
            'dst_size': 0
        }

def main():
    if not SOURCE_DIR.exists():
        print(f"ERROR: Source directory not found: {SOURCE_DIR}")
        sys.exit(1)

    print(f"================================================================")
    print(f"PIM : th3v4ult — Master Audio Batch Compression Utility")
    print(f"Source: {SOURCE_DIR}")
    print(f"Destination: {TARGET_DIR}")
    print(f"Threads: {CONCURRENCY}")
    print(f"Target Bitrate: 320 kbps MP3 (Originals Preserved)")
    print(f"================================================================")

    # Collect all WAV files
    wav_files = []
    for root, _, files in os.walk(SOURCE_DIR):
        for f in files:
            if f.startswith('._') or f.startswith('.'):
                continue
            if f.lower().endswith(('.wav', '.wave')):
                src = Path(root) / f
                # Determine relative path from SOURCE_DIR
                rel = src.relative_to(SOURCE_DIR)
                dst = TARGET_DIR / rel.with_suffix('.mp3')
                wav_files.append((src, dst))

    total_files = len(wav_files)
    print(f"Discovered {total_files} WAV tracks across all release folders.\n")

    if total_files == 0:
        print("No WAV files found to convert.")
        return

    start_time = time.time()
    converted_count = 0
    skipped_count = 0
    error_count = 0
    total_src_bytes = 0
    total_dst_bytes = 0

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = {executor.submit(convert_file, src, dst): (src, dst) for src, dst in wav_files}
        
        for i, future in enumerate(as_completed(futures), 1):
            res = future.result()
            total_src_bytes += res.get('src_size', 0)
            total_dst_bytes += res.get('dst_size', 0)
            
            status = res['status']
            src_file = res['src'].name
            
            if status == 'converted':
                converted_count += 1
                ratio = (1 - (res['dst_size'] / res['src_size'])) * 100 if res['src_size'] > 0 else 0
                print(f"[{i}/{total_files}] ✓ CONVERTED: {src_file} ({format_bytes(res['src_size'])} → {format_bytes(res['dst_size'])}, -{ratio:.1f}%)")
            elif status == 'skipped':
                skipped_count += 1
                print(f"[{i}/{total_files}] ⏩ SKIPPED (Already exists): {src_file}")
            else:
                error_count += 1
                print(f"[{i}/{total_files}] ❌ ERROR on {src_file}: {res.get('error')}")

    elapsed = time.time() - start_time
    savings_bytes = total_src_bytes - total_dst_bytes
    savings_pct = (savings_bytes / total_src_bytes) * 100 if total_src_bytes > 0 else 0

    print(f"\n================================================================")
    print(f"BATCH COMPRESSION COMPLETE in {elapsed:.2f} seconds")
    print(f"Converted: {converted_count} | Skipped: {skipped_count} | Errors: {error_count}")
    print(f"Original Master Size: {format_bytes(total_src_bytes)}")
    print(f"Compressed MP3 Size:  {format_bytes(total_dst_bytes)}")
    print(f"Total Storage Saved:  {format_bytes(savings_bytes)} ({savings_pct:.1f}% reduction)")
    print(f"Destination Folder:   {TARGET_DIR}")
    print(f"================================================================")

if __name__ == '__main__':
    main()

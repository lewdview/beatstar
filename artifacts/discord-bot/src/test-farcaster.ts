import { CONFIG } from './config.js';
import { catalogService } from './services/catalogService.js';

async function testFarcasterBroadcast() {
  const currentDay = catalogService.getCurrentDayOfYear();
  const song = catalogService.getSongByDay(currentDay);

  console.log(`[TestFarcaster] Testing broadcast for Day ${currentDay}:`, song?.title);

  const endpoint = `${CONFIG.SUPABASE_URL}/functions/v1/farcaster-webhook`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'broadcast',
      day: currentDay,
      songTitle: song?.title,
      songArtist: song?.artist,
      targetUrl: `${CONFIG.PIM_WEB_URL}/universe`
    })
  });

  const data = await response.json();
  console.log('[TestFarcaster] Result:', JSON.stringify(data, null, 2));
}

testFarcasterBroadcast().catch(console.error);

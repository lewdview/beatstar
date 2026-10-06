import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const ALLOWED_ORIGINS = [
  'https://pim.th3scr1b3.art',
  'https://beatstar-vault.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return true;
  if (/^https:\/\/(.*\.)?(warpcast\.com|recaster\.org|farcaster\.xyz|frames\.sh)$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = isAllowedOrigin(origin) ? origin : '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // GET: Health check & stats
  if (req.method === 'GET') {
    try {
      const { count, error } = await supabaseAdmin
        .from('farcaster_notification_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('enabled', true);

      return new Response(JSON.stringify({
        status: 'ok',
        service: 'pim-farcaster-webhook',
        activeSubscribers: error ? null : count,
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ status: 'ok', service: 'pim-farcaster-webhook' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const rawBody = await req.json();
    console.log('[farcaster-webhook] Received body:', JSON.stringify(rawBody).slice(0, 500));

    // Case 1: Direct Client Registration Action
    if (rawBody.action === 'register') {
      const { fid, notificationDetails } = rawBody;
      if (!fid || !notificationDetails?.token) {
        return new Response(JSON.stringify({ error: 'Missing fid or notificationDetails.token' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data, error } = await supabaseAdmin
        .from('farcaster_notification_tokens')
        .upsert({
          fid: Number(fid),
          token: notificationDetails.token,
          url: notificationDetails.url || 'https://api.warpcast.com/v1/frame-notifications',
          enabled: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fid,token' })
        .select()
        .single();

      if (error) {
        console.error('[farcaster-webhook] Register error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, registered: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Case 2: Broadcast Trigger Action (e.g. from Discord Bot or Admin)
    if (rawBody.action === 'broadcast') {
      const { day, songTitle, songArtist, targetUrl } = rawBody;
      const targetDay = Number(day) || 1;
      const title = `⚡ 365 DROP // DAY ${String(targetDay).padStart(3, '0')} IS LIVE!`;
      const body = songTitle
        ? `"${songTitle}" ${songArtist ? `by ${songArtist}` : ''} unlocked in PIM: th3v4ult.`
        : `Day ${targetDay} track & card drop unlocked in PIM: th3v4ult!`;
      const url = targetUrl || `https://pim.th3scr1b3.art/universe`;

      // Fetch all active tokens
      const { data: tokens, error: tokensErr } = await supabaseAdmin
        .from('farcaster_notification_tokens')
        .select('fid, token, url')
        .eq('enabled', true);

      if (tokensErr) {
        return new Response(JSON.stringify({ error: tokensErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!tokens || tokens.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'No active subscribers found', count: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Group tokens by notification endpoint URL (e.g. Warpcast)
      const groups = new Map<string, string[]>();
      for (const t of tokens) {
        const endpoint = t.url || 'https://api.warpcast.com/v1/frame-notifications';
        const list = groups.get(endpoint) || [];
        list.push(t.token);
        groups.set(endpoint, list);
      }

      let totalSent = 0;
      let totalSuccessful = 0;
      let totalInvalid = 0;
      const invalidTokensToDisable: string[] = [];

      for (const [endpoint, tokenList] of groups.entries()) {
        // Warpcast limits to 100 tokens per POST
        const CHUNK_SIZE = 100;
        for (let i = 0; i < tokenList.length; i += CHUNK_SIZE) {
          const chunk = tokenList.slice(i, i + CHUNK_SIZE);
          try {
            const resp = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                notificationId: `pim-drop-${targetDay}-${Date.now()}-${i}`,
                title,
                body,
                targetUrl: url,
                tokens: chunk
              })
            });

            const resJson = await resp.json().catch(() => ({}));
            totalSent += chunk.length;

            if (resJson?.result?.successfulTokens) {
              totalSuccessful += resJson.result.successfulTokens.length;
            }
            if (resJson?.result?.invalidTokens?.length) {
              totalInvalid += resJson.result.invalidTokens.length;
              invalidTokensToDisable.push(...resJson.result.invalidTokens);
            }
          } catch (sendErr) {
            console.warn(`[farcaster-webhook] Failed dispatching chunk to ${endpoint}:`, sendErr);
          }
        }
      }

      // Automatically disable dead/invalid tokens
      if (invalidTokensToDisable.length > 0) {
        await supabaseAdmin
          .from('farcaster_notification_tokens')
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .in('token', invalidTokensToDisable);
      }

      return new Response(JSON.stringify({
        success: true,
        broadcast: {
          day: targetDay,
          totalSubscribers: tokens.length,
          totalSent,
          totalSuccessful,
          totalInvalid
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Case 3: Standard Warpcast / Farcaster Webhook Event
    let event = rawBody.event;
    let notificationDetails = rawBody.notificationDetails;
    let fid: number | undefined = rawBody.fid;

    // Check for JFS (JSON Farcaster Signature envelope)
    if (rawBody.header && rawBody.payload) {
      try {
        const headerJson = JSON.parse(base64UrlDecode(rawBody.header));
        const payloadJson = JSON.parse(base64UrlDecode(rawBody.payload));
        fid = headerJson.fid;
        event = payloadJson.event;
        notificationDetails = payloadJson.notificationDetails;
      } catch (parseErr) {
        console.warn('[farcaster-webhook] Failed to parse JFS envelope:', parseErr);
      }
    }

    if (!event) {
      return new Response(JSON.stringify({ error: 'Unrecognized event format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[farcaster-webhook] Processing event: ${event} for FID: ${fid}`);

    // Handle frame_added & notifications_enabled
    if (event === 'frame_added' || event === 'notifications_enabled') {
      if (notificationDetails?.token && fid) {
        const { error } = await supabaseAdmin
          .from('farcaster_notification_tokens')
          .upsert({
            fid: Number(fid),
            token: notificationDetails.token,
            url: notificationDetails.url || 'https://api.warpcast.com/v1/frame-notifications',
            enabled: true,
            updated_at: new Date().toISOString()
          }, { onConflict: 'fid,token' });

        if (error) {
          console.error('[farcaster-webhook] Error saving notification token:', error);
        } else {
          console.log(`[farcaster-webhook] Successfully saved token for FID ${fid}`);
        }
      }
    } else if (event === 'frame_removed' || event === 'notifications_disabled') {
      if (fid) {
        await supabaseAdmin
          .from('farcaster_notification_tokens')
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq('fid', Number(fid));
        console.log(`[farcaster-webhook] Disabled notifications for FID ${fid}`);
      }
    }

    // Always respond 200 OK to Warpcast webhook
    return new Response(JSON.stringify({ success: true, event }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[farcaster-webhook] Unhandled error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

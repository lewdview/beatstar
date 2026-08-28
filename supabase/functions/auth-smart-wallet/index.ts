import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createPublicClient, http } from 'npm:viem@2.7.6';
import { base } from 'npm:viem@2.7.6/chains';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function generateDeterministicPassword(address: string, secretKey: string): Promise<string> {
  const data = new TextEncoder().encode(secretKey + address.toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.substring(0, 16) + '!aB1';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { address, message, signature, nonce } = await req.json();

    if (!address || !message || !signature) {
      throw new Error('Missing address, message, or signature');
    }

    const publicClient = createPublicClient({
      chain: base,
      transport: http('https://mainnet.base.org'),
    });

    const isValid = await publicClient.verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      throw new Error('Invalid signature');
    }

    // C2 FIX: Replay protection — validate nonce and timestamp in the signed message
    // Expected message format: "Sign in to PIM : th3v4ult\nNonce: <nonce>\nTimestamp: <ISO timestamp>"
    const nonceMatch = message.match(/Nonce:\s*([a-f0-9-]+)/i);
    const timestampMatch = message.match(/Timestamp:\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i);

    if (!nonceMatch || !timestampMatch) {
      throw new Error('Invalid message format: must contain Nonce and Timestamp');
    }

    const messageNonce = nonceMatch[1];
    const messageTimestamp = new Date(timestampMatch[1]);
    const now = new Date();
    const ageMs = now.getTime() - messageTimestamp.getTime();

    // Reject signatures older than 5 minutes
    if (ageMs > 5 * 60 * 1000 || ageMs < -30_000) {
      throw new Error('Signature expired or timestamp invalid');
    }

    // Verify nonce exists and hasn't been used (requires auth_nonces table)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Atomically consume the nonce — delete and check it existed
    const { data: nonceRow, error: nonceErr } = await supabaseAdmin
      .from('auth_nonces')
      .delete()
      .eq('nonce', messageNonce)
      .eq('wallet_address', address.toLowerCase())
      .select('*')
      .maybeSingle();

    if (nonceErr || !nonceRow) {
      throw new Error('Invalid or already-used nonce');
    }

    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const email = `${address.toLowerCase()}@smartwallet.th3vault.art`;
    const password = await generateDeterministicPassword(address, supabaseServiceKey);

    // Check if the caller is an anonymous user wanting to upgrade
    const authHeader = req.headers.get('authorization');
    let anonymousUserId: string | null = null;

    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user: callerUser } } = await supabaseAdmin.auth.getUser(token);
        if (callerUser?.is_anonymous) {
          anonymousUserId = callerUser.id;
        }
      } catch {
        // Not a valid token or not anonymous, proceed normally
      }
    }

    if (anonymousUserId) {
      // Check if this wallet already belongs to an existing user
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('wallet_address', address)
        .single();

      if (existingProfile && existingProfile.id !== anonymousUserId) {
        // Wallet belongs to another user — merge anonymous data into that user
        // Transfer vault_collections
        await supabaseAdmin.from('vault_collections').update({ owner_id: existingProfile.id }).eq('owner_id', anonymousUserId);
        // Transfer gameplay_records
        await supabaseAdmin.from('gameplay_records').update({ user_id: existingProfile.id }).eq('user_id', anonymousUserId);
        // Transfer user_fragments
        await supabaseAdmin.from('user_fragments').update({ user_id: existingProfile.id }).eq('user_id', anonymousUserId);
        // Transfer campaign_milestone_claims
        await supabaseAdmin.from('campaign_milestone_claims').update({ user_id: existingProfile.id }).eq('user_id', anonymousUserId);
        // Merge profile tokens/stats
        const { data: anonProfile } = await supabaseAdmin.from('profiles').select('tokens, total_pulls, streak_count').eq('id', anonymousUserId).single();
        if (anonProfile) {
          const { data: targetProfile } = await supabaseAdmin.from('profiles').select('tokens, total_pulls, streak_count').eq('id', existingProfile.id).single();
          if (targetProfile) {
            await supabaseAdmin.from('profiles').update({
              tokens: (targetProfile.tokens || 0) + (anonProfile.tokens || 0),
              total_pulls: (targetProfile.total_pulls || 0) + (anonProfile.total_pulls || 0),
              streak_count: Math.max(targetProfile.streak_count || 0, anonProfile.streak_count || 0),
            }).eq('id', existingProfile.id);
          }
        }
        // Clean up anonymous profile and user
        await supabaseAdmin.from('profiles').delete().eq('id', anonymousUserId);
        await supabaseAdmin.auth.admin.deleteUser(anonymousUserId);
        // Sign in as the existing wallet user
        const mergeAuth = await supabaseAuthClient.auth.signInWithPassword({ email, password });
        if (mergeAuth.error) throw new Error(`Failed to sign into merged account: ${mergeAuth.error.message}`);
        
        return new Response(JSON.stringify({
          success: true,
          session: mergeAuth.data.session,
          user: mergeAuth.data.user,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        // No existing wallet user — upgrade the anonymous user in place
        const { error: upgradeError } = await supabaseAdmin.auth.admin.updateUserById(anonymousUserId, {
          email,
          password,
          email_confirm: true,
          user_metadata: { wallet_address: address, is_smart_wallet: true },
        });
        if (upgradeError) throw new Error(`Failed to upgrade anonymous user: ${upgradeError.message}`);
        
        // Ensure profile has wallet address
        await supabaseAdmin.from('profiles').upsert({ id: anonymousUserId, wallet_address: address });
        
        // Sign in with the upgraded credentials
        const upgradeAuth = await supabaseAuthClient.auth.signInWithPassword({ email, password });
        if (upgradeAuth.error) throw new Error(`Failed to sign into upgraded account: ${upgradeAuth.error.message}`);
        
        return new Response(JSON.stringify({
          success: true,
          session: upgradeAuth.data.session,
          user: upgradeAuth.data.user,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 1. Try to sign in deterministically
    let authResponse = await supabaseAuthClient.auth.signInWithPassword({ email, password });

    if (authResponse.error && authResponse.error.message.includes('Invalid login credentials')) {
      // 2. If it fails, create the user
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { wallet_address: address, is_smart_wallet: true },
      });
      // Retry sign in
      authResponse = await supabaseAuthClient.auth.signInWithPassword({ email, password });
    }

    if (authResponse.error) {
      throw new Error(`Sign in failed: ${authResponse.error.message}`);
    }

    let session = authResponse.data.session;
    let user = authResponse.data.user;

    // 3. Ensure profile exists and is correct for this user ID
    const { data: profile } = await supabaseAdmin.from('profiles').select('wallet_address').eq('id', user.id).single();

    if (!profile) {
      // Profile is missing! Try to insert it.
      const { error: insertErr } = await supabaseAdmin.from('profiles').insert({ id: user.id, wallet_address: address });
      
      if (insertErr) {
        // If it fails, it's likely because the wallet_address is already owned by an OLD legacy Web3 account!
        const { data: oldProfile } = await supabaseAdmin.from('profiles').select('id').ilike('wallet_address', address).single();
        
        if (oldProfile) {
          // Delete the useless new account we just created to free up the email
          await supabaseAdmin.auth.admin.deleteUser(user.id);
          
          // Force update the old user's auth account to our deterministic credentials
          const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(oldProfile.id, {
             email,
             password,
             user_metadata: { wallet_address: address, is_smart_wallet: true }
          });

          if (updateErr) throw new Error(`Failed to claim old profile: ${updateErr.message}`);

          // Sign in to the OLD user!
          const retryAuth = await supabaseAuthClient.auth.signInWithPassword({ email, password });
          if (retryAuth.error) throw new Error(`Failed to sign into claimed profile: ${retryAuth.error.message}`);
          
          session = retryAuth.data.session;
          user = retryAuth.data.user;
        } else {
          throw new Error(`Profile insert failed: ${insertErr.message}`);
        }
      }
    } else if (profile.wallet_address !== address) {
      // Profile exists but wallet address is null or different (legacy)
      await supabaseAdmin.from('profiles').update({ wallet_address: address }).eq('id', user.id);
    }

    // 3. Return the full session to the frontend!
    return new Response(JSON.stringify({ 
      success: true, 
      session,
      user
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Smart Wallet Auth Error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

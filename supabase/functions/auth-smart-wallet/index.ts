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
    const { address, message, signature } = await req.json();

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const email = `${address.toLowerCase()}@smartwallet.th3vault.art`;
    const password = await generateDeterministicPassword(address, supabaseServiceKey);

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
      session: authResponse.data.session,
      user: authResponse.data.user
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

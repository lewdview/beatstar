const { Wallet } = require('ethers');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://pznmptudgicrmljjafex.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Generating new ephemeral wallet...');
  const wallet = Wallet.createRandom();
  const address = wallet.address;
  const message = `Sign in to th3vault on Base. Nonce: ${Date.now()}`;
  console.log('Wallet address:', address);

  console.log('Signing message...');
  const signature = await wallet.signMessage(message);

  console.log('Invoking auth-smart-wallet edge function...');
  const { data, error } = await supabase.functions.invoke('auth-smart-wallet', {
    body: { address, message, signature }
  });

  if (error || !data?.success) {
    console.error('Edge function invocation failed:', error || data);
    return;
  }

  console.log('Edge function response data success. Setting session...');
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  if (sessionError) {
    console.error('Set session failed:', sessionError);
    return;
  }

  const userId = data.user.id;
  console.log('Session set successfully. User ID:', userId);

  // Fetch profile
  console.log('Fetching profile...');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('Error fetching profile:', profileError);
  } else {
    console.log('Fetched profile:', profile);
  }

  // Attempt update
  console.log('Updating has_onboarded to true...');
  const { data: updateData, error: updateError } = await supabase
    .from('profiles')
    .update({ has_onboarded: true })
    .eq('id', userId)
    .select();

  if (updateError) {
    console.error('Error updating profile:', updateError);
  } else {
    console.log('Updated profile successfully:', updateData);
  }

  // Cleanup: sign out
  await supabase.auth.signOut();
  console.log('Signed out.');
}

run().catch(console.error);

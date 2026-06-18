import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pznmptudgicrmljjafex.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Signing in anonymously...');
  const { data: { session }, error: authError } = await supabase.auth.signInAnonymously();
  if (authError) {
    console.error('Auth error:', authError);
    return;
  }
  const userId = session.user.id;
  console.log('Signed in successfully. User ID:', userId);

  // Check if profile exists
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

  // Attempt to update has_onboarded to true
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

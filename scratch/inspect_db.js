const SUPABASE_URL = 'https://pznmptudgicrmljjafex.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g';

async function testDecrement() {
  const url = `${SUPABASE_URL}/rest/v1/rpc/decrement_tokens`;
  
  // Test user ID from profiles: '616f08f9-d2b5-46a2-9b2d-d394f0e10660'
  const payload = {
    user_uuid: '616f08f9-d2b5-46a2-9b2d-d394f0e10660',
    amount: 100000 // A very large amount to force negative if not validated
  };
  
  console.log('Sending payload:', payload);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    console.log('Status code:', res.status);
    const bodyText = await res.text();
    console.log('Response body:', bodyText);
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}

testDecrement();

const SUPABASE_URL = 'https://pznmptudgicrmljjafex.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g';

const tables = [
  'profiles',
  'vault_collections',
  'global_supply',
  'gameplay_records',
  'user_fragments',
  'campaign_milestone_claims',
  'admin_config',
  'releases'
];

async function checkTables() {
  for (const table of tables) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      console.log(`Table: ${table} -> Status: ${res.status}`);
      if (res.status !== 200) {
        const text = await res.text();
        console.log(`  Error body: ${text}`);
      } else {
        const data = await res.json();
        console.log(`  Data example:`, data);
      }
    } catch (err) {
      console.error(`  Fetch failed for ${table}:`, err);
    }
  }
}

checkTables();

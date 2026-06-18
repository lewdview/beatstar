process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import pg from 'pg';
const { Client } = pg;

delete process.env.PGUSER;
delete process.env.PGPASSWORD;
delete process.env.PGDATABASE;
delete process.env.PGHOST;
delete process.env.PGPORT;

const client = new Client({
  user: 'postgres.pznmptudgicrmljjafex',
  password: 'runeflow-admin-2025',
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgrespznmptudgicrmljjafex',
  ssl: { rejectUnauthorized: false }
});

console.log('PG Env keys:', Object.keys(process.env).filter(k => k.startsWith('PG')));
console.log('Client options:', {
  user: client.connectionParameters.user,
  database: client.connectionParameters.database,
  host: client.connectionParameters.host,
  port: client.connectionParameters.port,
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p
    INNER JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'decrement_tokens';
  `);
  if (res.rows.length > 0) {
    console.log(res.rows[0].def);
  } else {
    console.log('Function not found');
  }
  await client.end();
}

run().catch(console.error);

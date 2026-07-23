delete process.env.PGUSER;
delete process.env.PGPASSWORD;
delete process.env.PGDATABASE;
delete process.env.PGHOST;
delete process.env.PGPORT;

const pg = require('pg');
const { Client } = pg;

const client = new Client({
  user: 'postgres.pznmptudgicrmljjafex',
  password: 'giveME1221!sex',
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  // 1. Get policies
  console.log('--- POLICIES ---');
  const policiesRes = await client.query(`
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE schemaname = 'public';
  `);
  console.table(policiesRes.rows);

  // 2. Get columns of public.profiles
  console.log('--- profiles COLUMNS ---');
  const colsRes = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles';
  `);
  console.table(colsRes.rows);

  // 3. Get all tables in public schema
  console.log('--- TABLES ---');
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public';
  `);
  console.table(tablesRes.rows);

  await client.end();
}

run().catch(console.error);

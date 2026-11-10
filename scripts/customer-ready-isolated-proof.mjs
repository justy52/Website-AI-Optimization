import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';
import { writeFileSync } from 'node:fs';
config({path:'.env.local',quiet:true});
const url=new URL(process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL_UNPOOLED);
if(url.hostname!=='ep-odd-violet-arabm5ch.c-4.us-west-2.aws.neon.tech'||url.pathname!=='/virelantic_preview')throw Error('Isolated preview only');
const pool=new Pool({connectionString:url.toString()});
try{
  const q=process.argv[2]||'inspect';
  const schema=(await pool.query('select count(*)::int n from drizzle.__drizzle_migrations')).rows[0];
  if(q==='inspect') console.log(JSON.stringify({database:url.pathname,migrations:schema.n,runtimeRole:new URL(process.env.DATABASE_URL).username,submitRole:new URL(process.env.PUBLIC_INTAKE_DATABASE_URL).username}));
  if(q==='confirm'){
    const request=(await pool.query("select id,state,payload,lead_id,retention_until from public_audit_requests where payload->>'email'='customer-ready-20261104@example.com' order by created_at desc limit 1")).rows[0];
    if(!request)throw Error('Synthetic enquiry missing');
    if(request.payload.website!=='https://example.com/')throw Error('URL normalization failed');
    const duplicates=(await pool.query("select count(*)::int n from public_audit_requests where payload->>'email'='customer-ready-20261104@example.com'")).rows[0].n;
    const roles=(await pool.query('select rolname,rolsuper,rolbypassrls,rolinherit from pg_roles where rolname=any($1)',[[new URL(process.env.DATABASE_URL).username,new URL(process.env.PUBLIC_INTAKE_DATABASE_URL).username]])).rows;
    const grants=(await pool.query("select has_table_privilege($1,'public.public_audit_requests','select') request_read,has_table_privilege($1,'public.leads','select') lead_read,has_schema_privilege($1,'public','create') schema_create",[new URL(process.env.PUBLIC_INTAKE_DATABASE_URL).username])).rows[0];
    const proof={isolated:true,migrations:schema.n,syntheticRequest:request,matchingRequestCount:duplicates,roles,submitGrants:grants};
    writeFileSync('../../outputs/intake-database-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
  }
}finally{await pool.end();}

// Read-only preparation; credentials arrive through the existing private local store.
import { Pool } from '@neondatabase/serverless';
import { writeFileSync } from 'node:fs';
const url=new URL(process.env.MIGRATION_DATABASE_URL);
if(url.hostname!=='ep-proud-violet-bfzvmucw.c-5.us-west-2.aws.neon.tech'||url.pathname!=='/virelantic_production'||url.username!=='virelantic_migrator')throw Error('Wrong production target');
const pool=new Pool({connectionString:url.toString()});
try{
  await pool.query('begin read only');
  const workspace='1c6453fd-5fc9-4e20-a488-4f81b8a608f2';
  await pool.query("select set_config('app.workspace_id',$1,true)",[workspace]);
  const destination=(await pool.query('select workspace_id from public_intake_destination where singleton=true')).rows;
  const roles=(await pool.query("select rolname,rolcanlogin,rolsuper,rolbypassrls,rolinherit from pg_roles where rolname like 'virelantic_intake_%'")).rows;
  const activeOwners=(await pool.query("select count(*)::int n from workspace_memberships where workspace_id=$1 and role='OWNER' and status='ACTIVE'",[workspace])).rows[0].n;
  const workspaceFound=(await pool.query('select id from workspaces where id=$1 and archived_at is null',[workspace])).rowCount===1;
  const migrationCount=(await pool.query('select count(*)::int n from drizzle.__drizzle_migrations')).rows[0].n;
  const publicRole='virelantic_intake_public_submit';
  const permissions=roles.length?(await pool.query("select has_table_privilege($1,'public.public_audit_requests','SELECT') request_read,has_table_privilege($1,'public.leads','SELECT') lead_read,has_schema_privilege($1,'public','CREATE') schema_create,has_function_privilege($1,'public.submit_public_audit_request(jsonb,text,text,text,text,uuid)','EXECUTE') submit_execute",[publicRole])).rows[0]:null;
  const requestCount=(await pool.query('select count(*)::int n from public_audit_requests where workspace_id=$1',[workspace])).rows[0].n;
  const proof={readOnly:true,workspace,workspaceFound,activeOwners,migrationCount,destination,roles,permissions,requestCount,productionChangedByThisCheck:false};
  writeFileSync('../../outputs/production-intake-readiness.json',JSON.stringify(proof,null,2));
  console.log(JSON.stringify(proof));
  await pool.query('rollback');
}finally{await pool.end();}

import { Pool } from '@neondatabase/serverless';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';
const ownerUrl=new URL(process.env.MIGRATION_DATABASE_URL);
if(ownerUrl.hostname!=='ep-proud-violet-bfzvmucw.c-5.us-west-2.aws.neon.tech'||ownerUrl.pathname!=='/virelantic_production'||ownerUrl.username!=='virelantic_migrator')throw Error('Wrong target');
const settings=parse(readFileSync('.env.intake.local'));
if(settings.PUBLIC_INTAKE_ENABLED!=='false')throw Error('Intake must stay closed');
const submitUrl=new URL(settings.PUBLIC_INTAKE_DATABASE_URL);
if(submitUrl.username!=='virelantic_intake_public_submit'||submitUrl.hostname.replace('-pooler.','.')!==ownerUrl.hostname||submitUrl.pathname!==ownerUrl.pathname)throw Error('Wrong submit role');
const pool=new Pool({connectionString:ownerUrl.toString()});
try{
  const role=(await pool.query('select rolsuper,rolbypassrls,rolinherit from pg_roles where rolname=$1',[submitUrl.username])).rows[0];
  if(!role||Object.values(role).some(Boolean))throw Error('Role is not restricted');
  const replacement=randomBytes(32).toString('hex');
  await pool.query(`alter role virelantic_intake_public_submit password '${replacement}'`);
  submitUrl.password=replacement;
  settings.PUBLIC_INTAKE_DATABASE_URL=submitUrl.toString();
  writeFileSync('.env.intake.local',Object.entries(settings).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n');
  console.log('Restricted intake credential replaced; same role and permissions; intake remains closed.');
}finally{await pool.end();}

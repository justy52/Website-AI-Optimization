import { config } from 'dotenv';
import { spawn } from 'node:child_process';
config({path:'.vercel/.env.phase5-test.local',quiet:true});
const url=new URL(process.env.OPTIQ_TEST_RUNNER_URL);
if(url.pathname!=='/optiq_phase5_review_final_20260922'||!url.hostname.startsWith('ep-shy-firefly-arkuloja'))throw new Error('Designated disposable database required');
const env={...process.env,APP_ENV:'local',DATABASE_URL:process.env.OPTIQ_TEST_RUNNER_URL,DATABASE_URL_UNPOOLED:process.env.OPTIQ_TEST_RUNNER_URL,BETTER_AUTH_URL:'http://localhost:3100',BETTER_AUTH_SECRET:'disposable-recovery-auth-secret-not-for-deployment',CREDENTIAL_ENCRYPTION_KEY:'disposable-recovery-encryption-not-for-deployment',AGENT_PROVIDER:'deterministic',PERPLEXITY_API_KEY:'',QA_EXECUTE_ENABLED:'false'};
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3100','--hostname','127.0.0.1'],{env,stdio:'inherit',windowsHide:true});
process.on('SIGTERM',()=>child.kill());process.on('SIGINT',()=>child.kill());child.on('exit',code=>process.exit(code??1));

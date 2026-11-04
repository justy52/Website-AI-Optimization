import {config} from 'dotenv';
import {spawnSync} from 'node:child_process';
config({path:'.env.local',quiet:true});
config({path:'.env.intake.local',quiet:true,override:true});
Object.assign(process.env,{NODE_ENV:'test',PUBLIC_INTAKE_ENABLED:'true',PUBLIC_INTAKE_ORIGIN:'http://localhost:3117',DISPATCH_TEST_RUNNER_URL:process.env.DATABASE_URL,OPTIQ_INTAKE_LIVE_TEST:'true'});
const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','src/db/runtime-role.live.test.ts','src/server/dispatch-recovery.live.test.ts','src/server/intake-queue.integration.test.ts','--reporter=verbose'],{env:process.env,stdio:'inherit',windowsHide:true});
process.exitCode=result.status??1;

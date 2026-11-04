import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
config({path:".env.local",quiet:true});
const url = new URL(process.env.DATABASE_URL_UNPOOLED);
if (url.hostname !== "ep-delicate-paper-arppa8no.c-4.us-west-2.aws.neon.tech" || url.pathname !== "/virelantic_public_intake_preview") throw new Error("Not the isolated preview.");
const owner = new Pool({connectionString:url.toString()});
try {
  if (process.argv[2] === "fail-intake") {
    await owner.query("revoke execute on function public.submit_public_audit_request(jsonb,text,text,text,text,uuid) from virelantic_intake_preview_submit");
    console.log("preview_submit_temporarily_unavailable");
  } else if (process.argv[2] === "restore-intake") {
    await owner.query("grant execute on function public.submit_public_audit_request(jsonb,text,text,text,text,uuid) to virelantic_intake_preview_submit");
    console.log("preview_submit_restored");
  } else if (process.argv[2] === "operator") {
    const email = `operator-${randomBytes(5).toString("hex")}@example.com`;
    const password = randomBytes(20).toString("hex");
    const response = await fetch("http://localhost:3107/api/auth/sign-up/email", {method:"POST",headers:{origin:"http://localhost:3107","content-type":"application/json"},body:JSON.stringify({email,password,name:"Intake Preview Operator"})});
    if (!response.ok) throw new Error(`Synthetic signup failed: ${response.status}`);
    const data = await response.json();
    const workspaceId = process.env.PUBLIC_INTAKE_WORKSPACE_ID;
    await owner.query("select set_config('app.workspace_id',$1,false)",[workspaceId]);
    await owner.query("insert into workspace_memberships(workspace_id,user_id,role,status) values($1,$2,'OWNER','ACTIVE')",[workspaceId,data.user.id]);
    writeFileSync(".intake-preview-operator.local.json",JSON.stringify({email,password,userId:data.user.id,workspaceId}));
    console.log("synthetic_preview_operator_ready; credentials_in_ignored_local_file");
  } else throw new Error("Choose operator, fail-intake, or restore-intake.");
} finally { await owner.end(); }

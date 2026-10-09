// Offline operator command. Requires PORTAL_ADMIN_NAME, PORTAL_ADMIN_EMPLOYEE_ID,
// PORTAL_ADMIN_EMAIL and PORTAL_ADMIN_PASSWORD in the process environment.
// Apply migrations first, then execute the generated SQL with wrangler d1 execute.
import { mkdir, writeFile } from 'node:fs/promises';
import { hashPassword, normalizeEmail } from '../src/portal/auth.mjs';

const { PORTAL_ADMIN_NAME:name, PORTAL_ADMIN_EMPLOYEE_ID:employeeId, PORTAL_ADMIN_EMAIL:rawEmail, PORTAL_ADMIN_PASSWORD:password } = process.env;
const email = normalizeEmail(rawEmail);
if (!name?.trim() || name.length > 120 || !employeeId?.trim() || employeeId.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password) {
  throw new Error('Provide valid PORTAL_ADMIN_NAME, PORTAL_ADMIN_EMPLOYEE_ID, PORTAL_ADMIN_EMAIL, PORTAL_ADMIN_PASSWORD environment variables.');
}
const account = { id:crypto.randomUUID(), name:name.trim(), employeeId:employeeId.trim(), email, role:'Admin', jobFunctions:[], profile:{}, passwordHash:await hashPassword(password), mustChangePassword:true, active:true, credentialVersion:0, createdAt:new Date().toISOString(), deactivatedAt:null };
// A single guarded UPDATE is atomic in D1. Zero affected rows means already bootstrapped;
// the operator must verify the changed-row count rather than interpreting no error as success.
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const document = JSON.stringify({schema:1,users:[account],clients:[],tasks:[],updates:[],absences:[],notes:[],notifications:[],subscriptions:[],audit:[{id:crypto.randomUUID(),actorId:account.id,action:'admin.bootstrap',at:account.createdAt,subjectId:account.id}]});
const sql = `-- Private one-time bootstrap: apply migration first to the intended D1 database.\n-- Require exactly one affected row; zero means already bootstrapped or not migrated.\nUPDATE portal_state SET document = ${literal(document)}, revision = revision + 1 WHERE id = 1 AND revision = 0 AND json_array_length(json_extract(document, '$.users')) = 0;\n`;
await mkdir('.portal-local',{recursive:true,mode:0o700});
await writeFile('.portal-local/admin-bootstrap.sql',sql,{flag:'wx',mode:0o600});
console.info('Private bootstrap SQL created at .portal-local/admin-bootstrap.sql. Apply only to the intended migrated D1 database.');

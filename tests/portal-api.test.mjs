import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePortalApi } from '../src/portal/api.mjs';
import { tokenHash, hashPassword } from '../src/portal/auth.mjs';

const db={prepare(sql){ return {bind(...args){return {async first(){ if (sql.includes('portal_sessions')) return null; if (sql.includes('portal_state')) return {revision:0,document:JSON.stringify({schema:1,users:[],clients:[],tasks:[],updates:[],absences:[],notes:[],notifications:[],subscriptions:[]})}; return null; },async run(){return {meta:{changes:1}}} };},async first(){return null;}}; }};
const call=(path,options={}) => handlePortalApi(new Request('https://portal.example'+path,options),{PORTAL_DB:db});

test('anonymous snapshot and export are denied without revealing state',async()=>{
  for(const endpoint of ['snapshot','analytics','export']) {
    const response=await call('/api/portal/'+endpoint);
    assert.equal(response.status,401);
    assert.match(response.headers.get('Cache-Control'),/no-store/);
    assert.equal((await response.json()).error,'Sign in required.');
  }
});
test('mutations require same-origin Origin and no public signup exists',async()=>{
  const request={method:'POST',headers:{'Content-Type':'application/json'},body:'{}'};
  assert.equal((await call('/api/portal/actions',request)).status,403);
  assert.equal((await call('/api/portal/signup',{...request,headers:{...request.headers,Origin:'https://portal.example'}})).status,401);
});

function fixture(users, tasks=[]) {
  let revision=0, state={schema:1,users,clients:[],tasks,updates:[],absences:[],notes:[],notifications:[],subscriptions:[],audit:[]};
  const sessions=new Map();
  const db={prepare(sql){const bound=values => ({
    async first(){
      if (sql.includes('FROM portal_state')) return {revision,document:JSON.stringify(state)};
      if (sql.includes('FROM portal_sessions')) return sessions.get(values[0]) || null;
      return null;
    },
    async run(){
      if (sql.startsWith('UPDATE portal_state')) {
        if (revision !== values[1]) return {meta:{changes:0}};
        state=JSON.parse(values[0]); revision++; return {meta:{changes:1}};
      }
      if (sql.startsWith('DELETE FROM portal_sessions')) {
        for (const [key,value] of sessions) if (sql.includes('user_id') ? value.user_id === values[0] : key === values[0]) sessions.delete(key);
      }
      return {meta:{changes:1}};
    }
  }); return {bind(...values){return bound(values);},first(){return bound([]).first();}};}};
  return {db,sessions,get state(){return state;}};
}
const asUser=(fixture,user,token='a'.repeat(64)) => {
  const csrf=tokenHash('csrf:'+token);
  fixture.sessions.set(tokenHash(token),{user_id:user.id,csrf_hash:tokenHash(csrf),credential_version:user.credentialVersion || 0});
  return { Cookie:`portal_session=${token}`,Origin:'https://portal.example','X-CSRF-Token':csrf,'Content-Type':'application/json' };
};
test('employee unchanged email edit preserves session, changed email invalidates and audit contains no credentials',async()=>{
  const admin={id:'admin',role:'Admin',name:'Admin',email:'admin@example.com',active:true,credentialVersion:0};
  const employee={id:'emp',role:'Employee',name:'Sam',employeeId:'E1',email:'sam@example.com',jobFunctions:['Design'],active:true,credentialVersion:0};
  const f=fixture([admin,employee]); const headers=asUser(f,admin); asUser(f,employee,'b'.repeat(64));
  const update=email => callWith(f,'actions','POST',headers,{type:'employee.update',id:'emp',name:'Sam',employeeId:'E1',email,jobFunctions:['Design']});
  assert.equal((await update('sam@example.com')).status,200);
  assert.equal(f.sessions.size,2);
  assert.equal(f.state.users[1].credentialVersion,0);
  assert.equal((await update('sam.changed@example.com')).status,200);
  assert.equal(f.sessions.size,1);
  assert.equal(f.state.users[1].credentialVersion,1);
  assert.equal(f.state.audit.length,2);
  assert.equal(JSON.stringify(f.state.audit).includes('sam.changed@example.com'),false);
});
const callWith=(f,path,method,headers,body) => handlePortalApi(new Request('https://portal.example/api/portal/'+path,{method,headers,body:body && JSON.stringify(body)}),{PORTAL_DB:f.db});
test('team task summary uses real duration without disclosing description, events or intervals',async()=>{
  const employee={id:'viewer',role:'Employee',name:'Viewer',employeeId:'V',active:true,credentialVersion:0};
  const coworker={id:'owner',role:'Employee',name:'Owner',employeeId:'O',active:true,credentialVersion:0};
  const t={id:'task',title:'Work',description:'Private customer link',assigneeId:'owner',clientId:'c',jobFunction:'Design',deadline:'2026-10-09T12:00:00Z',priority:'Normal',state:'Completed',createdAt:'2026-10-05T04:30:00Z',completedAt:'2026-10-05T07:30:00Z',version:2,intervals:[{start:'2026-10-05T04:30:00Z',end:'2026-10-05T07:30:00Z'}],events:[{reason:'Private feedback'}]};
  const f=fixture([employee,coworker],[t]); const headers=asUser(f,employee);
  const response=await callWith(f,'snapshot','GET',headers);
  assert.equal(response.status,200); const data=await response.json();
  assert.equal(data.tasks[0].workSeconds,10800);
  for (const privateField of ['description','intervals','events']) assert.equal(privateField in data.tasks[0],false);
  assert.equal(data.employees[1].email,undefined);
});
test('push mutation refuses forced-password-change sessions, without storing a subscription',async()=>{
  const employee={id:'emp',role:'Employee',name:'Emp',employeeId:'E',active:true,credentialVersion:0,mustChangePassword:true};
  const f=fixture([employee]); const headers=asUser(f,employee);
  const response=await handlePortalApi(new Request('https://portal.example/api/portal/push-subscription',{method:'POST',headers,body:JSON.stringify({subscription:null})}),{PORTAL_DB:f.db});
  assert.equal(response.status,403);
  assert.deepEqual(f.state.subscriptions,[]);
  assert.deepEqual(f.state.audit,[]);
});

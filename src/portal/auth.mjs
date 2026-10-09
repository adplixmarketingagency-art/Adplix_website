import { scryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
const enc = new TextEncoder(), hex = b => Array.from(b, n => n.toString(16).padStart(2, '0')).join('');
const bytes = h => Uint8Array.from(h.match(/../g), n => parseInt(n, 16));
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const tokenHash = t => hex(sha256(enc.encode(t)));
export const normalizeEmail = v => typeof v === 'string' ? v.trim().toLowerCase() : '';
export const validPassword = v => typeof v === 'string' && v.length >= 12 && v.length <= 256 && enc.encode(v).length <= 1024;
export async function hashPassword(v) {
  if (!validPassword(v)) throw Object.assign(new Error('Password must be 12–256 characters.'), { status: 400 });
  const salt = crypto.getRandomValues(new Uint8Array(24));
  const hash = await scryptAsync(enc.encode(v), salt, { N: 32768, r: 8, p: 3, dkLen: 32, maxmem: 64 * 1024 * 1024 });
  return `scrypt-v1$32768$8$3$${hex(salt)}$${hex(hash)}`;
}
export async function verifyPassword(v, encoded) {
  if (typeof v !== 'string' || v.length > 256 || enc.encode(v).length > 1024 || typeof encoded !== 'string') return false;
  const m = /^scrypt-v1\$32768\$8\$3\$([a-f0-9]{48})\$([a-f0-9]{64})$/.exec(encoded);
  if (!m) return false;
  const actual = await scryptAsync(enc.encode(v), bytes(m[1]), { N: 32768, r: 8, p: 3, dkLen: 32, maxmem: 64 * 1024 * 1024 });
  const expected = bytes(m[2]);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
export const publicUser = u => ({ id:u.id,name:u.name,employeeId:u.employeeId,email:u.email,role:u.role,designation:u.designation||'',jobFunctions:u.jobFunctions||[],profile:u.profile||{},mustChangePassword:!!u.mustChangePassword,active:!!u.active,createdAt:u.createdAt || null,deactivatedAt:u.deactivatedAt || null });
export function cookie(token, request, env) {
  const secure = new URL(request.url).protocol === 'https:';
  if (!secure && (env.PORTAL_ALLOW_HTTP_LOCAL !== 'true' || !['localhost','127.0.0.1'].includes(new URL(request.url).hostname))) throw Object.assign(new Error('HTTPS required.'), { status: 503 });
  return `portal_session=${token}; HttpOnly; SameSite=Strict; Path=/api/portal; Max-Age=604800${secure ? '; Secure' : ''}`;
}
export const clearCookie = r => `portal_session=; HttpOnly; SameSite=Strict; Path=/api/portal; Max-Age=0${new URL(r.url).protocol === 'https:' ? '; Secure' : ''}`;
export const sameOrigin = r => !!r.headers.get('Origin') && r.headers.get('Origin') === new URL(r.url).origin;

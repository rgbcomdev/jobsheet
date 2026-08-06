export const ADMIN_COOKIE = "rgb_admin_session";

function getSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "rgb-jobsheet-dev-secret"
  );
}

export function getAdminCredentials() {
  return {
    id: process.env.ADMIN_ID || "admin",
    password: process.env.ADMIN_PASSWORD || "rgb16236",
  };
}

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

async function hmacHex(payload: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return toHex(sig);
}

export async function signAdminSession(
  username: string,
  maxAgeSec = 60 * 60 * 24 * 7
) {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  const payload = `${username}.${exp}`;
  const sig = await hmacHex(payload, getSecret());
  return `${payload}.${sig}`;
}

export async function verifyAdminSession(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [username, expStr, sig] = parts;
  const payload = `${username}.${expStr}`;
  const expected = await hmacHex(payload, getSecret());
  if (!timingSafeEqualHex(sig, expected)) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const { id } = getAdminCredentials();
  return username === id;
}

export function validateSitePassword(password: string) {
  const cred = getAdminCredentials();
  if (password.length !== cred.password.length) return false;
  let out = 0;
  for (let i = 0; i < password.length; i++) {
    out |= password.charCodeAt(i) ^ cred.password.charCodeAt(i);
  }
  return out === 0;
}

/** @deprecated 사이트는 비밀번호만 사용. 호환용으로 유지 */
export function validateAdminLogin(id: string, password: string) {
  const cred = getAdminCredentials();
  if (id && id !== cred.id) return false;
  return validateSitePassword(password);
}

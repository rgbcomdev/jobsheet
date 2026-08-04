import { createHmac, timingSafeEqual } from "crypto";

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

export function signAdminSession(username: string, maxAgeSec = 60 * 60 * 24 * 7) {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  const payload = `${username}.${exp}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyAdminSession(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [username, expStr, sig] = parts;
  const payload = `${username}.${expStr}`;
  const expected = createHmac("sha256", getSecret()).update(payload).digest("hex");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const { id } = getAdminCredentials();
  return username === id;
}

export function validateAdminLogin(id: string, password: string) {
  const cred = getAdminCredentials();
  const idOk =
    id.length === cred.id.length &&
    timingSafeEqual(Buffer.from(id), Buffer.from(cred.id));
  const pwOk =
    password.length === cred.password.length &&
    timingSafeEqual(Buffer.from(password), Buffer.from(cred.password));
  return idOk && pwOk;
}

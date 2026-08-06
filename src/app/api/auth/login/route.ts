import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  getAdminCredentials,
  signAdminSession,
  validateSitePassword,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: { id?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const password = body.password || "";

  if (!validateSitePassword(password)) {
    return NextResponse.json(
      { error: "비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  const { id } = getAdminCredentials();
  // 브라우저를 닫으면 사라지는 세션 쿠키 (maxAge 없음)
  const token = await signAdminSession(id, 60 * 60 * 12);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}

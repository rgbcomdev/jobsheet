import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  signAdminSession,
  validateAdminLogin,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: { id?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const id = (body.id || "").trim();
  const password = body.password || "";

  if (!validateAdminLogin(id, password)) {
    return NextResponse.json(
      { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  const token = signAdminSession(id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

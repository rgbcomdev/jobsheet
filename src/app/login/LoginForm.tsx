"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin";

  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "로그인에 실패했습니다.");
        setLoading(false);
        return;
      }
      // 쿠키가 반영된 뒤 미들웨어를 통과하도록 풀 리로드
      window.location.assign(next.startsWith("/") ? next : "/admin");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="wrap" style={{ maxWidth: 420, paddingTop: 80 }}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/" className="back-btn">
          ← 대시보드
        </Link>
      </div>
      <div className="admin-page-section" style={{ margin: 0 }}>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>관리자 로그인</h1>
        <p className="admin-sub" style={{ marginTop: 0 }}>
          통합관리 페이지는 관리자 계정으로 로그인한 뒤 이용할 수 있습니다.
        </p>
        <form
          onSubmit={onSubmit}
          className="emp-edit-form"
          style={{ marginTop: 20 }}
        >
          <div className="emp-edit-row">
            <label htmlFor="adminId">아이디</label>
            <input
              id="adminId"
              autoComplete="username"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="admin"
              required
            />
          </div>
          <div className="emp-edit-row">
            <label htmlFor="adminPw">비밀번호</label>
            <input
              id="adminPw"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
              {error}
            </p>
          )}
          <div
            className="modal-footer"
            style={{ borderTop: "none", paddingTop: 8 }}
          >
            <button type="submit" className="modal-save" disabled={loading}>
              {loading ? "확인 중…" : "로그인"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

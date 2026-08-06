"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

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
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "비밀번호가 올바르지 않습니다.");
        setLoading(false);
        return;
      }
      window.location.assign(next.startsWith("/") ? next : "/");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="wrap" style={{ maxWidth: 420, paddingTop: 100 }}>
      <div className="admin-page-section" style={{ margin: 0 }}>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>RGB 업무일지</h1>
        <p className="admin-sub" style={{ marginTop: 0 }}>
          비밀번호를 입력하면 사이트에 접속할 수 있습니다.
        </p>
        <form
          onSubmit={onSubmit}
          className="emp-edit-form"
          style={{ marginTop: 20 }}
        >
          <div className="emp-edit-row">
            <label htmlFor="sitePw">비밀번호</label>
            <input
              id="sitePw"
              type="password"
              autoComplete="current-password"
              autoFocus
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
              {loading ? "확인 중…" : "입장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

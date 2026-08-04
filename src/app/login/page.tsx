import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="wrap">
          <p style={{ color: "var(--text-muted)" }}>불러오는 중…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

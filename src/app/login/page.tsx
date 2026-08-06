import { Suspense } from "react";
import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "RGB 업무일지",
};

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

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "업무일지 사용가이드 | RGB",
  description: "RGB communications 업무일지 사용 매뉴얼 v1.15",
};

export default function ManualPage() {
  return (
    <iframe
      className="manual-iframe"
      src="/manual/index.html"
      title="RGB 업무일지 사용가이드"
    />
  );
}

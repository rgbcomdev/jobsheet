import type { Metadata } from "next";
import "./globals.css";
import { JobsheetProvider } from "@/context/JobsheetContext";

export const metadata: Metadata = {
  title: "RGB 업무일지",
  description: "RGB 월간 업무일지 · 캘린더 · KPI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body>
        <JobsheetProvider>{children}</JobsheetProvider>
      </body>
    </html>
  );
}

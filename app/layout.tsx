import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "택시팟",
  description: "막차 이후 성북구 택시 합승 매칭 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "택시팟 | 같은 방향, 가벼운 귀가",
  description: "성북구에서 함께 돌아갈 친구를 만나고 택시비를 나눠요.",
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

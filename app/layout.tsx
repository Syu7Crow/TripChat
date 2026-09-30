import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tripchat",
  description: "計画から精算まで、これひとつで完結する旅のしおり",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        {/* next/font/googleはこのバージョンだと日本語サブセットに対応していないため、
            Google FontsのCSSを直接読み込む(ブラウザが必要な文字だけ自動で取得する) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App RouterのRoot Layoutでの意図的な使用 */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

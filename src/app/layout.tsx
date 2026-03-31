import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TVG2 - 番組表ビューア",
  description: "地上波・BS・CSの番組表ビューア",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

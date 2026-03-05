import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Telegram Uploader Bot",
  description: "Serverless Telegram uploader bot"
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

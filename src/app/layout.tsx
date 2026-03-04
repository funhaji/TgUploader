import type { ReactNode } from "react";

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

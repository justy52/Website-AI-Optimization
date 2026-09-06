import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "OPTIQ",
  description: "Website and AI optimization operating system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

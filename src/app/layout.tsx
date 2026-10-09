import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoudMetric",
  description: "Self-hosted, cookie-free analytics that tells you what people actually read.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

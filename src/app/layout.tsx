import localFont from "next/font/local";
import "./globals.css";

/**
 * Geist, self-hosted.
 *
 * `next/font/google` exposes Geist only from Next 15, and this project is on 14.
 * The alternative was a runtime <link> to fonts.googleapis.com, which would put
 * a third party in the request path — and this product's entire claim is that
 * nothing about a visitor leaves the machine. A marketing page for analytics
 * that phones Google Fonts would be an own goal.
 *
 * So the two woff2 files are vendored under src/fonts and loaded through
 * next/font/local, which still gives the subsetting, preloading and zero-layout-
 * shift behaviour that makes font loading invisible.
 *
 * Geist Sans sets the interface. Geist Mono sets code, identifiers and tabular
 * figures, so digits align in a column and a value changing from 999 to 1,000
 * does not shift the column beside it.
 */
const geistSans = localFont({
  src: "../fonts/Geist.woff2",
  variable: "--font-geist-sans",
  display: "swap",
  weight: "400 600",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const geistMono = localFont({
  src: "../fonts/GeistMono.woff2",
  variable: "--font-geist-mono",
  display: "swap",
  weight: "400 600",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata = {
  title: "LoudMetric",
  description:
    "Self-hosted, cookie-free analytics that tells you what people actually read, and how fast your site really is.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

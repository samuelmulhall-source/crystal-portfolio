import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SmoothScroll from "./components/SmoothScroll";
import ConsoleFilter from "./components/ConsoleFilter";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// ── Update SITE_URL to your production domain ──────────────────────────────
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://multiscatter.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Multiscatter | 3D Artist & WebGPU Portfolio — Interactive 3D Developer",
  description:
    "Multiscatter is a 3D artist and interactive developer working across Blender, " +
    "Houdini, WebGPU and React Three Fiber. Environments, animated intros, " +
    "game assets, product visualisation, and experimental real-time experiences.",
  keywords: [
    "Blender artist", "3D artist", "WebGPU portfolio", "Three.js portfolio",
    "interactive 3D developer", "React Three Fiber", "procedural 3D",
    "game asset artist", "product visualisation", "motion graphics",
    "Houdini artist", "Substance Painter", "multiscatter",
  ],
  authors: [{ name: "Multiscatter", url: "https://x.com/multiscatter" }],
  creator: "Multiscatter",
  openGraph: {
    type:        "website",
    url:         SITE_URL,
    title:       "Multiscatter | 3D Artist & WebGPU Portfolio",
    description:
      "Full-pipeline 3D artist: environments, animated intros, game assets, " +
      "and real-time WebGPU experiences. Open for commissions and collaborations.",
    siteName:    "Multiscatter",
    // Add a 1200×630 render to /public/og-image.jpg for rich social previews
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Multiscatter 3D Portfolio" }],
  },
  twitter: {
    card:        "summary_large_image",
    site:        "@multiscatter",
    creator:     "@multiscatter",
    title:       "Multiscatter | 3D Artist & WebGPU Portfolio",
    description:
      "Full-pipeline 3D artist: environments, animated intros, game assets, " +
      "and real-time WebGPU experiences.",
    images:      ["/og-image.jpg"],
  },
  robots: {
    index:   true,
    follow:  true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  alternates: { canonical: SITE_URL },
};

// ── JSON-LD structured data ────────────────────────────────────────────────
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id":   `${SITE_URL}/#person`,
      name:    "Multiscatter",
      url:     SITE_URL,
      sameAs:  ["https://x.com/multiscatter"],
      jobTitle: "3D Artist",
      description:
        "Full-pipeline 3D artist working with Blender, Houdini, WebGPU, and " +
        "React Three Fiber. Specialising in environments, animated intros, game " +
        "assets, product visualisation, and experimental real-time experiences.",
      knowsAbout: [
        "Blender", "3D Modeling", "Procedural Geometry", "WebGPU",
        "Three.js", "React Three Fiber", "Houdini", "Substance Painter",
        "Motion Graphics", "Game Asset Creation",
      ],
    },
    {
      "@type": "WebSite",
      "@id":   `${SITE_URL}/#website`,
      url:     SITE_URL,
      name:    "Multiscatter",
      description: "Interactive 3D artist portfolio with live WebGPU model viewer",
      author:  { "@id": `${SITE_URL}/#person` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        <ConsoleFilter />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}

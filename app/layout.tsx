import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DisplayModeProvider } from "./components/site/DisplayModeProvider";
import { DisplayModeScript } from "./components/site/DisplayModeScript";
import ConsoleFilter from "./components/ConsoleFilter";
import FpsMeter from "./components/site/FpsMeter";
import { getSiteSettings } from "./lib/content";

// Geist (Vercel, SIL OFL 1.1), self-hosted — no font CDN at runtime or build.
// Serif Triangle: titles and the wordmark. Sans: text. Mono: figures only.
const serif = localFont({ src: "./fonts/geist/GeistSerif-Triangle.woff2", variable: "--lit-serif", display: "swap" });
const sans = localFont({ src: "./fonts/geist/Geist-Variable.woff2", variable: "--lit-sans", weight: "100 900", display: "swap" });
const mono = localFont({ src: "./fonts/geist/GeistMono-Variable.woff2", variable: "--lit-mono", weight: "100 900", display: "swap" });

const siteSettings = getSiteSettings();

export const metadata: Metadata = {
  metadataBase: new URL(siteSettings.deployment.siteUrl),
  title: {
    default: siteSettings.seo.defaultTitle,
    template: siteSettings.seo.titleTemplate,
  },
  description: siteSettings.seo.description,
  keywords: siteSettings.seo.keywords,
  authors: [{ name: siteSettings.brand.name, url: siteSettings.social.xUrl }],
  alternates: {
    canonical: siteSettings.deployment.siteUrl,
  },
  openGraph: {
    type: "website",
    url: siteSettings.deployment.siteUrl,
    title: siteSettings.seo.defaultTitle,
    description: siteSettings.seo.description,
    siteName: siteSettings.brand.name,
    images: [
      {
        url: siteSettings.seo.defaultOgImage,
        alt: `${siteSettings.brand.name} portfolio preview`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteSettings.seo.defaultTitle,
    description: siteSettings.seo.description,
    site: siteSettings.social.xHandle,
    creator: siteSettings.social.xHandle,
    images: [siteSettings.seo.defaultOgImage],
  },
};

// JSON-LD — machine-readable identity for search/preview cards. Person (the
// artist) + WebSite in one @graph; per-entry VisualArtwork lives on the work
// detail pages. `<` is escaped so content strings can never close the script.
const structuredData = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      name: siteSettings.brand.name,
      jobTitle: siteSettings.brand.studioLabel,
      url: siteSettings.deployment.siteUrl,
      sameAs: [siteSettings.social.xUrl],
    },
    {
      "@type": "WebSite",
      name: siteSettings.brand.name,
      url: siteSettings.deployment.siteUrl,
      description: siteSettings.seo.description,
    },
  ],
}).replace(/</g, "\\u003c");

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: structuredData }}
        />
        <DisplayModeScript
          enhancedMinDeviceMemory={siteSettings.qualityPresets.enhancedMinDeviceMemory}
          enhancedMinHardwareConcurrency={siteSettings.qualityPresets.enhancedMinHardwareConcurrency}
        />
        <DisplayModeProvider
          enhancedMinDeviceMemory={siteSettings.qualityPresets.enhancedMinDeviceMemory}
          enhancedMinHardwareConcurrency={siteSettings.qualityPresets.enhancedMinHardwareConcurrency}
        >
          <ConsoleFilter />
          {children}
          <FpsMeter />
        </DisplayModeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { DisplayModeProvider } from "./components/site/DisplayModeProvider";
import { DisplayModeScript } from "./components/site/DisplayModeScript";
import { QualityProvider } from "./components/site/QualityProvider";
import EnhancementLayers from "./components/site/EnhancementLayers";
import ConsoleFilter from "./components/ConsoleFilter";
import SmoothScroll from "./components/SmoothScroll";
import FpsMeter from "./components/site/FpsMeter";
import { getSiteSettings } from "./lib/content";

// Body / UI typeface — Archivo (clean modern grotesque).
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

// Hero wordmark — VTKS Trunkset (self-hosted display, subset to A-Z/a-z/0-9
// as woff2: 274 KB ttf → 117 KB; it renders exactly one word).
const displayFont = localFont({
  src: "./fonts/vtks-trunkset-subset.woff2",
  variable: "--font-display",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${displayFont.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <DisplayModeScript
          enhancedMinDeviceMemory={siteSettings.qualityPresets.enhancedMinDeviceMemory}
          enhancedMinHardwareConcurrency={siteSettings.qualityPresets.enhancedMinHardwareConcurrency}
        />
        <DisplayModeProvider
          enhancedMinDeviceMemory={siteSettings.qualityPresets.enhancedMinDeviceMemory}
          enhancedMinHardwareConcurrency={siteSettings.qualityPresets.enhancedMinHardwareConcurrency}
        >
          <QualityProvider>
            <ConsoleFilter />
            <EnhancementLayers />
            <SmoothScroll>
              {children}
            </SmoothScroll>
            <FpsMeter />
          </QualityProvider>
        </DisplayModeProvider>
      </body>
    </html>
  );
}

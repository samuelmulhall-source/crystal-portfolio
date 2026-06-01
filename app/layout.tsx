import type { Metadata } from "next";
import { Archivo, Archivo_Black, IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import VoidBackground from "./components/VoidBackground";
import EffectsOverlay from "./components/EffectsOverlay";
import SmokeLayersGate from "./components/SmokeLayersGate";
import { DisplayModeProvider } from "./components/site/DisplayModeProvider";
import { DisplayModeScript } from "./components/site/DisplayModeScript";
import SmoothScroll from "./components/SmoothScroll";
import CursorFollower from "./components/CursorFollower";
import { getSiteSettings } from "./lib/content";

// Body / UI — clean modern grotesque (var name kept to avoid CSS churn)
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

// Hero wordmark — heavy display, distressed + glowing in CSS
const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: ["400"],
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
      className={`${archivo.variable} ${archivoBlack.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* Distress filter for the hero wordmark — eroded, printed edges */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
          <filter id="wordmark-distress">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.16" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="wordmark-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="g" />
            <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.2 1.05" result="grain" />
            <feComposite in="SourceGraphic" in2="grain" operator="in" />
          </filter>
        </svg>
        <DisplayModeScript
          enhancedMinDeviceMemory={siteSettings.qualityPresets.enhancedMinDeviceMemory}
          enhancedMinHardwareConcurrency={siteSettings.qualityPresets.enhancedMinHardwareConcurrency}
        />
        <DisplayModeProvider
          enhancedMinDeviceMemory={siteSettings.qualityPresets.enhancedMinDeviceMemory}
          enhancedMinHardwareConcurrency={siteSettings.qualityPresets.enhancedMinHardwareConcurrency}
        >
          <VoidBackground />
          <EffectsOverlay />
          <SmokeLayersGate />
          <SmoothScroll>
            {children}
          </SmoothScroll>
          <CursorFollower />
        </DisplayModeProvider>
        <Analytics />
      </body>
    </html>
  );
}

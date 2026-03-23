import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { StarfieldBackground } from "./components/site/StarfieldBackground";
import { DisplayModeProvider } from "./components/site/DisplayModeProvider";
import { DisplayModeScript } from "./components/site/DisplayModeScript";
import SmoothScroll from "./components/SmoothScroll";
import { getSiteSettings } from "./lib/content";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const plexMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
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
      className={`${geistSans.variable} ${plexMono.variable}`}
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
          <StarfieldBackground />
          <SmoothScroll>
            {children}
          </SmoothScroll>
        </DisplayModeProvider>
        <Analytics />
      </body>
    </html>
  );
}

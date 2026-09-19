import type { Metadata, Viewport } from "next";
// leaflet.css first: it ships unlayered, so importing it after globals.css
// would let it win over our own .leaflet-container override.
import "leaflet/dist/leaflet.css";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Flex — Smart Commuter Companion",
  description: "Find the best time and way to travel within your flexible arrival window.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f6e5b" },
    { media: "(prefers-color-scheme: dark)", color: "#101412" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bg text-text" suppressHydrationWarning>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}

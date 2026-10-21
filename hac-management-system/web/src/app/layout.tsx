import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegistration from "@/components/PwaRegistration";
export const metadata: Metadata = {
  title: "HAC | Certification & Inspection",
  description:
    "HAC certification records, accountable inspections and product verification.",
  manifest: "/manifest.webmanifest",
  applicationName: "HAC Inspect",
  icons: { icon: "/branding/hac-app-192.png", apple: "/branding/apple-touch-icon.png" },
  appleWebApp: {capable:true,title:"HAC Inspect",statusBarStyle:"default"},
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#102b36",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}

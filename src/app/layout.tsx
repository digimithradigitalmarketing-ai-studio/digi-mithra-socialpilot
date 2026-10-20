import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { ServiceWorker } from "@/components/service-worker";

export const metadata: Metadata = {
  title: { default: "Digi Mithra Social Pilot", template: "%s · Social Pilot" },
  description: "All-in-one social media automation: publishing, inbox, AI, CRM and analytics in one place.",
  applicationName: "Social Pilot",
  appleWebApp: { capable: true, title: "Social Pilot", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#050805",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}

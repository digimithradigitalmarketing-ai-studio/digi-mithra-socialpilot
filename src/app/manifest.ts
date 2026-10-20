import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Digi Mithra Social Pilot",
    short_name: "Social Pilot",
    description: "All-in-one social media automation in one place.",
    start_url: "/app",
    display: "standalone",
    background_color: "#050805",
    theme_color: "#050805",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Compose post", url: "/app/compose" },
      { name: "Inbox", url: "/app/inbox" },
      { name: "Leads", url: "/app/crm" },
    ],
  };
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Circuvent Technologies",
    short_name: "Circuvent",
    description:
      "Engineering intelligent systems at the intersection of AI, IoT, and Full-Stack Engineering.",
    start_url: "/",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#06b6d4",
    orientation: "portrait-primary",
    categories: ["technology", "developer tools", "business"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

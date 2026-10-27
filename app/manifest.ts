import type { MetadataRoute } from "next";

/** Lets phones "Add to Home Screen" so Ironlog opens like an app, full-screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ironlog — your gym coach",
    short_name: "Ironlog",
    description: "Pick a goal, get today's workout, log your lifts, and see what to train next. Saved to your account.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d0d0d",
    theme_color: "#0d0d0d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

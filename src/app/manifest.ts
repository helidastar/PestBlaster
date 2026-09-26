import type { MetadataRoute } from "next";

/** Lets growers add the app to their phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PestBlaster",
    short_name: "PestBlaster",
    description: "Watch and control the PestBlaster lettuce pest turret.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef2e2",
    theme_color: "#3d6b2a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

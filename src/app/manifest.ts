import type { MetadataRoute } from "next";

/** Lets growers add the app to their phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PestBlaster",
    short_name: "PestBlaster",
    description: "Watch and control the PestBlaster lettuce pest turret.",
    start_url: "/",
    display: "standalone",
    background_color: "#e9efdd",
    theme_color: "#173a22",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

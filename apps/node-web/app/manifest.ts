import type { MetadataRoute } from "next";

/** Installable on a phone's Home Screen: a standalone window with the Ensemble mark. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ensemble Node",
    short_name: "Node",
    description: "Your AI teammates, working on your own computer, in rooms with your people.",
    start_url: "/chat",
    display: "standalone",
    background_color: "#081113",
    theme_color: "#081113",
    icons: [{ src: "/brand/woven-satin.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}

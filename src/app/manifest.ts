import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "חוזרים לבראשית",
    short_name: "חוזרים לבראשית",
    description: "מרחב הליווי האישי שלך",
    start_url: "/",
    display: "standalone",
    background_color: "#173d27",
    theme_color: "#173d27",
    // Deliberately "any"-purpose only, on a transparent background — the
    // logo has almost no built-in padding, and a "maskable" icon would
    // need an opaque safe-zone fill to survive OS cropping, which is
    // exactly the solid-background look this app doesn't want.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}

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
    // "any" icons stay transparent (desktop installs render them as-is —
    // just the floating logo). "maskable" gets an opaque brand-green
    // backdrop: Android crops/masks that variant into whatever shape the
    // launcher wants, and without a real backing layer it substitutes its
    // own default (usually a plain white circle) — there's no way to get
    // a truly transparent icon on an Android home screen.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

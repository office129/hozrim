"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { driveEmbedUrl, driveFileId, youTubeEmbedUrl } from "@/lib/external-links";

// pdf.js (used inside PdfViewer) references browser-only globals like
// DOMMatrix at module-evaluation time, which crashes during server-side
// rendering — ssr: false keeps it out of the SSR pass entirely, only ever
// loading in the browser.
const PdfViewer = dynamic(() => import("./PdfViewer").then((m) => m.PdfViewer), { ssr: false });

let driveProxyDisabled: Promise<boolean> | null = null;

// Returns true only when the server *explicitly* reports the Drive proxy is
// off (not configured / not connected). Any other outcome - success saying
// it's on, a 401, a blocked or failed request - is treated as "proxy on".
//
// This matters on iOS installed PWAs, where a client-side fetch sometimes
// doesn't carry the session cookie even though the <video> element's own
// request does. Gating playback on that fetch would wrongly conclude the
// proxy is off and drop every Drive video to Google's sign-in-gated
// preview. Staying on the proxy unless told otherwise keeps playback
// working there, and still falls back correctly on setups that really
// have no Drive connection (where the check returns a clean enabled:false).
function isDriveProxyDisabled(): Promise<boolean> {
  if (!driveProxyDisabled) {
    driveProxyDisabled = fetch("/api/drive/status", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.enabled === false)
      .catch(() => false);
  }
  return driveProxyDisabled;
}

// While our own server is set up to read from the coach's Drive (a
// service account shared on the folder), this streams the file's real
// bytes through us and back into a normal <video>/<audio> element — full
// control over how it looks, same as a directly uploaded file. Until
// that's configured, we fall back to Google's own embedded preview.
function useDriveProxySrc(url: string): string | null {
  const fileId = driveFileId(url);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    isDriveProxyDisabled().then((off) => {
      if (!cancelled && off) setDisabled(true);
    });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (!fileId) return null;
  // Optimistic: play through our proxy straight away, and only step back to
  // Google's preview if the server confirms the proxy is off. No "checking"
  // limbo, and no wrongful fallback when a PWA background check misfires.
  return disabled ? null : `/api/drive/${fileId}`;
}

export function VideoEmbed({ url, className }: { url: string; className?: string }) {
  const proxySrc = useDriveProxySrc(url);
  const embed = driveEmbedUrl(url);

  // A YouTube link isn't a playable file for a <video> element — it needs
  // YouTube's own iframe player. Handled first so a pasted YouTube URL just
  // works anywhere a video is expected (e.g. an intro clip in the roadmap).
  const youtube = youTubeEmbedUrl(url);
  if (youtube) {
    return (
      <iframe
        src={youtube}
        className={className}
        style={{ border: 0, aspectRatio: "16/9", minHeight: 220 }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    );
  }

  if (proxySrc) return <video controls playsInline preload="metadata" className={className} src={proxySrc} />;

  if (embed) {
    return (
      <iframe
        src={embed}
        className={className}
        // Drive's own video-player chrome (scrubber, play button,
        // fullscreen icon) is fixed-size UI, not truly responsive — on a
        // narrow phone, aspect-ratio 16/9 alone can squeeze it down to
        // where the controls are barely legible/tappable. The floor keeps
        // real room for it regardless of screen width.
        style={{ border: 0, aspectRatio: "16/9", minHeight: 220 }}
        allow="autoplay"
        allowFullScreen
      />
    );
  }
  return <video controls playsInline preload="metadata" className={className} src={url} />;
}

export function AudioEmbed({ url, className }: { url: string; className?: string }) {
  const proxySrc = useDriveProxySrc(url);
  const embed = driveEmbedUrl(url);

  if (proxySrc) return <audio controls preload="metadata" className={className} src={proxySrc} />;

  if (embed) {
    // Drive's own audio preview widget (title bar + scrubber + play button)
    // needs real vertical room — unlike a native <audio> bar, it can't be
    // squeezed into a slim strip without clipping.
    return <iframe src={embed} className={className} style={{ border: 0, height: 150 }} allow="autoplay" />;
  }
  return <audio controls preload="metadata" className={className} src={url} />;
}

export function DocEmbed({ url, className }: { url: string; className?: string }) {
  const proxySrc = useDriveProxySrc(url);
  const fileId = driveFileId(url);
  const embed = driveEmbedUrl(url);

  // Rendered with react-pdf (canvas-based) rather than an iframe — mobile
  // browsers don't reliably render PDFs embedded in an iframe the way
  // desktop Chrome/Firefox/Edge do, so an iframe here would look fine on a
  // computer and show a generic "open externally" placeholder on a phone.
  // A direct URL works whenever it's not a Drive link at all (Blob/local
  // files are already raw, fetchable PDF bytes) or when our own Drive
  // proxy resolved it.
  const pdfSrc = proxySrc || (!fileId ? url : null);
  if (pdfSrc) return <PdfViewer url={pdfSrc} className={className} />;

  // A Drive link with the display proxy unavailable can't be fetched as
  // raw bytes — fall back to Google's own preview as a last resort.
  if (embed) {
    return <iframe src={embed} className={className} style={{ border: 0, height: 340 }} />;
  }
  return null;
}

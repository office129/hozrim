"use client";

import { useEffect, useState } from "react";
import { driveEmbedUrl, driveFileId } from "@/lib/external-links";

let driveProxyEnabled: Promise<boolean> | null = null;

function isDriveProxyEnabled(): Promise<boolean> {
  if (!driveProxyEnabled) {
    driveProxyEnabled = fetch("/api/drive/status", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => !!data.enabled)
      .catch(() => false);
  }
  return driveProxyEnabled;
}

// While our own server is set up to read from the coach's Drive (a
// service account shared on the folder), this streams the file's real
// bytes through us and back into a normal <video>/<audio> element — full
// control over how it looks, same as a directly uploaded file. Until
// that's configured, we fall back to Google's own embedded preview.
function useDriveProxySrc(url: string): string | null | undefined {
  const fileId = driveFileId(url);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    isDriveProxyEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (!fileId) return null;
  if (enabled === null) return undefined; // still checking
  return enabled ? `/api/drive/${fileId}` : null;
}

export function VideoEmbed({ url, className }: { url: string; className?: string }) {
  const proxySrc = useDriveProxySrc(url);
  const embed = driveEmbedUrl(url);

  if (proxySrc === undefined) return <div className={className} style={{ aspectRatio: "16/9" }} />;
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

  if (proxySrc === undefined) return <div className={className} style={{ height: 44 }} />;
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
  const embed = driveEmbedUrl(url);

  if (proxySrc === undefined) return <div className={className} style={{ height: 340 }} />;
  // A PDF preview (proxied Drive bytes, Drive's own preview, or a
  // browser's native PDF viewer) needs real page height to be legible —
  // a link row isn't a substitute.
  return <iframe src={proxySrc || embed || url} className={className} style={{ border: 0, height: 340 }} />;
}

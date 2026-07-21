import { driveEmbedUrl } from "@/lib/external-links";

export function VideoEmbed({ url, className }: { url: string; className?: string }) {
  const embed = driveEmbedUrl(url);
  if (embed) {
    return (
      <iframe
        src={embed}
        className={className}
        style={{ border: 0, aspectRatio: "16/9" }}
        allow="autoplay"
        allowFullScreen
      />
    );
  }
  return <video controls playsInline preload="metadata" className={className} src={url} />;
}

export function AudioEmbed({ url, className }: { url: string; className?: string }) {
  const embed = driveEmbedUrl(url);
  if (embed) {
    // Drive's own audio preview widget (title bar + scrubber + play button)
    // needs real vertical room — unlike a native <audio> bar, it can't be
    // squeezed into a slim strip without clipping.
    return <iframe src={embed} className={className} style={{ border: 0, height: 150 }} allow="autoplay" />;
  }
  return <audio controls preload="metadata" className={className} src={url} />;
}

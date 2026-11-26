// Client side of the Bunny switch. Before a video plays, the server is
// asked (/api/media/probe) whether this file already lives on Bunny; if so
// it answers with a short-lived signed HLS link — Safari/iPhone play it
// natively, other browsers through hls.js. Otherwise, or whenever Bunny
// doesn't answer, the element plays its original source exactly as before,
// picking up from the same spot.

type HlsLike = { destroy: () => void };

export function attachMedia(el: HTMLMediaElement | null, fallbackSrc: string, sourceUrl: string): () => void {
  if (!el) return () => {};
  let disposed = false;
  let hls: HlsLike | null = null;
  let expiresAt = 0;
  let onBunny = false;

  const clearHls = () => {
    hls?.destroy();
    hls = null;
  };

  const restore = (at: number, play: boolean) => {
    if (at > 0) el.addEventListener("loadedmetadata", () => { el.currentTime = at; }, { once: true });
    if (play) el.addEventListener("canplay", () => { el.play().catch(() => {}); }, { once: true });
  };

  // Safety net: Bunny didn't answer (outage, expired link, blocked) — play
  // the very same file from its source, at the same position.
  const fallBack = () => {
    if (disposed || !onBunny) return;
    onBunny = false;
    const at = el.currentTime;
    const play = !el.paused;
    clearHls();
    el.removeEventListener("error", fallBack);
    restore(at, play);
    el.src = fallbackSrc;
  };

  const start = async (at = 0, play = false) => {
    let url: string | null = null;
    try {
      const r = await fetch(`/api/media/probe?u=${encodeURIComponent(sourceUrl)}`, { cache: "no-store", credentials: "include" });
      if (r.ok) {
        const j = (await r.json()) as { hls?: string | null; expiresAt?: number };
        url = j.hls ?? null;
        expiresAt = j.expiresAt ?? 0;
      }
    } catch {
      /* fall back to the source */
    }
    if (disposed) return;
    clearHls();
    el.removeEventListener("error", fallBack);

    if (!url) {
      onBunny = false;
      if (el.getAttribute("src") !== fallbackSrc) {
        restore(at, play);
        el.src = fallbackSrc;
      }
      return;
    }

    onBunny = true;
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.addEventListener("error", fallBack);
      restore(at, play);
      el.src = url;
      return;
    }
    try {
      const { default: Hls } = await import("hls.js");
      if (disposed) return;
      if (!Hls.isSupported()) {
        onBunny = false;
        el.src = fallbackSrc;
        return;
      }
      const h = new Hls({ capLevelToPlayerSize: true });
      hls = h;
      restore(at, play);
      h.loadSource(url);
      h.attachMedia(el as HTMLVideoElement);
      h.on(Hls.Events.ERROR, (_e, d) => {
        if (d.fatal) fallBack();
      });
    } catch {
      onBunny = false;
      el.src = fallbackSrc;
    }
  };

  // A page left open for hours: get a fresh signed link before playing
  // rather than letting the old one fail mid-way.
  const onPlay = () => {
    if (onBunny && expiresAt && Date.now() > expiresAt - 10 * 60_000) {
      expiresAt = 0;
      void start(el.currentTime, true);
    }
  };
  el.addEventListener("play", onPlay);
  void start();

  return () => {
    disposed = true;
    clearHls();
    el.removeEventListener("error", fallBack);
    el.removeEventListener("play", onPlay);
  };
}

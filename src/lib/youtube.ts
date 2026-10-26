// Thin helpers over the public YouTube Data API v3. Reading a public
// channel needs only an API key (no OAuth), so this stays simple and
// robust — unlike the Drive connection, nothing here expires.

const API = "https://www.googleapis.com/youtube/v3";

function apiKey(): string {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error("YOUTUBE_API_KEY לא מוגדר בשרת");
  return k;
}

async function yt(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", apiKey());
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Accepts a channel id (UC…), an @handle, or a full channel URL and
// returns the channel's "uploads" playlist id (which lists every video
// newest-first).
export async function resolveUploadsPlaylist(channel: string): Promise<string> {
  const raw = channel.trim();
  let data: Record<string, unknown>;
  if (/^UC[A-Za-z0-9_-]{20,}$/.test(raw)) {
    data = await yt("channels", { part: "contentDetails", id: raw });
  } else {
    const handle = raw
      .replace(/^https?:\/\/(www\.)?youtube\.com\//i, "")
      .replace(/^@/, "")
      .replace(/\/.*$/, "");
    data = await yt("channels", { part: "contentDetails", forHandle: handle });
  }
  const items = data.items as Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> | undefined;
  const uploads = items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("לא נמצא ערוץ יוטיוב מתאים לקישור שהוזן");
  return uploads;
}

function parseIsoDurationSeconds(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

// Lists videos from the uploads playlist, newest first, up to maxPages (50
// per page).
async function listUploads(playlistId: string, maxPages: number): Promise<Array<{ id: string; title: string }>> {
  const out: Array<{ id: string; title: string }> = [];
  let pageToken = "";
  for (let i = 0; i < maxPages; i++) {
    const params: Record<string, string> = { part: "snippet,contentDetails", playlistId, maxResults: "50" };
    if (pageToken) params.pageToken = pageToken;
    const data = await yt("playlistItems", params);
    const items = (data.items as Array<{ snippet?: { title?: string }; contentDetails?: { videoId?: string } }>) || [];
    for (const it of items) {
      const id = it.contentDetails?.videoId;
      if (id) out.push({ id, title: it.snippet?.title || "" });
    }
    const next = data.nextPageToken as string | undefined;
    if (!next) break;
    pageToken = next;
  }
  return out;
}

async function getDurations(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await yt("videos", { part: "contentDetails", id: chunk.join(",") });
    const items = (data.items as Array<{ id: string; contentDetails?: { duration?: string } }>) || [];
    for (const v of items) map.set(v.id, parseIsoDurationSeconds(v.contentDetails?.duration || ""));
  }
  return map;
}

export type YtVideo = { id: string; title: string; seconds: number };

// YouTube has no API flag for "is a Short", but a real Short's
// youtube.com/shorts/<id> URL stays on /shorts/, while a regular video's
// redirects to /watch. We check that, but only for short-enough duration
// candidates (bounding how many network checks we do). On a check error we
// keep very-short clips (<=60s) and drop the rest.
async function isRealShort(id: string, seconds: number): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${id}`, { method: "HEAD", redirect: "follow" });
    return res.url.includes("/shorts/");
  } catch {
    return seconds <= 60;
  }
}

async function filterRealShorts(candidates: YtVideo[]): Promise<YtVideo[]> {
  const kept: YtVideo[] = [];
  const CONCURRENCY = 8;
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const flags = await Promise.all(batch.map((v) => isRealShort(v.id, v.seconds)));
    batch.forEach((v, j) => {
      if (flags[j]) kept.push(v);
    });
  }
  return kept;
}

// Returns the channel's real Shorts, newest first. maxSeconds bounds which
// videos are even considered (and how many /shorts/ checks run); set it to
// 0 to skip the Shorts verification and take every upload up to no limit.
export async function fetchChannelShorts(opts: {
  channel: string;
  maxSeconds: number;
  maxPages: number;
}): Promise<YtVideo[]> {
  const playlist = await resolveUploadsPlaylist(opts.channel);
  const vids = await listUploads(playlist, opts.maxPages);
  if (vids.length === 0) return [];
  const durations = await getDurations(vids.map((v) => v.id));
  const withSeconds: YtVideo[] = vids.map((v) => ({ id: v.id, title: v.title, seconds: durations.get(v.id) ?? 0 }));

  if (opts.maxSeconds <= 0) return withSeconds; // no filter — every upload

  const candidates = withSeconds.filter((v) => v.seconds > 0 && v.seconds <= opts.maxSeconds);
  return filterRealShorts(candidates); // newest first (uploads-playlist order preserved)
}

// Normalize social handles/URLs to fully qualified URLs
const stripAt = (s) => (s || "").replace(/^@/, "").trim();

export function instagramUrl(v) {
  if (!v) return null;
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `https://instagram.com/${stripAt(s)}`;
}

export function youtubeUrl(v) {
  if (!v) return null;
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  const handle = stripAt(s);
  return `https://youtube.com/@${handle}`;
}

export function tiktokUrl(v) {
  if (!v) return null;
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `https://tiktok.com/@${stripAt(s)}`;
}

export function facebookUrl(v) {
  if (!v) return null;
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `https://facebook.com/${stripAt(s)}`;
}

// Google Maps: extract src from a full iframe HTML, or use raw URL if given
export function extractMapEmbedSrc(embed) {
  if (!embed) return null;
  const s = embed.trim();
  if (!s) return null;
  const match = s.match(/src="([^"]+)"/i);
  if (match) return match[1];
  return s; // already a plain URL
}

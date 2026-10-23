export type ParsedTweetUrl = {
  tweetId: string;
  normalizedUrl: string;
  handle: string;
};

const SUPPORTED_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "m.twitter.com",
]);

export function parseTweetUrl(rawUrl: string): ParsedTweetUrl {
  const trimmedUrl = rawUrl.trim();
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(
      /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`,
    );
  } catch {
    throw new Error("Enter a valid X or Twitter post link.");
  }

  if (!SUPPORTED_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
    throw new Error("Enter a valid X or Twitter post link.");
  }

  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const statusIndex = segments.indexOf("status");
  const tweetId = statusIndex >= 1 ? segments[statusIndex + 1] : undefined;

  if (!tweetId || !/^\d+$/.test(tweetId)) {
    throw new Error("The link must point to a specific tweet status.");
  }

  // `/i/status/ID` and `/i/web/status/ID` carry no author handle.
  const handle = statusIndex === 1 && segments[0] !== "i" ? segments[0] : "";

  return {
    tweetId,
    handle,
    normalizedUrl: `https://x.com/${handle || "i"}/status/${tweetId}`,
  };
}

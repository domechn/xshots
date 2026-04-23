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
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    throw new Error("Enter a valid X or Twitter post link.");
  }

  if (!SUPPORTED_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
    throw new Error("Enter a valid X or Twitter post link.");
  }

  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const statusIndex = segments.findIndex((segment) => segment === "status");

  if (statusIndex !== 1 || !segments[0] || !segments[2]) {
    throw new Error("The link must point to a specific tweet status.");
  }

  const handle = segments[0];
  const tweetId = segments[2];

  if (!/^\d+$/.test(tweetId)) {
    throw new Error("The link must point to a specific tweet status.");
  }

  return {
    tweetId,
    handle,
    normalizedUrl: `https://x.com/${handle}/status/${tweetId}`,
  };
}

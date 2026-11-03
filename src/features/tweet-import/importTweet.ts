import { parseTweetUrl } from "./parseTweetUrl";
import {
  createEmptyDraft,
  type EmbeddedTweet,
  type TweetImportResult,
} from "./types";

type OEmbedResponse = {
  author_name?: string;
  author_url?: string;
  html?: string;
};

type RichTweetResponse = {
  code?: number;
  status?: RichTweetStatus;
};

type RichTweetQuoteCandidate = RichTweetStatus | { status?: RichTweetStatus };

type RichTweetMediaItem = {
  type?: string;
  url?: string;
  media_url?: string;
  media_url_https?: string;
  thumbnail_url?: string | null;
  expanded_url?: string;
  display_url?: string;
};

type ArticleBlock = {
  type?: string;
  text?: string;
  inlineStyleRanges?: Array<{
    style?: string;
    offset?: number;
    length?: number;
  }>;
  entityRanges?: Array<{ key?: string | number }>;
};

type RichTweetStatus = RichTweetMetrics & {
  text?: string;
  raw_text?: {
    text?: string;
  };
  article?: {
    title?: string;
    preview_text?: string;
    content?: {
      blocks?: ArticleBlock[];
      entityMap?: Array<{
        key?: string | number;
        value?: {
          type?: string;
          data?: { mediaItems?: Array<{ mediaId?: string | number }> };
        };
      }>;
    };
    media_entities?: Array<{
      media_id?: string | number;
      media_info?: { original_img_url?: string };
    }>;
    cover_media?: {
      media_info?: {
        original_img_url?: string;
      };
    };
  };
  created_at?: string;
  url?: string;
  tweet_url?: string;
  author?: {
    name?: string;
    screen_name?: string;
    avatar_url?: string | null;
    verification?: {
      verified?: boolean;
    };
  };
  media?: {
    photos?: RichTweetMediaItem[];
    all?: RichTweetMediaItem[];
    videos?: RichTweetMediaItem[];
  };
  media_extended?: RichTweetMediaItem[];
  extended_entities?: {
    media?: RichTweetMediaItem[];
  };
  entities?: {
    media?: RichTweetMediaItem[];
  };
  quote?: RichTweetQuoteCandidate | null;
  quoted?: RichTweetQuoteCandidate | null;
  quoted_tweet?: RichTweetQuoteCandidate | null;
  quoted_status?: RichTweetQuoteCandidate | null;
  engagement?: RichTweetMetrics;
  stats?: RichTweetMetrics;
};

type RichTweetMetrics = {
  replies?: number | string;
  reply_count?: number | string;
  reposts?: number | string;
  repost_count?: number | string;
  quotes?: number | string;
  quote_count?: number | string;
  quoteCount?: number | string;
  retweets?: number | string;
  retweet_count?: number | string;
  likes?: number | string;
  favorites?: number | string;
  favourite_count?: number | string;
  favorite_count?: number | string;
  bookmarks?: number | string;
  bookmark_count?: number | string;
  bookmarkCount?: number | string;
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type Fetcher = (
  input: string,
  init?: RequestInit,
) => Promise<FetchResponseLike>;

export async function importTweetFromUrl(
  rawUrl: string,
  options: {
    fetcher?: Fetcher;
  } = {},
): Promise<TweetImportResult> {
  const parsed = parseTweetUrl(rawUrl);
  const draft = createEmptyDraft({
    sourceUrl: parsed.normalizedUrl,
    handle: parsed.handle,
  });

  const fetcher = options.fetcher ?? defaultFetcher;
  const richEndpoint = new URL(
    `https://api.fxtwitter.com/2/status/${parsed.tweetId}`,
  );
  const endpoint = new URL("https://publish.twitter.com/oembed");

  endpoint.searchParams.set("url", parsed.normalizedUrl);
  endpoint.searchParams.set("omit_script", "true");
  endpoint.searchParams.set("hide_thread", "true");
  endpoint.searchParams.set("dnt", "true");
  endpoint.searchParams.set("align", "center");

  try {
    const richResponse = await fetcher(richEndpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (richResponse.ok) {
      const richPayload = (await richResponse.json()) as RichTweetResponse;
      const richDraft = extractDraftFromRichPayload(
        parsed.normalizedUrl,
        richPayload,
      );

      if (richDraft) {
        return {
          status: "success",
          draft: createEmptyDraft({
            ...draft,
            ...richDraft,
            authorName: richDraft.authorName || parsed.handle,
            handle: richDraft.handle || parsed.handle,
          }),
        };
      }
    }
  } catch {
    // Continue to the oEmbed fallback when the richer client-side API is unavailable.
  }

  try {
    const response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        status: "manual",
        draft,
        reason:
          "We could not complete the automatic import. Please fill in the tweet manually.",
      };
    }

    const payload = (await response.json()) as OEmbedResponse;
    const extracted = extractContentFromHtml(payload.html ?? "");

    if (!extracted.body) {
      return {
        status: "manual",
        draft,
        reason:
          "We could not read the tweet text automatically. Please paste the content manually.",
      };
    }

    return {
      status: "success",
      draft: createEmptyDraft({
        ...draft,
        authorName: payload.author_name?.trim() || parsed.handle,
        handle: readHandleFromAuthorUrl(payload.author_url) || parsed.handle,
        body: extracted.body,
        bodyHtml: extracted.bodyHtml,
        timestampLabel: extracted.timestampLabel,
      }),
    };
  } catch {
    return {
      status: "manual",
      draft,
      reason:
        "We could not complete the automatic import. Please fill in the tweet manually.",
    };
  }
}

const defaultFetcher: Fetcher = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(8000) });

function extractContentFromHtml(html: string): {
  body: string;
  bodyHtml: string;
  timestampLabel: string;
} {
  const document = new DOMParser().parseFromString(html, "text/html");
  const paragraph = document.querySelector("p");
  const bodyHtml = paragraph ? sanitizeTweetHtml(paragraph) : "";
  const body = paragraph ? normalizeTweetText(readTextWithBreaks(paragraph)) : "";
  const timestampLabel = collapseWhitespace(
    Array.from(document.querySelectorAll("a")).at(-1)?.textContent ?? "",
  );

  return {
    body,
    bodyHtml,
    timestampLabel,
  };
}

function readHandleFromAuthorUrl(authorUrl?: string): string | null {
  if (!authorUrl) {
    return null;
  }

  try {
    const url = new URL(authorUrl);
    const handle = url.pathname.split("/").filter(Boolean)[0];
    return handle || null;
  } catch {
    return null;
  }
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatTimestampLabel(value: string): string {
  const normalizedValue = collapseWhitespace(value);

  if (!normalizedValue) {
    return "";
  }

  const rawTimestampMatch = normalizedValue.match(
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) ([A-Z][a-z]{2}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4}) (\d{4})$/,
  );

  if (!rawTimestampMatch) {
    return normalizedValue;
  }

  const [, , month, day, rawHours, minutes, , offset, year] = rawTimestampMatch;
  const hours = Number(rawHours);
  const meridiem = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  const timezoneLabel = formatUtcOffsetLabel(offset);

  return `${month} ${Number(day)}, ${year} · ${hours12}:${minutes} ${meridiem}${timezoneLabel ? ` ${timezoneLabel}` : ""}`;
}

function formatUtcOffsetLabel(offset: string): string {
  if (offset === "+0000" || offset === "-0000") {
    return "UTC";
  }

  const sign = offset.startsWith("-") ? "-" : "+";
  const hours = Number(offset.slice(1, 3));
  const minutes = offset.slice(3, 5);

  if (!Number.isFinite(hours)) {
    return `UTC${offset}`;
  }

  if (minutes === "00") {
    return `UTC${sign}${hours}`;
  }

  return `UTC${sign}${hours}:${minutes}`;
}

function normalizeTweetText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .join("\n")
    .trim();
}

function sanitizeTweetHtml(element: Element): string {
  return Array.from(element.childNodes)
    .map((node) => serializeTweetNode(node))
    .join("")
    .trim();
}

function serializeTweetNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  if (tagName === "br") {
    return "<br>";
  }

  const content = Array.from(element.childNodes)
    .map((childNode) => serializeTweetNode(childNode))
    .join("");

  if (!content) {
    return "";
  }

  if (tagName === "strong" || tagName === "b") {
    return `<strong>${content}</strong>`;
  }

  if (tagName === "em" || tagName === "i") {
    return `<em>${content}</em>`;
  }

  const inlineEmphasis = readInlineEmphasis(element.getAttribute("style"));

  if (inlineEmphasis.bold || inlineEmphasis.italic) {
    let emphasizedContent = content;

    if (inlineEmphasis.italic) {
      emphasizedContent = `<em>${emphasizedContent}</em>`;
    }

    if (inlineEmphasis.bold) {
      emphasizedContent = `<strong>${emphasizedContent}</strong>`;
    }

    return emphasizedContent;
  }

  return content;
}

function readInlineEmphasis(styleValue: string | null): {
  bold: boolean;
  italic: boolean;
} {
  if (!styleValue) {
    return {
      bold: false,
      italic: false,
    };
  }

  let bold = false;
  let italic = false;

  for (const declaration of styleValue.split(";")) {
    const [rawName, rawValue] = declaration.split(":");

    if (!rawName || !rawValue) {
      continue;
    }

    const name = rawName.trim().toLowerCase();
    const value = rawValue.trim().toLowerCase();

    if (
      name === "font-weight" &&
      (value === "bold" ||
        value === "bolder" ||
        (Number.parseInt(value, 10) >= 600 &&
          Number.isFinite(Number.parseInt(value, 10))))
    ) {
      bold = true;
    }

    if (
      name === "font-style" &&
      (value.includes("italic") || value.includes("oblique"))
    ) {
      italic = true;
    }
  }

  return {
    bold,
    italic,
  };
}

function readTextWithBreaks(node: ParentNode): string {
  return Array.from(node.childNodes)
    .map((childNode) => {
      if (childNode.nodeType === Node.TEXT_NODE) {
        return childNode.textContent ?? "";
      }

      if (childNode.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }

      const element = childNode as Element;

      if (element.tagName.toLowerCase() === "br") {
        return "\n";
      }

      return readTextWithBreaks(element);
    })
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractDraftFromRichPayload(
  sourceUrl: string,
  payload: RichTweetResponse,
): Partial<ReturnType<typeof createEmptyDraft>> | null {
  const tweet = extractEmbeddedTweet(payload.status, sourceUrl);

  if (!tweet) {
    return null;
  }

  return {
    ...tweet,
    ...extractEngagementCounts(payload.status),
    quotedTweet: extractQuotedTweet(payload.status),
  };
}

function extractEngagementCounts(
  status: RichTweetStatus | undefined,
): Pick<
  ReturnType<typeof createEmptyDraft>,
  "replyCount" | "repostCount" | "likeCount" | "bookmarkCount"
> {
  return {
    replyCount: readStatusMetric(status, "replies", "reply_count"),
    repostCount: readDisplayedRepostCount(status),
    likeCount: readStatusMetric(
      status,
      "likes",
      "favorites",
      "favourite_count",
      "favorite_count",
    ),
    bookmarkCount: readStatusMetric(
      status,
      "bookmarks",
      "bookmark_count",
      "bookmarkCount",
    ),
  };
}

function readDisplayedRepostCount(
  status: RichTweetStatus | undefined,
): number | null {
  const repostCount = readStatusMetric(
    status,
    "reposts",
    "repost_count",
    "retweets",
    "retweet_count",
  );
  const quoteCount = readStatusMetric(
    status,
    "quotes",
    "quote_count",
    "quoteCount",
  );

  if (repostCount === null && quoteCount === null) {
    return null;
  }

  return (repostCount ?? 0) + (quoteCount ?? 0);
}

// Checks every key on the status itself first, then `engagement`, then `stats`.
function readStatusMetric(
  status: RichTweetStatus | undefined,
  ...keys: Array<keyof RichTweetMetrics>
): number | null {
  return readMetricCount(
    ...[status, status?.engagement, status?.stats].flatMap((source) =>
      keys.map((key) => source?.[key]),
    ),
  );
}

function readMetricCount(
  ...values: Array<number | string | null | undefined>
): number | null {
  for (const value of values) {
    if (typeof value === "number") {
      if (Number.isFinite(value) && value >= 0) {
        return value;
      }

      continue;
    }

    if (typeof value !== "string") {
      continue;
    }

    const trimmedValue = value.trim();

    if (!trimmedValue) {
      continue;
    }

    const normalizedValue = trimmedValue.replace(/,/g, "");
    const parsedValue = Number(normalizedValue);

    if (Number.isFinite(parsedValue) && parsedValue >= 0) {
      return parsedValue;
    }
  }

  return null;
}

function extractEmbeddedTweet(
  status: RichTweetStatus | undefined,
  sourceUrl: string,
): EmbeddedTweet | null {
  if (!status) {
    return null;
  }

  const articleCoverUrl = normalizeAssetUrl(
    status.article?.cover_media?.media_info?.original_img_url ?? "",
  );
  const article = status.article ? extractArticle(status) : null;
  const mediaUrls = status.article
    ? dedupeMediaUrls(
        [articleCoverUrl, ...(article?.mediaUrls ?? [])].filter(Boolean),
      ).slice(0, 4)
    : extractPhotoMediaUrls(status);
  const mediaUrl =
    mediaUrls[0] ?? (status.article ? "" : extractFallbackMediaUrl(status));
  const hasMedia = mediaUrls.length > 0 || Boolean(mediaUrl);
  const body = status.article
    ? article?.body ?? ""
    : normalizeTweetText(
        stripMediaLinksFromText(
          status.raw_text?.text ?? status.text ?? "",
          extractMediaTextUrls(status),
          hasMedia,
        ),
      );

  if (!body && !mediaUrl && !mediaUrls.length) {
    return null;
  }

  return {
    sourceUrl,
    authorName: status.author?.name?.trim() ?? "",
    handle: status.author?.screen_name?.trim() ?? "",
    body,
    bodyHtml: article?.bodyHtml ?? "",
    timestampLabel: formatTimestampLabel(status.created_at ?? ""),
    avatarUrl: normalizeAssetUrl(status.author?.avatar_url ?? ""),
    mediaUrl,
    mediaUrls,
    verified: Boolean(status.author?.verification?.verified),
  };
}

function extractArticle(status: RichTweetStatus): {
  body: string;
  bodyHtml: string;
  mediaUrls: string[];
} {
  const article = status.article;
  const tweetText = normalizeTweetText(
    (status.text ?? status.raw_text?.text ?? "")
      .replace(
        /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/article\/\d+\S*/g,
        "",
      )
      .replace(/\s*https?:\/\/t\.co\/\S+$/, ""),
  );
  const blocks = Array.isArray(article?.content?.blocks)
    ? article.content.blocks
    : [];
  const parts: Array<{ text: string; html: string; list: string }> = [];
  const title = normalizeTweetText(article?.title ?? "");
  if (title) {
    parts.push({
      text: title,
      html: `<strong>${escapeHtml(title)}</strong>`,
      list: "",
    });
  }

  const mediaUrls: string[] = [];
  let orderedIndex = 0;
  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }
    if (block.type === "atomic") {
      for (const range of Array.isArray(block.entityRanges)
        ? block.entityRanges
        : []) {
        const entity = article?.content?.entityMap?.find(
          (item) => item?.key === range?.key,
        );
        if (entity?.value?.type !== "MEDIA") {
          continue;
        }
        for (const item of entity.value.data?.mediaItems ?? []) {
          if (item?.mediaId === undefined || item.mediaId === null) {
            continue;
          }
          const media = article?.media_entities?.find(
            (candidate) => String(candidate?.media_id) === String(item?.mediaId),
          );
          const url = normalizeAssetUrl(
            media?.media_info?.original_img_url ?? "",
          );
          if (url) {
            mediaUrls.push(url);
          }
        }
      }
      continue;
    }
    const text = typeof block.text === "string" ? block.text : "";
    if (!text.trim()) {
      continue;
    }
    const list =
      block.type === "unordered-list-item" ||
      block.type === "ordered-list-item"
        ? block.type
        : "";
    orderedIndex = block.type === "ordered-list-item" ? orderedIndex + 1 : 0;
    const prefix =
      block.type === "unordered-list-item"
        ? "• "
        : block.type === "ordered-list-item"
          ? `${orderedIndex}. `
          : "";
    const html = renderArticleInline(text, block.inlineStyleRanges);
    const isHeader = ["header-one", "header-two", "header-three"].includes(
      block.type ?? "",
    );
    parts.push({
      text: prefix + text,
      html: escapeHtml(prefix) + (isHeader ? `<strong>${html}</strong>` : html),
      list,
    });
  }
  if (!blocks.length) {
    const preview = normalizeTweetText(article?.preview_text ?? "");
    if (preview) {
      parts.push({
        text: preview,
        html: escapeHtml(preview).replace(/\n/g, "<br>"),
        list: "",
      });
    }
  }
  if (tweetText) {
    parts.push({
      text: tweetText,
      html: escapeHtml(tweetText).replace(/\n/g, "<br>"),
      list: "",
    });
  }

  return {
    body: parts
      .map(
        (part, index) =>
          `${index ? parts[index - 1].list && parts[index - 1].list === part.list ? "\n" : "\n\n" : ""}${part.text}`,
      )
      .join(""),
    bodyHtml: parts
      .map(
        (part, index) =>
          `${index ? parts[index - 1].list && parts[index - 1].list === part.list ? "<br>" : "<br><br>" : ""}${part.html}`,
      )
      .join(""),
    mediaUrls,
  };
}

function renderArticleInline(
  text: string,
  ranges: ArticleBlock["inlineStyleRanges"],
): string {
  const validRanges = (Array.isArray(ranges) ? ranges : []).filter(
    (range) =>
      (range?.style === "Bold" || range?.style === "Italic") &&
      Number.isInteger(range.offset) &&
      Number.isInteger(range.length) &&
      (range.offset ?? -1) >= 0 &&
      (range.length ?? 0) > 0,
  );
  const boundaries = Array.from(
    new Set([
      0,
      text.length,
      ...validRanges.flatMap((range) => [
        Math.min(range.offset ?? 0, text.length),
        Math.min((range.offset ?? 0) + (range.length ?? 0), text.length),
      ]),
    ]),
  ).sort((a, b) => a - b);
  let html = "";
  let open: string[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const active = ["Bold", "Italic"].filter((style) =>
      validRanges.some((range) =>
        range.style === style &&
        (range.offset ?? 0) <= start &&
        (range.offset ?? 0) + (range.length ?? 0) >= end,
      ),
    );
    const common = open.findIndex((style, i) => active[i] !== style);
    const shared = common < 0 ? Math.min(open.length, active.length) : common;
    for (const style of open.slice(shared).reverse()) {
      html += style === "Bold" ? "</strong>" : "</em>";
    }
    for (const style of active.slice(shared)) {
      html += style === "Bold" ? "<strong>" : "<em>";
    }
    html += escapeHtml(text.slice(start, end)).replace(/\n/g, "<br>");
    open = active;
  }
  for (const style of open.reverse()) {
    html += style === "Bold" ? "</strong>" : "</em>";
  }
  return html;
}

function extractPhotoMediaUrls(status: RichTweetStatus): string[] {
  return dedupeMediaUrls(
    [
      ...(status.media?.photos ?? []).map((photo) => readMediaPhotoUrl(photo)),
      ...(status.media?.all ?? [])
        .filter((item) => item.type === "photo")
        .map((item) => readMediaPhotoUrl(item)),
      ...(status.media_extended ?? [])
        .filter((item) => item.type === "photo")
        .map((item) => readMediaPhotoUrl(item)),
      ...(status.extended_entities?.media ?? [])
        .filter((item) => item.type === "photo")
        .map((item) => readMediaPhotoUrl(item)),
      ...(status.entities?.media ?? [])
        .filter((item) => item.type === "photo")
        .map((item) => readMediaPhotoUrl(item)),
    ]
      .map((mediaUrl) => normalizeAssetUrl(mediaUrl))
      .filter(Boolean),
  );
}

function extractFallbackMediaUrl(status: RichTweetStatus): string {
  const fallbackMedia = [
    ...(status.media?.all ?? []),
    ...(status.media?.videos ?? []),
    ...(status.media_extended ?? []),
    ...(status.extended_entities?.media ?? []),
    ...(status.entities?.media ?? []),
  ].find((item) => Boolean(readMediaPhotoUrl(item) || item.thumbnail_url));

  return normalizeAssetUrl(
    fallbackMedia?.thumbnail_url ?? readMediaPhotoUrl(fallbackMedia ?? {}) ?? "",
  );
}

function readMediaPhotoUrl(item: RichTweetMediaItem): string {
  return (
    item.media_url_https ??
    item.media_url ??
    (isTextLinkUrl(item.url) ? "" : item.url) ??
    ""
  );
}

function extractMediaTextUrls(status: RichTweetStatus): string[] {
  return dedupeMediaUrls(
    [
      ...(status.media?.photos ?? []),
      ...(status.media?.all ?? []),
      ...(status.media_extended ?? []),
      ...(status.extended_entities?.media ?? []),
      ...(status.entities?.media ?? []),
    ]
      .flatMap((item) => [item.url, item.expanded_url, item.display_url])
      .filter((mediaTextUrl): mediaTextUrl is string => Boolean(mediaTextUrl)),
  );
}

function stripMediaLinksFromText(
  text: string,
  mediaLinkUrls: string[],
  hasMedia: boolean = false,
): string {
  let nextText = text;

  for (const mediaLinkUrl of mediaLinkUrls) {
    nextText = nextText
      .replace(new RegExp(escapeRegExp(mediaLinkUrl), "g"), "")
      .trim();
  }

  // When media is attached, Twitter/X always appends a t.co gallery link at the
  // very end of the tweet text.  Strip it as a fallback for cases where the
  // t.co↔media-URL mapping is not included in the API response.
  if (hasMedia) {
    nextText = nextText.replace(/\s*https:\/\/t\.co\/\S+$/, "").trim();
  }

  return nextText;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isTextLinkUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === "t.co";
  } catch {
    return false;
  }
}

function normalizeAssetUrl(assetUrl: string): string {
  if (!assetUrl) {
    return "";
  }

  try {
    const url = new URL(assetUrl);

    if (
      url.protocol === "http:" &&
      ["twimg.com", "twitter.com", "x.com"].some(
        (hostname) =>
          url.hostname === hostname || url.hostname.endsWith(`.${hostname}`),
      )
    ) {
      url.protocol = "https:";
      return url.toString();
    }
  } catch {
    return assetUrl;
  }

  return assetUrl;
}

function dedupeMediaUrls(mediaUrls: string[]): string[] {
  return Array.from(new Set(mediaUrls));
}

function extractQuotedTweet(
  status: RichTweetStatus | undefined,
): EmbeddedTweet | null {
  const quotedStatus = readQuotedStatus(status);

  if (!quotedStatus) {
    return null;
  }

  return extractEmbeddedTweet(
    quotedStatus,
    quotedStatus.url ?? quotedStatus.tweet_url ?? "",
  );
}

function readQuotedStatus(
  status: RichTweetStatus | undefined,
): RichTweetStatus | null {
  if (!status) {
    return null;
  }

  const candidates = [
    status.quote,
    status.quoted,
    status.quoted_tweet,
    status.quoted_status,
  ];

  for (const candidate of candidates) {
    const quotedStatus = unwrapQuotedStatus(candidate);

    if (quotedStatus) {
      return quotedStatus;
    }
  }

  return null;
}

function unwrapQuotedStatus(
  candidate: RichTweetQuoteCandidate | null | undefined,
): RichTweetStatus | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  if ("status" in candidate && candidate.status) {
    return candidate.status;
  }

  return candidate as RichTweetStatus;
}

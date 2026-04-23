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

type RichTweetStatus = {
  text?: string;
  raw_text?: {
    text?: string;
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
    photos?: Array<{
      url?: string;
    }>;
    all?: Array<{
      type?: string;
      url?: string;
      thumbnail_url?: string | null;
    }>;
    videos?: Array<{
      thumbnail_url?: string | null;
    }>;
  };
  quote?: RichTweetQuoteCandidate | null;
  quoted?: RichTweetQuoteCandidate | null;
  quoted_tweet?: RichTweetQuoteCandidate | null;
  quoted_status?: RichTweetQuoteCandidate | null;
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
        authorName: payload.author_name?.trim() ?? parsed.handle,
        handle: readHandleFromAuthorUrl(payload.author_url) ?? parsed.handle,
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

async function defaultFetcher(
  input: string,
  init?: RequestInit,
): Promise<FetchResponseLike> {
  const response = await fetch(input, init);

  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json() as Promise<OEmbedResponse>,
  };
}

function extractContentFromHtml(html: string): {
  body: string;
  bodyHtml: string;
  timestampLabel: string;
} {
  const document = new DOMParser().parseFromString(html, "text/html");
  const paragraph = document.querySelector("p");
  const bodyHtml = paragraph ? sanitizeTweetHtml(paragraph) : "";
  const body = bodyHtml ? htmlToPlainText(bodyHtml) : "";
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

function htmlToPlainText(html: string): string {
  const document = new DOMParser().parseFromString(
    `<p>${html}</p>`,
    "text/html",
  );
  const paragraph = document.querySelector("p");

  if (!paragraph) {
    return "";
  }

  return normalizeTweetText(readTextWithBreaks(paragraph));
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
    .replace(/\"/g, "&quot;")
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
    quotedTweet: extractQuotedTweet(payload.status),
  };
}

function extractEmbeddedTweet(
  status: RichTweetStatus | undefined,
  sourceUrl: string,
): EmbeddedTweet | null {
  const body = normalizeTweetText(status?.raw_text?.text ?? status?.text ?? "");

  if (!status || !body) {
    return null;
  }

  const mediaUrls = dedupeMediaUrls(
    [
      ...(status.media?.photos ?? []).map((photo) => photo.url ?? ""),
      ...(status.media?.all ?? [])
        .filter((item) => item.type === "photo")
        .map((item) => item.url ?? ""),
    ]
      .map((mediaUrl) => normalizeAssetUrl(mediaUrl))
      .filter(Boolean),
  );

  const mediaUrl =
    mediaUrls[0] ??
    normalizeAssetUrl(
      status.media?.all?.find((item) => Boolean(item.url))?.url ??
        status.media?.videos?.find((video) => Boolean(video.thumbnail_url))
          ?.thumbnail_url ??
        "",
    );

  return {
    sourceUrl,
    authorName: status.author?.name?.trim() ?? "",
    handle: status.author?.screen_name?.trim() ?? "",
    body,
    bodyHtml: "",
    timestampLabel: collapseWhitespace(status.created_at ?? ""),
    avatarUrl: normalizeAssetUrl(status.author?.avatar_url ?? ""),
    mediaUrl,
    mediaUrls,
    verified: Boolean(status.author?.verification?.verified),
  };
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

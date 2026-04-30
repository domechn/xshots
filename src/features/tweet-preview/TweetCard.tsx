import type { EmbeddedTweet, TweetDraft } from "../tweet-import/types";
import { Fragment } from "react";
import type { ReactNode } from "react";

const ENGAGEMENT_COUNT_FORMATTER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type TweetCardProps = {
  draft: TweetDraft;
};

export function TweetCard({ draft }: TweetCardProps) {
  const avatarFallback =
    draft.authorName.slice(0, 1) || draft.handle.slice(0, 1) || "X";
  const siteUrl = "xshots.domc.me";
  const mediaUrls = draft.mediaUrls.length
    ? draft.mediaUrls
    : draft.mediaUrl
      ? [draft.mediaUrl]
      : [];

  return (
    <article
      className={`tweet-card tweet-card--${draft.themeVariant}`}
      aria-label="Tweet preview card"
    >
      <div className="tweet-card__orbit" aria-hidden="true" />
      <header className="tweet-card__header">
        <div className="tweet-card__avatar-shell">
          {draft.avatarUrl ? (
            <img
              className="tweet-card__avatar"
              src={draft.avatarUrl}
              alt={`${draft.authorName} avatar`}
            />
          ) : (
            <div
              className="tweet-card__avatar tweet-card__avatar--fallback"
              aria-hidden="true"
            >
              {avatarFallback.toUpperCase()}
            </div>
          )}
        </div>
        <div className="tweet-card__meta">
          <div className="tweet-card__identity-row">
            <p className="tweet-card__author">
              {draft.authorName || "Your headline author"}
            </p>
            {draft.verified ? <VerifiedBadge label="Verified account" /> : null}
          </div>
          <p className="tweet-card__handle">
            @{draft.handle || "missioncontrol"}
          </p>
        </div>
      </header>

      <div className="tweet-card__body">
        <p className="tweet-card__text">
          {renderTweetBody(
            draft.body || "Paste the tweet text or import it from a link.",
            draft.bodyHtml,
          )}
        </p>
        <MediaGallery mediaUrls={mediaUrls} alt="Tweet media preview" />
        {draft.quotedTweet ? (
          <QuotedTweetCard tweet={draft.quotedTweet} />
        ) : null}
      </div>

      <EngagementMetrics draft={draft} />

      <footer className="tweet-card__footer">
        <span className="tweet-card__timestamp">
          {draft.timestampLabel || "Add launch timestamp"}
        </span>
        <span
          className="tweet-card__credit"
          aria-label="Share card site attribution"
        >
          <span className="tweet-card__credit-label">Made with</span>
          <span className="tweet-card__credit-url">{siteUrl}</span>
        </span>
      </footer>
    </article>
  );
}

function QuotedTweetCard({ tweet }: { tweet: EmbeddedTweet }) {
  const avatarFallback =
    tweet.authorName.slice(0, 1) || tweet.handle.slice(0, 1) || "X";
  const mediaUrls = tweet.mediaUrls.length
    ? tweet.mediaUrls
    : tweet.mediaUrl
      ? [tweet.mediaUrl]
      : [];

  return (
    <section className="tweet-card__quote" aria-label="Quoted tweet preview">
      <div className="tweet-card__quote-header">
        <div className="tweet-card__quote-avatar-shell">
          {tweet.avatarUrl ? (
            <img
              className="tweet-card__quote-avatar"
              src={tweet.avatarUrl}
              alt={`${tweet.authorName} avatar`}
            />
          ) : (
            <div
              className="tweet-card__quote-avatar tweet-card__quote-avatar--fallback"
              aria-hidden="true"
            >
              {avatarFallback.toUpperCase()}
            </div>
          )}
        </div>

        <div className="tweet-card__quote-meta">
          <div className="tweet-card__quote-author-row">
            <p className="tweet-card__quote-author">
              {tweet.authorName || "Quoted author"}
            </p>
            {tweet.verified ? (
              <VerifiedBadge label="Quoted verified account" />
            ) : null}
          </div>
          <p className="tweet-card__quote-handle">
            @{tweet.handle || "quotedtweet"}
          </p>
        </div>
      </div>

      <p className="tweet-card__quote-text">
        {renderTweetBody(tweet.body, tweet.bodyHtml)}
      </p>

      <MediaGallery
        mediaUrls={mediaUrls}
        alt="Quoted tweet media preview"
        isQuoted
      />

      {tweet.timestampLabel ? (
        <p className="tweet-card__quote-timestamp">{tweet.timestampLabel}</p>
      ) : null}
    </section>
  );
}

function MediaGallery({
  mediaUrls,
  alt,
  isQuoted = false,
}: {
  mediaUrls: string[];
  alt: string;
  isQuoted?: boolean;
}) {
  const galleryMediaUrls = mediaUrls.slice(0, 4);

  if (!galleryMediaUrls.length) {
    return null;
  }

  const layout = getMediaLayout(galleryMediaUrls.length);

  return (
    <div
      className={`tweet-card__media-grid tweet-card__media-grid--${layout}${isQuoted ? " tweet-card__media-grid--quote" : ""}`}
    >
      {galleryMediaUrls.map((mediaUrl, index) => (
        <div
          className={`tweet-card__media-shell${layout === "three" && index === 0 ? " tweet-card__media-shell--hero" : ""}`}
          key={`${mediaUrl}-${index}`}
        >
          <img
            className={
              isQuoted ? "tweet-card__quote-media" : "tweet-card__media"
            }
            src={mediaUrl}
            alt={alt}
          />
        </div>
      ))}
    </div>
  );
}

function getMediaLayout(count: number): "single" | "two" | "three" | "four" {
  if (count <= 1) {
    return "single";
  }

  if (count === 2) {
    return "two";
  }

  if (count === 3) {
    return "three";
  }

  return "four";
}

function VerifiedBadge({ label }: { label: string }) {
  return (
    <span className="tweet-card__verified" aria-label={label}>
      <svg viewBox="0 0 22 22" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
        />
      </svg>
    </span>
  );
}

function EngagementMetrics({ draft }: { draft: TweetDraft }) {
  const metrics: Array<{
    key: string;
    label: string;
    count: number;
    icon: ReactNode;
  }> = [];

  if (draft.replyCount !== null) {
    metrics.push({
      key: "replies",
      label: "Replies",
      count: draft.replyCount,
      icon: <ReplyIcon />,
    });
  }

  if (draft.repostCount !== null) {
    metrics.push({
      key: "reposts",
      label: "Reposts",
      count: draft.repostCount,
      icon: <RepostIcon />,
    });
  }

  if (draft.likeCount !== null) {
    metrics.push({
      key: "likes",
      label: "Likes",
      count: draft.likeCount,
      icon: <LikeIcon />,
    });
  }

  if (draft.bookmarkCount !== null) {
    metrics.push({
      key: "bookmarks",
      label: "Bookmarks",
      count: draft.bookmarkCount,
      icon: <BookmarkIcon />,
    });
  }

  if (!metrics.length) {
    return null;
  }

  return (
    <div
      className="tweet-card__engagement"
      aria-label="Tweet engagement metrics"
    >
      {metrics.map((metric) => {
        const formattedCount = formatEngagementCount(metric.count);

        return (
          <span
            className="tweet-card__engagement-item"
            key={metric.key}
            aria-label={`${metric.label} ${formattedCount}`}
          >
            <span className="tweet-card__engagement-icon" aria-hidden="true">
              {metric.icon}
            </span>
            <span className="tweet-card__engagement-count">
              {formattedCount}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function formatEngagementCount(count: number): string {
  return ENGAGEMENT_COUNT_FORMATTER.format(count);
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"
        fill="currentColor"
      />
    </svg>
  );
}

function RepostIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"
        fill="currentColor"
      />
    </svg>
  );
}

function LikeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"
        fill="currentColor"
      />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"
        fill="currentColor"
      />
    </svg>
  );
}

function renderTweetBody(text: string, bodyHtml: string): ReactNode[] {
  if (!bodyHtml) {
    return renderAccentText(text, "plain");
  }

  const document = new DOMParser().parseFromString(
    `<p>${bodyHtml}</p>`,
    "text/html",
  );
  const root = document.querySelector("p");

  if (!root) {
    return renderAccentText(text, "fallback");
  }

  return renderAccentNodes(Array.from(root.childNodes), "html");
}

function renderAccentNodes(nodes: ChildNode[], keyPrefix: string): ReactNode[] {
  return nodes.flatMap((node, index) =>
    renderAccentNode(node, `${keyPrefix}-${index}`),
  );
}

function renderAccentNode(node: ChildNode, keyPrefix: string): ReactNode[] {
  if (node.nodeType === Node.TEXT_NODE) {
    return renderAccentText(node.textContent ?? "", keyPrefix);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  if (tagName === "br") {
    return [<br key={keyPrefix} />];
  }

  const children = renderAccentNodes(
    Array.from(element.childNodes),
    `${keyPrefix}-${tagName}`,
  );

  if (tagName === "strong" || tagName === "b") {
    return [<strong key={keyPrefix}>{children}</strong>];
  }

  if (tagName === "em" || tagName === "i") {
    return [<em key={keyPrefix}>{children}</em>];
  }

  return [<Fragment key={keyPrefix}>{children}</Fragment>];
}

function renderAccentText(text: string, keyPrefix: string): ReactNode[] {
  const accentPattern = /[@#][A-Za-z0-9_]+/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(accentPattern)) {
    const matchText = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      nodes.push(
        <Fragment key={`${keyPrefix}-text-${lastIndex}`}>
          {text.slice(lastIndex, matchIndex)}
        </Fragment>,
      );
    }

    nodes.push(
      <span
        className="tweet-card__accent"
        key={`${keyPrefix}-accent-${matchIndex}`}
      >
        {matchText}
      </span>,
    );

    lastIndex = matchIndex + matchText.length;
  }

  if (lastIndex < text.length) {
    nodes.push(
      <Fragment key={`${keyPrefix}-text-tail`}>
        {text.slice(lastIndex)}
      </Fragment>,
    );
  }

  return nodes;
}

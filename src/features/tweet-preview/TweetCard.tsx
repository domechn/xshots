import type { EmbeddedTweet, TweetDraft } from "../tweet-import/types";
import { Fragment } from "react";
import type { ReactNode } from "react";

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

      <footer className="tweet-card__footer">
        <span>{draft.timestampLabel || "Add launch timestamp"}</span>
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

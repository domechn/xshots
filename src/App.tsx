import { startTransition, useEffect, useRef, useState } from "react";
import { exportTweetCardToPng } from "./features/export/exportPng";
import { importTweetFromUrl } from "./features/tweet-import/importTweet";
import {
  createEmptyDraft,
  type TweetImportResult,
} from "./features/tweet-import/types";
import { TweetCard } from "./features/tweet-preview/TweetCard";

type AppProps = {
  importer?: (rawUrl: string) => Promise<TweetImportResult>;
  exporter?: typeof exportTweetCardToPng;
  clipboardWriter?: (dataUrl: string) => Promise<void>;
};

type StatusTone = "success" | "warning" | "error";
type StatusState = {
  tone: StatusTone;
  message: string;
};

type AdsByGoogleQueue = Array<Record<string, never>>;
const DESKTOP_AD_MEDIA_QUERY = "(min-width: 1280px)";
const SIDE_AD_SLOT_COUNT = 2;

declare global {
  interface Window {
    adsbygoogle?: AdsByGoogleQueue;
    __xshotsQueuedAdCount?: number;
  }
}

const INITIAL_DRAFT = createEmptyDraft({
  authorName: "Preview",
  handle: "xshots",
  body: "Paste a tweet URL to preview it here.",
  timestampLabel: "Ready to import",
  verified: false,
  themeVariant: "orbital",
});

export default function App({
  importer = importTweetFromUrl,
  exporter = exportTweetCardToPng,
  clipboardWriter = copyPngToClipboard,
}: AppProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const isDesktopAdLayout = useDesktopAdLayout();
  const [tweetUrl, setTweetUrl] = useState("");
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [isStatusExiting, setIsStatusExiting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const activeAdSlotCount = isDesktopAdLayout ? SIDE_AD_SLOT_COUNT : 1;

  useEffect(() => {
    queueAdsenseAds(activeAdSlotCount);
  }, [activeAdSlotCount]);

  useEffect(() => {
    if (!status) {
      return;
    }

    setIsStatusExiting(false);

    const exitTimer = window.setTimeout(() => {
      setIsStatusExiting(true);
    }, 3200);

    const clearTimer = window.setTimeout(() => {
      setStatus(null);
      setIsStatusExiting(false);
    }, 3600);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(clearTimer);
    };
  }, [status]);

  function showStatus(nextStatus: StatusState) {
    setIsStatusExiting(false);
    setStatus(nextStatus);
  }

  function clearStatus() {
    setIsStatusExiting(false);
    setStatus(null);
  }

  async function handleImport() {
    if (!tweetUrl.trim()) {
      showStatus({
        tone: "warning",
        message: "Paste an X or Twitter link first.",
      });
      return;
    }

    setIsImporting(true);
    clearStatus();

    try {
      const result = await importer(tweetUrl.trim());

      if (result.status === "success") {
        startTransition(() => {
          setDraft(
            createEmptyDraft({
              ...INITIAL_DRAFT,
              ...result.draft,
            }),
          );
        });
        showStatus({
          tone: "success",
          message: "Import complete. Export when ready.",
        });
      } else {
        showStatus({
          tone: "warning",
          message: result.reason,
        });
      }
    } catch (error) {
      showStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong while importing the tweet.",
      });
    } finally {
      setIsImporting(false);
    }
  }

  async function handleExport() {
    setIsExporting(true);
    clearStatus();

    try {
      const result = await renderSharePng();

      if (result.status === "blocked") {
        showStatus({
          tone: "warning",
          message: result.message,
        });
        return;
      }

      downloadDataUrl(result.dataUrl, buildFilename(draft.sourceUrl));
      showStatus({
        tone: "success",
        message: "PNG ready. The rendered tweet card has been downloaded.",
      });
    } catch (error) {
      showStatus({
        tone: "error",
        message:
          error instanceof Error ? error.message : "The PNG export failed.",
      });
    } finally {
      setIsExporting(false);
    }
  }

  async function handleCopyToClipboard() {
    setIsCopying(true);
    clearStatus();

    try {
      const result = await renderSharePng();

      if (result.status === "blocked") {
        showStatus({
          tone: "warning",
          message: result.message,
        });
        return;
      }

      await clipboardWriter(result.dataUrl);
      showStatus({
        tone: "success",
        message: "PNG copied to the clipboard.",
      });
    } catch (error) {
      showStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Copying the PNG to the clipboard failed.",
      });
    } finally {
      setIsCopying(false);
    }
  }

  async function renderSharePng() {
    if (!previewRef.current) {
      throw new Error("The preview is not ready yet.");
    }

    return await exporter(previewRef.current, {
      draft,
      size: "portrait",
    });
  }

  const isOutputDisabled = !draft.sourceUrl || isExporting || isCopying;

  return (
    <main className="app-shell app-shell--minimal">
      {status ? (
        <div className="app-toast-layer" aria-live="polite">
          <div
            className={`status-banner app-toast status-banner--${status.tone}${isStatusExiting ? " app-toast--exit" : ""}`}
            role="status"
          >
            {status.message}
          </div>
        </div>
      ) : null}
      <div className="app-layout app-layout--minimal">
        {isDesktopAdLayout ? (
          <AdSlot className="ad-slot ad-slot--side-rail ad-slot--side-rail-left" />
        ) : null}
        <div className="app-shell__inner">
          <section className="app-hero app-hero--minimal">
            <h1 className="app-hero__title app-hero__title--minimal">
              Paste a tweet URL. Get a clean share image.
            </h1>
            <p className="app-hero__summary app-hero__summary--minimal">
              Enter an X or Twitter post URL to preview and export it.
            </p>
          </section>

          <section className="app-grid app-grid--minimal">
            <section className="control-panel control-panel--minimal">
              <form
                className="import-shell"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleImport();
                }}
              >
                <label className="field">
                  <span className="field__label">Tweet link</span>
                  <div className="import-shell__row">
                    <input
                      aria-label="Tweet link"
                      className="field__input"
                      placeholder="https://x.com/user/status/..."
                      value={tweetUrl}
                      onChange={(event) => setTweetUrl(event.target.value)}
                    />
                    <button
                      className="button button--compact"
                      type="submit"
                      disabled={isImporting}
                    >
                      {isImporting ? "Importing…" : "Import tweet"}
                    </button>
                  </div>
                  <span className="field__hint">
                    Paste a full X or Twitter status link.
                  </span>
                </label>
              </form>
            </section>

            <section className="preview-panel preview-panel--minimal">
              <div className="preview-panel__header preview-panel__header--minimal">
                <h2 className="preview-panel__title">Preview stage</h2>
                <div className="preview-panel__toolbar">
                  <button
                    className="button--ghost button--compact"
                    type="button"
                    onClick={handleCopyToClipboard}
                    disabled={isOutputDisabled}
                  >
                    {isCopying ? "Copying…" : "Copy to clipboard"}
                  </button>
                  <button
                    className="button button--compact"
                    type="button"
                    onClick={handleExport}
                    disabled={isOutputDisabled}
                  >
                    {isExporting ? "Rendering…" : "Export PNG"}
                  </button>
                </div>
              </div>

              <div className="preview-stage preview-stage--minimal">
                <div className="preview-stage__capture" ref={previewRef}>
                  <TweetCard draft={draft} />
                </div>
              </div>
            </section>
          </section>
          {!isDesktopAdLayout ? (
            <AdSlot className="ad-slot ad-slot--mobile-fallback" />
          ) : null}
          <footer className="app-footer">
            <p className="privacy-note">
              This site uses Google AdSense, which may use cookies to serve
              personalized ads.
              <a href="/privacy.html" className="app-link">
                Privacy Policy
              </a>
            </p>
          </footer>
        </div>
        {isDesktopAdLayout ? (
          <AdSlot className="ad-slot ad-slot--side-rail ad-slot--side-rail-right" />
        ) : null}
      </div>
    </main>
  );
}

function AdSlot({ className }: { className: string }) {
  return (
    <aside className={className} aria-label="Advertisement">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client="ca-pub-7409362530062378"
        data-ad-slot="5831776750"
        data-ad-format="auto"
        data-full-width-responsive="true"
      ></ins>
    </aside>
  );
}

function buildFilename(sourceUrl: string): string {
  const statusId = sourceUrl.match(/status\/(\d+)/)?.[1];
  return statusId ? `tweet-${statusId}.png` : `tweet-${Date.now()}.png`;
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

async function copyPngToClipboard(dataUrl: string) {
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== "function" ||
    typeof ClipboardItem === "undefined"
  ) {
    throw new Error("Clipboard image copy is not supported in this browser.");
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();

  await navigator.clipboard.write([
    new ClipboardItem({
      [blob.type || "image/png"]: blob,
    }),
  ]);
}

function queueAdsenseAds(slotCount: number) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const adsbygoogle = window.adsbygoogle ?? (window.adsbygoogle = []);
    const queuedAdCount = window.__xshotsQueuedAdCount ?? 0;

    for (let index = queuedAdCount; index < slotCount; index += 1) {
      adsbygoogle.push({});
    }

    window.__xshotsQueuedAdCount = Math.max(queuedAdCount, slotCount);
  } catch {
    return;
  }
}

function useDesktopAdLayout() {
  const [isDesktopAdLayout, setIsDesktopAdLayout] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false;
    }

    return window.matchMedia(DESKTOP_AD_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia(DESKTOP_AD_MEDIA_QUERY);
    const updateLayout = (event?: MediaQueryListEvent) => {
      setIsDesktopAdLayout(event ? event.matches : mediaQuery.matches);
    };

    updateLayout();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateLayout);

      return () => {
        mediaQuery.removeEventListener("change", updateLayout);
      };
    }

    mediaQuery.addListener(updateLayout);

    return () => {
      mediaQuery.removeListener(updateLayout);
    };
  }, []);

  return isDesktopAdLayout;
}

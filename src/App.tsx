import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { exportTweetCardToPng } from "./features/export/exportPng";
import { importTweetFromUrl } from "./features/tweet-import/importTweet";
import {
  createEmptyDraft,
  type TweetImportResult,
} from "./features/tweet-import/types";
import { TweetCard } from "./features/tweet-preview/TweetCard";
import { SiteContent } from "./SiteContent";

type AppProps = {
  importer?: (rawUrl: string) => Promise<TweetImportResult>;
  exporter?: typeof exportTweetCardToPng;
  clipboardWriter?: (png: Promise<Blob>) => Promise<void>;
};

type SharePngResult = Awaited<ReturnType<typeof exportTweetCardToPng>>;
type SuccessfulSharePngResult = Extract<SharePngResult, { status: "success" }>;
type PreparedSharePngResult = SuccessfulSharePngResult & {
  previewSizeKey: string | null;
};
type PendingSharePngRender = {
  promise: Promise<SharePngResult>;
  previewSizeKey: string | null;
};

type StatusTone = "success" | "warning" | "error";
type StatusState = {
  tone: StatusTone;
  message: string;
};

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
  const preparedSharePngRef = useRef<PreparedSharePngResult | null>(null);
  const pendingSharePngRef = useRef<PendingSharePngRender | null>(null);
  const sharePngRevisionRef = useRef(0);
  const [tweetUrl, setTweetUrl] = useState("");
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [isStatusExiting, setIsStatusExiting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  const invalidateSharePngCache = useCallback(() => {
    sharePngRevisionRef.current += 1;
    preparedSharePngRef.current = null;
    pendingSharePngRef.current = null;

    return sharePngRevisionRef.current;
  }, []);

  const startSharePngRender = useCallback(
    (
      revision = sharePngRevisionRef.current,
      previewSizeKey = getPreviewSizeKey(previewRef.current),
    ): Promise<SharePngResult> => {
      const previewNode = previewRef.current;

      if (!previewNode) {
        return Promise.reject(new Error("The preview is not ready yet."));
      }

      const renderPromise = exporter(previewNode, {
        draft,
        size: "portrait",
      })
        .then((result) => {
          if (
            sharePngRevisionRef.current === revision &&
            result.status === "success"
          ) {
            preparedSharePngRef.current = {
              ...result,
              previewSizeKey,
            };
          }

          return result;
        })
        .finally(() => {
          if (
            sharePngRevisionRef.current === revision &&
            pendingSharePngRef.current?.promise === renderPromise
          ) {
            pendingSharePngRef.current = null;
          }
        });

      pendingSharePngRef.current = {
        promise: renderPromise,
        previewSizeKey,
      };

      return renderPromise;
    },
    [draft, exporter],
  );

  useEffect(() => {
    if (!status) {
      return;
    }

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

  useEffect(() => {
    const revision = invalidateSharePngCache();

    if (!draft.sourceUrl || !previewRef.current) {
      return;
    }

    const renderPromise = startSharePngRender(revision);
    void renderPromise.catch(() => undefined);

    return () => {
      if (
        sharePngRevisionRef.current === revision &&
        pendingSharePngRef.current?.promise === renderPromise
      ) {
        pendingSharePngRef.current = null;
      }
    };
  }, [draft.sourceUrl, invalidateSharePngCache, startSharePngRender]);

  useEffect(() => {
    if (
      !draft.sourceUrl ||
      !previewRef.current ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const node = previewRef.current;
    let lastPreviewSizeKey = getPreviewSizeKey(node);
    let debounceTimer: number | undefined;

    const observer = new ResizeObserver(() => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        const nextPreviewSizeKey = getPreviewSizeKey(node);

        if (!nextPreviewSizeKey || nextPreviewSizeKey === lastPreviewSizeKey) {
          return;
        }

        lastPreviewSizeKey = nextPreviewSizeKey;

        const revision = invalidateSharePngCache();
        const renderPromise = startSharePngRender(revision, nextPreviewSizeKey);
        void renderPromise.catch(() => undefined);
      }, 300);
    });

    observer.observe(node);

    return () => {
      window.clearTimeout(debounceTimer);
      observer.disconnect();
    };
  }, [draft.sourceUrl, invalidateSharePngCache, startSharePngRender]);

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

    invalidateSharePngCache();
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

      downloadBlob(result.blob, buildFilename(draft.sourceUrl));
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

    const renderPromise = renderSharePng();
    // Safari only allows clipboard.write() synchronously inside the click, so
    // hand it the pending PNG instead of awaiting the render first.
    const pngPromise = renderPromise.then((result) =>
      result.status === "success"
        ? result.blob
        : Promise.reject(new Error(result.message)),
    );
    void pngPromise.catch(() => undefined);

    try {
      await clipboardWriter(pngPromise);
      showStatus({
        tone: "success",
        message: "PNG copied to the clipboard.",
      });
    } catch (error) {
      const result = await renderPromise.catch(() => null);

      if (result?.status === "blocked") {
        showStatus({
          tone: "warning",
          message: result.message,
        });
        return;
      }

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
    const previewSizeKey = getPreviewSizeKey(previewRef.current);

    if (
      preparedSharePngRef.current &&
      preparedSharePngRef.current.previewSizeKey === previewSizeKey
    ) {
      return preparedSharePngRef.current;
    }

    if (
      pendingSharePngRef.current &&
      pendingSharePngRef.current.previewSizeKey === previewSizeKey
    ) {
      return await pendingSharePngRef.current.promise;
    }

    const revision = invalidateSharePngCache();

    return await startSharePngRender(revision, previewSizeKey);
  }

  const isOutputDisabled =
    !draft.sourceUrl || isImporting || isExporting || isCopying;
  const toast = status ? (
    <div
      className={`status-banner app-toast status-banner--${status.tone}${isStatusExiting ? " app-toast--exit" : ""}`}
    >
      {status.message}
    </div>
  ) : null;

  return (
    <main className="app-shell app-shell--minimal">
      {/* Live regions stay mounted so screen readers announce new messages. */}
      <div className="app-toast-layer">
        <div role="status">
          {status && status.tone !== "error" ? toast : null}
        </div>
        <div role="alert">{status?.tone === "error" ? toast : null}</div>
      </div>
      <div className="app-layout app-layout--minimal">
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
                // Links without https:// are accepted, so skip native URL validation.
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleImport();
                }}
              >
                <div className="field">
                  <label className="field__label" htmlFor="tweet-url">
                    Tweet link
                  </label>
                  <div className="import-shell__row">
                    <input
                      id="tweet-url"
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      aria-describedby="tweet-url-hint"
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
                  <span className="field__hint" id="tweet-url-hint">
                    Paste a full X or Twitter status link.
                  </span>
                </div>
              </form>
            </section>

            <section className="preview-panel preview-panel--minimal">
              <div className="preview-panel__header preview-panel__header--minimal">
                <div>
                  <h2 className="preview-panel__title">Preview stage</h2>
                </div>
                <div className="preview-panel__actions">
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
                      {isExporting ? "Exporting…" : "Export PNG"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="preview-stage preview-stage--minimal">
                <div className="preview-stage__capture" ref={previewRef}>
                  <TweetCard draft={draft} />
                </div>
              </div>
            </section>
          </section>
          <SiteContent />
          <footer className="app-footer">
            <p className="privacy-note">
              No account required.{" "}
              <a href="/privacy.html" className="app-link">
                Privacy Policy
              </a>
              <a
                href="https://github.com/domechn/xshots"
                className="app-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                ⭐ Star on GitHub
              </a>
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}

function buildFilename(sourceUrl: string): string {
  const statusId = sourceUrl.match(/status\/(\d+)/)?.[1];
  return statusId ? `tweet-${statusId}.png` : `tweet-${Date.now()}.png`;
}

function downloadBlob(blob: Blob, filename: string) {
  // An object URL rather than a multi-megabyte data: URL: mobile browsers
  // (notably iOS Safari) often refuse to download large data: URLs, or simply
  // navigate to them instead of saving them.
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";

  // The anchor must be in the document for `.click()` to dispatch a real
  // navigation/download on mobile Safari and some Android browsers.
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    // Defer revocation so the browser has time to start the download.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  }
}

async function copyPngToClipboard(png: Promise<Blob>) {
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== "function" ||
    typeof ClipboardItem === "undefined"
  ) {
    throw new Error("Clipboard image copy is not supported in this browser.");
  }

  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

function getPreviewSizeKey(node: HTMLElement | null): string | null {
  if (!node) {
    return null;
  }

  const width = node.offsetWidth || node.getBoundingClientRect().width;
  const height = node.offsetHeight || node.getBoundingClientRect().height;

  if (!width || !height) {
    return null;
  }

  return `${Math.round(width)}x${Math.round(height)}`;
}

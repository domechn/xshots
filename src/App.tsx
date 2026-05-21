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
  sponsorUnlockEnabled?: boolean;
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

type OutputAction = "copy" | "export";
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

const SPONSOR_URL =
  "https://plump-plastic.com/b.3qVK0vPn3rppveb/m/VDJEZvDP0/3cMZDjUJ1sOfTmEdz/LOTNchwhNwTzU-5/MZT/cp";
const SPONSOR_UNLOCK_WINDOW_MS = 45_000;
const OUTPUT_ACTION_LABELS: Record<OutputAction, string> = {
  copy: "Copy to clipboard",
  export: "Export PNG",
};

export default function App({
  importer = importTweetFromUrl,
  exporter = exportTweetCardToPng,
  clipboardWriter = copyPngToClipboard,
  sponsorUnlockEnabled = !import.meta.env.DEV,
}: AppProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const preparedSharePngRef = useRef<PreparedSharePngResult | null>(null);
  const pendingSharePngRef = useRef<PendingSharePngRender | null>(null);
  const sharePngRevisionRef = useRef(0);
  const sponsorUnlockExpiresAtRef = useRef<number | null>(null);
  const [tweetUrl, setTweetUrl] = useState("");
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [isStatusExiting, setIsStatusExiting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

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
  }, [draft, exporter]);

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

    const observer = new ResizeObserver(() => {
      const nextPreviewSizeKey = getPreviewSizeKey(node);

      if (!nextPreviewSizeKey || nextPreviewSizeKey === lastPreviewSizeKey) {
        return;
      }

      lastPreviewSizeKey = nextPreviewSizeKey;

      const revision = invalidateSharePngCache();
      const renderPromise = startSharePngRender(revision, nextPreviewSizeKey);
      void renderPromise.catch(() => undefined);
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [draft, exporter]);

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

    sponsorUnlockExpiresAtRef.current = null;
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
    if (!ensureSponsorUnlock("export")) {
      return;
    }

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
    if (!ensureSponsorUnlock("copy")) {
      return;
    }

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

  function startSharePngRender(
    revision = sharePngRevisionRef.current,
    previewSizeKey = getPreviewSizeKey(previewRef.current),
  ): Promise<SharePngResult> {
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
  }

  function invalidateSharePngCache() {
    sharePngRevisionRef.current += 1;
    preparedSharePngRef.current = null;
    pendingSharePngRef.current = null;

    return sharePngRevisionRef.current;
  }

  function ensureSponsorUnlock(action: OutputAction) {
    if (!sponsorUnlockEnabled) {
      return true;
    }

    const now = Date.now();

    if ((sponsorUnlockExpiresAtRef.current ?? 0) > now) {
      return true;
    }

    sponsorUnlockExpiresAtRef.current = now + SPONSOR_UNLOCK_WINDOW_MS;
    window.open(SPONSOR_URL, "_blank", "noopener,noreferrer");
    showStatus({
      tone: "warning",
      message: `Sponsor link opened in a new tab. Return here and press ${OUTPUT_ACTION_LABELS[action]} again to continue.`,
    });

    return false;
  }

  const isOutputDisabled =
    !draft.sourceUrl || isImporting || isExporting || isCopying;

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
                  <p className="preview-panel__copy preview-panel__copy--actions">
                    {sponsorUnlockEnabled
                      ? "First click opens sponsor tab. Click again to finish."
                      : "Development mode: sponsor tab is disabled."}
                  </p>
                </div>
              </div>

              <div className="preview-stage preview-stage--minimal">
                <div className="preview-stage__capture" ref={previewRef}>
                  <TweetCard draft={draft} />
                </div>
              </div>
            </section>
          </section>
          <footer className="app-footer">
            <p className="privacy-note">
              {sponsorUnlockEnabled
                ? "Copy and export open a sponsor link in a new tab. No account required."
                : "Development mode: sponsor link is disabled for copy and export."}{" "}
              <a href="/privacy.html" className="app-link">
                Privacy Policy
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

function downloadDataUrl(dataUrl: string, filename: string) {
  const blob = dataUrlToBlob(dataUrl);
  // Prefer an object URL over a multi-megabyte data: URL: mobile browsers
  // (notably iOS Safari) often refuse to download data: URLs whose payload
  // exceeds a small size, or simply navigate to them instead of saving them.
  const objectUrl = blob ? URL.createObjectURL(blob) : null;
  const href = objectUrl ?? dataUrl;

  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener";

  // The anchor must be in the document for `.click()` to dispatch a real
  // navigation/download on mobile Safari and some Android browsers.
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    document.body.removeChild(link);

    if (objectUrl) {
      // Defer revocation so the browser has time to start the download.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    }
  }
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);

  if (!match) {
    return null;
  }

  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";

  try {
    if (isBase64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      return new Blob([bytes], { type: mimeType });
    }

    return new Blob([decodeURIComponent(payload)], { type: mimeType });
  } catch {
    return null;
  }
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

  const blob = dataUrlToBlob(dataUrl);

  if (!blob) {
    throw new Error("The PNG could not be prepared for clipboard copy.");
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      [blob.type || "image/png"]: blob,
    }),
  ]);
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

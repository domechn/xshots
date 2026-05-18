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
}: AppProps) {
  const previewRef = useRef<HTMLDivElement>(null);
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
    if (!previewRef.current) {
      throw new Error("The preview is not ready yet.");
    }

    return await exporter(previewRef.current, {
      draft,
      size: "portrait",
    });
  }

  function ensureSponsorUnlock(action: OutputAction) {
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
                      {isExporting ? "Rendering…" : "Export PNG"}
                    </button>
                  </div>
                  <p className="preview-panel__copy preview-panel__copy--actions">
                    First click opens sponsor tab. Click again to finish.
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
              Copy and export open a sponsor link in a new tab. No account
              required.{" "}
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

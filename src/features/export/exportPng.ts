import { toPng as htmlToPng } from "html-to-image";
import type { TweetDraft } from "../tweet-import/types";

type ExportSizeKey = "landscape" | "portrait";

type ProbeAsset = (url: string) => Promise<boolean>;
type ResolveAssetUrl = (url: string) => Promise<string | null>;

type ToPng = (
  node: HTMLElement,
  options?: Record<string, unknown>,
) => Promise<string>;

type ExportOptions = {
  draft: TweetDraft;
  size?: ExportSizeKey;
  probeAsset?: ProbeAsset;
  resolveAssetUrl?: ResolveAssetUrl;
  toPng?: ToPng;
};

const EXPORT_SIZES: Record<ExportSizeKey, { width: number; height: number }> = {
  landscape: { width: 1200, height: 675 },
  portrait: { width: 1080, height: 1350 },
};
const EXPORT_PIXEL_RATIO = 1.5;
const decodedImages = new WeakSet<HTMLImageElement>();

export async function exportTweetCardToPng(
  node: HTMLElement,
  options: ExportOptions,
): Promise<
  | {
      status: "success";
      dataUrl: string;
    }
  | {
      status: "blocked";
      message: string;
    }
> {
  const size = EXPORT_SIZES[options.size ?? "landscape"];
  const canvasSize = resolveCanvasSize(node, size);
  const assets = collectAssetUrls(node, options.draft);
  const resolvedAssets = new Map<string, string>();

  for (const assetUrl of assets) {
    if (isLocalAsset(assetUrl)) {
      continue;
    }

    const resolvedUrl = await resolveRemoteAssetUrl(assetUrl, options);

    if (!resolvedUrl) {
      return {
        status: "blocked",
        message:
          "One or more remote images cannot be exported safely. Please upload the image locally before generating the PNG.",
      };
    }

    resolvedAssets.set(assetUrl, resolvedUrl);
  }

  const toPng = options.toPng ?? htmlToPng;
  const restoreImages = await swapInlineAssetUrls(node, resolvedAssets);

  try {
    await waitForRenderedImages(node);

    const dataUrl = await toPng(node, {
      cacheBust: true,
      pixelRatio: EXPORT_PIXEL_RATIO,
      backgroundColor: "#05070a",
      canvasWidth: canvasSize.width,
      canvasHeight: canvasSize.height,
    });

    return {
      status: "success",
      dataUrl,
    };
  } finally {
    restoreImages();
  }
}

async function waitForRenderedImages(node: HTMLElement): Promise<void> {
  const images = Array.from(node.querySelectorAll("img"));

  await Promise.all(images.map(waitForImageDecode));
  await waitForNextPaint();
}

async function waitForImageDecode(image: HTMLImageElement): Promise<void> {
  if (decodedImages.has(image)) {
    return;
  }

  if (typeof image.decode !== "function") {
    return;
  }

  try {
    await image.decode();
    decodedImages.add(image);
  } catch {
    // Keep exporting if decode() rejects; broken images are handled by the
    // browser exactly as they are rendered in the preview.
  }
}

async function waitForNextPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof window.requestAnimationFrame !== "function") {
      window.setTimeout(resolve, 0);
      return;
    }

    window.requestAnimationFrame(() => resolve());
  });
}

function resolveCanvasSize(
  node: HTMLElement,
  targetSize: { width: number; height: number },
): { width: number; height: number } {
  const sourceWidth = node.offsetWidth || node.getBoundingClientRect().width;
  const sourceHeight = node.offsetHeight || node.getBoundingClientRect().height;

  if (!sourceWidth || !sourceHeight) {
    return targetSize;
  }

  const scale = targetSize.width / sourceWidth;

  return {
    width: targetSize.width,
    height: Math.round(sourceHeight * scale),
  };
}

async function defaultProbeAsset(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function defaultResolveAssetUrl(url: string): Promise<string | null> {
  for (const cacheMode of ["force-cache", "reload"] as const) {
    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        cache: cacheMode,
      });

      if (!response.ok) {
        continue;
      }

      const blob = await response.blob();
      return await blobToDataUrl(blob);
    } catch {
      continue;
    }
  }

  return null;
}

function collectAssetUrls(node: HTMLElement, draft: TweetDraft): string[] {
  const renderedAssetUrls = Array.from(node.querySelectorAll("img"))
    .map((image) => image.currentSrc || image.getAttribute("src") || "")
    .filter(Boolean);

  if (renderedAssetUrls.length) {
    return Array.from(new Set(renderedAssetUrls));
  }

  const mediaUrls = draft.mediaUrls.length
    ? draft.mediaUrls
    : draft.mediaUrl
      ? [draft.mediaUrl]
      : [];

  const quotedTweetMediaUrls = draft.quotedTweet
    ? draft.quotedTweet.mediaUrls.length
      ? draft.quotedTweet.mediaUrls
      : draft.quotedTweet.mediaUrl
        ? [draft.quotedTweet.mediaUrl]
        : []
    : [];

  return [
    draft.avatarUrl,
    ...mediaUrls,
    draft.quotedTweet?.avatarUrl ?? "",
    ...quotedTweetMediaUrls,
  ].filter(Boolean);
}

async function resolveRemoteAssetUrl(
  assetUrl: string,
  options: ExportOptions,
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const resolvedUrl = await resolveRemoteAssetUrlOnce(assetUrl, options);

    if (resolvedUrl) {
      return resolvedUrl;
    }
  }

  return null;
}

async function resolveRemoteAssetUrlOnce(
  assetUrl: string,
  options: ExportOptions,
): Promise<string | null> {
  if (options.resolveAssetUrl) {
    return await options.resolveAssetUrl(assetUrl);
  }

  if (options.probeAsset) {
    return (await options.probeAsset(assetUrl)) ? assetUrl : null;
  }

  return await defaultResolveAssetUrl(assetUrl);
}

async function swapInlineAssetUrls(
  node: HTMLElement,
  resolvedAssets: Map<string, string>,
): Promise<() => void> {
  if (!resolvedAssets.size) {
    return () => undefined;
  }

  const images = Array.from(node.querySelectorAll("img"));
  const swappedImages: Array<{
    image: HTMLImageElement;
    source: string | null;
  }> = [];

  for (const image of images) {
    const source = image.getAttribute("src");
    const resolvedUrl =
      (source ? resolvedAssets.get(source) : null) ??
      resolvedAssets.get(image.src);

    if (!resolvedUrl || resolvedUrl === source) {
      continue;
    }

    swappedImages.push({ image, source });
    await setImageSource(image, resolvedUrl);
  }

  return () => {
    for (const swappedImage of swappedImages) {
      if (swappedImage.source === null) {
        swappedImage.image.removeAttribute("src");
      } else {
        swappedImage.image.setAttribute("src", swappedImage.source);
      }
    }
  };
}

async function setImageSource(
  image: HTMLImageElement,
  source: string,
): Promise<void> {
  image.setAttribute("src", source);

  // Disconnected nodes (e.g. test fixtures and the off-DOM clones html-to-image
  // builds internally) never fire a `load` event, so simply setting the source
  // is enough.
  if (!image.isConnected) {
    return;
  }

  // Wait for the new source to be fully decoded before continuing. Relying on
  // the `complete` flag alone is unsafe right after `setAttribute` because
  // some browsers briefly keep the previous load's `complete=true` state,
  // which would cause us to resolve before the new image data is ready.
  // html-to-image then clones the node and rasterises the result while the
  // inlined data URL hasn't been decoded yet, producing a PNG with blank
  // image slots.
  if (typeof image.decode === "function") {
    try {
      await image.decode();
      decodedImages.add(image);
      return;
    } catch {
      // Fall back to the load/error listeners below if decode() rejects.
    }
  }

  await new Promise<void>((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      image.removeEventListener("load", finish);
      image.removeEventListener("error", finish);
      window.clearTimeout(timeoutId);
      resolve();
    };

    image.addEventListener("load", finish);
    image.addEventListener("error", finish);

    // Safety net so we never hang if neither event fires.
    const timeoutId = window.setTimeout(finish, 5000);
  });

  decodedImages.add(image);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("The image could not be converted for export."));
    };

    reader.onerror = () => {
      reject(new Error("The image could not be converted for export."));
    };

    reader.readAsDataURL(blob);
  });
}

function isLocalAsset(url: string): boolean {
  if (!url) {
    return true;
  }

  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

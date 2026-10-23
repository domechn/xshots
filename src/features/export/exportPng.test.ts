import { describe, expect, it, vi } from "vitest";
import { createEmptyDraft } from "../tweet-import/types";
import { exportTweetCardToPng } from "./exportPng";

const PNG_BLOB = new Blob(["png"], { type: "image/png" });

describe("exportTweetCardToPng", () => {
  it("waits for image decode before exporting so the swap is fully applied", async () => {
    const node = document.createElement("div");
    node.innerHTML =
      '<img alt="avatar" src="https://images.example.com/a.jpg">';
    document.body.appendChild(node);

    const image = node.querySelector("img") as HTMLImageElement;
    let decodeResolved = false;
    let resolveDecode: () => void = () => undefined;
    let decodeCalls = 0;
    // jsdom doesn't implement HTMLImageElement.decode; install our own so we
    // can observe when (and whether) it is awaited.
    (image as { decode?: () => Promise<void> }).decode = () => {
      decodeCalls += 1;

      if (decodeResolved) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        resolveDecode = () => {
          decodeResolved = true;
          resolve();
        };
      });
    };

    const toBlob = vi.fn(async () => {
      // Export must not start until decode() of the swapped data URL resolves.
      expect(decodeResolved).toBe(true);
      return PNG_BLOB;
    });

    const exportPromise = exportTweetCardToPng(node, {
      draft: createEmptyDraft({
        avatarUrl: "https://images.example.com/a.jpg",
      }),
      resolveAssetUrl: async () => "data:image/png;base64,avatar",
      toBlob,
    } as never);

    // Allow the async swap to progress through several await points until it
    // reaches the decode() await.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(decodeCalls).toBe(1);
    expect(toBlob).not.toHaveBeenCalled();

    resolveDecode();

    const result = await exportPromise;

    expect(result).toEqual({
      status: "success",
      blob: PNG_BLOB,
    });
    expect(toBlob).toHaveBeenCalledOnce();

    document.body.removeChild(node);
  });

  it("waits for a paint frame after inlined images decode before exporting", async () => {
    const node = document.createElement("div");
    node.innerHTML =
      '<img alt="media" src="https://images.example.com/media.jpg">';
    document.body.appendChild(node);

    const image = node.querySelector("img") as HTMLImageElement;
    (image as { decode?: () => Promise<void> }).decode = async () => undefined;

    const pendingFrame = {
      callback: null as FrameRequestCallback | null,
    };
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;

    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        pendingFrame.callback = callback;
        return 1;
      },
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: vi.fn(),
    });

    const toBlob = vi.fn(async () => PNG_BLOB);

    try {
      const exportPromise = exportTweetCardToPng(node, {
        draft: createEmptyDraft({
          mediaUrl: "https://images.example.com/media.jpg",
        }),
        resolveAssetUrl: async () => "data:image/png;base64,media",
        toBlob,
      } as never);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(toBlob).not.toHaveBeenCalled();
      expect(pendingFrame.callback).not.toBeNull();

      if (!pendingFrame.callback) {
        throw new Error("Expected export to wait for requestAnimationFrame.");
      }

      pendingFrame.callback(performance.now());

      await expect(exportPromise).resolves.toEqual({
        status: "success",
        blob: PNG_BLOB,
      });
      expect(toBlob).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(window, "requestAnimationFrame", {
        configurable: true,
        value: originalRequestAnimationFrame,
      });
      Object.defineProperty(window, "cancelAnimationFrame", {
        configurable: true,
        value: originalCancelAnimationFrame,
      });
      document.body.removeChild(node);
    }
  });

  it("blocks export when a remote asset cannot be verified for browser-safe export", async () => {
    const node = document.createElement("div");
    const toBlob = vi.fn();

    const result = await exportTweetCardToPng(node, {
      draft: createEmptyDraft({
        mediaUrl: "https://images.example.com/poster.jpg",
      }),
      probeAsset: async () => false,
      toBlob,
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") {
      throw new Error("Expected export to be blocked.");
    }
    expect(result.message).toContain("upload the image locally");
    expect(toBlob).not.toHaveBeenCalled();
  });

  it("returns a data URL when exportable assets are available", async () => {
    const node = document.createElement("div");

    const result = await exportTweetCardToPng(node, {
      draft: createEmptyDraft({
        body: "Launch update",
        mediaUrl: "data:image/png;base64,xyz",
      }),
      probeAsset: async () => true,
      toBlob: async () => PNG_BLOB,
    });

    expect(result).toEqual({
      status: "success",
      blob: PNG_BLOB,
    });
  });

  it("inlines remote avatar and media assets before exporting", async () => {
    const node = document.createElement("div");
    node.innerHTML = `
      <img alt="avatar" src="https://images.example.com/avatar.jpg">
      <img alt="photo 1" src="https://images.example.com/photo-1.jpg">
      <img alt="photo 2" src="https://images.example.com/photo-2.jpg">
    `;

    const toBlob = vi.fn(async (element: HTMLElement) => {
      const imageSources = Array.from(element.querySelectorAll("img")).map(
        (image) => image.getAttribute("src"),
      );

      expect(imageSources).toEqual([
        "data:image/png;base64,avatar",
        "data:image/png;base64,photo1",
        "data:image/png;base64,photo2",
      ]);

      return PNG_BLOB;
    });

    const draft = {
      ...createEmptyDraft({
        avatarUrl: "https://images.example.com/avatar.jpg",
        mediaUrl: "https://images.example.com/photo-1.jpg",
      }),
      mediaUrls: [
        "https://images.example.com/photo-1.jpg",
        "https://images.example.com/photo-2.jpg",
      ],
    };

    const result = await exportTweetCardToPng(node, {
      draft,
      toBlob,
      resolveAssetUrl: async (url: string) => {
        if (url.endsWith("avatar.jpg")) {
          return "data:image/png;base64,avatar";
        }

        if (url.endsWith("photo-1.jpg")) {
          return "data:image/png;base64,photo1";
        }

        return "data:image/png;base64,photo2";
      },
    } as never);

    expect(result).toEqual({
      status: "success",
      blob: PNG_BLOB,
    });
    expect(toBlob).toHaveBeenCalledOnce();
  });

  it("also inlines quoted tweet assets before exporting", async () => {
    const node = document.createElement("div");
    node.innerHTML = `
      <img alt="quoted avatar" src="https://images.example.com/quoted-avatar.jpg">
      <img alt="quoted photo" src="https://images.example.com/quoted-photo.jpg">
    `;

    const toBlob = vi.fn(async (element: HTMLElement) => {
      const imageSources = Array.from(element.querySelectorAll("img")).map(
        (image) => image.getAttribute("src"),
      );

      expect(imageSources).toEqual([
        "data:image/png;base64,quotedavatar",
        "data:image/png;base64,quotedphoto",
      ]);

      return PNG_BLOB;
    });

    const result = await exportTweetCardToPng(node, {
      draft: createEmptyDraft({
        quotedTweet: {
          sourceUrl: "",
          authorName: "NASA",
          handle: "NASA",
          body: "Quoted mission note.",
          bodyHtml: "",
          timestampLabel: "April 22, 2026",
          avatarUrl: "https://images.example.com/quoted-avatar.jpg",
          mediaUrl: "https://images.example.com/quoted-photo.jpg",
          mediaUrls: ["https://images.example.com/quoted-photo.jpg"],
          verified: true,
        },
      }),
      toBlob,
      resolveAssetUrl: async (url: string) => {
        if (url.endsWith("quoted-avatar.jpg")) {
          return "data:image/png;base64,quotedavatar";
        }

        return "data:image/png;base64,quotedphoto";
      },
    } as never);

    expect(result).toEqual({
      status: "success",
      blob: PNG_BLOB,
    });
  });

  it("uses the rendered image sources when draft asset urls are stale", async () => {
    const node = document.createElement("div");
    node.innerHTML = `
      <img alt="avatar" src="data:image/png;base64,avatar">
      <img alt="photo" src="data:image/png;base64,photo">
    `;

    const toBlob = vi.fn(async () => PNG_BLOB);

    const result = await exportTweetCardToPng(node, {
      draft: createEmptyDraft({
        avatarUrl: "https://images.example.com/stale-avatar.jpg",
        mediaUrl: "https://images.example.com/stale-photo.jpg",
        mediaUrls: ["https://images.example.com/stale-photo.jpg"],
      }),
      resolveAssetUrl: async () => null,
      toBlob,
    } as never);

    expect(result).toEqual({
      status: "success",
      blob: PNG_BLOB,
    });
  });

  it("retries a failed cached image fetch with a network reload before blocking export", async () => {
    const node = document.createElement("div");
    node.innerHTML =
      '<img alt="avatar" src="https://images.example.com/avatar.jpg">';

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("CORS"))
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(["avatar"], { type: "image/png" }),
      } as Response);

    try {
      const result = await exportTweetCardToPng(node, {
        draft: createEmptyDraft({
          avatarUrl: "https://images.example.com/avatar.jpg",
        }),
        toBlob: async () => PNG_BLOB,
      });

      expect(result).toEqual({
        status: "success",
        blob: PNG_BLOB,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls.map(([, init]) => init?.cache)).toEqual([
        "force-cache",
        "reload",
      ]);
      expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("resolves remote assets in parallel", async () => {
    const node = document.createElement("div");
    node.innerHTML = `
      <img alt="avatar" src="https://images.example.com/avatar.jpg">
      <img alt="photo" src="https://images.example.com/photo.jpg">
    `;
    const pending: Array<() => void> = [];

    const exportPromise = exportTweetCardToPng(node, {
      draft: createEmptyDraft(),
      resolveAssetUrl: (url: string) =>
        new Promise<string>((resolve) => {
          pending.push(() => resolve(`data:image/png;base64,${url.length}`));
        }),
      toBlob: async () => PNG_BLOB,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pending).toHaveLength(2);
    pending.forEach((resolve) => resolve());

    await expect(exportPromise).resolves.toEqual({
      status: "success",
      blob: PNG_BLOB,
    });
  });

  it("preserves the rendered card aspect ratio during portrait export", async () => {
    const node = document.createElement("div");
    Object.defineProperty(node, "offsetWidth", {
      configurable: true,
      value: 540,
    });
    Object.defineProperty(node, "offsetHeight", {
      configurable: true,
      value: 900,
    });

    const toBlob = vi.fn(async () => PNG_BLOB);

    const result = await exportTweetCardToPng(node, {
      draft: createEmptyDraft({
        body: "Launch update",
      }),
      size: "portrait",
      toBlob,
    });

    expect(result).toEqual({
      status: "success",
      blob: PNG_BLOB,
    });
    expect(toBlob).toHaveBeenCalledWith(
      node,
      expect.objectContaining({
        canvasWidth: 1080,
        canvasHeight: 1800,
      }),
    );
  });

  it("uses a lower pixel ratio to reduce copy and download image size", async () => {
    const node = document.createElement("div");
    const toBlob = vi.fn(async () => PNG_BLOB);

    const result = await exportTweetCardToPng(node, {
      draft: createEmptyDraft({
        body: "Launch update",
      }),
      toBlob,
    });

    expect(result).toEqual({
      status: "success",
      blob: PNG_BLOB,
    });
    expect(toBlob).toHaveBeenCalledWith(
      node,
      expect.objectContaining({
        pixelRatio: 1.5,
      }),
    );
  });
});

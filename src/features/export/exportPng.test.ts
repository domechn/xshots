import { describe, expect, it, vi } from "vitest";
import { createEmptyDraft } from "../tweet-import/types";
import { exportTweetCardToPng } from "./exportPng";

describe("exportTweetCardToPng", () => {
  it("blocks export when a remote asset cannot be verified for browser-safe export", async () => {
    const node = document.createElement("div");
    const toPng = vi.fn();

    const result = await exportTweetCardToPng(node, {
      draft: createEmptyDraft({
        mediaUrl: "https://images.example.com/poster.jpg",
      }),
      probeAsset: async () => false,
      toPng,
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") {
      throw new Error("Expected export to be blocked.");
    }
    expect(result.message).toContain("upload the image locally");
    expect(toPng).not.toHaveBeenCalled();
  });

  it("returns a data URL when exportable assets are available", async () => {
    const node = document.createElement("div");

    const result = await exportTweetCardToPng(node, {
      draft: createEmptyDraft({
        body: "Launch update",
        mediaUrl: "data:image/png;base64,xyz",
      }),
      probeAsset: async () => true,
      toPng: async () => "data:image/png;base64,abc",
    });

    expect(result).toEqual({
      status: "success",
      dataUrl: "data:image/png;base64,abc",
    });
  });

  it("inlines remote avatar and media assets before exporting", async () => {
    const node = document.createElement("div");
    node.innerHTML = `
      <img alt="avatar" src="https://images.example.com/avatar.jpg">
      <img alt="photo 1" src="https://images.example.com/photo-1.jpg">
      <img alt="photo 2" src="https://images.example.com/photo-2.jpg">
    `;

    const toPng = vi.fn(async (element: HTMLElement) => {
      const imageSources = Array.from(element.querySelectorAll("img")).map(
        (image) => image.getAttribute("src"),
      );

      expect(imageSources).toEqual([
        "data:image/png;base64,avatar",
        "data:image/png;base64,photo1",
        "data:image/png;base64,photo2",
      ]);

      return "data:image/png;base64,abc";
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
      toPng,
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
      dataUrl: "data:image/png;base64,abc",
    });
    expect(toPng).toHaveBeenCalledOnce();
  });

  it("also inlines quoted tweet assets before exporting", async () => {
    const node = document.createElement("div");
    node.innerHTML = `
      <img alt="quoted avatar" src="https://images.example.com/quoted-avatar.jpg">
      <img alt="quoted photo" src="https://images.example.com/quoted-photo.jpg">
    `;

    const toPng = vi.fn(async (element: HTMLElement) => {
      const imageSources = Array.from(element.querySelectorAll("img")).map(
        (image) => image.getAttribute("src"),
      );

      expect(imageSources).toEqual([
        "data:image/png;base64,quotedavatar",
        "data:image/png;base64,quotedphoto",
      ]);

      return "data:image/png;base64,abc";
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
      toPng,
      resolveAssetUrl: async (url: string) => {
        if (url.endsWith("quoted-avatar.jpg")) {
          return "data:image/png;base64,quotedavatar";
        }

        return "data:image/png;base64,quotedphoto";
      },
    } as never);

    expect(result).toEqual({
      status: "success",
      dataUrl: "data:image/png;base64,abc",
    });
  });

  it("uses the rendered image sources when draft asset urls are stale", async () => {
    const node = document.createElement("div");
    node.innerHTML = `
      <img alt="avatar" src="data:image/png;base64,avatar">
      <img alt="photo" src="data:image/png;base64,photo">
    `;

    const toPng = vi.fn(async () => "data:image/png;base64,abc");

    const result = await exportTweetCardToPng(node, {
      draft: createEmptyDraft({
        avatarUrl: "https://images.example.com/stale-avatar.jpg",
        mediaUrl: "https://images.example.com/stale-photo.jpg",
        mediaUrls: ["https://images.example.com/stale-photo.jpg"],
      }),
      resolveAssetUrl: async () => null,
      toPng,
    } as never);

    expect(result).toEqual({
      status: "success",
      dataUrl: "data:image/png;base64,abc",
    });
  });

  it("retries transient asset resolution failures before blocking export", async () => {
    const node = document.createElement("div");
    node.innerHTML =
      '<img alt="avatar" src="https://images.example.com/avatar.jpg">';

    const resolveAssetUrl = vi
      .fn<(_: string) => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("data:image/png;base64,avatar");

    const result = await exportTweetCardToPng(node, {
      draft: createEmptyDraft({
        avatarUrl: "https://images.example.com/avatar.jpg",
      }),
      resolveAssetUrl,
      toPng: async () => "data:image/png;base64,abc",
    } as never);

    expect(result).toEqual({
      status: "success",
      dataUrl: "data:image/png;base64,abc",
    });
    expect(resolveAssetUrl).toHaveBeenCalledTimes(2);
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

    const toPng = vi.fn(async () => "data:image/png;base64,abc");

    const result = await exportTweetCardToPng(node, {
      draft: createEmptyDraft({
        body: "Launch update",
      }),
      size: "portrait",
      toPng,
    });

    expect(result).toEqual({
      status: "success",
      dataUrl: "data:image/png;base64,abc",
    });
    expect(toPng).toHaveBeenCalledWith(
      node,
      expect.objectContaining({
        canvasWidth: 1080,
        canvasHeight: 1800,
      }),
    );
  });
});

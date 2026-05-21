import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function installResizeObserverMock() {
  const callbacksByTarget = new Map<Element, Set<ResizeObserverCallback>>();
  const originalResizeObserver = globalThis.ResizeObserver;

  class ResizeObserverMock implements ResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}

    observe(target: Element) {
      const callbacks = callbacksByTarget.get(target) ?? new Set();
      callbacks.add(this.callback);
      callbacksByTarget.set(target, callbacks);
    }

    unobserve(target: Element) {
      callbacksByTarget.get(target)?.delete(this.callback);
    }

    disconnect() {
      for (const callbacks of callbacksByTarget.values()) {
        callbacks.delete(this.callback);
      }
    }
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: ResizeObserverMock,
  });

  return {
    isObserving(target: Element) {
      return (callbacksByTarget.get(target)?.size ?? 0) > 0;
    },
    trigger(target: Element) {
      const callbacks = callbacksByTarget.get(target);

      if (!callbacks?.size) {
        return;
      }

      const rect = target.getBoundingClientRect();
      const entry = {
        target,
        contentRect: rect,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      } as ResizeObserverEntry;

      for (const callback of callbacks) {
        callback([entry], {} as ResizeObserver);
      }
    },
    restore() {
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        writable: true,
        value: originalResizeObserver,
      });
    },
  };
}

describe("App", () => {
  it("renders a minimal import and preview layout", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "Paste a tweet URL. Get a clean share image.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Enter an X or Twitter post URL to preview and export it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Tweet link")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import tweet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export PNG" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy to clipboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Preview stage" }),
    ).toBeInTheDocument();

    expect(screen.queryByText("Compose")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Author name")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reset canvas" }),
    ).not.toBeInTheDocument();
  });

  it("renders sponsor disclosure without inline advertisement slots", () => {
    render(<App sponsorUnlockEnabled />);

    expect(screen.queryByLabelText("Advertisement")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Copy and export open a sponsor link in a new tab. No account required.",
      ),
    ).toBeInTheDocument();
  });

  it("imports a tweet URL and updates the preview", async () => {
    const user = userEvent.setup();
    const importer = vi.fn().mockResolvedValue({
      status: "success",
      draft: {
        sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
        authorName: "SpaceX",
        handle: "SpaceX",
        body: "Booster landing confirmed.",
        timestampLabel: "April 23, 2026",
        avatarUrl: "",
        mediaUrl: "",
        verified: true,
        themeVariant: "orbital",
      },
    });

    render(<App importer={importer} />);

    await user.type(
      screen.getByLabelText("Tweet link"),
      "https://x.com/SpaceX/status/1915324363727337943",
    );
    await user.click(screen.getByRole("button", { name: "Import tweet" }));

    expect(importer).toHaveBeenCalled();
    expect(
      await within(screen.getByLabelText("Tweet preview card")).findByText(
        "Booster landing confirmed.",
      ),
    ).toBeInTheDocument();
  });

  it("shows import success as a top toast instead of an inline form banner", async () => {
    const user = userEvent.setup();
    const importer = vi.fn().mockResolvedValue({
      status: "success",
      draft: {
        sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
        authorName: "SpaceX",
        handle: "SpaceX",
        body: "Booster landing confirmed.",
        bodyHtml: "",
        timestampLabel: "April 23, 2026",
        avatarUrl: "",
        mediaUrl: "",
        mediaUrls: [],
        verified: true,
        themeVariant: "orbital",
        quotedTweet: null,
      },
    });
    const { container } = render(<App importer={importer} />);

    await user.type(
      screen.getByLabelText("Tweet link"),
      "https://x.com/SpaceX/status/1915324363727337943",
    );
    await user.click(screen.getByRole("button", { name: "Import tweet" }));

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Import complete. Export when ready.");
    expect(container.querySelector(".import-shell")).not.toContainElement(
      toast,
    );
  });

  it("shows manual fallback guidance when automatic import cannot complete", async () => {
    const user = userEvent.setup();
    const importer = vi.fn().mockResolvedValue({
      status: "manual",
      reason:
        "We could not complete the automatic import. Please fill in the tweet manually.",
      draft: {
        sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
        authorName: "",
        handle: "SpaceX",
        body: "",
        timestampLabel: "",
        avatarUrl: "",
        mediaUrl: "",
        verified: false,
        themeVariant: "orbital",
      },
    });

    render(<App importer={importer} />);

    await user.type(
      screen.getByLabelText("Tweet link"),
      "https://x.com/SpaceX/status/1915324363727337943",
    );
    await user.click(screen.getByRole("button", { name: "Import tweet" }));

    expect(importer).toHaveBeenCalled();
    expect(screen.getByText(/fill in the tweet manually/i)).toBeInTheDocument();
  });

  it("prepares the share image after import and reuses it for clipboard copy", async () => {
    const user = userEvent.setup();
    const importer = vi.fn().mockResolvedValue({
      status: "success",
      draft: {
        sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
        authorName: "SpaceX",
        handle: "SpaceX",
        body: "Clipboard ready.",
        bodyHtml: "",
        timestampLabel: "April 23, 2026",
        avatarUrl: "",
        mediaUrl: "",
        mediaUrls: [],
        verified: true,
        themeVariant: "orbital",
        quotedTweet: null,
        replyCount: null,
        repostCount: null,
        likeCount: null,
        bookmarkCount: null,
      },
    });
    const exporter = vi.fn().mockResolvedValue({
      status: "success",
      dataUrl: "data:image/png;base64,Zm9v",
    });
    const clipboardWriter = vi.fn().mockResolvedValue(undefined);

    render(
      <App
        importer={importer}
        exporter={exporter}
        clipboardWriter={clipboardWriter}
        sponsorUnlockEnabled={false}
      />,
    );

    await user.type(
      screen.getByLabelText("Tweet link"),
      "https://x.com/SpaceX/status/1915324363727337943",
    );
    await user.click(screen.getByRole("button", { name: "Import tweet" }));

    await within(screen.getByLabelText("Tweet preview card")).findByText(
      "Clipboard ready.",
    );

    await waitFor(() => {
      expect(exporter).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));

    expect(exporter).toHaveBeenCalledTimes(1);
    expect(clipboardWriter).toHaveBeenCalledWith("data:image/png;base64,Zm9v");
  });

  it("copies the prepared PNG without refetching the data url", async () => {
    const user = userEvent.setup();
    const importer = vi.fn().mockResolvedValue({
      status: "success",
      draft: {
        sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
        authorName: "SpaceX",
        handle: "SpaceX",
        body: "Clipboard ready.",
        bodyHtml: "",
        timestampLabel: "April 23, 2026",
        avatarUrl: "",
        mediaUrl: "https://images.example.com/poster.jpg",
        mediaUrls: ["https://images.example.com/poster.jpg"],
        verified: true,
        themeVariant: "orbital",
        quotedTweet: null,
        replyCount: null,
        repostCount: null,
        likeCount: null,
        bookmarkCount: null,
      },
    });
    const exporter = vi.fn().mockResolvedValue({
      status: "success",
      dataUrl: "data:image/png;base64,Zm9v",
    });
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("copy should not fetch the data url"));
    const originalClipboard = navigator.clipboard;
    const originalClipboardItem = globalThis.ClipboardItem;

    class ClipboardItemMock {
      constructor(readonly items: Record<string, Blob>) {}
    }

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: writeMock,
      },
    });
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: ClipboardItemMock,
    });

    try {
      render(
        <App
          importer={importer}
          exporter={exporter}
          sponsorUnlockEnabled={false}
        />,
      );

      await user.type(
        screen.getByLabelText("Tweet link"),
        "https://x.com/SpaceX/status/1915324363727337943",
      );
      await user.click(screen.getByRole("button", { name: "Import tweet" }));

      await waitFor(() => {
        expect(exporter).toHaveBeenCalledTimes(1);
      });

      await user.click(
        screen.getByRole("button", { name: "Copy to clipboard" }),
      );

      await waitFor(() => {
        expect(writeMock).toHaveBeenCalledTimes(1);
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(writeMock.mock.calls[0][0]).toHaveLength(1);
      expect(
        (writeMock.mock.calls[0][0][0] as ClipboardItemMock).items["image/png"],
      ).toBeInstanceOf(Blob);
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
      Object.defineProperty(globalThis, "ClipboardItem", {
        configurable: true,
        value: originalClipboardItem,
      });
    }
  });

  it("prepares the share image after import and reuses it for PNG export", async () => {
    const user = userEvent.setup();
    const importer = vi.fn().mockResolvedValue({
      status: "success",
      draft: {
        sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
        authorName: "SpaceX",
        handle: "SpaceX",
        body: "Export ready.",
        bodyHtml: "",
        timestampLabel: "April 23, 2026",
        avatarUrl: "",
        mediaUrl: "",
        mediaUrls: [],
        verified: true,
        themeVariant: "orbital",
        quotedTweet: null,
        replyCount: null,
        repostCount: null,
        likeCount: null,
        bookmarkCount: null,
      },
    });
    const exporter = vi.fn().mockResolvedValue({
      status: "success",
      dataUrl: "data:image/png;base64,Zm9v",
    });
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-object-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(
      <App
        importer={importer}
        exporter={exporter}
        sponsorUnlockEnabled={false}
      />,
    );

    await user.type(
      screen.getByLabelText("Tweet link"),
      "https://x.com/SpaceX/status/1915324363727337943",
    );
    await user.click(screen.getByRole("button", { name: "Import tweet" }));

    await within(screen.getByLabelText("Tweet preview card")).findByText(
      "Export ready.",
    );

    await waitFor(() => {
      expect(exporter).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Export PNG" }));

    expect(exporter).toHaveBeenCalledTimes(1);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
  });

  it("refreshes the prepared share image when the preview height changes", async () => {
    const resizeObserver = installResizeObserverMock();
    const user = userEvent.setup();
    const importer = vi.fn().mockResolvedValue({
      status: "success",
      draft: {
        sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
        authorName: "SpaceX",
        handle: "SpaceX",
        body: "Export ready.",
        bodyHtml: "",
        timestampLabel: "April 23, 2026",
        avatarUrl: "",
        mediaUrl: "",
        mediaUrls: [],
        verified: true,
        themeVariant: "orbital",
        quotedTweet: null,
        replyCount: null,
        repostCount: null,
        likeCount: null,
        bookmarkCount: null,
      },
    });
    const exporter = vi.fn(async (node: HTMLElement) => ({
      status: "success" as const,
      dataUrl:
        node.offsetHeight >= 1200
          ? "data:image/png;base64,c2Vjb25k"
          : "data:image/png;base64,Zmlyc3Q=",
    }));
    const clipboardWriter = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <App
        importer={importer}
        exporter={exporter}
        clipboardWriter={clipboardWriter}
        sponsorUnlockEnabled={false}
      />,
    );

    const capture = container.querySelector(".preview-stage__capture");

    if (!(capture instanceof HTMLDivElement)) {
      throw new Error("Expected preview capture node.");
    }

    let previewWidth = 540;
    let previewHeight = 900;

    Object.defineProperty(capture, "offsetWidth", {
      configurable: true,
      get: () => previewWidth,
    });
    Object.defineProperty(capture, "offsetHeight", {
      configurable: true,
      get: () => previewHeight,
    });
    capture.getBoundingClientRect = () => ({
      width: previewWidth,
      height: previewHeight,
      top: 0,
      left: 0,
      right: previewWidth,
      bottom: previewHeight,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    try {
      await user.type(
        screen.getByLabelText("Tweet link"),
        "https://x.com/SpaceX/status/1915324363727337943",
      );
      await user.click(screen.getByRole("button", { name: "Import tweet" }));

      await waitFor(() => {
        expect(exporter).toHaveBeenCalledTimes(1);
        expect(resizeObserver.isObserving(capture)).toBe(true);
      });

      previewHeight = 1200;
      resizeObserver.trigger(capture);

      await waitFor(() => {
        expect(exporter).toHaveBeenCalledTimes(2);
      });

      await user.click(
        screen.getByRole("button", { name: "Copy to clipboard" }),
      );

      expect(exporter).toHaveBeenCalledTimes(2);
      expect(clipboardWriter).toHaveBeenCalledWith(
        "data:image/png;base64,c2Vjb25k",
      );
    } finally {
      resizeObserver.restore();
    }
  });

  it("opens a sponsor tab before allowing clipboard copy", async () => {
    const user = userEvent.setup();
    const importer = vi.fn().mockResolvedValue({
      status: "success",
      draft: {
        sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
        authorName: "SpaceX",
        handle: "SpaceX",
        body: "Clipboard ready.",
        timestampLabel: "April 23, 2026",
        avatarUrl: "",
        mediaUrl: "",
        verified: true,
        themeVariant: "orbital",
      },
    });
    const exporter = vi.fn().mockResolvedValue({
      status: "success",
      dataUrl: "data:image/png;base64,Zm9v",
    });
    const clipboardWriter = vi.fn().mockResolvedValue(undefined);
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(
      <App
        importer={importer}
        exporter={exporter}
        clipboardWriter={clipboardWriter}
        sponsorUnlockEnabled
      />,
    );

    await user.type(
      screen.getByLabelText("Tweet link"),
      "https://x.com/SpaceX/status/1915324363727337943",
    );
    await user.click(screen.getByRole("button", { name: "Import tweet" }));

    await waitFor(() => {
      expect(exporter).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));

    expect(openSpy).toHaveBeenCalledWith(
      "https://plump-plastic.com/b.3qVK0vPn3rppveb/m/VDJEZvDP0/3cMZDjUJ1sOfTmEdz/LOTNchwhNwTzU-5/MZT/cp",
      "_blank",
      "noopener,noreferrer",
    );
    expect(exporter).toHaveBeenCalledTimes(1);
    expect(clipboardWriter).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sponsor link opened in a new tab. Return here and press Copy to clipboard again to continue.",
    );

    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));

    expect(exporter).toHaveBeenCalledTimes(1);
    expect(clipboardWriter).toHaveBeenCalledWith("data:image/png;base64,Zm9v");
  });

  it("opens a sponsor tab before allowing PNG export", async () => {
    const user = userEvent.setup();
    const importer = vi.fn().mockResolvedValue({
      status: "success",
      draft: {
        sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
        authorName: "SpaceX",
        handle: "SpaceX",
        body: "Export ready.",
        timestampLabel: "April 23, 2026",
        avatarUrl: "",
        mediaUrl: "",
        verified: true,
        themeVariant: "orbital",
      },
    });
    const exporter = vi.fn().mockResolvedValue({
      status: "success",
      dataUrl: "data:image/png;base64,Zm9v",
    });
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(
      <App importer={importer} exporter={exporter} sponsorUnlockEnabled />,
    );

    await user.type(
      screen.getByLabelText("Tweet link"),
      "https://x.com/SpaceX/status/1915324363727337943",
    );
    await user.click(screen.getByRole("button", { name: "Import tweet" }));

    await waitFor(() => {
      expect(exporter).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Export PNG" }));

    expect(openSpy).toHaveBeenCalledWith(
      "https://plump-plastic.com/b.3qVK0vPn3rppveb/m/VDJEZvDP0/3cMZDjUJ1sOfTmEdz/LOTNchwhNwTzU-5/MZT/cp",
      "_blank",
      "noopener,noreferrer",
    );
    expect(exporter).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sponsor link opened in a new tab. Return here and press Export PNG again to continue.",
    );

    await user.click(screen.getByRole("button", { name: "Export PNG" }));

    expect(exporter).toHaveBeenCalledTimes(1);
  });

  it("downloads the exported PNG via an object URL appended to the document", async () => {
    const user = userEvent.setup();
    const importer = vi.fn().mockResolvedValue({
      status: "success",
      draft: {
        sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
        authorName: "SpaceX",
        handle: "SpaceX",
        body: "Export ready.",
        timestampLabel: "April 23, 2026",
        avatarUrl: "",
        mediaUrl: "",
        verified: true,
        themeVariant: "orbital",
      },
    });
    const exporter = vi.fn().mockResolvedValue({
      status: "success",
      dataUrl: "data:image/png;base64,Zm9v",
    });
    vi.spyOn(window, "open").mockReturnValue(null);

    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-object-url");
    const revokeObjectUrlSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);

    const anchorClicks: Array<{
      href: string;
      download: string;
      wasConnected: boolean;
    }> = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function recordClick(
      this: HTMLAnchorElement,
    ) {
      anchorClicks.push({
        href: this.href,
        download: this.download,
        wasConnected: this.isConnected,
      });
    };

    try {
      render(
        <App importer={importer} exporter={exporter} sponsorUnlockEnabled />,
      );

      await user.type(
        screen.getByLabelText("Tweet link"),
        "https://x.com/SpaceX/status/1915324363727337943",
      );
      await user.click(screen.getByRole("button", { name: "Import tweet" }));
      await user.click(screen.getByRole("button", { name: "Export PNG" }));
      await user.click(screen.getByRole("button", { name: "Export PNG" }));

      expect(exporter).toHaveBeenCalledTimes(1);
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
      const blobArg = createObjectUrlSpy.mock.calls[0][0] as Blob;
      expect(blobArg).toBeInstanceOf(Blob);
      expect(blobArg.type).toBe("image/png");

      expect(anchorClicks).toHaveLength(1);
      expect(anchorClicks[0].href).toBe("blob:mock-object-url");
      expect(anchorClicks[0].download).toBe("tweet-1915324363727337943.png");
      // The anchor must be in the DOM at click time for mobile browsers.
      expect(anchorClicks[0].wasConnected).toBe(true);

      // Object URL gets revoked (asynchronously) after the click.
      await new Promise((resolve) => setTimeout(resolve, 4500));
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:mock-object-url");
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });

  it("auto dismisses toast messages after a few seconds", async () => {
    vi.useFakeTimers();
    const importer = vi.fn().mockResolvedValue({
      status: "success",
      draft: {
        sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
        authorName: "SpaceX",
        handle: "SpaceX",
        body: "Booster landing confirmed.",
        bodyHtml: "",
        timestampLabel: "April 23, 2026",
        avatarUrl: "",
        mediaUrl: "",
        mediaUrls: [],
        verified: true,
        themeVariant: "orbital",
        quotedTweet: null,
      },
    });

    render(<App importer={importer} />);

    fireEvent.change(screen.getByLabelText("Tweet link"), {
      target: {
        value: "https://x.com/SpaceX/status/1915324363727337943",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import tweet" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Import complete. Export when ready.",
    );

    act(() => {
      vi.advanceTimersByTime(4200);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("skips sponsor redirect when sponsor unlock is disabled", async () => {
    const user = userEvent.setup();
    const importer = vi.fn().mockResolvedValue({
      status: "success",
      draft: {
        sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
        authorName: "SpaceX",
        handle: "SpaceX",
        body: "Clipboard ready.",
        timestampLabel: "April 23, 2026",
        avatarUrl: "",
        mediaUrl: "",
        verified: true,
        themeVariant: "orbital",
      },
    });
    const exporter = vi.fn().mockResolvedValue({
      status: "success",
      dataUrl: "data:image/png;base64,Zm9v",
    });
    const clipboardWriter = vi.fn().mockResolvedValue(undefined);
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(
      <App
        importer={importer}
        exporter={exporter}
        clipboardWriter={clipboardWriter}
        sponsorUnlockEnabled={false}
      />,
    );

    await user.type(
      screen.getByLabelText("Tweet link"),
      "https://x.com/SpaceX/status/1915324363727337943",
    );
    await user.click(screen.getByRole("button", { name: "Import tweet" }));
    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));

    expect(openSpy).not.toHaveBeenCalled();
    expect(exporter).toHaveBeenCalledTimes(1);
    expect(clipboardWriter).toHaveBeenCalledWith("data:image/png;base64,Zm9v");
  });
});

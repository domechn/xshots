import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const DESKTOP_AD_MEDIA_QUERY = "(min-width: 1280px)";
const originalMatchMedia = window.matchMedia;

function mockViewportMode(mode: "desktop" | "mobile") {
  const matchesDesktop = mode === "desktop";

  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === DESKTOP_AD_MEDIA_QUERY ? matchesDesktop : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  vi.useRealTimers();
  delete window.adsbygoogle;
  delete window.__xshotsQueuedAdCount;
  window.matchMedia = originalMatchMedia;
});

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

  it("renders fixed side-rail ads outside the main content grid on desktop", () => {
    mockViewportMode("desktop");

    const { container } = render(<App />);

    const appGrid = container.querySelector<HTMLElement>(".app-grid");
    const adSlots = screen.getAllByLabelText("Advertisement");
    const footerAdSlot = container.querySelector<HTMLElement>(
      ".app-footer .ad-slot",
    );
    const inlineGridAd = appGrid?.querySelector<HTMLElement>(".ad-slot");
    const mobileFallbackAd = container.querySelector<HTMLElement>(
      ".ad-slot--mobile-fallback",
    );

    expect(adSlots).toHaveLength(2);
    expect(inlineGridAd).toBeNull();
    expect(footerAdSlot).not.toBeInTheDocument();
    expect(mobileFallbackAd).toBeNull();
    expect(adSlots[0]).toHaveClass("ad-slot--side-rail");
    expect(adSlots[0]).toHaveClass("ad-slot--side-rail-left");
    expect(adSlots[1]).toHaveClass("ad-slot--side-rail");
    expect(adSlots[1]).toHaveClass("ad-slot--side-rail-right");
    expect(adSlots[0].querySelector(".adsbygoogle")).toHaveAttribute(
      "data-full-width-responsive",
      "true",
    );
    expect(adSlots[1].querySelector(".adsbygoogle")).toHaveAttribute(
      "data-full-width-responsive",
      "true",
    );
  });

  it("renders a mobile fallback ad between the content and footer on small screens", () => {
    mockViewportMode("mobile");

    const { container } = render(<App />);

    const shellInner =
      container.querySelector<HTMLElement>(".app-shell__inner");
    const appGrid = container.querySelector<HTMLElement>(".app-grid");
    const footer = container.querySelector<HTMLElement>(".app-footer");
    const adSlots = screen.getAllByLabelText("Advertisement");
    const shellChildren = Array.from(shellInner?.children ?? []);

    expect(adSlots).toHaveLength(1);
    expect(adSlots[0]).toHaveClass("ad-slot--mobile-fallback");
    expect(adSlots[0]).not.toHaveClass("ad-slot--side-rail");
    expect(shellInner).toContainElement(adSlots[0]);
    expect(shellChildren.indexOf(appGrid!)).toBeLessThan(
      shellChildren.indexOf(adSlots[0]),
    );
    expect(shellChildren.indexOf(adSlots[0])).toBeLessThan(
      shellChildren.indexOf(footer!),
    );
  });

  it("queues AdSense for both desktop side rails", () => {
    mockViewportMode("desktop");

    const adQueue: Array<Record<string, never>> = [];
    window.adsbygoogle = adQueue;

    render(<App />);

    expect(adQueue).toEqual([{}, {}]);
  });

  it("queues AdSense for the mobile fallback slot", () => {
    mockViewportMode("mobile");

    const adQueue: Array<Record<string, never>> = [];
    window.adsbygoogle = adQueue;

    render(<App />);

    expect(adQueue).toEqual([{}]);
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

  it("copies the rendered png to the clipboard", async () => {
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

    render(
      <App
        importer={importer}
        exporter={exporter}
        clipboardWriter={clipboardWriter}
      />,
    );

    await user.type(
      screen.getByLabelText("Tweet link"),
      "https://x.com/SpaceX/status/1915324363727337943",
    );
    await user.click(screen.getByRole("button", { name: "Import tweet" }));
    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));

    expect(exporter).toHaveBeenCalled();
    expect(clipboardWriter).toHaveBeenCalledWith("data:image/png;base64,Zm9v");
    expect(screen.getByText(/copied to the clipboard/i)).toBeInTheDocument();
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
});

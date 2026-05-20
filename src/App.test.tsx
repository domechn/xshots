import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

  it("renders sponsor disclosure without inline advertisement slots", () => {
    render(<App />);

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
    const exporter = vi.fn().mockResolvedValue({
      status: "success",
      dataUrl: "data:image/png;base64,Zm9v",
    });

    render(<App importer={importer} exporter={exporter} />);

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
    expect(exporter).toHaveBeenCalledTimes(1);
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
    const exporter = vi.fn().mockResolvedValue({
      status: "success",
      dataUrl: "data:image/png;base64,Zm9v",
    });
    const { container } = render(<App importer={importer} exporter={exporter} />);

    await user.type(
      screen.getByLabelText("Tweet link"),
      "https://x.com/SpaceX/status/1915324363727337943",
    );
    await user.click(screen.getByRole("button", { name: "Import tweet" }));

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent(
      "Import complete. Copy or export when ready.",
    );
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
      />,
    );

    await user.type(
      screen.getByLabelText("Tweet link"),
      "https://x.com/SpaceX/status/1915324363727337943",
    );
    await user.click(screen.getByRole("button", { name: "Import tweet" }));
    expect(exporter).toHaveBeenCalledTimes(1);

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

    render(<App importer={importer} exporter={exporter} />);

    await user.type(
      screen.getByLabelText("Tweet link"),
      "https://x.com/SpaceX/status/1915324363727337943",
    );
    await user.click(screen.getByRole("button", { name: "Import tweet" }));
    expect(exporter).toHaveBeenCalledTimes(1);

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
    HTMLAnchorElement.prototype.click = function recordClick(this: HTMLAnchorElement) {
      anchorClicks.push({
        href: this.href,
        download: this.download,
        wasConnected: this.isConnected,
      });
    };

    try {
      render(<App importer={importer} exporter={exporter} />);

      await user.type(
        screen.getByLabelText("Tweet link"),
        "https://x.com/SpaceX/status/1915324363727337943",
      );
      await user.click(screen.getByRole("button", { name: "Import tweet" }));
      expect(exporter).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: "Export PNG" }));
      await user.click(screen.getByRole("button", { name: "Export PNG" }));

      expect(exporter).toHaveBeenCalledTimes(1);
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
      const blobArg = createObjectUrlSpy.mock.calls[0][0] as Blob;
      expect(blobArg).toBeInstanceOf(Blob);
      expect(blobArg.type).toBe("image/png");

      expect(anchorClicks).toHaveLength(1);
      expect(anchorClicks[0].href).toBe("blob:mock-object-url");
      expect(anchorClicks[0].download).toBe(
        "tweet-1915324363727337943.png",
      );
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
    const exporter = vi.fn().mockResolvedValue({
      status: "success",
      dataUrl: "data:image/png;base64,Zm9v",
    });

    render(<App importer={importer} exporter={exporter} />);

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
      "Import complete. Copy or export when ready.",
    );

    act(() => {
      vi.advanceTimersByTime(4200);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

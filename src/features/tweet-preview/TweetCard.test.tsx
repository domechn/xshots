import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../../app.css";
import { exportTweetCardToPng } from "../export/exportPng";
import { createEmptyDraft } from "../tweet-import/types";
import { TweetCard } from "./TweetCard";

describe("TweetCard", () => {
  it("renders author, handle, text, and timestamp", () => {
    render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "SpaceX",
          handle: "SpaceX",
          body: "Starship reached stage separation.",
          timestampLabel: "April 23, 2026",
          sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
          verified: true,
        })}
      />,
    );

    expect(screen.getByText("SpaceX")).toBeInTheDocument();
    expect(screen.getByText("@SpaceX")).toBeInTheDocument();
    expect(
      screen.getByText("Starship reached stage separation."),
    ).toBeInTheDocument();
    expect(screen.getByText("April 23, 2026")).toBeInTheDocument();
    expect(screen.getByText("xshots.domc.me")).toBeInTheDocument();
    expect(screen.getByText("Made with")).toBeInTheDocument();
    expect(screen.getByLabelText("Verified account")).toBeInTheDocument();
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    expect(screen.queryByText("Orbital")).not.toBeInTheDocument();
    expect(screen.queryByText("Source attached")).not.toBeInTheDocument();
  });

  it("keeps the footer attribution accessible when the visible label is compacted", () => {
    const { container } = render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "SpaceX",
          handle: "SpaceX",
          body: "Footer sizing check.",
          timestampLabel: "April 23, 2026",
        })}
      />,
    );

    expect(screen.getByLabelText("Made with xshots.domc.me")).toHaveClass(
      "tweet-card__credit",
    );
    expect(
      container.querySelector(".tweet-card__credit-label"),
    ).toHaveAttribute("aria-hidden", "true");
  });

  it("renders an uploaded media image when present", () => {
    render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "NASA",
          handle: "NASA",
          body: "Crew mission update.",
          mediaUrl: "data:image/png;base64,xyz",
        })}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Tweet media preview" }),
    ).toHaveAttribute("src", "data:image/png;base64,xyz");
  });

  it("uses initials when the main or quoted avatar fails", () => {
    const { container } = render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "SpaceX",
          avatarUrl: "https://pbs.twimg.com/profile_images/main.jpg",
          quotedTweet: {
            sourceUrl: "",
            authorName: "NASA",
            handle: "NASA",
            body: "Launch update",
            bodyHtml: "",
            timestampLabel: "",
            avatarUrl: "https://pbs.twimg.com/profile_images/quote.jpg",
            mediaUrl: "",
            mediaUrls: [],
            verified: false,
          },
        })}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "SpaceX avatar" }));
    fireEvent.error(screen.getByRole("img", { name: "NASA avatar" }));

    expect(screen.queryByRole("img", { name: "SpaceX avatar" })).toBeNull();
    expect(screen.queryByRole("img", { name: "NASA avatar" })).toBeNull();
    expect(
      container.querySelector(".tweet-card__avatar--fallback"),
    ).toHaveTextContent("S");
    expect(
      container.querySelector(".tweet-card__quote-avatar--fallback"),
    ).toHaveTextContent("N");
  });

  it("requests remote avatars and media without a referrer and with CORS", () => {
    render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "SpaceX",
          avatarUrl: "https://pbs.twimg.com/profile_images/main.jpg",
          mediaUrl: "https://pbs.twimg.com/media/main.jpg",
          quotedTweet: {
            sourceUrl: "",
            authorName: "NASA",
            handle: "NASA",
            body: "Launch update",
            bodyHtml: "",
            timestampLabel: "",
            avatarUrl: "https://pbs.twimg.com/profile_images/quote.jpg",
            mediaUrl: "https://pbs.twimg.com/media/quote.jpg",
            mediaUrls: [],
            verified: false,
          },
        })}
      />,
    );

    for (const image of screen.getAllByRole("img")) {
      expect(image).toHaveAttribute("crossorigin", "anonymous");
      expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    }
  });

  it("exports initials when an avatar is the only image and it failed", async () => {
    const draft = createEmptyDraft({
      authorName: "SpaceX",
      avatarUrl: "https://pbs.twimg.com/profile_images/main.jpg",
    });
    const { container } = render(<TweetCard draft={draft} />);
    fireEvent.error(screen.getByRole("img", { name: "SpaceX avatar" }));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const blob = new Blob(["png"], { type: "image/png" });

    try {
      const result = await exportTweetCardToPng(
        container.querySelector(".tweet-card") as HTMLElement,
        {
          draft,
          toBlob: async (node) => {
            expect(
              node.querySelector(".tweet-card__avatar--fallback"),
            ).toHaveTextContent("S");
            expect(node.querySelector("img")).toBeNull();
            return blob;
          },
        },
      );

      expect(result).toEqual({ status: "success", blob });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("exports initials when all avatar fetch attempts fail", async () => {
    const draft = createEmptyDraft({
      authorName: "SpaceX",
      avatarUrl: "https://pbs.twimg.com/profile_images/main.jpg",
    });
    const { container } = render(<TweetCard draft={draft} />);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Image unavailable"));
    const blob = new Blob(["png"], { type: "image/png" });

    try {
      const result = await exportTweetCardToPng(container, {
        draft,
        toBlob: async (node) => {
          expect(
            node.querySelector(".tweet-card__avatar--fallback"),
          ).toHaveTextContent("S");
          expect(node.querySelector("img")).toBeNull();
          return blob;
        },
      });

      expect(result).toEqual({ status: "success", blob });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(screen.queryByRole("img", { name: "SpaceX avatar" })).toBeNull();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("replaces both avatars when they share an unavailable image URL", async () => {
    const avatarUrl = "https://pbs.twimg.com/profile_images/shared.jpg";
    const draft = createEmptyDraft({
      authorName: "SpaceX",
      avatarUrl,
      quotedTweet: {
        sourceUrl: "",
        authorName: "NASA",
        handle: "NASA",
        body: "Launch update",
        bodyHtml: "",
        timestampLabel: "",
        avatarUrl,
        mediaUrl: "",
        mediaUrls: [],
        verified: false,
      },
    });
    const { container } = render(<TweetCard draft={draft} />);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Image unavailable"));

    try {
      const result = await exportTweetCardToPng(container, {
        draft,
        toBlob: async (node) => {
          expect(node.querySelectorAll("img")).toHaveLength(0);
          expect(
            node.querySelector(".tweet-card__avatar--fallback"),
          ).toHaveTextContent("S");
          expect(
            node.querySelector(".tweet-card__quote-avatar--fallback"),
          ).toHaveTextContent("N");
          return new Blob(["png"], { type: "image/png" });
        },
      });

      expect(result.status).toBe("success");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("renders every imported media image when multiple photos are present", () => {
    const draft = {
      ...createEmptyDraft({
        authorName: "NASA",
        handle: "NASA",
        body: "Photo set update.",
      }),
      mediaUrls: ["data:image/png;base64,aaa", "data:image/png;base64,bbb"],
    };

    render(<TweetCard draft={draft} />);

    const images = screen.getAllByRole("img", { name: "Tweet media preview" });
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", "data:image/png;base64,aaa");
    expect(images[1]).toHaveAttribute("src", "data:image/png;base64,bbb");
  });

  it("uses an x-style three-image layout for the main tweet", () => {
    const { container } = render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "NASA",
          handle: "NASA",
          body: "Three image update.",
          mediaUrls: [
            "data:image/png;base64,aaa",
            "data:image/png;base64,bbb",
            "data:image/png;base64,ccc",
          ],
        })}
      />,
    );

    expect(
      container.querySelector(".tweet-card__media-grid--three"),
    ).not.toBeNull();
    expect(
      container.querySelector(".tweet-card__media-shell--hero"),
    ).not.toBeNull();
  });

  it("renders preserved emphasis markup when bodyHtml is present", () => {
    const { container } = render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "SpaceX",
          handle: "SpaceX",
          body: "Flight update:\nGO for launch",
          bodyHtml: "Flight update:<br><strong>GO for launch</strong>",
          sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
        })}
      />,
    );

    expect(screen.getByText("GO for launch").tagName).toBe("STRONG");
    expect(container.querySelector(".tweet-card__text")?.innerHTML).toContain(
      "<br>",
    );
  });

  it("renders and exports the full article text without an HTML injection or main body clamp", async () => {
    const ending = "Final article paragraph after the long body.";
    const draft = createEmptyDraft({
      body: `Article\n\n${"A".repeat(500)}\n\n${ending}`,
      bodyHtml: `<strong>Article</strong><br><br><em>${"A".repeat(500)}</em><br><br>${ending}<img src=x onerror=alert(1)>`,
    });
    const { container } = render(<TweetCard draft={draft} />);
    const card = container.querySelector(".tweet-card") as HTMLElement;
    const text = container.querySelector(".tweet-card__text") as HTMLElement;

    expect(text.textContent).toContain(ending);
    expect(text.querySelector("em")?.textContent).toHaveLength(500);
    expect(text.querySelector("img")).toBeNull();
    expect(text.className).toBe("tweet-card__text");
    expect(window.getComputedStyle(text).whiteSpace).toBe("pre-wrap");

    const blob = new Blob(["png"], { type: "image/png" });
    const result = await exportTweetCardToPng(card, {
      draft,
      toBlob: async (node) => {
        expect(node.querySelector(".tweet-card__text")?.textContent).toContain(ending);
        return blob;
      },
    });
    expect(result).toEqual({ status: "success", blob });
  });

  it("renders reply, repost, like, and bookmark actions in x order", () => {
    const { container } = render(
      <TweetCard
        draft={{
          ...createEmptyDraft({
            authorName: "SpaceX",
            handle: "SpaceX",
            body: "Engagement snapshot.",
          }),
          replyCount: 128,
          repostCount: 7420,
          likeCount: 89000,
          bookmarkCount: 29,
        }}
      />,
    );

    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("7.4K")).toBeInTheDocument();
    expect(screen.getByText("89K")).toBeInTheDocument();
    expect(screen.getByText("29")).toBeInTheDocument();
    expect(screen.getByLabelText("Replies 128")).toBeInTheDocument();
    expect(screen.getByLabelText("Reposts 7.4K")).toBeInTheDocument();
    expect(screen.getByLabelText("Likes 89K")).toBeInTheDocument();
    expect(screen.getByLabelText("Bookmarks 29")).toBeInTheDocument();
    expect(
      Array.from(
        container.querySelectorAll(".tweet-card__engagement-item"),
      ).map((item) => item.getAttribute("aria-label")),
    ).toEqual(["Replies 128", "Reposts 7.4K", "Likes 89K", "Bookmarks 29"]);
    expect(
      container.querySelectorAll(".tweet-card__engagement-item"),
    ).toHaveLength(4);
  });

  it("styles mentions and hashtags in tweet text with x blue", () => {
    const { container } = render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "SpaceX",
          handle: "SpaceX",
          body: "Checking in with @NASA about #Starship today.",
        })}
      />,
    );

    const accents = container.querySelectorAll(".tweet-card__accent");

    expect(accents).toHaveLength(2);
    expect(accents[0]).toHaveTextContent("@NASA");
    expect(accents[1]).toHaveTextContent("#Starship");
  });

  it("accents unicode hashtags but not emails or mid-word symbols", () => {
    const { container } = render(
      <TweetCard
        draft={createEmptyDraft({
          body: "Mail ops@spacex.com about #火星 and #Café, not issue#42.",
        })}
      />,
    );

    const accents = Array.from(
      container.querySelectorAll(".tweet-card__accent"),
    ).map((accent) => accent.textContent);

    expect(accents).toEqual(["#火星", "#Café"]);
  });

  it("styles mentions and hashtags in preserved bodyHtml with x blue", () => {
    const { container } = render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "SpaceX",
          handle: "SpaceX",
          body: "Flight update:\n@NASA says #Starship is go",
          bodyHtml:
            "Flight update:<br><strong>@NASA</strong> says <em>#Starship</em> is go",
        })}
      />,
    );

    const accents = container.querySelectorAll(".tweet-card__accent");

    expect(accents).toHaveLength(2);
    expect(accents[0]).toHaveTextContent("@NASA");
    expect(accents[0].tagName).toBe("SPAN");
    expect(accents[0].parentElement?.tagName).toBe("STRONG");
    expect(accents[1]).toHaveTextContent("#Starship");
    expect(accents[1].parentElement?.tagName).toBe("EM");
  });

  it("renders a quoted tweet block when quoted content is present", () => {
    const { container } = render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "SpaceX",
          handle: "SpaceX",
          body: "Main launch update.",
          quotedTweet: {
            sourceUrl: "",
            authorName: "NASA",
            handle: "NASA",
            body: "Quoted mission note.",
            bodyHtml: "",
            timestampLabel: "April 22, 2026",
            avatarUrl: "",
            mediaUrl: "data:image/png;base64,quote-1",
            mediaUrls: [
              "data:image/png;base64,quote-1",
              "data:image/png;base64,quote-2",
            ],
            verified: true,
          },
        })}
      />,
    );

    expect(screen.getByLabelText("Quoted tweet preview")).toBeInTheDocument();
    expect(screen.getByText("NASA")).toBeInTheDocument();
    expect(screen.getByText("@NASA")).toBeInTheDocument();
    expect(screen.getByText("Quoted mission note.")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Quoted verified account"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("img", { name: "Quoted tweet media preview" }),
    ).toHaveLength(2);
    expect(
      container.querySelector(".tweet-card__media-grid--two"),
    ).not.toBeNull();
  });

  it("preserves the intrinsic aspect ratio for a single quoted image", () => {
    render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "SpaceX",
          handle: "SpaceX",
          body: "Main launch update.",
          quotedTweet: {
            sourceUrl: "",
            authorName: "NASA",
            handle: "NASA",
            body: "Quoted mission note.",
            bodyHtml: "",
            timestampLabel: "April 22, 2026",
            avatarUrl: "",
            mediaUrl: "data:image/png;base64,quote-single",
            mediaUrls: ["data:image/png;base64,quote-single"],
            verified: true,
          },
        })}
      />,
    );

    const image = screen.getByRole("img", {
      name: "Quoted tweet media preview",
    });

    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 1080,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 1350,
    });

    fireEvent.load(image);

    expect(image.closest(".tweet-card__media-shell")).toHaveStyle({
      aspectRatio: "0.8",
      minHeight: "0",
    });
  });

  it("uses a clamped quoted body while keeping quoted media visible", () => {
    const { container } = render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "SpaceX",
          handle: "SpaceX",
          body: "Main launch update.",
          quotedTweet: {
            sourceUrl: "",
            authorName: "NASA",
            handle: "NASA",
            body: "Line 1 Line 2 Line 3 Line 4 Line 5 Line 6 Line 7 Line 8",
            bodyHtml: "",
            timestampLabel: "April 22, 2026",
            avatarUrl: "",
            mediaUrl: "data:image/png;base64,quote-single",
            mediaUrls: ["data:image/png;base64,quote-single"],
            verified: true,
          },
        })}
      />,
    );

    expect(container.querySelector(".tweet-card__quote")).toHaveClass(
      "tweet-card__quote--media",
    );
    expect(container.querySelector(".tweet-card__quote-text")).toHaveClass(
      "tweet-card__quote-text--clamped",
    );
    expect(
      screen.getByRole("img", { name: "Quoted tweet media preview" }),
    ).toBeInTheDocument();
  });

  it("preserves quoted text line breaks while clamped to five lines", () => {
    const { container } = render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "SpaceX",
          handle: "SpaceX",
          body: "Main launch update.",
          quotedTweet: {
            sourceUrl: "",
            authorName: "NASA",
            handle: "NASA",
            body: "First line\nSecond line\nThird line\nFourth line",
            bodyHtml: "",
            timestampLabel: "April 22, 2026",
            avatarUrl: "",
            mediaUrl: "data:image/png;base64,quote-single",
            mediaUrls: ["data:image/png;base64,quote-single"],
            verified: true,
          },
        })}
      />,
    );

    const quoteText = container.querySelector(".tweet-card__quote-text");
    const clampRule = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .find(
        (rule): rule is CSSStyleRule =>
          rule instanceof CSSStyleRule &&
          rule.selectorText === ".tweet-card__quote-text--clamped",
      );

    expect(quoteText).not.toBeNull();
    expect(window.getComputedStyle(quoteText as Element).whiteSpace).toBe(
      "pre-line",
    );
    expect(clampRule?.style.getPropertyValue("-webkit-line-clamp")).toBe("5");
  });

  it("uses a 16px main body scale and a 13px quoted body scale", () => {
    const { container } = render(
      <TweetCard
        draft={createEmptyDraft({
          authorName: "SpaceX",
          handle: "SpaceX",
          body: "Main launch update.",
          quotedTweet: {
            sourceUrl: "",
            authorName: "NASA",
            handle: "NASA",
            body: "Quoted mission note.",
            bodyHtml: "",
            timestampLabel: "April 22, 2026",
            avatarUrl: "",
            mediaUrl: "",
            mediaUrls: [],
            verified: true,
          },
        })}
      />,
    );

    const mainText = container.querySelector(".tweet-card__text");
    const quoteText = container.querySelector(".tweet-card__quote-text");

    expect(mainText).not.toBeNull();
    expect(quoteText).not.toBeNull();
    expect(window.getComputedStyle(mainText as Element).fontSize).toBe("16px");
    expect(window.getComputedStyle(quoteText as Element).fontSize).toBe("13px");
    expect(window.getComputedStyle(mainText as Element).letterSpacing).toBe(
      "0.4px",
    );
    expect(window.getComputedStyle(quoteText as Element).letterSpacing).toBe(
      "0.325px",
    );
  });
});

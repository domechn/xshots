import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});

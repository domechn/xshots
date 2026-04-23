import { describe, expect, it } from "vitest";
import { importTweetFromUrl } from "./importTweet";

describe("importTweetFromUrl", () => {
  it("maps avatar, media, and verification from a richer tweet payload", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            status: {
              text: "Starship reached orbit.",
              created_at: "April 23, 2026",
              author: {
                name: "SpaceX",
                screen_name: "SpaceX",
                avatar_url: "https://images.example.com/spacex-avatar.jpg",
                verification: {
                  verified: true,
                },
              },
              media: {
                photos: [
                  {
                    type: "photo",
                    url: "https://images.example.com/starship-launch.jpg",
                    width: 1600,
                    height: 900,
                  },
                ],
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft).toMatchObject({
      authorName: "SpaceX",
      handle: "SpaceX",
      body: "Starship reached orbit.",
      timestampLabel: "April 23, 2026",
      avatarUrl: "https://images.example.com/spacex-avatar.jpg",
      mediaUrl: "https://images.example.com/starship-launch.jpg",
      verified: true,
      sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
    });
  });

  it("upgrades insecure twitter asset urls from the richer payload", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            status: {
              text: "Starship reached orbit.",
              created_at: "April 23, 2026",
              author: {
                name: "SpaceX",
                screen_name: "SpaceX",
                avatar_url: "http://pbs.twimg.com/profile_images/spacex.jpg",
              },
              media: {
                photos: [
                  {
                    url: "http://pbs.twimg.com/media/starship-launch.jpg",
                  },
                ],
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.avatarUrl).toBe(
      "https://pbs.twimg.com/profile_images/spacex.jpg",
    );
    expect(result.draft.mediaUrl).toBe(
      "https://pbs.twimg.com/media/starship-launch.jpg",
    );
    expect(result.draft.mediaUrls).toEqual([
      "https://pbs.twimg.com/media/starship-launch.jpg",
    ]);
  });

  it("keeps all photo media urls from a richer tweet payload", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            status: {
              text: "Mission photo set.",
              created_at: "April 23, 2026",
              author: {
                name: "SpaceX",
                screen_name: "SpaceX",
              },
              media: {
                photos: [
                  {
                    url: "https://images.example.com/photo-1.jpg",
                  },
                  {
                    url: "https://images.example.com/photo-2.jpg",
                  },
                ],
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect((result.draft as { mediaUrls?: string[] }).mediaUrls).toEqual([
      "https://images.example.com/photo-1.jpg",
      "https://images.example.com/photo-2.jpg",
    ]);
    expect(result.draft.mediaUrl).toBe(
      "https://images.example.com/photo-1.jpg",
    );
  });

  it("deduplicates repeated media urls from the richer payload", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            status: {
              text: "Mission photo set.",
              created_at: "April 23, 2026",
              author: {
                name: "SpaceX",
                screen_name: "SpaceX",
              },
              media: {
                photos: [
                  {
                    url: "https://images.example.com/photo-1.jpg",
                  },
                ],
                all: [
                  {
                    type: "photo",
                    url: "https://images.example.com/photo-1.jpg",
                  },
                  {
                    type: "photo",
                    url: "https://images.example.com/photo-2.jpg",
                  },
                ],
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.mediaUrls).toEqual([
      "https://images.example.com/photo-1.jpg",
      "https://images.example.com/photo-2.jpg",
    ]);
  });

  it("maps a single quoted tweet from the richer payload and ignores deeper nesting", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            status: {
              text: "Main launch update.",
              created_at: "April 23, 2026",
              author: {
                name: "SpaceX",
                screen_name: "SpaceX",
              },
              quote: {
                text: "Quoted mission note.",
                created_at: "April 22, 2026",
                author: {
                  name: "NASA",
                  screen_name: "NASA",
                  avatar_url: "https://images.example.com/nasa-avatar.jpg",
                  verification: {
                    verified: true,
                  },
                },
                media: {
                  photos: [
                    {
                      url: "https://images.example.com/quote-photo.jpg",
                    },
                  ],
                },
                quote: {
                  text: "Nested quote that should be ignored.",
                  author: {
                    name: "ESA",
                    screen_name: "ESA",
                  },
                },
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.quotedTweet).toEqual({
      sourceUrl: "",
      authorName: "NASA",
      handle: "NASA",
      body: "Quoted mission note.",
      bodyHtml: "",
      timestampLabel: "April 22, 2026",
      avatarUrl: "https://images.example.com/nasa-avatar.jpg",
      mediaUrl: "https://images.example.com/quote-photo.jpg",
      mediaUrls: ["https://images.example.com/quote-photo.jpg"],
      verified: true,
    });
  });

  it("maps a successful oEmbed payload into a tweet draft", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            author_name: "SpaceX",
            author_url: "https://x.com/SpaceX",
            html: '<blockquote><p>Starship reached stage separation.</p><a href="https://x.com/SpaceX/status/1915324363727337943">April 23, 2026</a></blockquote>',
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft).toMatchObject({
      authorName: "SpaceX",
      handle: "SpaceX",
      body: "Starship reached stage separation.",
      timestampLabel: "April 23, 2026",
      sourceUrl: "https://x.com/SpaceX/status/1915324363727337943",
    });
  });

  it("preserves line breaks from richer tweet text", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            status: {
              raw_text: {
                text: "First stage complete.\n\nSecond stage ignition confirmed.",
              },
              created_at: "April 23, 2026",
              author: {
                name: "SpaceX",
                screen_name: "SpaceX",
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.body).toBe(
      "First stage complete.\n\nSecond stage ignition confirmed.",
    );
  });

  it("preserves simple formatting from oEmbed html", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            author_name: "SpaceX",
            author_url: "https://x.com/SpaceX",
            html: '<blockquote><p>Flight update:<br><strong>GO for launch</strong></p><a href="https://x.com/SpaceX/status/1915324363727337943">April 23, 2026</a></blockquote>',
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.body).toBe("Flight update:\nGO for launch");
    expect(result.draft.bodyHtml).toBe(
      "Flight update:<br><strong>GO for launch</strong>",
    );
  });

  it("preserves inline span emphasis styles from oEmbed html", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            author_name: "SpaceX",
            author_url: "https://x.com/SpaceX",
            html: '<blockquote><p>Flight update:<br><span style="font-weight: 700">GO for launch</span> and <span style="font-style: italic">hold if needed</span></p><a href="https://x.com/SpaceX/status/1915324363727337943">April 23, 2026</a></blockquote>',
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.body).toBe(
      "Flight update:\nGO for launch and hold if needed",
    );
    expect(result.draft.bodyHtml).toBe(
      "Flight update:<br><strong>GO for launch</strong> and <em>hold if needed</em>",
    );
  });

  it("returns manual fallback when the network request fails", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => {
          throw new Error("network down");
        },
      },
    );

    expect(result.status).toBe("manual");
    if (result.status !== "manual") {
      throw new Error("Expected a manual fallback result.");
    }
    expect(result.reason).toContain("automatic import");
    expect(result.draft.sourceUrl).toBe(
      "https://x.com/SpaceX/status/1915324363727337943",
    );
  });

  it("returns manual fallback when the payload has no extractable body", async () => {
    const result = await importTweetFromUrl(
      "https://twitter.com/nasa/status/1234567890123456789",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            author_name: "NASA",
            author_url: "https://x.com/NASA",
            html: "<blockquote><div>No text paragraph here</div></blockquote>",
          }),
        }),
      },
    );

    expect(result.status).toBe("manual");
    if (result.status !== "manual") {
      throw new Error("Expected a manual fallback result.");
    }
    expect(result.reason).toContain("could not read the tweet text");
    expect(result.draft.handle).toBe("nasa");
  });
});

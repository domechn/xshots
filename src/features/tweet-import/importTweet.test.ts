import { describe, expect, it } from "vitest";
import { importTweetFromUrl } from "./importTweet";

describe("importTweetFromUrl", () => {
  it("imports an article title, preview, and normalized cover instead of its links", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/binancezh/status/2117448637127233906",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            status: {
              text: "https://x.com/i/article/2117447529424203776",
              raw_text: { text: "https://t.co/article123" },
              media: {},
              article: {
                title: "Article headline",
                preview_text: "A short summary of the article.",
                cover_media: {
                  media_info: {
                    original_img_url: "http://pbs.twimg.com/media/cover.jpg",
                  },
                },
                content: { blocks: [] },
                media_entities: [],
              },
              author: { name: "Binance", screen_name: "binancezh" },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.body).toBe(
      "Article headline\n\nA short summary of the article.",
    );
    expect(result.draft.mediaUrl).toBe(
      "https://pbs.twimg.com/media/cover.jpg",
    );
    expect(result.draft.mediaUrls).toEqual([
      "https://pbs.twimg.com/media/cover.jpg",
    ]);
  });

  it("imports article text when cover media is missing", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/binancezh/status/2117448637127233906",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            status: {
              text: "https://x.com/i/article/2117447529424203776",
              raw_text: { text: "https://t.co/article123" },
              media: {},
              article: {
                title: "Article headline",
                preview_text: "A short summary.",
                content: { blocks: [] },
                media_entities: [],
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.body).toBe("Article headline\n\nA short summary.");
    expect(result.draft.mediaUrl).toBe("");
    expect(result.draft.mediaUrls).toEqual([]);
  });

  it("keeps the full preview when article blocks are unavailable", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/binancezh/status/2117448637127233906",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            status: {
              text: "My take: read this https://x.com/i/article/2117447529424203776",
              raw_text: { text: "My take: read this https://t.co/article123" },
              media: {},
              article: {
                title: "Article headline",
                preview_text: "A".repeat(400),
                content: { blocks: [] },
                media_entities: [],
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.body).toBe(
      `Article headline\n\n${"A".repeat(400)}\n\nMy take: read this`,
    );
  });

  it("imports every article block with UTF-16 emphasis and inline media", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/binancezh/status/2117448637127233906",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            status: {
              text: "https://x.com/i/article/2117447529424203776",
              article: {
                title: "Title <safe>",
                preview_text: "Old preview",
                cover_media: {
                  media_info: { original_img_url: "https://img.test/cover.jpg" },
                },
                media_entities: [
                  {
                    media_id: "one",
                    media_info: { original_img_url: "https://img.test/one.jpg" },
                  },
                  {
                    media_id: "two",
                    media_info: { original_img_url: "https://img.test/two.jpg" },
                  },
                ],
                content: {
                  blocks: [
                    {
                      type: "unstyled",
                      text: "🚀Bold & <real> end",
                      inlineStyleRanges: [
                        { style: "Bold", offset: 2, length: 13 },
                        { style: "Italic", offset: 9, length: 6 },
                      ],
                    },
                    { type: "header-two", text: "Section" },
                    { type: "unordered-list-item", text: "First" },
                    { type: "unordered-list-item", text: "Second" },
                    { type: "ordered-list-item", text: "Numbered" },
                    { type: "blockquote", text: "Quoted\nline" },
                    { type: "atomic", text: "", entityRanges: [{ key: 7, offset: 0, length: 1 }] },
                    { type: "atomic", text: "", entityRanges: [{ key: 8, offset: 0, length: 1 }] },
                    { type: "unstyled", text: "Final paragraph." },
                  ],
                  entityMap: [
                    { key: 7, value: { type: "MEDIA", data: { mediaItems: [{ mediaId: "one" }] } } },
                    { key: 8, value: { type: "MEDIA", data: { mediaItems: [{ mediaId: "two" }] } } },
                  ],
                },
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.body).toBe(
      "Title <safe>\n\n🚀Bold & <real> end\n\nSection\n\n• First\n• Second\n\n1. Numbered\n\nQuoted\nline\n\nFinal paragraph.",
    );
    expect(result.draft.bodyHtml).toBe(
      "<strong>Title &lt;safe&gt;</strong><br><br>🚀<strong>Bold &amp; <em>&lt;real&gt;</em></strong> end<br><br><strong>Section</strong><br><br>• First<br>• Second<br><br>1. Numbered<br><br>Quoted<br>line<br><br>Final paragraph.",
    );
    expect(result.draft.mediaUrls).toEqual([
      "https://img.test/cover.jpg",
      "https://img.test/one.jpg",
      "https://img.test/two.jpg",
    ]);
  });

  it("ignores incomplete article entities and limits images to four", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/binancezh/status/2117448637127233906",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            status: {
              article: {
                title: "Gallery",
                cover_media: { media_info: { original_img_url: "https://img.test/cover.jpg" } },
                media_entities: [1, 2, 3, 4].map((id) => ({
                  media_id: id,
                  media_info: { original_img_url: `https://img.test/${id}.jpg` },
                })),
                content: {
                  blocks: [
                    { type: "unstyled", text: "Complete body", inlineStyleRanges: [{ style: "Bold", offset: -1, length: 99 }] },
                    { type: "atomic", entityRanges: [{ key: 0 }] },
                    { type: "atomic", entityRanges: [{ key: 1 }] },
                    { type: "atomic", entityRanges: [{ key: 2 }] },
                  ],
                  entityMap: [
                    { key: 0, value: { type: "MEDIA", data: { mediaItems: [1, 2].map((mediaId) => ({ mediaId })) } } },
                    { key: 1, value: { type: "MEDIA", data: { mediaItems: [3, 4].map((mediaId) => ({ mediaId })) } } },
                    { key: 2, value: { type: "MEDIA", data: {} } },
                  ],
                },
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.body).toBe("Gallery\n\nComplete body");
    expect(result.draft.bodyHtml).toBe("<strong>Gallery</strong><br><br>Complete body");
    expect(result.draft.mediaUrls).toEqual([
      "https://img.test/cover.jpg",
      "https://img.test/1.jpg",
      "https://img.test/2.jpg",
      "https://img.test/3.jpg",
    ]);
  });

  it("keeps article tweet text when article details and cover are absent", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/binancezh/status/2117448637127233906",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            status: {
              raw_text: { text: "Read my note https://t.co/article123" },
              article: {},
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.body).toBe("Read my note");
    expect(result.draft.mediaUrls).toEqual([]);
  });

  it("formats raw x created_at timestamps into a compact footer label", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/Pluvio9yte/status/2049742800049316039",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            status: {
              text: "Example tweet.",
              created_at: "Thu Apr 30 06:49:00 +0000 2026",
              author: {
                name: "雪踏乌云",
                screen_name: "Pluvio9yte",
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.timestampLabel).toBe("Apr 30, 2026 · 6:49 AM UTC");
  });

  it("combines repost and quote counts to match x's displayed repost total", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/Pluvio9yte/status/2049742800049316039",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            status: {
              text: "Example tweet.",
              created_at: "April 30, 2026",
              replies: 45,
              reposts: 0,
              quotes: 5,
              likes: 52,
              bookmarks: 29,
              author: {
                name: "雪踏乌云",
                screen_name: "Pluvio9yte",
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft).toMatchObject({
      replyCount: 45,
      repostCount: 5,
      likeCount: 52,
      bookmarkCount: 29,
    });
  });

  it("adds quotes to repost counts when both are present", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/example/status/123",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            status: {
              text: "Example tweet.",
              created_at: "April 30, 2026",
              reposts: 1,
              quotes: 5,
              author: {
                name: "Example",
                screen_name: "example",
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.repostCount).toBe(6);
  });

  it("maps reply, repost, like, and bookmark counts from a richer tweet payload", async () => {
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
              replies: 128,
              retweets: 7420,
              likes: 89000,
              bookmark_count: 29,
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
    expect(result.draft).toMatchObject({
      replyCount: 128,
      repostCount: 7420,
      likeCount: 89000,
      bookmarkCount: 29,
    });
  });

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

  it("maps quoted tweet entity media and removes the image link from quoted text", async () => {
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
                text: "Quoted image note. https://t.co/quotephoto",
                created_at: "April 22, 2026",
                author: {
                  name: "NASA",
                  screen_name: "NASA",
                },
                entities: {
                  media: [
                    {
                      type: "photo",
                      url: "https://t.co/quotephoto",
                      media_url_https:
                        "https://pbs.twimg.com/media/quote-photo.jpg",
                    },
                  ],
                },
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.quotedTweet).toMatchObject({
      body: "Quoted image note.",
      mediaUrl: "https://pbs.twimg.com/media/quote-photo.jpg",
      mediaUrls: ["https://pbs.twimg.com/media/quote-photo.jpg"],
    });
  });

  it("removes trailing t.co image url from body when media is attached but entity mapping is absent", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            status: {
              text: "Starship reached orbit. https://t.co/gallery123",
              created_at: "April 23, 2026",
              author: {
                name: "SpaceX",
                screen_name: "SpaceX",
              },
              media: {
                photos: [
                  {
                    type: "photo",
                    url: "https://pbs.twimg.com/media/starship.jpg",
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
    expect(result.draft.body).toBe("Starship reached orbit.");
    expect(result.draft.mediaUrls).toEqual([
      "https://pbs.twimg.com/media/starship.jpg",
    ]);
  });

  it("removes trailing t.co image url from quoted tweet body when entity mapping is absent", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            status: {
              text: "Main tweet.",
              created_at: "April 23, 2026",
              author: {
                name: "SpaceX",
                screen_name: "SpaceX",
              },
              quote: {
                text: "Quoted with image. https://t.co/quotegallery",
                created_at: "April 22, 2026",
                author: {
                  name: "NASA",
                  screen_name: "NASA",
                },
                media: {
                  photos: [
                    {
                      type: "photo",
                      url: "https://pbs.twimg.com/media/nasa-photo.jpg",
                    },
                  ],
                },
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.quotedTweet).toMatchObject({
      body: "Quoted with image.",
      mediaUrls: ["https://pbs.twimg.com/media/nasa-photo.jpg"],
    });
  });

  it("keeps non-media t.co links in body when they precede the image gallery link", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            status: {
              text: "Read this https://t.co/articlelink https://t.co/gallery123",
              created_at: "April 23, 2026",
              author: {
                name: "SpaceX",
                screen_name: "SpaceX",
              },
              media: {
                photos: [
                  {
                    type: "photo",
                    url: "https://pbs.twimg.com/media/starship.jpg",
                  },
                ],
              },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.body).toBe("Read this https://t.co/articlelink");
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

  it("keeps the URL handle when the rich payload has an empty author handle", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            status: {
              text: "Booster landing confirmed.",
              author: { name: "  ", screen_name: "" },
            },
          }),
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.handle).toBe("SpaceX");
    expect(result.draft.authorName).toBe("SpaceX");
  });

  it("keeps the URL handle when oEmbed returns an empty author name", async () => {
    const result = await importTweetFromUrl(
      "https://x.com/SpaceX/status/1915324363727337943",
      {
        fetcher: async (input) =>
          input.includes("fxtwitter")
            ? { ok: false, status: 404, json: async () => ({}) }
            : {
                ok: true,
                status: 200,
                json: async () => ({
                  author_name: "",
                  html: "<blockquote><p>Liftoff.</p></blockquote>",
                }),
              },
      },
    );

    expect(result.status).toBe("success");
    expect(result.draft.handle).toBe("SpaceX");
    expect(result.draft.authorName).toBe("SpaceX");
  });
});

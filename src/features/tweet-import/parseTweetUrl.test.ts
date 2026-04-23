import { describe, expect, it } from "vitest";
import { parseTweetUrl } from "./parseTweetUrl";

describe("parseTweetUrl", () => {
  it("parses a standard x.com status URL", () => {
    expect(
      parseTweetUrl("https://x.com/SpaceX/status/1915324363727337943"),
    ).toEqual({
      tweetId: "1915324363727337943",
      normalizedUrl: "https://x.com/SpaceX/status/1915324363727337943",
      handle: "SpaceX",
    });
  });

  it("normalizes twitter.com and strips query parameters", () => {
    expect(
      parseTweetUrl("https://twitter.com/nasa/status/1234567890123456789?s=20"),
    ).toEqual({
      tweetId: "1234567890123456789",
      normalizedUrl: "https://x.com/nasa/status/1234567890123456789",
      handle: "nasa",
    });
  });

  it("supports mobile.twitter.com URLs", () => {
    expect(
      parseTweetUrl(
        "https://mobile.twitter.com/github/status/9876543210987654321",
      ),
    ).toEqual({
      tweetId: "9876543210987654321",
      normalizedUrl: "https://x.com/github/status/9876543210987654321",
      handle: "github",
    });
  });

  it("rejects non-twitter domains", () => {
    expect(() =>
      parseTweetUrl("https://example.com/SpaceX/status/1915324363727337943"),
    ).toThrow("Enter a valid X or Twitter post link.");
  });

  it("rejects URLs without a status id", () => {
    expect(() => parseTweetUrl("https://x.com/SpaceX")).toThrow(
      "The link must point to a specific tweet status.",
    );
  });
});

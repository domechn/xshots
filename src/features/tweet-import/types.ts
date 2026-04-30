export type ThemeVariant = "orbital" | "lunar";

export type EmbeddedTweet = {
  sourceUrl: string;
  authorName: string;
  handle: string;
  body: string;
  bodyHtml: string;
  timestampLabel: string;
  avatarUrl: string;
  mediaUrl: string;
  mediaUrls: string[];
  verified: boolean;
};

export type TweetDraft = EmbeddedTweet & {
  themeVariant: ThemeVariant;
  quotedTweet: EmbeddedTweet | null;
  replyCount: number | null;
  repostCount: number | null;
  likeCount: number | null;
  bookmarkCount: number | null;
};

export type TweetImportResult =
  | {
      status: "success";
      draft: TweetDraft;
    }
  | {
      status: "manual";
      draft: TweetDraft;
      reason: string;
    };

export function createEmptyDraft(seed: Partial<TweetDraft> = {}): TweetDraft {
  return {
    sourceUrl: "",
    authorName: "",
    handle: "",
    body: "",
    bodyHtml: "",
    timestampLabel: "",
    avatarUrl: "",
    mediaUrl: "",
    mediaUrls: [],
    verified: false,
    themeVariant: "orbital",
    quotedTweet: null,
    replyCount: null,
    repostCount: null,
    likeCount: null,
    bookmarkCount: null,
    ...seed,
  };
}

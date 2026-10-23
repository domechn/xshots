import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import { FAQ_ITEMS, SiteContent } from "./SiteContent";

describe("SiteContent", () => {
  it("renders the FAQ as h3 questions with answers", () => {
    render(<SiteContent />);

    for (const item of FAQ_ITEMS) {
      expect(
        screen.getByRole("heading", { level: 3, name: item.question }),
      ).toBeInTheDocument();
      expect(screen.getByText(item.answer)).toBeInTheDocument();
    }
  });

  it("matches the FAQPage JSON-LD and noscript copy in index.html", () => {
    const doc = new DOMParser().parseFromString(indexHtml, "text/html");
    const faqPage = [
      ...doc.querySelectorAll('script[type="application/ld+json"]'),
    ]
      .map((script) => JSON.parse(script.textContent ?? ""))
      .find((data) => data["@type"] === "FAQPage");

    expect(
      faqPage.mainEntity.map(
        (entry: { name: string; acceptedAnswer: { text: string } }) => ({
          question: entry.name,
          answer: entry.acceptedAnswer.text,
        }),
      ),
    ).toEqual(FAQ_ITEMS);

    const noscriptText = doc.querySelector("noscript")?.textContent ?? "";
    for (const item of FAQ_ITEMS) {
      expect(noscriptText).toContain(item.question);
      expect(noscriptText).toContain(item.answer);
    }
  });
});

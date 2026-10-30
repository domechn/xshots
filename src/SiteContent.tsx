// Mirrored in index.html (noscript + FAQPage JSON-LD); SiteContent.test.tsx keeps them in sync.
export const FAQ_ITEMS = [
  {
    question: "Is XShots free?",
    answer:
      "Yes. XShots is free and open source, and you don't need an account to use it.",
  },
  {
    question: "Which links are supported?",
    answer:
      "Any x.com or twitter.com post link, including mobile.twitter.com links, /i/web/status/ links and links pasted without https://.",
  },
  {
    question: "Does XShots upload my data?",
    answer:
      "No. XShots has no backend. Your browser fetches the post from the public FxTwitter API (or Twitter's oEmbed endpoint as a fallback) and renders the PNG locally. If a direct image fetch fails, XShots tries wsrv.nl as a fallback proxy. Nothing is stored by XShots.",
  },
  {
    question: "What image quality do I get?",
    answer:
      "Images are exported as lossless PNG files at 1.5x pixel density (1800 px wide for landscape, 1620 px for portrait), so text and photos stay sharp.",
  },
  {
    question: "Are quoted tweets and multiple images included?",
    answer:
      "Yes. The image includes the quoted tweet if the post has one, and up to four images. Threads, videos and polls are not supported yet.",
  },
  {
    question: "Why did my import fail?",
    answer:
      "Import is best effort. X platform restrictions and browser CORS rules can block remote content, in which case XShots shows a warning. Check the link and try again later.",
  },
];

export function SiteContent() {
  return (
    <section className="site-content" aria-labelledby="how-it-works">
      <h2 className="site-content__title" id="how-it-works">
        How to turn a tweet into an image
      </h2>
      <ol className="site-content__steps">
        <li>
          <h3>Copy the post link</h3>
          <p>Copy the URL of any X or Twitter post from the app or browser.</p>
        </li>
        <li>
          <h3>Paste and import</h3>
          <p>
            Paste it into XShots and import. XShots renders a clean card with the
            author, text, images and quoted tweet.
          </p>
        </li>
        <li>
          <h3>Export the PNG</h3>
          <p>Download the screenshot as a PNG or copy it to your clipboard.</p>
        </li>
      </ol>

      <h2 className="site-content__title">Why XShots</h2>
      <ul className="site-content__list">
        <li>Free and open source, with no account or sign-up.</li>
        <li>Runs entirely in your browser. No server stores your posts.</li>
        <li>Clean, high-resolution PNG output ready to share anywhere.</li>
        <li>Works with x.com and twitter.com links on desktop and mobile.</li>
      </ul>

      <h2 className="site-content__title">Frequently asked questions</h2>
      <div className="site-content__faq">
        {FAQ_ITEMS.map((item) => (
          <div key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

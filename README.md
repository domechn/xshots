# XShots

XShots is a pure frontend tweet screenshot generator built with React, TypeScript, and Vite. Paste an X or Twitter status link, preview the rendered card, and export a clean PNG.

[Try It！](https://xshots.domc.me)

## What it does

- Parses x.com and twitter.com status links (with or without `https://`, including `/i/web/status/<id>`)
- Attempts a browser-side rich import through the public FxTwitter API, then falls back to oEmbed text import when needed
- Shows the imported tweet in a local preview card
- Exports the preview to PNG with `html-to-image`

## Current scope

This first version is intentionally narrow:

- Single tweet only, plus its quoted tweet if it has one
- Up to four images
- No thread rendering
- No video or poll support
- No server-side proxy

Because this is a static frontend app, automatic import is best effort only. X platform restrictions and browser CORS rules can block remote content. When that happens, the app shows an import warning instead of opening a full manual editor.

The interface is intentionally minimal: one URL input, one preview stage, one export action.

## Scripts

- `npm run dev` starts the Vite development server
- `npm run test:run` runs the Vitest suite once
- `npm run test` starts Vitest in watch mode
- `npm run lint` runs ESLint (TypeScript + React hooks rules)
- `npm run build` performs a typecheck and creates a production build in `dist/`
- `npm run preview` serves the production build locally

## Verified commands

- `npm run test:run`
- `npm run build`
- `npm run lint`

## GitHub Pages

The current Vite build already produces a static bundle suitable for GitHub Pages:

- `dist/index.html`
- `dist/assets/*.css`
- `dist/assets/*.js`

This is a normal static site build, not a single self-contained inline HTML file.

The repository is configured so GitHub Pages can serve the custom domain `xshots.domc.me` once the repository settings and DNS are pointed correctly:

- `public/CNAME` is copied into the build output with the custom domain
- `.github/workflows/static.yml` runs the tests, builds, and publishes `dist/` to GitHub Pages (`dist/` is not committed)

To finish the custom domain setup, point the `xshots.domc.me` DNS record at your GitHub Pages host and set Pages to deploy from GitHub Actions.

## Stack

- React 19
- TypeScript
- Vite
- Vitest + Testing Library
- html-to-image

## Notes for future work

- Add a tiny Edge Function if you want stable automatic import from links
- Add more export presets for landscape, portrait, and story formats
- Extend the draft model for threads and richer media

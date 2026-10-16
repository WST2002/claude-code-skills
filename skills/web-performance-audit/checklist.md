# Web performance checklist

## Images (LCP, CLS)

- [ ] Hero / LCP image is not lazy-loaded and has `fetchpriority="high"` (Next.js: `priority`).
- [ ] Every `<img>` has `width` and `height` (or aspect-ratio) to reserve space.
- [ ] Modern formats (AVIF/WebP) and responsive `srcset`/`sizes`; no 3000px images in 400px slots.
- [ ] Below-the-fold images use `loading="lazy"`.

## Fonts (LCP, CLS)

- [ ] `font-display: swap` or `optional`; critical font preloaded; subset to used characters.
- [ ] Fallback font metrics adjusted (`size-adjust`) to avoid layout shift.
- [ ] No render-blocking Google Fonts `@import` inside CSS.

## JavaScript (INP, bundle)

- [ ] No whole-library imports: `import _ from "lodash"`, `moment`, full icon packs → per-function imports or lighter libraries.
- [ ] Route-level and component-level code splitting (`import()`, `next/dynamic`, `React.lazy`) for heavy, below-fold or rarely used UI.
- [ ] No duplicate packages or multiple versions in the bundle (check with a bundle analyzer).
- [ ] Long tasks broken up; heavy work moved off the main thread or deferred.

## Third parties

- [ ] Analytics, chat, tag managers load `async`/`defer` or after interaction, never synchronously in `<head>`.
- [ ] Embeds (YouTube, maps) use facades until clicked.

## Rendering (INP)

- [ ] Large lists virtualized; expensive derived data memoized; stable props so children do not re-render.
- [ ] State kept close to where it is used; no global state update on every keystroke.
- [ ] Scroll and resize handlers are passive and throttled; no layout reads after writes in loops (layout thrashing).
- [ ] Animations use `transform` and `opacity`, not `top`/`left`/`width`.

## Data fetching (LCP, INP)

- [ ] No request waterfalls: independent requests run in parallel (`Promise.all`) or are fetched on the server.
- [ ] No N+1 requests per list item; batch them.
- [ ] Critical data rendered on the server (SSR/SSG) when it determines the LCP element.

## Network and caching (TTFB, repeat visits)

- [ ] Static assets have long-lived `Cache-Control` with hashed filenames.
- [ ] Compression (Brotli/gzip) enabled; HTTP/2 or HTTP/3.
- [ ] CDN in front of static and cacheable pages; `preconnect` to critical third-party origins.
- [ ] Server response under ~600 ms for HTML.

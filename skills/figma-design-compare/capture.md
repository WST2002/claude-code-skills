# Capturing the design and the build

## 1. The design (Figma)

From the link `https://www.figma.com/design/<fileKey>/<name>?node-id=12-345`, the node id is `12:345` (replace `-` with `:`).

### With the Figma MCP server

Use its tools to fetch the node data and download the frame image (for example `get_figma_data` with the file key and node id, then `download_figma_images` at scale 2).

### With the Figma REST API

The token is read from the `FIGMA_TOKEN` environment variable.

```bash
# Node data: layout, text styles, fills, padding, gaps, effects
curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/files/<fileKey>/nodes?ids=12:345" > figma-node.json

# Frame image at 2x
curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/images/<fileKey>?ids=12:345&format=png&scale=2"
# → returns {"images": {"12:345": "<temporary URL>"}}; download that URL to figma.png
```

Useful fields in the node JSON:

| Need | Field |
|---|---|
| Size and position | `absoluteBoundingBox` (`x`, `y`, `width`, `height`) |
| Auto-layout padding and gaps | `paddingLeft/Right/Top/Bottom`, `itemSpacing`, `layoutMode` |
| Text | `style.fontFamily`, `fontWeight`, `fontSize`, `lineHeightPx`, `letterSpacing`, `textAlignHorizontal` |
| Colors | `fills[].color` (`r`,`g`,`b` in 0-1, multiply by 255) and `opacity` |
| Borders | `strokes`, `strokeWeight`, `cornerRadius` / `rectangleCornerRadii` |
| Shadows | `effects[]` with `type: DROP_SHADOW`, `offset`, `radius`, `color` |

## 2. The build

Match the frame width and use device scale 2 to compare with the 2x Figma image.

### Website or web app — Playwright (if available)

```js
// capture.mjs — run with: node capture.mjs <url> <width> <height>
import { chromium } from "playwright";
const [url, width = "1440", height = "900"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +width, height: +height }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "built.png", fullPage: true });

// Computed styles for elements to measure (adjust selectors)
const styles = await page.$$eval("h1, h2, p, button, a, img, section", (els) =>
  els.slice(0, 60).map((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName, text: el.textContent?.trim().slice(0, 40),
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      font: `${s.fontFamily} ${s.fontWeight} ${s.fontSize}/${s.lineHeight}`,
      color: s.color, bg: s.backgroundColor, radius: s.borderRadius, padding: s.padding,
    };
  }));
console.log(JSON.stringify(styles, null, 2));
await browser.close();
```

If Playwright is not installed: `npx -y playwright install chromium` once, or use Chrome directly for a screenshot only:

```bash
chrome --headless=new --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=1440,900 --screenshot=built.png http://localhost:3000
```

### Android app

```bash
adb exec-out screencap -p > built.png
adb shell wm size        # physical size; compare with the frame at the same density
```

### iOS app (simulator)

```bash
xcrun simctl io booted screenshot built.png
```

## 3. Pixel diff (optional)

When both images have the same size, a diff image highlights every changed area:

```bash
npx -y pixelmatch figma.png built.png diff.png 0.1
# or, with ImageMagick:
magick compare -metric AE figma.png built.png diff.png
```

Use the diff to find areas to inspect. It does not replace the measured pass: content and font rendering differences also show up in a diff.

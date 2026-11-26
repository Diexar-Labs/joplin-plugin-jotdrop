"""Run after npm run build: python test/board-corner-browser.py. Synthetic Joplin bridge only.

#109 (mrjo118, 24 Nov): the cut-off bit of a card's folded corner was painted in the page colour, so under the pointer it lay
as a cream triangle over the amber shadow. It has to look see-through: the page at rest, the shadow under the pointer, and
the same as the shadow while the shadow fades in or out. Checked on the pixels, in light and dark."""
import io
import json
import mimetypes
import re
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

BRIDGE = """
  window.webviewApi = {
    onMessage(cb) {},
    async postMessage(m) {
      if (m.type === 'load') return DATA;
      if (m.type === 'previews') return m.ids.map(id => ({id, body: 'Short note', updated: 1, files: []}));
      return {};
    }
  };
"""

# Pauses every running transition at the given millisecond and returns what was transitioning.
PAUSE = """async (ms) => {
  const paper = document.querySelector('.note-card .card-paper');
  getComputedStyle(paper).boxShadow; getComputedStyle(paper, '::after').backgroundColor;
  for (let i = 0; i < 5 && !document.getAnimations().length; i++) await new Promise(r => requestAnimationFrame(r));
  const running = document.getAnimations();
  for (const animation of running) { animation.pause(); animation.currentTime = ms; }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return running.map(a => (a.effect && a.effect.pseudoElement || '') + a.transitionProperty).sort();
}"""


def main():
    cards = [{"id": f"n{i}", "title": f"Note {i}", "color": "default", "tags": [], "pinned": False, "archived": False, "updated": 1, "rank": 100 - i, "folderId": "h"} for i in range(4)]
    data = {"locale": "en", "platform": "desktop", "cards": cards, "folders": [{"id": "h", "title": "Home"}], "boardFolder": "h", "drawers": [], "scroll": None, "view": None}

    def serve(route):
        path = urlparse(route.request.url).path
        if path == "/":
            route.fulfill(content_type="text/html; charset=utf-8", body='<html><head><meta charset="utf-8"><link rel="stylesheet" href="/dist/board.css"></head><body><div id="jotdrop-root"></div><script src="/dist/board.js"></script></body></html>')
        else:
            file = (ROOT / path.lstrip("/")).resolve()
            assert file.is_relative_to(ROOT)
            route.fulfill(path=str(file), content_type=(mimetypes.guess_type(str(file))[0] or "application/octet-stream") + "; charset=utf-8")

    def distance(a, b):
        return max(abs(x - y) for x, y in zip(a[:3], b[:3]))

    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        try:
            for scheme in ("light", "dark"):
                context = browser.new_context(viewport={"width": 1000, "height": 700}, color_scheme=scheme)
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.route("http://jotdrop.test/**", serve)
                page.add_init_script(BRIDGE.replace("DATA", json.dumps(data)))
                page.goto("http://jotdrop.test/", wait_until="networkidle")
                card = page.locator(".note-card").first
                card.wait_for()
                # Only the angle is taken away, so a pixel lands on the same spot of every card.
                page.add_style_tag(content=".card-paper { rotate: 0deg !important; }")

                def sample():
                    box, shadow = card.locator(".card-paper").evaluate("(e) => { const r = e.getBoundingClientRect(); return [[r.left, r.top, r.right, r.bottom], getComputedStyle(e).boxShadow]; }")
                    left, top, right, bottom = box
                    shot = Image.open(io.BytesIO(page.screenshot())).convert("RGB")
                    found = {
                        "cut": shot.getpixel((int(right) - 3, int(bottom) - 3)),
                        "page": shot.getpixel((int(left) - 5, int(top) + 30)),
                    }
                    # What lies under the cut-off bit right now: the shadow's colour as it is at this moment, over the page.
                    # While it fades the shadow also shrinks, so a pixel beside the card would miss it.
                    rgba = [float(n) for n in re.findall(r"[\d.]+", re.search(r"rgba?\([^)]*\)", shadow).group(0))] if shadow != "none" else [0, 0, 0, 0]
                    alpha = rgba[3] if len(rgba) == 4 else 1.0
                    found["shadow"] = tuple(round(alpha * c + (1 - alpha) * p) for c, p in zip(rgba[:3], found["page"]))
                    return found

                away = lambda: page.mouse.move(990, 690)
                away()
                page.wait_for_timeout(400)
                rest = sample()
                assert distance(rest["cut"], rest["page"]) <= 6, (scheme, "at rest the cut-off bit shows the page", rest)

                card.hover()
                page.wait_for_timeout(400)
                lifted = sample()
                assert distance(lifted["shadow"], (244, 196, 88)) <= 6, (scheme, "the amber shadow", lifted)
                assert distance(lifted["cut"], lifted["shadow"]) <= 6, (scheme, "under the pointer the cut-off bit shows the shadow, not the page", lifted)

                # Halfway out: the shadow is still half there, so the cut-off bit must be too.
                away()
                leaving_props = page.evaluate(PAUSE, 75)
                leaving = sample()
                assert distance(leaving["cut"], leaving["shadow"]) <= 16, (scheme, "fading out: no cream triangle on the shadow", leaving, leaving_props)
                page.evaluate("document.getAnimations().forEach(a => a.finish())")

                # Halfway in.
                card.hover()
                entering_props = page.evaluate(PAUSE, 75)
                entering = sample()
                assert distance(entering["cut"], entering["shadow"]) <= 16, (scheme, "fading in: the cut-off bit follows the shadow", entering, entering_props)
                page.evaluate("document.getAnimations().forEach(a => a.finish())")

                assert not errors, errors
                results[scheme] = {"rest": rest, "lifted": lifted, "leaving": leaving, "entering": entering}
                context.close()

            # Less motion: nothing fades, the corner switches with the shadow.
            context = browser.new_context(viewport={"width": 1000, "height": 700}, reduced_motion="reduce")
            page = context.new_page()
            page.route("http://jotdrop.test/**", serve)
            page.add_init_script(BRIDGE.replace("DATA", json.dumps(data)))
            page.goto("http://jotdrop.test/", wait_until="networkidle")
            page.locator(".note-card").first.wait_for()
            durations = page.locator(".note-card .card-paper").first.evaluate("(e) => [getComputedStyle(e).transitionDuration, getComputedStyle(e, '::after').transitionDuration]")
            assert all(set(d.replace(" ", "").split(",")) == {"0s"} for d in durations), durations
            context.close()
        finally:
            browser.close()
    print({scheme: {k: {"cut": v["cut"], "shadow": v["shadow"]} for k, v in r.items()} for scheme, r in results.items()})
    print("PASS board-corner-browser")


if __name__ == "__main__":
    main()

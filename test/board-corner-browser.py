"""Run after npm run build: python test/board-corner-browser.py. Synthetic Joplin bridge only.

#109 (mrjo118, 24 and 26 Nov): the cut-off bit of a card's folded corner was painted, in the page colour and later in the
shadow's colour, so it showed as a square corner on anything else: the amber shadow under the pointer stuck out past the fold
on a phone. It has to be open. The board lies on magenta for the measurement, a colour the plugin never uses; the cut-off bit
shows it at rest, under the pointer and halfway through the shadow fading in and out, while the flap and the shadow are still
there. Checked on the pixels, in light and dark."""
import io
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MAGENTA = (255, 0, 255)

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
  getComputedStyle(paper).filter;
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
                # Only the angle is taken away, so a pixel lands on the same spot of every card; the page turns magenta.
                page.add_style_tag(content=".card-paper { rotate: 0deg !important; } html, body { background: rgb(255, 0, 255) !important; }")

                def sample():
                    left, right, bottom = card.locator(".card-paper").evaluate("(e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.bottom]; }")
                    shot = Image.open(io.BytesIO(page.screenshot())).convert("RGB")
                    # "under": just below the paper, in the middle: the amber shadow under the pointer.
                    return {"cut": shot.getpixel((round(right) - 2, round(bottom) - 2)), "flap": shot.getpixel((round(right) - 11, round(bottom) - 11)),
                            "under": shot.getpixel((round((left + right) / 2), round(bottom) + 2))}

                def open_corner(found, why):
                    assert distance(found["cut"], MAGENTA) <= 6, (scheme, why, found)
                    assert distance(found["flap"], MAGENTA) > 60, (scheme, "the flap is still drawn", found)

                away = lambda: page.mouse.move(990, 690)
                away()
                page.wait_for_timeout(400)
                rest = sample()
                open_corner(rest, "at rest the cut-off bit shows what lies under the card")
                assert distance(rest["under"], MAGENTA) <= 6, (scheme, "no shadow at rest", rest)

                card.hover()
                page.wait_for_timeout(400)
                lifted = sample()
                open_corner(lifted, "under the pointer the cut-off bit shows what lies under the card, not a painted corner")
                assert distance(lifted["under"], (244, 196, 88)) <= 6, (scheme, "under the pointer the paper lies on the amber shadow", lifted)

                # Halfway out, and halfway in.
                away()
                leaving_props = page.evaluate(PAUSE, 75)
                leaving = sample()
                open_corner(leaving, ("fading out", leaving_props))
                page.evaluate("document.getAnimations().forEach(a => a.finish())")
                card.hover()
                entering_props = page.evaluate(PAUSE, 75)
                entering = sample()
                open_corner(entering, ("fading in", entering_props))
                page.evaluate("document.getAnimations().forEach(a => a.finish())")

                assert not errors, errors
                results[scheme] = {"rest": rest["cut"], "lifted": lifted["cut"], "leaving": leaving["cut"], "entering": entering["cut"]}
                context.close()

            # Less motion: the shadow comes and goes at once.
            context = browser.new_context(viewport={"width": 1000, "height": 700}, reduced_motion="reduce")
            page = context.new_page()
            page.route("http://jotdrop.test/**", serve)
            page.add_init_script(BRIDGE.replace("DATA", json.dumps(data)))
            page.goto("http://jotdrop.test/", wait_until="networkidle")
            page.locator(".note-card").first.wait_for()
            duration = page.locator(".note-card .card-paper").first.evaluate("(e) => getComputedStyle(e).transitionDuration")
            assert set(duration.replace(" ", "").split(",")) == {"0s"}, duration
            context.close()
        finally:
            browser.close()
    print(results)
    print("PASS board-corner-browser")


if __name__ == "__main__":
    main()

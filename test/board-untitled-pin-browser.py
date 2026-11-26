"""Run after npm run build: python test/board-untitled-pin-browser.py. Synthetic Joplin bridge only.

Forum 51337 #57 (mrjo118, 24 Nov): on a note without a title the text started at the top of the card and ran under the pin.
A title keeps clear of the pin; the first line of a note without one has to as well, whether it is text or a task, on a phone
(pin always shown) and on a desktop (pin shown under the pointer). A card with a cover photo keeps its photo under the pin."""
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

BRIDGE = """
  window.webviewApi = {
    onMessage(cb) {},
    async postMessage(m) {
      if (m.type === 'load') return DATA;
      if (m.type === 'previews') return m.ids.map(id => ({id, body: BODIES[id], updated: 1, files: []}));
      return {};
    }
  };
"""

# Every piece of text in the card's first content block that lies at the pin's height, and how far right it reaches.
OVERLAP = """(card) => {
  const pin = card.querySelector('.card-pin').getBoundingClientRect();
  const first = card.querySelector('.note-preview > :first-child') || card.querySelector('.note-preview');
  const walker = document.createTreeWalker(first, NodeFilter.SHOW_TEXT);
  let right = -1, lines = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.bottom <= pin.top || r.top >= pin.bottom) continue;
      right = Math.max(right, r.right); lines++;
    }
  }
  return { pinLeft: pin.left, right, lines };
}"""


def main():
    long_text = "Hjjdbbfbf ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff"
    bodies = {
        "n0": long_text,
        "n1": "- [ ] a task with a long name that runs across the whole card\n- [ ] two",
        "n2": "Text under a title " + long_text,
        "n3": long_text,
    }
    cards = [
        {"id": "n0", "title": "", "color": "default", "tags": [], "pinned": True, "archived": False, "updated": 4, "rank": 4, "folderId": "h"},
        {"id": "n1", "title": "", "color": "default", "tags": [], "pinned": True, "archived": False, "updated": 3, "rank": 3, "folderId": "h"},
        {"id": "n2", "title": "A title that is long enough to reach the pin", "color": "default", "tags": [], "pinned": True, "archived": False, "updated": 2, "rank": 2, "folderId": "h"},
        {"id": "n3", "title": "", "color": "default", "tags": [], "pinned": False, "archived": False, "updated": 1, "rank": 1, "folderId": "h"},
    ]

    def serve(route):
        path = urlparse(route.request.url).path
        if path == "/":
            route.fulfill(content_type="text/html; charset=utf-8", body='<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dist/board.css"></head><body><div id="jotdrop-root"></div><script src="/dist/board.js"></script></body></html>')
        else:
            file = (ROOT / path.lstrip("/")).resolve()
            assert file.is_relative_to(ROOT)
            route.fulfill(path=str(file), content_type=(mimetypes.guess_type(str(file))[0] or "application/octet-stream") + "; charset=utf-8")

    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        try:
            for width, platform in ((393, "mobile"), (1000, "desktop")):
                data = {"locale": "en", "platform": platform, "cards": cards, "folders": [{"id": "h", "title": "Home"}], "boardFolder": "h", "drawers": [], "scroll": None, "view": None}
                context = browser.new_context(viewport={"width": width, "height": 900}, has_touch=width < 600)
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.route("http://jotdrop.test/**", serve)
                page.add_init_script(BRIDGE.replace("DATA", json.dumps(data)).replace("BODIES", json.dumps(bodies)))
                page.goto("http://jotdrop.test/", wait_until="networkidle")
                page.locator(".note-card .note-preview").first.wait_for()
                for card_id in ("n0", "n1", "n3"):
                    card = page.locator(f'.note-card[data-id="{card_id}"]')
                    card.hover()  # on a desktop the pin shows under the pointer; the text must not move then
                    found = card.evaluate(OVERLAP)
                    assert found["lines"] >= 1, (width, card_id, "no text at the pin's height to measure", found)
                    assert found["right"] <= found["pinLeft"] + 0.5, (width, card_id, "text runs under the pin", found)
                    results[f"{width}-{card_id}"] = round(found["pinLeft"] - found["right"], 1)
                # The title keeps its own room, as before.
                title = page.locator('.note-card[data-id="n2"] h3').evaluate("(e) => getComputedStyle(e).paddingRight")
                assert title == "26px", title
                assert not errors, errors
                context.close()
        finally:
            browser.close()
    print("room left of the pin (px):", results)
    print("PASS board-untitled-pin-browser")


if __name__ == "__main__":
    main()

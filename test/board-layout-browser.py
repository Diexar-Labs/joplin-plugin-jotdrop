"""Run after npm run build: python test/board-layout-browser.py. Synthetic Joplin bridge only.

Forum 51337, 23 Nov (mrjo118): on a wide screen Archive is as high as Ask JotDrop and Find duplicates; a tag longer than the
row is cut with "..." instead of hiding every tag behind "+N", and opened up it stays inside the screen; when the filters
wrap onto more rows the JotDrop title stays level with the first row."""
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

BRIDGE = """
  window.data = DATA; window.bodies = BODIES; window.messages = [];
  window.webviewApi = { onMessage(cb) {}, async postMessage(m) {
    window.messages.push(m);
    if (m.type === 'load') return data;
    if (m.type === 'previews') return m.ids.map(id => ({id, body: bodies[id], updated: 1, files: [], image: null}));
    if (m.type === 'search') return [];
    return {};
  } };
"""

LONG_TAG = "asdasdfdfgagsdfnhsdfgadfgasdfgsdfafsdfsdafasdfasdfasdfasdsdf" * 7
TAGS = [LONG_TAG, "asdf", "asdfasdf", "dsfasdfg", "sdafasdf", "sdf", "sdfasdf"]

PROBE = """() => {
  const rect = (el) => { const b = el.getBoundingClientRect(); return {x: b.x, y: b.y, w: b.width, h: b.height}; };
  const q = (s) => document.querySelector(s);
  const chips = [...document.querySelectorAll('.jd-tags-list > .jd-chip')];
  return {
    brand: q('.jd-brand') ? rect(q('.jd-brand')) : null, search: rect(q('.jd-searchbox')),
    archive: q('.jd-archive') ? rect(q('.jd-archive')) : null, ask: q('.jd-ask-chip') ? rect(q('.jd-ask-chip')) : null, dup: q('.jd-dup-chip') ? rect(q('.jd-dup-chip')) : null,
    shown: chips.filter((c) => !c.classList.contains('is-clipped')).map((c) => c.textContent),
    tagRight: Math.max(0, ...chips.filter((c) => !c.classList.contains('is-clipped')).map((c) => c.getBoundingClientRect().right)),
    longTitle: (chips.find((c) => c.textContent.includes('asdasdf')) || {}).title || null,
    scrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
}"""


def main():
    bodies = {"n1": "sdf"}
    cards = [{"id": "n1", "title": "sdf", "color": "default", "tags": TAGS, "pinned": False, "archived": False, "updated": 1, "rank": 1000, "folderId": "h"}]
    folders = [{"id": "h", "title": "JotDrop"}]
    bridge = BRIDGE.replace("BODIES", json.dumps(bodies))

    def serve(route):
        path = urlparse(route.request.url).path
        if path == "/":
            route.fulfill(content_type="text/html; charset=utf-8", body='<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dist/board.css"></head><body><div id="jotdrop-root"></div><script src="/dist/board.js"></script></body></html>')
        else:
            file = (ROOT / path.lstrip("/")).resolve()
            assert file.is_relative_to(ROOT)
            route.fulfill(path=str(file), content_type=(mimetypes.guess_type(str(file))[0] or "application/octet-stream") + "; charset=utf-8")

    def open_board(browser, width, platform):
        data = {"locale": "en", "platform": platform, "cards": cards, "folders": folders, "boardFolder": "h", "drawers": [], "scroll": None, "view": None}
        page = browser.new_context(viewport={"width": width, "height": 700}).new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("http://jotdrop.test/**", serve)
        page.add_init_script(bridge.replace("DATA", json.dumps(data)))
        page.goto("http://jotdrop.test/", wait_until="networkidle")
        page.locator(".note-card").first.wait_for()
        page.wait_for_timeout(300)
        assert not errors, errors
        return page

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")

        # 1. Archive, Ask JotDrop and Find duplicates are equally high, wide or wrapped, on both platforms.
        for platform, width in [("mobile", 1304), ("mobile", 773), ("mobile", 607), ("desktop", 1304), ("desktop", 773)]:
            m = open_board(browser, width, platform).evaluate(PROBE)
            heights = (m["archive"]["h"], m["ask"]["h"], m["dup"]["h"])
            assert max(heights) - min(heights) < 1, f"{platform} {width}px: Archive, Ask and Find duplicates differ in height: {heights}"

        # 2. The title stays level with the first row of the filters, also when they wrap onto two or three rows.
        for width in (1304, 773, 607):
            m = open_board(browser, width, "mobile").evaluate(PROBE)
            assert abs(m["brand"]["y"] - m["search"]["y"]) <= 2, f"{width}px: the title is {m['brand']['y'] - m['search']['y']:.0f}px off the search box"

        # 3. One tag longer than the screen: the others stay in view, the long one is cut and has its full name as a tooltip,
        #    and opened up nothing runs off the screen or makes the page scroll sideways.
        for width in (1304, 773, 607, 390):
            page = open_board(browser, width, "mobile")
            m = page.evaluate(PROBE)
            assert any(text.startswith("#asdasdf") for text in m["shown"]), f"{width}px: the long tag is not shown ({m['shown']})"
            assert any(text == "#asdf" for text in m["shown"]) or width < 600, f"{width}px: the tags after the long one are hidden ({m['shown']})"
            assert m["longTitle"] == "#" + LONG_TAG, f"{width}px: the long tag has no tooltip with its full name"
            assert not m["scrollsSideways"] and m["tagRight"] <= width, f"{width}px: the tag row runs off the screen ({m['tagRight']:.0f}px)"
            toggle = page.locator(".jd-tags-toggle:visible")
            if toggle.count():
                toggle.first.click()
                page.wait_for_timeout(300)
                m = page.evaluate(PROBE)
                assert not m["scrollsSideways"] and m["tagRight"] <= width, f"{width}px: opened up, the tag row runs off the screen ({m['tagRight']:.0f}px)"
                every = len(TAGS) + (1 if width < 600 else 2)  # "All" and the tags, plus the Paper drawer chip unless it sits in "More"
                assert len(m["shown"]) == every, f"{width}px: opened up, not every tag shows ({len(m['shown'])} of {every})"
        browser.close()
    print("board layout (forum 51337, 23 Nov): ok")


main()

"""Run after npm run build: python test/board-narrow-browser.py. Synthetic Joplin bridge only.

The board on a phone (forum 49904, 18 Nov): no "JotDrop" word, the note count in the search box, a one-line note box,
and small tool chips (Drawing, Ask JotDrop) instead of the drawing window's wide, shadowed look."""
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main():
    bodies = {f"n{i}": f"- [ ] task {i}" if i % 2 else f"Short note {i}" for i in range(54)}
    cards = [{"id": key, "title": f"Note {i}", "color": "default", "tags": [], "pinned": False, "archived": False, "updated": 1, "rank": 1000 - i, "folderId": "f"} for i, key in enumerate(bodies)]
    bridge = """
      window.data = DATA; window.bodies = BODIES;
      window.webviewApi = {
        onMessage(cb) {},
        async postMessage(m) {
          if (m.type === 'load') return data;
          if (m.type === 'previews') return m.ids.map(id => ({id, body:bodies[id], updated:1, files:[]}));
          if (m.type === 'search') return data.cards.filter(c=>bodies[c.id].includes(m.text)).map(c=>c.id);
          return {};
        }
      };
    """.replace("BODIES", json.dumps(bodies))

    def serve(route):
        path = urlparse(route.request.url).path
        if path == "/":
            route.fulfill(content_type="text/html; charset=utf-8", body='<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dist/board.css"></head><body><div id="jotdrop-root"></div><script src="/dist/board.js"></script></body></html>')
        else:
            file = (ROOT / path.lstrip("/")).resolve()
            assert file.is_relative_to(ROOT)
            route.fulfill(path=str(file), content_type=(mimetypes.guess_type(str(file))[0] or "application/octet-stream") + "; charset=utf-8")

    def open_board(browser, width, platform, locale="en", count=54):
        data = {"locale": locale, "platform": platform, "cards": cards[:count], "folders": [{"id": "f", "title": "Synthetic"}], "boardFolder": "f", "drawers": [], "scroll": None}
        context = browser.new_context(viewport={"width": width, "height": 800}, has_touch=width < 600)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("http://jotdrop.test/**", serve)
        page.add_init_script(bridge.replace("DATA", json.dumps(data)))
        page.goto("http://jotdrop.test/", wait_until="networkidle")
        if count:
            page.locator(".note-card").first.wait_for()
        else:
            page.locator(".jd-empty").wait_for()
        assert not errors, errors
        return page

    def box(page, selector):
        return page.locator(selector).first.bounding_box()

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")

        phone = open_board(browser, 393, "mobile")
        assert not phone.locator(".jd-brand").is_visible(), "the JotDrop word should be gone on a phone"
        assert phone.locator(".jd-search").get_attribute("placeholder") == "Search 54 notes"
        assert phone.locator(".jd-search").get_attribute("aria-label") == "Search your notes"
        # The note box is one low line until it is tapped.
        assert not phone.locator(".jd-c-title").is_visible()
        assert box(phone, ".jd-compose")["height"] < 46, box(phone, ".jd-compose")
        # The tool chips are chips: no wider than their words, no drawing-window shadow.
        for chip in [phone.locator(".jd-filters button", has_text="Drawing"), phone.locator(".jd-filters button", has_text="Ask JotDrop")]:
            size = chip.bounding_box()
            assert size["width"] < 170 and size["height"] < 40, size
            assert chip.evaluate("el => getComputedStyle(el).boxShadow") == "none"
        # The first card starts in the top 40% of an 800 px screen (it was ~49%).
        first = box(phone, ".note-card")["y"]
        assert first < 0.4 * 800, first
        # Tapping the box opens the title and the save bar; Close puts it back.
        phone.locator(".jd-c-body").tap()
        phone.locator(".jd-c-title").wait_for(state="visible")
        phone.get_by_role("button", name="Close").tap()
        phone.locator(".jd-c-title").wait_for(state="hidden")
        # The count follows a filter; with no match the box says what it searches again once the text is cleared.
        phone.locator(".jd-search").fill("task")
        phone.wait_for_function("document.querySelector('.jd-count').textContent === '27 notes'")
        phone.locator(".jd-search").fill("")
        phone.wait_for_function("document.querySelector('.jd-search').placeholder === 'Search 54 notes'")
        phone.context.close()

        # Dutch, and an empty board does not say "Search 0 notes".
        dutch = open_board(browser, 393, "mobile", "nl")
        assert dutch.locator(".jd-search").get_attribute("placeholder") == "Zoek in 54 notities"
        dutch.context.close()
        empty = open_board(browser, 393, "mobile", count=0)
        assert empty.locator(".jd-search").get_attribute("placeholder") == "Search your notes"
        empty.context.close()

        # A wide window keeps the word, the count next to it and the plain search text; its chips are small as well.
        desktop = open_board(browser, 1100, "desktop")
        assert desktop.locator(".jd-brand").is_visible()
        assert desktop.locator(".jd-search").get_attribute("placeholder") == "Search your notes"
        for chip in [desktop.locator(".jd-filters button", has_text="Drawing"), desktop.locator(".jd-filters button", has_text="Ask JotDrop")]:
            size = chip.bounding_box()
            assert size["width"] < 170 and size["height"] < 40, size
        desktop.context.close()
        browser.close()
    print("PASS board-narrow-browser")


main()

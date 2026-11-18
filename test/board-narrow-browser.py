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

    def open_board(browser, width, platform, locale="en", count=54, height=800):
        data = {"locale": locale, "platform": platform, "cards": cards[:count], "folders": [{"id": "f", "title": "Synthetic"}], "boardFolder": "f", "drawers": [], "scroll": None}
        context = browser.new_context(viewport={"width": width, "height": height}, has_touch=width < 600 or height < 600)
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
        # One top row: search, notebooks and the "More" button; Archive, Drawing, Ask JotDrop, Find duplicates and the Paper drawer are in its menu.
        for hidden in ["Drawing", "Ask JotDrop", "Find duplicates", "Archive", "Paper drawer"]:
            assert not phone.locator(".jd-filters button, .jd-tags button", has_text=hidden).first.is_visible(), hidden
        tools = phone.locator(".jd-tools-btn")
        assert tools.is_visible() and tools.get_attribute("aria-label") == "More" and tools.get_attribute("aria-haspopup") == "menu"
        rows = [box(phone, selector)["y"] for selector in [".jd-search", ".jd-folder", ".jd-tools-btn"]]
        assert max(rows) - min(rows) < 12, f"search, notebooks and More should share a row: {rows}"
        assert tools.bounding_box()["width"] >= 36 and tools.bounding_box()["height"] >= 30, tools.bounding_box()
        assert phone.locator(".jd-tags").evaluate("el => el.children.length === 0 && getComputedStyle(el).display") == "none", "an empty tag row takes no room, not even its margin"
        # The menu: five items, none switched on, Esc closes it.
        tools.tap()
        menu = phone.locator(".menu-tools")
        menu.wait_for()
        names = [text.strip() for text in menu.locator("button").all_inner_texts()]
        assert names == ["Archive", "Drawing", "Ask JotDrop", "Find duplicates", "Paper drawer"], names
        assert [b.get_attribute("aria-checked") for b in menu.locator("button").all()] == ["false", None, None, None, "false"]
        phone.keyboard.press("Escape")
        menu.wait_for(state="detached")
        # Archive on: the item says so, and the Archive chip shows up with its ✓ so the state is not only in the menu.
        tools.tap()
        phone.locator(".menu-tools button", has_text="Archive").tap()
        phone.locator(".jd-archive").wait_for(state="visible")
        assert phone.locator(".jd-archive").inner_text().startswith("✓"), phone.locator(".jd-archive").inner_text()
        tools.tap()
        assert phone.locator(".menu-tools button", has_text="Archive").get_attribute("aria-checked") == "true"
        assert "✓" in phone.locator(".menu-tools button", has_text="Archive").inner_text()
        phone.locator(".menu-tools button", has_text="Archive").tap()
        phone.locator(".jd-archive").wait_for(state="hidden")
        # The Paper drawer on: its chips take the place of the menu item in the tag row (✓ on the first, and a "New drawer" chip).
        tools.tap()
        phone.locator(".menu-tools button", has_text="Paper drawer").tap()
        phone.locator(".jd-paper-chip").first.wait_for(state="visible")
        assert phone.locator(".jd-paper-chip").first.inner_text().startswith("✓")
        assert phone.locator(".jd-tags button", has_text="New drawer").is_visible()
        tools.tap()
        assert phone.locator(".menu-tools button", has_text="Paper drawer").get_attribute("aria-checked") == "true"
        phone.locator(".menu-tools button", has_text="Paper drawer").tap()
        phone.locator(".jd-paper-chip").first.wait_for(state="detached")
        # Drawing and Ask JotDrop from the menu open their windows.
        tools.tap()
        phone.locator(".menu-tools button", has_text="Drawing").tap()
        phone.locator(".jd-draw-overlay").wait_for()
        phone.locator(".jd-draw-overlay").evaluate("el => el.remove()")
        # Find duplicates from the menu opens its window too (and Close shuts it).
        tools.tap()
        phone.locator(".menu-tools button", has_text="Find duplicates").tap()
        phone.locator(".jd-ask-overlay[aria-label='Find duplicates']").wait_for()
        phone.locator(".jd-ask-overlay[aria-label='Find duplicates'] button", has_text="Close").tap()
        phone.locator(".jd-ask-overlay[aria-label='Find duplicates']").wait_for(state="detached")
        # The first card starts in the top 20% of an 800 px screen (it was ~49%, then ~31%, now one row of tools: ~13%).
        first = box(phone, ".note-card")["y"]
        assert first < 0.2 * 800, first
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

        # A phone on its side is wider than 600 px but low (about 360 px): the same "More" button, and the word, the count,
        # the search box, the notebooks and "More" all on one line (forum 51337: it was three rows next to the title).
        side = open_board(browser, 800, "mobile", height=360)
        assert side.locator(".jd-brand").is_visible()
        assert side.locator(".jd-tools-btn").is_visible()
        for hidden in ["Drawing", "Ask JotDrop", "Find duplicates", "Archive", "Paper drawer"]:
            assert not side.locator(".jd-filters button, .jd-tags button", has_text=hidden).first.is_visible(), hidden
        centres = [(lambda b: b["y"] + b["height"] / 2)(box(side, selector)) for selector in [".jd-word", ".jd-search", ".jd-folder", ".jd-tools-btn"]]
        assert max(centres) - min(centres) < 10, f"one row, centred: {centres}"
        side.context.close()

        # A wide window keeps the word, the count next to it and the plain search text; its chips are small as well.
        desktop = open_board(browser, 1100, "desktop")
        assert not desktop.locator(".jd-tools-btn").is_visible(), "no More button where every chip fits"
        assert desktop.locator(".jd-tags button", has_text="Paper drawer").is_visible()
        for shown in ["Archive", "Drawing", "Ask JotDrop", "Find duplicates"]:
            assert desktop.locator(".jd-filters button", has_text=shown).is_visible(), shown
        assert desktop.locator(".jd-brand").is_visible()
        assert desktop.locator(".jd-search").get_attribute("placeholder") == "Search your notes"
        for chip in [desktop.locator(".jd-filters button", has_text="Drawing"), desktop.locator(".jd-filters button", has_text="Ask JotDrop"), desktop.locator(".jd-filters button", has_text="Find duplicates")]:
            size = chip.bounding_box()
            assert size["width"] < 170 and size["height"] < 40, size
        # Narrowing the window moves the closed Paper drawer into the menu and widening it brings the chip back.
        desktop.set_viewport_size({"width": 393, "height": 800})
        desktop.locator(".jd-tools-btn").wait_for(state="visible")
        assert desktop.locator(".jd-tags button", has_text="Paper drawer").count() == 0
        desktop.set_viewport_size({"width": 1100, "height": 800})
        desktop.locator(".jd-tags button", has_text="Paper drawer").wait_for(state="visible")
        desktop.context.close()
        browser.close()
    print("PASS board-narrow-browser")


main()

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
      window.data = DATA; window.bodies = BODIES; window.posts = [];
      window.webviewApi = {
        onMessage(cb) {},
        async postMessage(m) {
          window.posts.push(m.type);
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
        page.jd_errors = errors
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
        # Two top rows (forum 51337, 18 Nov): search and the "More" button, and under them the notebooks on a row of their own;
        # Archive, Drawing, Ask JotDrop, Find duplicates and the Paper drawer are in the menu.
        for hidden in ["Drawing", "Ask JotDrop", "Find duplicates", "Archive", "Paper drawer"]:
            assert not phone.locator(".jd-filters button, .jd-tags button", has_text=hidden).first.is_visible(), hidden
        tools = phone.locator(".jd-tools-btn")
        assert tools.is_visible() and tools.get_attribute("aria-label") == "More" and tools.get_attribute("aria-haspopup") == "menu"
        rows = [box(phone, selector)["y"] for selector in [".jd-search", ".jd-tools-btn"]]
        assert max(rows) - min(rows) < 12, f"search and More should share a row: {rows}"
        search_box, folder_box = box(phone, ".jd-search"), box(phone, ".jd-folder")
        assert folder_box["y"] >= search_box["y"] + search_box["height"], f"the notebooks go under the search box: {search_box} {folder_box}"
        assert folder_box["width"] > 393 - 40, f"the notebooks take the whole row: {folder_box}"
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
        # A tap outside an open menu only closes it (forum 51337, 18 Nov): "More" closes its own menu, and a card under the
        # finger does not open. The same for a card's colour menu, and a drag with a menu open does nothing strange.
        def opens():
            return phone.evaluate("window.posts.filter((type) => type === 'open').length")
        tools.tap()
        phone.locator(".menu-tools").wait_for()
        tools.tap()
        phone.locator(".menu-tools").wait_for(state="detached")
        assert opens() == 0
        tools.tap()
        phone.locator(".menu-tools").wait_for()
        phone.locator(".note-card h3").first.tap()
        phone.locator(".menu-tools").wait_for(state="detached")
        assert opens() == 0, "a tap beside the menu must not open the note under it"
        phone.locator(".note-card h3").first.tap()
        phone.wait_for_function("window.posts.includes('open')")  # with no menu open a card still opens
        phone.evaluate("window.posts.length = 0")
        phone.locator(".note-card .card-actions button[aria-haspopup=menu]").first.tap()
        phone.locator(".card-menu").wait_for()
        phone.locator(".note-card h3").nth(1).tap()
        phone.locator(".card-menu").wait_for(state="detached")
        assert opens() == 0, "a tap beside the colour menu must not open a note either"
        tools.tap()
        phone.locator(".menu-tools").wait_for()
        card_box = box(phone, ".note-card")
        x, y = card_box["x"] + 30, card_box["y"] + card_box["height"] / 2
        def drag_card():
            phone.mouse.move(x, y)
            phone.mouse.down()
            phone.mouse.move(x, y + 300, steps=10)
            phone.mouse.up()
            phone.wait_for_timeout(200)
        phone.evaluate("window.posts.length = 0")
        drag_card()
        assert opens() == 0, "dragging a card with a menu open must not open it"
        assert phone.evaluate("window.posts.includes('setRanks')") is False, "a press outside an open menu must not pick the card up"
        assert not phone.jd_errors, phone.jd_errors
        # Without a menu the same drag still moves the card.
        if phone.locator(".menu-tools").count():
            phone.keyboard.press("Escape")
            phone.locator(".menu-tools").wait_for(state="detached")
        drag_card()
        assert phone.evaluate("window.posts.includes('setRanks')"), "the card drag itself still works"
        assert not phone.jd_errors, phone.jd_errors
        # The first card starts in the top 22% of an 800 px screen (it was ~49%, then ~31%, then one row of tools ~13%; the
        # notebooks on a row of their own, as mrjo118 asked, cost one more row).
        first = box(phone, ".note-card")["y"]
        assert first < 0.22 * 800, first
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

        # The placeholder fits in the search box with room to spare (forum 51337: its last letter was cut off), on the
        # narrowest and the widest phones, in English and Dutch, and with a count of five digits.
        def placeholder_room(page):
            return page.evaluate("""async () => {
              await document.fonts.ready;
              const el = document.querySelector('.jd-search');
              const style = getComputedStyle(el);
              const context = document.createElement('canvas').getContext('2d');
              context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
              const text = context.measureText(el.placeholder).width;
              const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
              return { text, room };
            }""")
        for width in [320, 360, 393, 412]:
            for locale in ["en", "nl"]:
                page = open_board(browser, width, "mobile", locale)
                page.evaluate("document.querySelector('.jd-search').placeholder = document.querySelector('.jd-search').placeholder.replace('54', '12345')")
                size = placeholder_room(page)
                assert size["text"] + 8 <= size["room"], f"placeholder cut off at {width} px ({locale}): {size}"
                page.context.close()

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

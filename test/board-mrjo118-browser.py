"""Run after npm run build: python test/board-mrjo118-browser.py. Synthetic Joplin bridge only.

Forum 51337, 20 Nov (mrjo118): the search, notebook and filters stay when you come back from a note; the clear cross of the
search box stays while it holds text; the tag row is one line with a +N button; a card shows at most four tags; a Joplin
to-do keeps its box; Joplin's own search language goes to Joplin; Find duplicates says which notebook a note is in; there is
no Drawing on a phone."""
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

BRIDGE = """
  window.data = DATA; window.bodies = BODIES; window.messages = [];
  window.webviewApi = {
    onMessage(cb) {},
    async postMessage(m) {
      window.messages.push(m);
      if (m.type === 'load') return data;
      if (m.type === 'previews') return m.ids.map(id => ({id, body:bodies[id], updated:1, files:[], image: id === 'n1' ? {id: 'img1', url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', drawing: true} : null}));
      if (m.type === 'search') return m.text.startsWith('title:') ? ['n3', 'n4'] : data.cards.filter(c=>bodies[c.id].includes(m.text)).map(c=>c.id);
      if (m.type === 'toggleTodo') { const c = data.cards.find(c => c.id === m.id); return {...c, done: m.done, preview: {id: c.id, body: bodies[c.id], updated: 1, files: []}}; }
      if (m.type === 'aiDuplicates') return {complete: true, aiOn: false, pairs: [{kind: 'same', score: 1, drop: 'n1', older: {id: 'n1', title: 'Same name', updatedAt: 1}, newer: {id: 'n2', title: 'Same name', updatedAt: 2}}]};
      return {};
    }
  };
"""


def main():
    bodies = {f"n{i}": f"Short note {i}" for i in range(12)}
    folders = [{"id": "w", "title": "Work"}, {"id": "p", "title": "Projects", "parent_id": "w"}, {"id": "h", "title": "Home"}]

    def card(i, **extra):
        base = {"id": f"n{i}", "title": f"Note {i}", "color": "default", "tags": [], "pinned": False, "archived": False, "updated": 1, "rank": 1000 - i, "folderId": "h"}
        base.update(extra)
        return base

    many = [f"tag{k}" for k in range(1, 7)]
    cards = [
        card(0, tags=many),
        card(1, folderId="p"),
        card(2, folderId="w"),
        card(3),
        card(4),
        card(5, isTodo=True, done=False),
        card(6, isTodo=True, done=True),
        card(7, isTodo=True, done=False, madeTodo=True),
    ]
    bridge = BRIDGE.replace("BODIES", json.dumps(bodies))

    def serve(route):
        path = urlparse(route.request.url).path
        if path == "/":
            route.fulfill(content_type="text/html; charset=utf-8", body='<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dist/board.css"></head><body><div id="jotdrop-root"></div><script src="/dist/board.js"></script></body></html>')
        else:
            file = (ROOT / path.lstrip("/")).resolve()
            assert file.is_relative_to(ROOT)
            route.fulfill(path=str(file), content_type=(mimetypes.guess_type(str(file))[0] or "application/octet-stream") + "; charset=utf-8")

    def open_board(browser, width, view=None, board_cards=cards, platform="mobile"):
        data = {"locale": "en", "platform": platform, "cards": board_cards, "folders": folders, "boardFolder": "h", "drawers": [], "scroll": None, "view": view}
        context = browser.new_context(viewport={"width": width, "height": 800}, has_touch=width < 600)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("http://jotdrop.test/**", serve)
        page.add_init_script(bridge.replace("DATA", json.dumps(data)))
        page.goto("http://jotdrop.test/", wait_until="networkidle")
        page.locator(".note-card").first.wait_for()
        assert not errors, errors
        page.jd_errors = errors
        return page

    def titles(page):
        return [text.strip() for text in page.locator(".note-card h3").all_inner_texts()]

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")

        # --- The clear cross stays while the box holds text, focus or not.
        page = open_board(browser, 393)
        assert not page.locator(".jd-search-clear").is_visible(), "no cross on an empty box"
        page.locator(".jd-search").fill("Short")
        assert page.locator(".jd-search-clear").is_visible()
        page.locator(".jd-folder").focus()  # focus leaves the box
        assert not page.evaluate("document.activeElement === document.querySelector('.jd-search')")
        assert page.locator(".jd-search-clear").is_visible(), "the cross must stay without focus"
        assert page.locator(".jd-search-clear").get_attribute("aria-label") == "Clear search"
        assert page.locator(".jd-search-clear").inner_text() == "×"
        cross, field = page.locator(".jd-search-clear").bounding_box(), page.locator(".jd-search").bounding_box()
        assert cross["x"] >= field["x"] and cross["x"] + cross["width"] <= field["x"] + field["width"], (cross, field)
        assert cross["width"] >= 28 and cross["height"] >= 28, cross
        page.locator(".jd-search-clear").tap()
        assert page.locator(".jd-search").input_value() == ""
        assert not page.locator(".jd-search-clear").is_visible()
        assert len(titles(page)) == 8, titles(page)

        # --- Coming back from a note: the search, notebook, tag and archive filters are as they were.
        page = open_board(browser, 393, view={"query": "Short", "folderId": "h", "tag": "tag2", "paper": "", "archive": False})
        assert page.locator(".jd-search").input_value() == "Short"
        assert page.locator(".jd-search-clear").is_visible()
        assert page.locator(".jd-folder").input_value() == "h"
        assert titles(page) == ["Note 0"], titles(page)
        assert page.locator(".jd-tags button[aria-pressed=true]").inner_text().strip() == "✓ #tag2"
        # A notebook that is gone is dropped, not applied as an empty board.
        page = open_board(browser, 393, view={"query": "", "folderId": "gone", "tag": "", "paper": "", "archive": False})
        assert len(titles(page)) == 8, titles(page)
        # Opening a card hands the filters to the plugin, with the scroll place.
        page = open_board(browser, 393)
        page.locator(".jd-search").fill("Short")
        page.locator(".jd-folder").select_option("h")
        page.locator(".note-card h3").first.tap()
        page.wait_for_function("window.messages.some((m) => m.type === 'open')")
        sent = page.evaluate("window.messages.find((m) => m.type === 'open')")
        assert sent["view"] == {"query": "Short", "folderId": "h", "tag": "", "paper": "", "archive": False}, sent
        assert "y" in sent and "top" in sent

        # --- The tag row is one line with a +N button, and many tags no longer fill the top (393 px).
        many_tags = [card(i, tags=[f"topic{i}-{k}" for k in range(3)]) for i in range(8)]
        page = open_board(browser, 393, board_cards=many_tags)
        row = page.locator(".jd-tags-list").bounding_box()
        chip = page.locator(".jd-tags-list .jd-chip").first.bounding_box()
        assert row["height"] <= chip["height"] + 2, f"one line: {row} {chip}"
        toggle = page.locator(".jd-tags-toggle")
        assert toggle.is_visible() and toggle.inner_text().startswith("+"), toggle.inner_text()
        count = int(toggle.inner_text()[1:])
        clipped = page.locator(".jd-tags-list .is-clipped").count()
        assert count == clipped and count > 0, (count, clipped)
        assert toggle.get_attribute("aria-expanded") == "false"
        assert page.locator(".jd-tags-list .is-clipped").first.evaluate("el => getComputedStyle(el).visibility") == "hidden"
        # Every chip that stays in view fits whole.
        for kept in page.locator(".jd-tags-list .jd-chip:not(.is-clipped)").all():
            b = kept.bounding_box()
            assert b["x"] + b["width"] <= row["x"] + row["width"] + 1, (b, row)
        toggle.tap()
        assert page.locator(".jd-tags-toggle").inner_text() == "Less"
        assert page.locator(".jd-tags-toggle").get_attribute("aria-expanded") == "true"
        assert page.locator(".jd-tags-list").bounding_box()["height"] > row["height"] * 2
        assert page.locator(".jd-tags-list .is-clipped").count() == 0
        page.locator(".jd-tags-toggle").tap()
        assert page.locator(".jd-tags-list").bounding_box()["height"] <= chip["height"] + 2, "closed again"
        assert page.locator(".jd-tags-toggle").inner_text() == f"+{count}"
        # A row that fits shows no button.
        page = open_board(browser, 393, board_cards=[card(0, tags=["a"]), card(1)])
        assert not page.locator(".jd-tags-toggle").is_visible()
        # A wide window shows more on its one line.
        wide = open_board(browser, 1200, board_cards=many_tags, platform="desktop")
        assert not wide.locator(".jd-tags-toggle").is_visible() or int(wide.locator(".jd-tags-toggle").inner_text()[1:]) < count, "a wide window fits more tags"
        # The chosen tag always stays in view on the one line, so the filter that is on is never hidden behind the +N.
        page = open_board(browser, 393, board_cards=many_tags)
        page.locator(".jd-tags-list .jd-chip", has_text="#topic3-2").evaluate("el => el.click()")
        pressed = page.locator(".jd-tags-list .jd-chip[aria-pressed=true]")
        assert pressed.inner_text().strip() == "✓ #topic3-2"
        assert pressed.evaluate("el => getComputedStyle(el).visibility") == "visible" and pressed.is_visible()
        assert titles(page) == ["Note 3"], titles(page)

        # --- A card shows at most four tags, then +N (like the website and the Obsidian plugin).
        page = open_board(browser, 393)
        first = page.locator(".note-card").first
        assert first.locator(".jd-tagchip:not(.jd-tagmore)").count() == 4
        more = first.locator(".jd-tagmore")
        assert more.inner_text() == "+2" and more.get_attribute("title") == "#tag5 #tag6"
        assert "#tag5" in more.get_attribute("aria-label")

        # --- A Joplin to-do keeps its box; a note that only got a reminder stays plain.
        todo = page.locator(".note-card", has_text="Note 5")
        box_el = todo.locator(".jd-todo-head .jd-check")
        assert box_el.inner_text() == "☐" and box_el.get_attribute("aria-checked") == "false"
        box_el.tap()
        page.wait_for_function("window.messages.some((m) => m.type === 'toggleTodo')")
        sent = page.evaluate("window.messages.find((m) => m.type === 'toggleTodo')")
        assert sent["id"] == "n5" and sent["done"] is True, sent
        done = page.locator(".note-card", has_text="Note 6")
        assert done.locator(".jd-todo-head").evaluate("el => el.classList.contains('is-done')")
        assert done.locator(".jd-check").inner_text() == "☑" and done.locator(".jd-check").get_attribute("aria-checked") == "true"
        assert done.locator("h3").evaluate("el => getComputedStyle(el).textDecorationLine") == "line-through"
        assert page.locator(".note-card", has_text="Note 7").locator(".jd-todo-head").count() == 0, "a reminder-only note is no to-do card"
        assert "open" not in [m["type"] for m in page.evaluate("window.messages")], "the box must not open the note"

        # --- Joplin's own search language is answered by Joplin alone; plain words still match on the board.
        page.locator(".jd-search").fill("title:note")
        page.wait_for_function("window.messages.some((m) => m.type === 'search' && m.text === 'title:note')")
        page.wait_for_function("document.querySelectorAll('.note-card').length === 2")
        assert titles(page) == ["Note 3", "Note 4"], titles(page)
        page.locator(".jd-search").fill("Note 5")
        page.wait_for_function("document.querySelectorAll('.note-card').length === 1")
        assert titles(page)[-1].startswith("Note 5"), titles(page)

        # --- Find duplicates names the notebook, with its parents.
        page.evaluate("document.querySelector('.jd-search-clear').click()")
        page.locator(".jd-tools-btn").tap()
        page.locator(".menu-tools button", has_text="Find duplicates").tap()
        page.locator(".jd-dup-item").wait_for()
        lines = page.locator(".jd-dup-item p").all_inner_texts()
        assert lines[0].startswith('Older: "Same name", in Work › Projects, edited'), lines
        assert lines[1].startswith('Newer: "Same name", in Work, edited'), lines
        assert not page.evaluate("window.messages.some((m) => m.type === 'open')")

        # --- Drawing: on the desktop the window opens and a drawing card has its pencil; on a phone there is no Drawing at all
        # (nothing could be saved there, and Joplin has its own Draw picture).
        desk = open_board(browser, 1200, platform="desktop")
        desk.locator(".note-card .jd-draw-edit").wait_for(state="attached")
        assert desk.locator(".note-card .jd-draw-edit").count() == 1, "the pencil of a drawing card (desktop)"
        desk.locator(".jd-filters .jd-tool", has_text="Drawing").click()
        desk.locator(".jd-draw-overlay").wait_for()
        for width in (393, 1200):
            phone = open_board(browser, width, platform="mobile")
            phone.wait_for_timeout(300)
            assert phone.locator(".jd-filters button", has_text="Drawing").count() == 0, f"no Drawing chip on a phone ({width})"
            assert phone.locator(".note-card .jd-draw-edit").count() == 0, f"no pencil on a phone ({width})"
            if phone.locator(".jd-tools-btn").is_visible():
                phone.locator(".jd-tools-btn").evaluate("el => el.click()")
                phone.locator(".menu-tools").wait_for()
                assert phone.locator(".menu-tools button", has_text="Drawing").count() == 0, f"no Drawing in the menu ({width})"

        browser.close()
    print("PASS board-mrjo118-browser")


main()

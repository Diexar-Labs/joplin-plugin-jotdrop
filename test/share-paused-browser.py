"""Run after npm run build: python test/share-paused-browser.py. Synthetic Joplin bridge only.

Sync on hold (the server answers 403 device-paused): the share menu of a card shows the text the plugin sends instead of
the form, and a menu that only has the text does not break the list of links. A connected cloud still gets the form."""
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAUSED = "This Joplin is on hold: your JotDrop plan syncs fewer devices than you use, and this is not one of them."

BRIDGE = """
  window.data = DATA; window.messages = [];
  window.webviewApi = {
    onMessage(cb) {},
    async postMessage(m) {
      window.messages.push(m);
      if (m.type === 'load') return data;
      if (m.type === 'previews') return m.ids.map(id => ({id, body: 'Short note', updated: 1, files: [], image: null}));
      if (m.type === 'shareInfo') return SHARE;
      return {};
    }
  };
"""


def main():
    card = {"id": "n1", "title": "Note 1", "color": "default", "tags": [], "pinned": False, "archived": False, "updated": 1, "rank": 1000, "folderId": "h"}

    def serve(route):
        path = urlparse(route.request.url).path
        if path == "/":
            route.fulfill(content_type="text/html; charset=utf-8", body='<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dist/board.css"></head><body><div id="jotdrop-root"></div><script src="/dist/board.js"></script></body></html>')
        else:
            file = (ROOT / path.lstrip("/")).resolve()
            assert file.is_relative_to(ROOT)
            route.fulfill(path=str(file), content_type=(mimetypes.guess_type(str(file))[0] or "application/octet-stream") + "; charset=utf-8")

    def open_board(browser, share):
        data = {"locale": "en", "platform": "desktop", "cards": [card], "folders": [{"id": "h", "title": "Home"}], "boardFolder": "h", "drawers": [], "scroll": None, "view": None}
        page = browser.new_context(viewport={"width": 900, "height": 800}).new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("http://jotdrop.test/**", serve)
        page.add_init_script(BRIDGE.replace("DATA", json.dumps(data)).replace("SHARE", json.dumps(share)))
        page.goto("http://jotdrop.test/", wait_until="networkidle")
        page.locator(".note-card").first.wait_for()
        page.errors = errors
        return page

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")

        # On hold: the text, no form.
        page = open_board(browser, {"connected": True, "problem": PAUSED, "links": [], "lists": []})
        page.locator(".note-card .jd-act[aria-label='Share by link']").first.evaluate("el => el.click()")
        page.locator(".menu-share").wait_for()
        assert page.locator(".menu-share .menu-note").inner_text() == PAUSED, page.locator(".menu-share").inner_text()
        assert page.locator(".menu-share select").count() == 0 and page.locator(".menu-share button").count() == 0, "no form on hold"
        assert not page.errors, page.errors

        # Not connected: still the old way, a note and the button to connect.
        page = open_board(browser, {"connected": False})
        page.locator(".note-card .jd-act[aria-label='Share by link']").first.evaluate("el => el.click()")
        page.locator(".menu-share").wait_for()
        assert page.locator(".menu-share button.menu-set").count() == 1, page.locator(".menu-share").inner_text()
        assert not page.errors, page.errors

        browser.close()
    print("PASS share-paused-browser")


main()

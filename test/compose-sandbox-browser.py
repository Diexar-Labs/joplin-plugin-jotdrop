"""Run after npm run build: python test/compose-sandbox-browser.py. Synthetic Joplin bridge only.

Forum 51337 #52, 24 Nov (mrjo118), Joplin's web app in Chrome on Windows:
1. "Take a note": the Close button did nothing, so the note could not be saved. Joplin's web app shows a plugin panel in an
   iframe with sandbox="allow-scripts allow-modals allow-popups allow-popups-to-escape-sandbox" (packages/app-mobile/
   components/ExtendedWebView/index.web.tsx). Without allow-forms the browser blocks a form submission, so a submit button
   never reaches the submit handler. This test loads the board in such an iframe.
2. With the paper drawer open, the drawer's panel is as wide as "Take a note"."""
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SANDBOX = "allow-scripts allow-modals allow-popups allow-popups-to-escape-sandbox"

BRIDGE = """
  window.data = DATA; window.messages = [];
  window.webviewApi = { onMessage(cb) {}, async postMessage(m) {
    window.messages.push(m);
    if (m.type === 'load') return data;
    if (m.type === 'previews') return m.ids.map(id => ({id, body: 'sdf', updated: 1, files: [], image: null}));
    if (m.type === 'search') return [];
    if (m.type === 'create') return {id: 'n2', title: m.title, color: 'default', tags: [], pinned: false, archived: false, updated: 2,
      rank: 2000, folderId: 'h', preview: {id: 'n2', body: m.body, updated: 2, files: [], image: null}};
    return {};
  } };
"""

BOARD_HTML = ('<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
              '<link rel="stylesheet" href="http://jotdrop.test/dist/board.css"></head><body><div id="jotdrop-root"></div>'
              '<script src="http://jotdrop.test/dist/board.js"></script></body></html>')

WIDTHS = """() => {
  const outer = (s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().width : null; };
  return {compose: outer('.jd-compose'), intro: outer('.jd-paper-intro')};
}"""


def main():
    cards = [{"id": "n1", "title": "sdf", "color": "default", "tags": [], "pinned": False, "archived": False, "updated": 1, "rank": 1000, "folderId": "h"}]
    data = {"locale": "en", "platform": "mobile", "cards": cards, "folders": [{"id": "h", "title": "JotDrop"}], "boardFolder": "h",
            "drawers": [], "scroll": None, "view": None}

    def serve(route):
        path = urlparse(route.request.url).path
        if path == "/":
            route.fulfill(content_type="text/html; charset=utf-8",
                          body=f'<html><body style="margin:0"><iframe sandbox="{SANDBOX}" src="/board.html" style="border:0;width:100vw;height:100vh"></iframe></body></html>')
        elif path == "/board.html":
            route.fulfill(content_type="text/html; charset=utf-8", body=BOARD_HTML)
        else:
            file = (ROOT / path.lstrip("/")).resolve()
            assert file.is_relative_to(ROOT)
            route.fulfill(path=str(file), content_type=(mimetypes.guess_type(str(file))[0] or "application/octet-stream") + "; charset=utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_context(viewport={"width": 1304, "height": 800}).new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("http://jotdrop.test/**", serve)
        page.add_init_script(BRIDGE.replace("DATA", json.dumps(data)))
        page.goto("http://jotdrop.test/", wait_until="networkidle")
        board = page.frame_locator("iframe")
        board.locator(".note-card").first.wait_for()
        frame = page.frames[1]
        assert frame.evaluate("() => !!window.webviewApi"), "the bridge is not in the sandboxed frame"

        # 1. Type a note in the sandboxed frame and press Close: it is saved, the box closes and empties.
        board.locator(".jd-c-body").click()
        board.locator(".jd-c-title").fill("From the web app")
        board.locator(".jd-c-body").fill("Saved with the Close button")
        board.locator(".jd-c-save").click()
        page.wait_for_timeout(500)
        created = [m for m in frame.evaluate("() => window.messages") if m.get("type") == "create"]
        assert created, "Close in a sandboxed frame did not save the note (no create message)"
        assert created[0]["title"] == "From the web app" and created[0]["body"] == "Saved with the Close button", created[0]
        assert len(created) == 1, f"the note was saved {len(created)} times"
        assert board.locator(".jd-c-body").input_value() == "", "the box still holds the text after saving"
        assert not frame.evaluate("() => document.querySelector('.jd-compose').classList.contains('is-open')"), "the box stays open"

        # An empty box closes with Close and saves nothing.
        board.locator(".jd-c-body").click()
        board.locator(".jd-c-save").click()
        page.wait_for_timeout(300)
        assert not frame.evaluate("() => document.querySelector('.jd-compose').classList.contains('is-open')"), "an empty box does not close"
        assert len([m for m in frame.evaluate("() => window.messages") if m.get("type") == "create"]) == 1, "an empty box saved a note"

        # 2. The paper drawer's panel is as wide as "Take a note", as a full intro and as a tip.
        board.locator(".jd-paper-chip").first.click()
        page.wait_for_timeout(400)
        w = frame.evaluate(WIDTHS)
        assert w["intro"], "the paper drawer shows no panel"
        assert abs(w["intro"] - w["compose"]) < 1, f"the paper drawer's panel is {w['intro']:.0f}px wide, Take a note {w['compose']:.0f}px"
        frame.evaluate("() => { const s = document.createElement('section'); s.className = 'jd-paper-intro is-tip'; s.id = 'tip-probe';"
                       " document.querySelector('.jd-compose').after(s); }")
        tip = frame.evaluate("() => document.getElementById('tip-probe').getBoundingClientRect().width")
        assert abs(tip - w["compose"]) < 1, f"the paper drawer's tip is {tip:.0f}px wide, Take a note {w['compose']:.0f}px"
        assert not errors, errors
        browser.close()
    print("compose in a sandboxed frame and the paper drawer's width (forum 51337 #52): ok")


main()

"""Run after npm run build: python test/undo-toast-browser.py. Synthetic Joplin bridge only.

Forum 51337 (mrjo118, 19 Nov): pin, unpin, archive and unarchive are one tap and easy to hit by accident, so their toast
offers Undo (which sets the old value back, and says "Undone" without a second Undo). And a size dragged on the "take a
note" box must not keep a closed, empty box tall: it is one line again after Close, and the size comes back when the box
opens."""
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

BRIDGE = """
  window.data = DATA; window.posts = [];
  window.webviewApi = {
    onMessage(cb) {},
    async postMessage(m) {
      window.posts.push(m);
      if (m.type === 'load') return JSON.parse(JSON.stringify(data));  // a copy: the board must not share objects with this bridge
      if (m.type === 'previews') return m.ids.map(id => ({id, body: 'Short note', updated: 1, files: []}));
      if (m.type === 'search') return [];
      if (m.type === 'setPinned' || m.type === 'setArchived') {
        const card = data.cards.find(c => c.id === m.id);
        if (m.type === 'setPinned') card.pinned = m.pinned; else card.archived = m.archived;
        return Object.assign({}, card, {preview: {id: card.id, body: 'Short note', updated: 1, files: []}});
      }
      return {};
    }
  };
"""


def serve(route):
    path = urlparse(route.request.url).path
    if path == "/":
        route.fulfill(content_type="text/html; charset=utf-8", body='<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dist/board.css"></head><body><div id="jotdrop-root"></div><script src="/dist/board.js"></script></body></html>')
    else:
        file = (ROOT / path.lstrip("/")).resolve()
        assert file.is_relative_to(ROOT)
        route.fulfill(path=str(file), content_type=(mimetypes.guess_type(str(file))[0] or "application/octet-stream") + "; charset=utf-8")


def main():
    cards = [{"id": f"n{i}", "title": f"Note {i}", "color": "default", "tags": [], "pinned": False, "archived": False, "updated": 1, "rank": 1000 - i, "folderId": "f"} for i in range(3)]
    data = {"locale": "en", "platform": "desktop", "cards": cards, "folders": [{"id": "f", "title": "Synthetic"}], "boardFolder": "f", "drawers": [], "scroll": None}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_context(viewport={"width": 1280, "height": 900}).new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("http://jotdrop.test/**", serve)
        page.add_init_script(BRIDGE.replace("DATA", json.dumps(data)))
        page.goto("http://jotdrop.test/", wait_until="networkidle")
        page.locator(".note-card").first.wait_for()

        toast = page.locator(".jd-toast")
        undo = page.locator(".jd-toast-undo")
        sent = lambda kind: [m for m in page.evaluate("window.posts") if m["type"] == kind]

        def card(title):
            return page.locator(".note-card").filter(has=page.locator("h3", has_text=title)).first

        # Pin: a toast with Undo (pinning had no toast before), and Undo puts it back.
        card("Note 0").hover()
        card("Note 0").locator(".card-pin").click()
        toast.filter(has_text="Note pinned").wait_for()
        assert "is-shown" in toast.get_attribute("class") and undo.is_visible() and undo.inner_text() == "Undo"
        assert sent("setPinned")[-1]["pinned"] is True
        undo.click()
        toast.filter(has_text="Undone").wait_for()
        assert [m["pinned"] for m in sent("setPinned")] == [True, False], sent("setPinned")
        assert undo.count() == 0, "the toast that says Undone has no Undo of its own"
        assert card("Note 0").locator(".card-pin").get_attribute("aria-pressed") == "false"

        # Unpin: the same, the other way round.
        card("Note 1").hover()
        card("Note 1").locator(".card-pin").click()
        toast.filter(has_text="Note pinned").wait_for()
        card("Note 1").hover()
        card("Note 1").locator(".card-pin").click()
        toast.filter(has_text="Note unpinned").wait_for()
        undo.click()
        toast.filter(has_text="Undone").wait_for()
        assert [m["pinned"] for m in sent("setPinned")][-3:] == [True, False, True], sent("setPinned")
        assert card("Note 1").locator(".card-pin").get_attribute("aria-pressed") == "true", "Undo of an unpin pins it again"

        # Archive: gone from the board, and Undo brings it back.
        card("Note 2").hover()
        card("Note 2").get_by_role("button", name="Archive").click()
        toast.filter(has_text="Note archived").wait_for()
        card("Note 2").wait_for(state="detached", timeout=3000)  # an archived note leaves the board
        undo.click()
        toast.filter(has_text="Undone").wait_for()
        card("Note 2").wait_for()
        assert sent("setArchived")[-2]["archived"] is True and sent("setArchived")[-1]["archived"] is False, sent("setArchived")

        # Unarchive: from the archive view, Undo archives it again.
        card("Note 2").hover()
        card("Note 2").get_by_role("button", name="Archive").click()
        toast.filter(has_text="Note archived").wait_for()
        page.locator(".jd-archive").click()
        card("Note 2").wait_for()
        card("Note 2").hover()
        card("Note 2").get_by_role("button", name="Back to the board").click()
        toast.filter(has_text="Note back on the board").wait_for()
        undo.click()
        toast.filter(has_text="Undone").wait_for()
        assert sent("setArchived")[-1]["archived"] is True, sent("setArchived")
        page.locator(".jd-archive").click()

        # The toast stays long enough for a thumb, and a hidden toast takes no taps.
        card("Note 0").hover()
        card("Note 0").locator(".card-pin").click()
        toast.filter(has_text="Note pinned").wait_for()
        page.wait_for_timeout(3800)
        assert "is-shown" in toast.get_attribute("class") and undo.is_visible(), "an Undo toast outlasts the plain 3.5 seconds"
        page.wait_for_function("() => !document.querySelector('.jd-toast').classList.contains('is-shown')", timeout=6000)
        assert page.evaluate("getComputedStyle(document.querySelector('.jd-toast-undo')).pointerEvents") == "none", "a hidden Undo cannot be tapped"

        # The note box: a dragged size does not keep a closed box tall; it comes back when the box opens.
        compose = page.locator(".jd-compose")
        body = page.locator(".jd-c-body")
        closed = compose.bounding_box()["height"]
        body.click()
        page.wait_for_function("() => document.querySelector('.jd-compose').classList.contains('is-open')")
        page.evaluate("document.querySelector('.jd-c-body').style.height = '240px'")  # what the drag handle sets
        page.locator(".jd-c-save").click()
        page.wait_for_function("() => !document.querySelector('.jd-compose').classList.contains('is-open')")
        assert body.evaluate("el => el.style.height") == "", "Close clears the dragged height"
        assert abs(compose.bounding_box()["height"] - closed) < 2, (compose.bounding_box(), closed)
        body.click()
        page.wait_for_function("() => document.querySelector('.jd-compose').classList.contains('is-open')")
        assert body.evaluate("el => el.style.height") == "240px", "the size comes back when the box opens"
        page.locator(".jd-c-title").click()
        assert body.evaluate("el => el.style.height") == "240px", "moving to the title does not reset it"
        page.keyboard.press("Escape")
        assert body.evaluate("el => el.style.height") == "", "Escape closes the box in one line too"

        assert not errors, errors
        browser.close()
    print("undo-toast-browser: ok")


if __name__ == "__main__":
    main()

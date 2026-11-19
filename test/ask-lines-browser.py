"""Run after npm run build: python test/ask-lines-browser.py. Synthetic Joplin bridge only, no AI service.

Ask JotDrop on the board, two honest details: "This week" sends a digest, so the "Sent to" line says "a digest of 7 notes"
(an ordinary question still says "7 notes"); after a Merge with AI that was applied the merged text is in the newer note,
so "Save as a new note" is gone, and after a merge the user did not apply it stays."""
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

SETTINGS = {"provider": "anthropic", "model": "", "baseUrl": "", "includeShared": False,
            "providers": [{"id": "anthropic", "name": "Anthropic (Claude)", "defaultModel": "claude-test"}]}
BRIDGE = """
  window.data = DATA; window.posts = []; window.applyMerge = true;
  const notes = [1, 2].map(i => ({id: 'n' + i, title: 'Tuin ' + i}));
  const result = (extra) => Object.assign({problem: '', answer: 'Done.', actions: [], first: 2, also: [], files: [], sources: [], stop: 'done',
    nothingSent: false, failed: false, service: 'Anthropic (Claude)', model: 'claude-test', usage: {input: 5, output: 5, seconds: 0}, local: false, receipt: null}, extra);
  window.webviewApi = {
    onMessage(cb) {},
    async postMessage(m) {
      window.posts.push(m);
      if (m.type === 'load') return data;
      if (m.type === 'previews') return m.ids.map(id => ({id, body: 'x', updated: 1, files: []}));
      if (m.type === 'search') return [];
      if (m.type === 'aiSettings') return SETTINGS;
      if (m.type === 'aiFiles') return {files: [], drawers: [], drawer: '', request: ''};
      if (m.type === 'aiWeek' || m.type === 'aiPreview') return {notes};
      if (m.type === 'aiDuplicates') return {complete: true, aiOn: true, pairs: [{kind: 'same', score: 1, drop: 'n1',
        older: {id: 'n1', title: 'Tuin 1', updatedAt: 1}, newer: {id: 'n2', title: 'Tuin 2', updatedAt: 2}}]};
      if (m.type === 'aiAsk') {
        if (m.mode === 'merge') return result({answer: 'I have updated the newer note.', actions: window.applyMerge ? [{tool: 'replace_note_text', status: 'done', id: 'n2', title: 'Tuin 2'}] : [{tool: 'replace_note_text', status: 'declined', id: 'n2', title: 'Tuin 2'}]});
        return result({answer: m.mode === 'digest' ? 'Your week.' : 'An answer.'});
      }
      return {};
    }
  };
""".replace("SETTINGS", json.dumps(SETTINGS))


def serve(route):
    path = urlparse(route.request.url).path
    if path == "/":
        route.fulfill(content_type="text/html; charset=utf-8", body='<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dist/board.css"></head><body><div id="jotdrop-root"></div><script src="/dist/board.js"></script></body></html>')
    else:
        file = (ROOT / path.lstrip("/")).resolve()
        assert file.is_relative_to(ROOT)
        route.fulfill(path=str(file), content_type=(mimetypes.guess_type(str(file))[0] or "application/octet-stream") + "; charset=utf-8")


def main():
    cards = [{"id": f"n{i}", "title": f"Tuin {i}", "color": "default", "tags": [], "pinned": False, "archived": False, "updated": 1, "rank": 1000 - i, "folderId": "f"} for i in (1, 2)]
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

        def also():
            page.locator(".jd-ask-result").wait_for(state="visible")
            return page.locator(".jd-ask-result .jd-ask-note").first.inner_text()

        buttons = lambda: page.locator(".jd-ask-result .jd-ask-buttons button").all_inner_texts()

        # An ordinary question names the notes.
        page.locator(".jd-ask-chip").click()
        page.locator(".jd-ask-request").fill("What is in my garden notes?")
        page.locator(".jd-ask-primary", has_text="Send").click()
        line = also()
        assert line == "Sent to Anthropic (Claude): your question and 2 notes.", line
        assert "Save as a new note" in buttons(), buttons()
        page.get_by_role("button", name="Close").click()

        # This week sends a digest, and the line says so.
        page.locator(".jd-ask-chip").click()
        page.get_by_role("button", name="This week").click()
        page.locator(".jd-ask-primary", has_text="Send").click()
        line = also()
        assert line == "Sent to Anthropic (Claude): your question and a digest of 2 notes.", line
        assert "Save as a new note" in buttons(), "the week's overview can still be saved"
        page.get_by_role("button", name="Close").click()

        # A merge that was applied: the merged text is in the newer note, nothing is left to save.
        def merge(applied):
            page.evaluate(f"window.applyMerge = {str(applied).lower()}")
            page.locator(".jd-dup-chip").click()
            page.get_by_role("button", name="Merge with AI…").click()
            page.locator(".jd-ask-primary", has_text="Send").click()
            also()

        merge(True)
        assert "Save as a new note" not in buttons() and "Report" in buttons(), buttons()
        assert page.locator(".jd-ask-actions li", has_text='The older note "Tuin 1" is still there.').count() == 1
        page.get_by_role("button", name="Close").click()

        # A merge the user did not apply: the AI's answer can still be saved, named after the note.
        merge(False)
        assert "Save as a new note" in buttons(), buttons()
        assert page.locator(".jd-ask-actions li", has_text="is still there").count() == 0
        page.get_by_role("button", name="Save as a new note").click()
        page.locator(".jd-ask-status", has_text='Saved as the note "Merged text of Tuin 2".').wait_for()
        assert any(m.get("type") == "create" and m.get("title") == "Merged text of Tuin 2" for m in page.evaluate("window.posts")), "saved under the merge title"

        assert not errors, errors
        browser.close()
    print("ask-lines-browser: ok")


if __name__ == "__main__":
    main()

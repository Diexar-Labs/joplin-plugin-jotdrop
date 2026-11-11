"""Run after npm run build: python test/preview-browser.py. Synthetic Joplin bridge only."""
import json
import mimetypes
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main():
    bodies = {f"n{count}": "\n".join(f"- [ ] task {i + 1}" for i in range(count)) or "Plain text" for count in [0, 1, 5, 10, 11, 12, 100]}
    bodies["checked"] = "\n".join(f"- [{'x' if i % 2 else ' '}] chk {i + 1}" for i in range(15))
    bodies["mixed"] = "Some tips first.\n\n- [ ] MA\n- [x] MB"
    bodies["tagged"] = "- [ ] milk\n- [ ] bread\n\n#groceries"
    bodies["article"] = "Long article sentence. " * 300 + "\n- [ ] A\n- [x] B\n- [ ] C"
    # Attached files other than photos and sounds: up to three chips with name and size, then "+ N files".
    bodies["files"] = "Quote for the roof"
    bodies["onefile"] = ""
    pdf = {"id": "f" * 32, "name": "Offer for the new roof with a very long file name.pdf", "kind": "pdf", "size": 2 * 1048576 + 5}
    files = {"files": [pdf, {"id": "1" * 32, "name": "budget.xlsx", "kind": "file", "size": 3000}, {"id": "2" * 32, "name": "walk.mp4", "kind": "video", "size": 0},
                       {"id": "3" * 32, "name": "a.zip", "kind": "file", "size": 1}, {"id": "4" * 32, "name": "b.txt", "kind": "file", "size": 1}],
             "onefile": [{"id": "5" * 32, "name": "scan.pdf", "kind": "pdf", "size": 40000}]}
    cards = [{"id": key, "title": key, "color": "default", "tags": [], "pinned": False, "archived": False, "updated": 1, "rank": 1000 - i, "folderId": "f"} for i, key in enumerate(bodies)]
    bridge = """
      window.data = DATA; window.bodies = BODIES; window.messages = [];
      const preview = id => ({id, body:bodies[id], updated:data.cards.find(c=>c.id===id).updated, files:FILES[id]||[]});
      window.webviewApi = {
        onMessage(cb) { window.changed = () => cb({message:{type:'changed'}}); },
        async postMessage(m) {
          messages.push(m);
          if (m.type === 'load') return data;
          if (m.type === 'previews') return m.ids.map(preview);
          if (m.type === 'search') return data.cards.filter(c=>bodies[c.id].includes(m.text)).map(c=>c.id);
          if (m.type === 'toggleTask') {
            const lines = bodies[m.id].split('\\n');
            lines[m.line] = lines[m.line].replace(/\\[[ xX]\\]/, m.checked ? '[x]' : '[ ]');
            bodies[m.id] = lines.join('\\n');
            const c = data.cards.find(c=>c.id===m.id); c.updated++;
            return {...c, preview:preview(c.id)};
          }
          return {};
        }
      };
    """.replace("DATA", json.dumps({"locale": "en", "platform": "desktop", "cards": cards, "folders": [{"id": "f", "title": "Synthetic"}], "boardFolder": "f"})).replace("BODIES", json.dumps(bodies)).replace("FILES", json.dumps(files))
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 1200, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def serve(route):
            path = urlparse(route.request.url).path
            if path == "/":
                route.fulfill(content_type="text/html; charset=utf-8", body='<html><head><meta charset="utf-8"><link rel="stylesheet" href="/dist/board.css"></head><body><div id="jotdrop-root"></div><script src="/dist/board.js"></script></body></html>')
            else:
                file = (ROOT / path.lstrip("/")).resolve()
                assert file.is_relative_to(ROOT)
                route.fulfill(path=str(file), content_type=(mimetypes.guess_type(str(file))[0] or "application/octet-stream") + "; charset=utf-8")

        page.route("http://jotdrop.test/**", serve)
        page.add_init_script(bridge)
        page.goto("http://jotdrop.test/", wait_until="networkidle")
        page.locator('.note-preview[data-visible-tasks="10"]').first.wait_for()

        def state(card):
            preview = card.locator(".note-preview")
            return {k: preview.get_attribute(f"data-{k}") for k in ["mode", "visible-tasks", "hidden-tasks", "checked-tasks"]}

        # Like Keep: up to 10 open tasks at once, no More/Less, the rest behind "Open note - N more tasks".
        for count in [1, 5, 10, 11, 12, 100]:
            card = page.locator(f'[data-id="n{count}"]')
            assert state(card) == {"mode": "checklist", "visible-tasks": str(min(10, count)), "hidden-tasks": str(max(0, count - 10)), "checked-tasks": "0"}, (count, state(card))
            assert card.locator('[data-preview-action="toggle"]').count() == 0
            assert card.locator('[data-preview-action="open"]').count() == (1 if count > 10 else 0)
        assert state(page.locator('[data-id="n0"]'))["mode"] == "text"
        # Ticking task 10 changes line 10; after a moment it joins "+ 1 checked item" and task 11 moves up.
        card = page.locator('[data-id="n12"]')
        card.get_by_role("checkbox", name="task 10", exact=True).click()
        page.wait_for_function("id => messages.some(m=>m.type==='toggleTask'&&m.id===id&&m.line===9&&m.checked)", arg="n12")
        page.wait_for_timeout(700)
        assert state(card) == {"mode": "checklist", "visible-tasks": "10", "hidden-tasks": "1", "checked-tasks": "1"}, state(card)
        assert card.locator('[data-preview-action="checked"]').text_content() == "+ 1 checked item"
        assert card.get_by_role("checkbox", name="task 11", exact=True).count() == 1
        checked = page.locator('[data-id="checked"]')
        assert state(checked) == {"mode": "checklist", "visible-tasks": "8", "hidden-tasks": "0", "checked-tasks": "7"}, state(checked)
        assert checked.get_by_role("checkbox", checked=True).count() == 0
        # Any other text makes it a text card (like Joplin's welcome note "4. Tips"): tasks as ☐/☑ text.
        mixed = page.locator('[data-id="mixed"]')
        assert state(mixed)["mode"] == "text" and mixed.get_by_role("checkbox").count() == 0, state(mixed)
        mixed_text = mixed.locator(".note-preview").text_content()
        assert "☐ MA" in mixed_text and "☑ MB" in mixed_text, mixed_text
        tagged = page.locator('[data-id="tagged"]')
        assert state(tagged)["mode"] == "checklist" and tagged.get_by_role("checkbox").count() == 2, state(tagged)
        article = page.locator('[data-id="article"]')
        assert state(article)["mode"] == "text" and article.get_by_role("checkbox").count() == 0
        assert article.locator('[data-preview-action="open"]').text_content() == "Open note"
        intro = article.locator(".note-preview").text_content()
        assert intro.startswith("Long article sentence.") and intro.endswith("…"), intro[-60:]
        chips = page.locator('[data-id="files"] .file-chip')
        assert chips.count() == 3, chips.count()
        assert chips.nth(0).get_attribute("aria-label") == f"Open {pdf['name']}, 2.0 MiB", chips.nth(0).get_attribute("aria-label")
        assert chips.nth(0).locator(".file-chip-size").text_content() == "· 2.0 MiB"
        assert chips.nth(1).locator(".file-chip-size").text_content() == "· 3 KiB"
        assert chips.nth(2).locator(".file-chip-size").count() == 0 and chips.nth(2).get_attribute("aria-label") == "Open walk.mp4"
        assert all(chips.nth(i).locator("svg").count() == 1 for i in range(3))
        # A long name is cut off with an ellipsis inside the card, the size stays visible.
        box = chips.nth(0).evaluate("el=>({cut:el.querySelector('.file-chip-name').scrollWidth>el.querySelector('.file-chip-name').clientWidth, inside:el.closest('.note-card').getBoundingClientRect().right-el.getBoundingClientRect().right})")
        assert box["cut"] and box["inside"] >= 0, box
        assert page.locator('[data-id="files"] .file-more').text_content() == "+ 2 files"
        before = page.evaluate("messages.length")
        chips.nth(0).click()
        page.wait_for_function("id => messages.some(m=>m.type==='openFile'&&m.id===id)", arg=pdf["id"])
        assert not page.evaluate("n => messages.slice(n).some(m=>m.type==='open')", before)
        page.locator('[data-id="files"] .file-more').click()
        page.wait_for_function("n => messages.slice(n).some(m=>m.type==='open'&&m.id==='files')", arg=before)
        one = page.locator('[data-id="onefile"]')
        assert one.locator(".file-chip").count() == 1 and one.locator(".file-more").count() == 0 and one.locator(".jd-muted").count() == 0
        shots = Path(tempfile.gettempdir()) / "kilo" / "compact-card-checks"
        shots.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(shots / "joplin-desktop.png"), full_page=True)
        task_font = {}
        for width, height, size in [(390, 844, "15px"), (1200, 900, "30px"), (844, 390, "15px")]:
            page.set_viewport_size({"width": width, "height": height})
            # The preview is sized in rem, so larger text means a larger root font.
            # A zoom or font change resizes the window in Joplin; headless Edge after a screenshot only delivers that event.
            page.locator("html").evaluate("(el,size)=>{el.style.fontSize=size;dispatchEvent(new Event('resize'))}", size)
            page.wait_for_timeout(300)
            measured = page.locator(".note-preview .jd-task").first.evaluate("el=>parseFloat(getComputedStyle(el).fontSize)")
            task_font.setdefault(size, measured)
            assert abs(measured - task_font[size]) < .01, (size, measured, task_font)
            if "15px" in task_font and "30px" in task_font:
                assert abs(task_font["30px"] / task_font["15px"] - 2) < .01, task_font
            for card in page.locator(".note-card:has(.note-preview)").all():
                sizes = card.locator(".note-preview").evaluate("el=>({h:el.offsetHeight,cap:parseFloat(el.style.maxHeight),rows:[...el.querySelectorAll('.jd-task')].map(r=>r.getBoundingClientRect().bottom-el.getBoundingClientRect().bottom)})")
                assert sizes["h"] <= sizes["cap"] + 1, sizes
                assert all(bottom <= 1 for bottom in sizes["rows"]), sizes
            if width == 390:
                page.screenshot(path=str(shots / "joplin-mobile.png"), full_page=True)
        assert not errors, errors
        print("Joplin synthetic board (Keep model): 0/1/5/10/11/12/100, source line 10 then folded, checked folded, mixed = text, tag line, article, file chips, resize and large text PASS")
        browser.close()


if __name__ == "__main__":
    main()

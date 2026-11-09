"""Run after npm run build: python test/preview-browser.py. Synthetic Joplin bridge only."""
import json
import mimetypes
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main():
    bodies = {f"n{count}": "\n".join(f"- [{'x' if i % 2 else ' '}] task {i + 1}" for i in range(count)) or "Plain text" for count in [0, 1, 5, 6, 10, 11, 100]}
    bodies["article"] = "Long article sentence. " * 300 + "\n- [ ] A\n- [x] B\n- [ ] C"
    cards = [{"id": key, "title": key, "color": "default", "tags": [], "pinned": False, "archived": False, "updated": 1, "rank": 1000 - i, "folderId": "f"} for i, key in enumerate(bodies)]
    bridge = """
      window.data = DATA; window.bodies = BODIES; window.messages = [];
      const preview = id => ({id, body:bodies[id], updated:data.cards.find(c=>c.id===id).updated});
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
    """.replace("DATA", json.dumps({"locale": "en", "platform": "desktop", "cards": cards, "folders": [{"id": "f", "title": "Synthetic"}], "boardFolder": "f"})).replace("BODIES", json.dumps(bodies))
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
        page.locator('.note-preview[data-visible-tasks="5"]').first.wait_for()
        for count in [0, 1, 5, 6, 10, 11, 100]:
            card = page.locator(f'[data-id="n{count}"]')
            preview = card.locator(".note-preview")
            assert int(preview.get_attribute("data-visible-tasks")) == min(5, count), count
            if count > 5:
                toggle = card.locator('[data-preview-action="toggle"]')
                toggle.scroll_into_view_if_needed()
                before = card.bounding_box()["y"]
                toggle.click()
                assert int(preview.get_attribute("data-visible-tasks")) == min(10, count)
                assert int(preview.get_attribute("data-hidden-tasks")) == max(0, count - 10)
                assert abs(card.bounding_box()["y"] - before) < 3
                if count >= 10:
                    card.get_by_role("checkbox", name="task 10", exact=True).click()
                    page.wait_for_function("id => messages.some(m=>m.type==='toggleTask'&&m.id===id&&m.line===9)", arg=f"n{count}")
                    assert int(preview.get_attribute("data-visible-tasks")) == 10
                card.locator('[data-preview-action="toggle"]').click()
                assert int(preview.get_attribute("data-visible-tasks")) == 5
        article = page.locator('[data-id="article"]')
        assert article.get_by_role("checkbox").count() == 0
        assert article.locator('[data-preview-action="toggle"]').count() == 0
        assert article.locator('[data-preview-action="open"]').inner_text() == "Open note - 3 more tasks"
        shots = Path(tempfile.gettempdir()) / "kilo" / "compact-card-checks"
        shots.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(shots / "joplin-desktop.png"), full_page=True)
        task_font = {}
        for width, height, size in [(390, 844, "15px"), (1200, 900, "30px"), (844, 390, "15px")]:
            page.set_viewport_size({"width": width, "height": height})
            # The preview is sized in rem, so larger text means a larger root font.
            page.locator("html").evaluate("(el,size)=>el.style.fontSize=size", size)
            page.wait_for_timeout(300)
            measured = page.locator(".note-preview .jd-task").first.evaluate("el=>parseFloat(getComputedStyle(el).fontSize)")
            task_font.setdefault(size, measured)
            assert abs(measured - task_font[size]) < .01, (size, measured, task_font)
            if "15px" in task_font and "30px" in task_font:
                assert abs(task_font["30px"] / task_font["15px"] - 2) < .01, task_font
            for card in page.locator(".note-card").all():
                sizes = card.locator(".note-preview").evaluate("el=>({h:el.offsetHeight,cap:parseFloat(el.style.maxHeight),rows:[...el.querySelectorAll('.jd-task')].map(r=>r.getBoundingClientRect().bottom-el.getBoundingClientRect().bottom)})")
                assert sizes["h"] <= sizes["cap"] + 1, sizes
                assert all(bottom <= 1 for bottom in sizes["rows"]), sizes
            if width == 390:
                page.screenshot(path=str(shots / "joplin-mobile.png"), full_page=True)
        assert not errors, errors
        print("Joplin synthetic board: 0/1/5/6/10/11/100, source line 10, mixed article, resize and large text PASS")
        browser.close()


if __name__ == "__main__":
    main()

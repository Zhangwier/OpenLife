"""Exercise the pottery-slice UI in an isolated server and browser; keep screenshots as evidence.

Run: python scripts/verify-playable.py --output artifacts/playable
Requires the existing local Playwright installation and Microsoft Edge.

Since M1 the default opening is the settlement, so this script asks the server
for the pottery scenario explicitly. The M1 flow has its own script:
`scripts/verify-settlement.py`.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time

from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="artifacts/playable")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    output = (root / args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    server = subprocess.Popen(["node", "apps/web/server.ts"], cwd=root,
                              env={**os.environ, "PORT": "0", "OPENLIFE_START": "pottery"},
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True, encoding="utf-8")
    try:
        line = server.stdout.readline()
        match = re.search(r"http://127\.0\.0\.1:\d+", line)
        if not match:
            raise RuntimeError(f"server did not start: {line}")
        base = match.group(0)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel="msedge", headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 1000})
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(base, wait_until="networkidle")
            page.wait_for_function("document.getElementById('stageTitle').textContent.includes('第一段手艺')")
            assert page.locator("#homeScreen").is_visible()
            assert not page.locator("#continueLife").is_enabled()
            assert not page.locator("#applicationLayout").is_visible()
            page.screenshot(path=str(output / "desktop-home.png"), full_page=True)
            page.locator("#homeNewLife").click()
            page.locator("#newLifeForm").get_by_role("button", name="开始这段人生").click()
            page.wait_for_function("document.body.dataset.screen === 'life'")

            def wait_idle():
                page.wait_for_function("!document.body.classList.contains('is-busy')")

            def click(locator):
                locator.click()
                wait_idle()

            def state():
                return page.evaluate("async () => (await fetch('/api/state')).json()")

            def main_action(name):
                if page.evaluate("document.body.dataset.screen") != "activities":
                    go("activities")
                click(page.locator("#actionGrid").get_by_role("button", name=re.compile(name)))

            def go(route):
                page.locator(f'#appNavigation [data-route="{route}"]').click()
                assert page.locator(f'#screen-{route}').is_visible()
                assert page.locator('[data-screen-panel]:visible').count() == 1

            def finish_pottery():
                for name in ["筛除杂质", "盘条法", "阴凉处慢慢干燥", "先低火预热"]:
                    main_action(name)
                assert state()["player"]["practice"] is None

            assert state()["character"]["age"] == 16
            page.screenshot(path=str(output / "desktop-opening.png"), full_page=True)
            main_action("向师傅学习辨泥")
            main_action("制作一件陶器")
            tick_at_choice = state()["tick"]
            page.locator("#autoButton").click()
            click(page.locator('[data-auto="year"]'))
            assert state()["tick"] == tick_at_choice
            assert "等待" in page.locator("#toast").inner_text()
            page.locator("#memoryButton").click()
            click(page.locator('[data-save-slot="manual-1"]'))
            page.locator("#closeMemory").click()
            page.screenshot(path=str(output / "desktop-choice.png"), full_page=True)
            finish_pottery()
            first_vessel = state()["player"]["vessels"][0]
            assert page.locator('#screen-works').is_visible()
            page.screenshot(path=str(output / "desktop-result.png"), full_page=True)
            click(page.locator("#workshopWorks").get_by_role("button", name=re.compile("留给家族")))
            assert len(state()["player"]["familyWorks"]) == 1

            # Reload a saved pending decision, then repeat the real UI route.
            page.locator("#memoryButton").click()
            click(page.locator('[data-load-slot="manual-1"]'))
            assert state()["tick"] == tick_at_choice
            assert len(state()["player"]["vessels"]) == 0
            finish_pottery()
            assert state()["player"]["vessels"][0]["id"] == first_vessel["id"]
            click(page.locator("#workshopWorks").get_by_role("button", name=re.compile("留给家族")))
            main_action("向师傅再学")
            main_action("整理手艺")
            main_action("收集烧窑")
            for _ in range(2):
                page.locator("#autoButton").click()
                click(page.locator('[data-auto="year"]'))
            go("people")
            person = page.locator(".person-card").filter(has=page.get_by_role("heading", name=re.compile("阿予")))
            click(person.get_by_role("button", name=re.compile("带柴火")))
            click(person.get_by_role("button", name=re.compile("一起聊聊")))
            click(person.get_by_role("button", name=re.compile("决定共同生活")))
            main_action("迎接一个孩子")
            assert state()["player"]["children"][0]["age"] == 0
            go("activities")
            assert not page.locator("#actionGrid").get_by_role("button", name=re.compile("迎接一个孩子")).is_enabled()
            page.locator("#autoButton").click()
            click(page.locator('[data-auto="milestone"]'))
            assert state()["player"]["children"][0]["age"] == 18
            go("family")
            click(page.locator("#handoffChoices").get_by_role("button", name=re.compile("接过")))
            assert state()["generation"] == 2
            assert state()["character"]["age"] == 18
            page.screenshot(path=str(output / "desktop-handoff.png"), full_page=True)

            # The browser's automatic save survives a reload.
            checkpoint_tick = state()["tick"]
            page.reload(wait_until="networkidle")
            assert page.locator("#homeScreen").is_visible()
            page.wait_for_function("!document.getElementById('continueLife').disabled")
            page.locator("#continueLife").click()
            page.wait_for_function("document.body.dataset.screen === 'life'")
            assert state()["tick"] == checkpoint_tick
            for view in ["people", "works", "family", "world", "character", "history", "modules", "map"]:
                go(view)
            page.locator(".map-pack").first.wait_for()
            assert page.locator(".map-pack").count() == 2
            page.screenshot(path=str(output / "desktop-map.png"), full_page=True)
            go("modules")
            page.locator(".module-card").first.wait_for()
            # M1 added world-clock, world-space, world-objects and
            # settlement-locations, so the loaded set is 15 rather than 11.
            assert page.locator(".module-status.loaded").count() == 15
            page.screenshot(path=str(output / "desktop-modules.png"), full_page=True)

            # New life and narrow-screen input use UI controls as well.
            page.set_viewport_size({"width": 390, "height": 844})
            page.locator("#resetButton").click()
            page.locator("#newGivenName").fill("初")
            page.locator("#newLifeForm").get_by_role("button", name="开始这段人生").click()
            page.wait_for_function("document.getElementById('characterName').textContent.includes('初')")
            wait_idle()
            page.wait_for_timeout(300)
            for view in ["life", "activities", "people", "works", "family", "world", "character", "history", "modules", "map"]:
                go(view)
                if view == "modules": page.locator(".module-card").first.wait_for()
                if view == "map": page.locator(".map-pack").first.wait_for()
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), view
            page.locator('.top-actions [data-route="home"]').click()
            page.screenshot(path=str(output / "mobile-home.png"), full_page=True)
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            page.locator("#continueLife").click()
            page.wait_for_function("document.body.dataset.screen === 'life'")
            page.screenshot(path=str(output / "mobile-opening.png"), full_page=True)
            main_action("向师傅学习辨泥")
            main_action("制作一件陶器")
            page.screenshot(path=str(output / "mobile-choice.png"), full_page=True)
            finish_pottery()
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            page.locator("#memoryButton").click()
            assert page.locator("#memoryModal").is_visible()
            assert page.locator("#closeMemory").is_visible()
            page.wait_for_function("document.querySelector('main').inert")
            page.keyboard.press("Escape")
            page.wait_for_function("!document.querySelector('main').inert")
            assert not page.locator("#memoryModal").is_visible()
            assert errors == [], errors
            result = {"passed": True, "page_errors": errors,
                      "checks": ["opening", "four pottery choices", "fast forward blocked at choice",
                                 "save/load", "work disposition", "relationship", "birth", "adult handoff",
                                 "home menu", "explicit continue after reload", "independent pages", "module catalog", "map inventory", "390px layout", "mobile craft and modal", "keyboard dialog"],
                      "screenshots": sorted(p.name for p in output.glob("*.png")),
                      "human_playtest": "pending; duration and enjoyment are not asserted"}
            (output / "browser-results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps(result, ensure_ascii=False))
            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    main()

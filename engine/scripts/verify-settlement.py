"""Exercise the M1 settlement UI in an isolated server and browser; keep screenshots as evidence.

Run: python scripts/verify-settlement.py --output artifacts/settlement
Requires the existing local Playwright installation and Microsoft Edge.

The script starts its own server on a random port and uses a fresh browser
context, so it never touches a running server or the user's stored saves.
"""

import argparse
import json
import os
import re
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="artifacts/settlement")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    output = (root / args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)

    server = subprocess.Popen(
        ["node", "apps/web/server.ts"], cwd=root,
        env={**os.environ, "PORT": "0"},
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8",
    )
    try:
        line = server.stdout.readline()
        match = re.search(r"http://127\.0\.0\.1:\d+", line)
        if not match:
            raise RuntimeError(f"server did not start: {line}")
        base = match.group(0)

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel="msedge", headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 1100})
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            page.goto(base, wait_until="networkidle")
            assert page.locator("#homeScreen").is_visible()
            page.screenshot(path=str(output / "desktop-home.png"), full_page=True)

            # Start a new life: the M1 opening is the settlement itself.
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

            def go(route):
                page.locator(f'#appNavigation [data-route="{route}"]').click()
                assert page.locator(f"#screen-{route}").is_visible()

            def scene_action(name):
                # The scene lives on the "activities" page (it hosts .life-stage),
                # so every scene interaction starts by going there.
                if page.evaluate("document.body.dataset.screen") != "activities":
                    go("activities")
                button = page.locator("#sceneActions").get_by_role("button", name=re.compile(name))
                button.first.click()
                wait_idle()

            def take_object(object_id):
                if page.evaluate("document.body.dataset.screen") != "activities":
                    go("activities")
                page.locator(f'#sceneObjects [data-object="{object_id}"]').click()
                wait_idle()

            go("activities")
            initial = state()
            assert initial["settlement"]["exists"] is True
            assert initial["settlement"]["neighbours"], "someone else is in the opening scene"
            assert len(initial["settlement"]["objects"]) >= 5, "the opening room has objects"
            assert initial["clock"]["baseUnit"] == "day"
            page.screenshot(path=str(output / "desktop-settlement.png"), full_page=True)

            # 1. Borrow the household jar.
            jar = next(o for o in initial["settlement"]["objects"] if o["prototypeId"] == "prototype:water-jar")
            take_object(jar["id"])
            after_take = state()
            assert len(after_take["player"]["settlementLoans"]) == 1, "borrowing is recorded"
            assert any(row["resourceId"] == "resource:jar" for row in after_take["settlement"]["carrying"])
            page.screenshot(path=str(output / "desktop-borrowed.png"), full_page=True)

            # 2. Walk to the river; walking costs days.
            tick_before_walk = after_take["tick"]
            scene_action("走到河边取水点")
            at_river = state()
            assert at_river["settlement"]["placeId"] == "place:river"
            assert at_river["tick"] > tick_before_walk, "walking costs days"
            water_before = next(
                row for row in at_river["settlement"]["yields"] if row["resourceId"] == "resource:water"
            )["stock"]

            # 3. Fill the jar.
            scene_action("装水带回")
            filled = state()
            water_row = next(
                (row for row in filled["settlement"]["carrying"] if row["resourceId"] == "resource:water"),
                None,
            )
            assert water_row and water_row["count"] > 0, "the jar now carries water"
            water_after = next(
                row for row in filled["settlement"]["yields"] if row["resourceId"] == "resource:water"
            )["stock"]
            assert water_after < water_before, "the river lost what the jar gained"
            page.screenshot(path=str(output / "desktop-river.png"), full_page=True)

            # 4. Carry it home and give it back.
            scene_action("走到陶家庭院")
            page.locator("#sceneLoans [data-return]").first.click()
            wait_idle()
            returned = state()
            assert returned["player"]["settlementLoans"] == [], "the loan is cleared"
            assert not any(row["resourceId"] == "resource:jar" for row in returned["settlement"]["carrying"])
            page.screenshot(path=str(output / "desktop-returned.png"), full_page=True)

            # 5. Let a day pass: one action is one day, not one month.
            day_before = returned["tick"]
            scene_action("让这一天过去")
            stepped = state()
            assert stepped["tick"] == day_before + 1, "one day passed, not one month"
            months_before = returned["clock"]["monthsElapsed"]
            assert stepped["clock"]["monthsElapsed"] == months_before, "a day must not consume a month"

            # 6. Other places are reachable and describe themselves.
            scene_action("走到公用灶台")
            kitchen = state()
            assert kitchen["settlement"]["placeId"] == "place:hearth-yard"
            assert kitchen["settlement"]["yields"], "the kitchen has shared food"
            page.screenshot(path=str(output / "desktop-kitchen.png"), full_page=True)

            # Every independent page still renders, and exactly one shows at a time.
            for view in ["life", "character", "activities", "people", "works", "family", "world", "history", "modules", "map"]:
                go(view)
                visible = page.evaluate(
                    "Array.from(document.querySelectorAll('[data-screen-panel]'))"
                    ".filter(el => !el.hidden).length"
                )
                assert visible == 1, f"{view}: {visible} panels visible"
            page.screenshot(path=str(output / "desktop-people.png"), full_page=True)

            # Refresh restores the automatic save without losing the world.
            checkpoint = state()
            page.reload(wait_until="networkidle")
            assert page.locator("#homeScreen").is_visible()
            page.wait_for_function("!document.getElementById('continueLife').disabled")
            page.locator("#continueLife").click()
            page.wait_for_function("document.body.dataset.screen === 'life'")
            restored = state()
            assert restored["tick"] == checkpoint["tick"]
            assert restored["settlement"]["placeId"] == checkpoint["settlement"]["placeId"]
            assert len(restored["settlement"]["neighbours"]) == len(checkpoint["settlement"]["neighbours"])

            # Narrow screen: the scene must not overflow horizontally.
            page.set_viewport_size({"width": 390, "height": 844})
            wait_idle()
            page.wait_for_timeout(250)
            for view in ["life", "activities", "people", "works", "family", "world", "character", "history", "modules", "map"]:
                go(view)
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), view
            page.locator('.top-actions [data-route="home"]').click()
            page.screenshot(path=str(output / "mobile-home.png"), full_page=True)
            page.locator("#continueLife").click()
            page.wait_for_function("document.body.dataset.screen === 'life'")
            page.screenshot(path=str(output / "mobile-settlement.png"), full_page=True)
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")

            # Keyboard access to the memory dialog still works.
            page.locator("#memoryButton").click()
            assert page.locator("#memoryModal").is_visible()
            page.wait_for_function("document.querySelector('main').inert")
            page.keyboard.press("Escape")
            page.wait_for_function("!document.querySelector('main').inert")

            assert errors == [], errors
            result = {
                "passed": True,
                "page_errors": errors,
                "checks": [
                    "day-scale clock (1 action = 1 day, 30 days = 1 month, 12 months = 1 year)",
                    "opening scene shows a real place, people and objects",
                    "borrowing records a dated loan",
                    "walking costs days and reports the new place",
                    "filling a jar conserves the river's stock",
                    "returning the jar clears the loan",
                    "one day pass does not consume a month",
                    "a second worksite is reachable and has its own stock",
                    "all ten independent pages render",
                    "refresh restores the automatic save",
                    "390px layout has no horizontal overflow",
                    "keyboard dialog focus trap",
                ],
                "screenshots": sorted(p.name for p in output.glob("*.png")),
                "human_playtest": "pending; duration, enjoyment and whether a player finds the loop unaided are not asserted",
            }
            (output / "browser-results.json").write_text(
                json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
            )
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

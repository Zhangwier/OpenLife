# -*- coding: utf-8 -*-
"""
Capture game screenshots from running server at http://127.0.0.1:4173.
Viewports:
1. 1280x800
2. 573x788
Target dir: D:\\MG\\program\\scratch\\2026-11\\2026-11-08_openlife-art\\
"""

import os, time
from playwright.sync_api import sync_playwright

OUT_DIR = r"D:\MG\program\scratch\2026-11\2026-11-08_openlife-art"
os.makedirs(OUT_DIR, exist_ok=True)

def capture():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        
        # 1. 1280x800
        page1 = browser.new_page(viewport={"width": 1280, "height": 800})
        page1.goto("http://127.0.0.1:4173", wait_until="networkidle")
        page1.wait_for_timeout(2500)
        shot1_path = os.path.join(OUT_DIR, "screen_1280x800.png")
        page1.screenshot(path=shot1_path)
        print(f"Captured 1280x800 -> {shot1_path}")
        page1.close()
        
        # 2. 573x788
        page2 = browser.new_page(viewport={"width": 573, "height": 788})
        page2.goto("http://127.0.0.1:4173", wait_until="networkidle")
        page2.wait_for_timeout(2500)
        shot2_path = os.path.join(OUT_DIR, "screen_573x788.png")
        page2.screenshot(path=shot2_path)
        print(f"Captured 573x788 -> {shot2_path}")
        page2.close()
        
        browser.close()

if __name__ == "__main__":
    capture()

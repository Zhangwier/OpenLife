from playwright.sync_api import sync_playwright

svg = open(
    r"D:\MG\program\OpenLife\apps\card-world\art\svgs\dog.svg", encoding="utf-8"
).read()
html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>body {{ margin:0; background:transparent; }} svg {{ width:256px; height:256px; }}</style></head><body>{svg}</body></html>"""

with sync_playwright() as p:
  b = p.chromium.launch(channel="msedge")
  pg = b.new_page(viewport={"width": 256, "height": 256})
  pg.set_content(html)
  pg.screenshot(
      path=r"D:\MG\program\OpenLife\apps\card-world\art\icons\dog.png",
      omit_background=True,
  )
  b.close()
print("Dog rendered successfully")

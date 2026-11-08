path = r"D:\MG\program\OpenLife\apps\card-world\app.js"
content = open(path, encoding="utf-8").read()

import_target = 'import { loadArt, deco as DECO } from "./art.js";'
import_add = (
    'import { loadArt, deco as DECO } from "./art.js";\nimport { fx } from'
    ' "./fx.js";'
)

frame_target = "    render(now);\n  } catch (err) { console.error(err); }"
frame_add = (
    "    render(now);\n    fx.scanWorld(boards.world, now);\n   "
    " fx.updateAndDraw();\n  } catch (err) { console.error(err); }"
)

init_target = (
    "worldEl.style.width = `${WW}px`; worldEl.style.height = `${WH}px`;"
)
init_add = (
    "worldEl.style.width = `${WW}px`; worldEl.style.height = `${WH}px`;\nconst"
    ' fxCanvas = $("fxLayer"); if (fxCanvas) { fx.init(fxCanvas);'
    " fx.resize(WW, WH); }"
)

if import_target in content and 'import { fx } from "./fx.js";' not in content:
  content = content.replace(import_target, import_add, 1)
  content = content.replace(frame_target, frame_add, 1)
  content = content.replace(init_target, init_add, 1)
  open(path, "w", encoding="utf-8").write(content)
  print("app.js updated successfully")
else:
  print("already updated or target not found")

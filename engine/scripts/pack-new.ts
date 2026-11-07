/**
 * pack:new -- scaffold a new content pack with the right shape.
 *
 *   npm run pack:new my-pack -- --kind items
 *   npm run pack:new my-pack -- --kind incidents
 *
 * Content authors reach for this because remembering the manifest fields and
 * the JSON shape is error-prone. This writes a working skeleton with the
 * required fields filled in, so you only have to write the words.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACK_DIR = join(ROOT, "content-packs");

const KINDS = {
  items: {
    label: "物品包",
    description: "新增可采集、可制作的物品。",
    files: {
      "items.json": `[
  {
    "id": "item:my-item",
    "name": "我的物品",
    "kind": "tool",
    "blurb": "一句外观描述。",
    "tags": ["tool"]
  }
]
`,
    },
  },
  incidents: {
    label: "事件包",
    description: "新增村里会发生的事。",
    files: {
      "incidents.json": `[
  {
    "id": "incident:my-incident",
    "kind": "quarrel",
    "title": "一件事",
    "when": "any",
    "who": ["resident:a", "resident:b"],
    "line": "这件事的叙述。",
    "choices": [
      { "id": "side-a", "label": "帮一边", "effects": { "bond": { "resident:a": 1, "resident:b": -1 } } },
      { "id": "side-b", "label": "帮另一边", "effects": { "bond": { "resident:a": -1, "resident:b": 1 } } }
    ]
  }
]
`,
    },
  },
  residents: {
    label: "村民包",
    description: "新增住在村里的人。",
    files: {
      "residents.json": `[
  {
    "key": "my-resident",
    "name": "新村民",
    "role": "做的事",
    "wish": "心里惦记的事",
    "loves": ["item:grain"],
    "dislikes": []
  }
]
`,
    },
  },
  dialogue: {
    label: "对话包",
    description: "新增村民说的话。",
    files: {
      "dialogue.json": `{
  "met": ["认识以后说的话。"],
  "acquainted": ["熟了以后说的话。"]
}
`,
    },
  },
} as const;

type Kind = keyof typeof KINDS;

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): number {
  const name = process.argv[2];
  if (!name || name.startsWith("--")) {
    console.error("usage: npm run pack:new <name> -- --kind items|incidents|residents|dialogue");
    return 2;
  }
  const kind = (arg("--kind") ?? "items") as Kind;
  const spec = KINDS[kind];
  if (!spec) {
    console.error(`unknown kind: ${kind}. Pick one of: ${Object.keys(KINDS).join(", ")}`);
    return 2;
  }

  const dir = resolve(PACK_DIR, name);
  if (existsSync(dir)) {
    console.error(`already exists: ${dir}`);
    return 1;
  }

  mkdirSync(dir, { recursive: true });
  const manifest = {
    id: name.replace(/-/g, "_"),
    name: spec.label,
    version: "0.1.0",
    type: "settlement_extension",
    formatVersion: 2,
    target: "river-terrace",
    label: name,
    description: spec.description,
    requires: [],
    provides: [],
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  for (const [file, content] of Object.entries(spec.files)) {
    writeFileSync(join(dir, file), content);
  }

  console.log(`pack ${name} created under content-packs/${name}/`);
  console.log(`kind: ${spec.label} · ${spec.description}`);
  console.log(`next: write the words, then npm run pack:check ${dir}`);
  return 0;
}

process.exitCode = main();

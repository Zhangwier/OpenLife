// 家族谱页增强（2026-10-24 合并场）：成员标注「你」、已故淡显、人数摘要、读屏列表语义、当前成员滚入视野。
// 只按 id 观察 #familyTree 的重画，幂等；不改渲染函数。
export function summarizeFamily(nodes) {
  const list = nodes.map((n) => ({ current: !!n.current, alive: n.alive !== false, generation: Number(n.generation) || 1 }));
  const total = list.length;
  const alive = list.filter((n) => n.alive).length;
  const gens = total ? Math.max(...list.map((n) => n.generation)) : 1;
  const text = total <= 1 ? "" : `家族共 ${total} 人，仍在生活 ${alive} 人，传到第 ${gens} 代。`;
  return { total, alive, gens, text };
}
export function parseNode(el) {
  const sub = el.querySelector("span")?.textContent || "";
  const m = sub.match(/第\s*(\d+)\s*代/);
  return { current: el.classList.contains("current"), alive: !sub.includes("已进入家族史"), generation: m ? Number(m[1]) : 1, name: (el.querySelector("strong")?.textContent || "").trim() };
}
function enhance() {
  const tree = document.getElementById("familyTree");
  if (!tree) return;
  const nodes = [...tree.querySelectorAll(".family-node")];
  tree.setAttribute("role", "list");
  tree.setAttribute("aria-label", "家族成员，按代排列");
  nodes.forEach((el) => {
    const info = parseNode(el);
    el.setAttribute("role", "listitem");
    el.classList.toggle("fux-gone", !info.alive);
    if (info.current) { el.setAttribute("aria-current", "true"); if (!el.querySelector(".fux-you")) { const b = document.createElement("em"); b.className = "fux-you"; b.textContent = "你"; el.prepend(b); } }
    el.setAttribute("aria-label", `${info.name}，第 ${info.generation} 代，${info.alive ? "仍在生活" : "已进入家族史"}${info.current ? "，是你" : ""}`);
  });
  const sum = summarizeFamily(nodes.map(parseNode));
  let line = document.getElementById("familyUxSummary");
  if (sum.text) {
    if (!line) { line = document.createElement("p"); line.id = "familyUxSummary"; line.className = "fux-summary"; tree.before(line); }
    if (line.textContent !== sum.text) line.textContent = sum.text;
  } else line?.remove();
  const label = document.getElementById("lineageLabel");
  if (label) label.title = sum.total > 1 ? sum.text : "";
  const cur = tree.querySelector(".family-node.current");
  if (cur && tree.scrollWidth > tree.clientWidth + 2 && tree.dataset.fuxScrolled !== String(nodes.length)) { tree.dataset.fuxScrolled = String(nodes.length); cur.scrollIntoView({ block: "nearest", inline: "center" }); }
  tree.classList.toggle("fux-scroll", tree.scrollWidth > tree.clientWidth + 2);
  const hand = document.getElementById("familyHandoff");
  if (hand) hand.classList.toggle("fux-empty", !hand.textContent.trim());
}
export function installFamilyUx() {
  if (typeof document === "undefined") return;
  if (!document.querySelector('link[href="/family-ux.css"]')) {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/family-ux.css"; document.head.append(l);
  }
  const hook = () => {
    const tree = document.getElementById("familyTree");
    if (!tree) { requestAnimationFrame(hook); return; }
    new MutationObserver(enhance).observe(tree, { childList: true });
    const hand = document.getElementById("familyHandoff");
    if (hand) new MutationObserver(enhance).observe(hand, { childList: true });
    addEventListener("resize", enhance);
    enhance();
  };
  hook();
}
installFamilyUx();

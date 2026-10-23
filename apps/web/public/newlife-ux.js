/**
 * 2026-10-23 午场：「新的开始」弹窗（新人生表单）。只做表现层，不改提交逻辑。
 *  1. 人生编号是给开发者复现用的，原来占一整块，还被底部按钮盖住 → 收进「高级：人生编号」折叠里，默认合上。
 *  2. 表单上方多一行「将以……开始」：名字、聚落、出身一目了然，随输入即时更新。
 *  3. 名字留空时标红并说明，提交按钮停用，不再靠服务端报错。
 *  4. 桌面端两个按钮并排；打开时光标落在名字上并全选，直接改。
 */
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** 纯函数：一行摘要。 */
export function lifeSummary({ given = "", family = "", city = "", origin = "" } = {}) {
  const name = `${String(family).trim()}${String(given).trim()}`;
  if (!String(given).trim()) return "先给这个人起个名字。";
  const o = !origin || /^随缘/.test(origin) ? "出身随缘" : `出身「${String(origin).replace(/[（(].*$/, "").trim()}」`;
  return `将以「${name}」开始，生在${city || "聚落"}，${o}。`;
}
export function nameProblem(given) {
  return String(given ?? "").trim() ? "" : "名字不能空着。";
}

function selText(id) { const s = $(id); return s && s.selectedOptions[0] ? s.selectedOptions[0].textContent : ""; }

function enhance() {
  const form = $("newLifeForm");
  if (!form || form.dataset.nlux) return;
  form.dataset.nlux = "1";
  form.classList.add("nl-ux");
  // 1. 种子折叠
  const seed = $("newSeed");
  const seedLabel = seed && seed.closest("label");
  if (seedLabel) {
    const d = document.createElement("details");
    d.className = "nl-advanced";
    d.innerHTML = '<summary>高级：这段人生的编号</summary>';
    seedLabel.replaceWith(d);
    d.append(seedLabel);
  }
  // 2. 摘要
  const sum = document.createElement("p");
  sum.className = "nl-summary";
  sum.id = "newLifeSummary";
  sum.setAttribute("aria-live", "polite");
  const actions = form.querySelector(".form-actions");
  form.insertBefore(sum, form.firstChild);
  // 3. 名字校验
  const given = $("newGivenName");
  const err = document.createElement("small");
  err.className = "nl-error";
  err.id = "newGivenError";
  err.hidden = true;
  err.setAttribute("role", "alert");
  given.closest("label").append(err);
  const submit = form.querySelector("button[type=submit]");
  const refresh = () => {
    const bad = nameProblem(given.value);
    err.hidden = !bad; err.textContent = bad;
    given.setAttribute("aria-invalid", bad ? "true" : "false");
    if (bad) given.setAttribute("aria-describedby", "newGivenError"); else given.removeAttribute("aria-describedby");
    submit.disabled = !!bad;
    sum.textContent = lifeSummary({ given: given.value, family: $("newFamilyName").value, city: selText("newCity"), origin: selText("newOrigin") });
  };
  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
  new MutationObserver(refresh).observe($("newOrigin"), { childList: true });
  refresh();
}

function onOpen() {
  const m = $("newLifeModal");
  if (!m) return;
  const go = () => {
    if (m.hidden) return;
    enhance();
    const g = $("newGivenName");
    if (g && document.activeElement !== g) { g.focus(); g.select(); }
  };
  new MutationObserver(go).observe(m, { attributes: true, attributeFilter: ["hidden"] });
  enhance();
}

if (typeof document !== "undefined") {
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = "/newlife-ux.css";
  document.head.append(link);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onOpen); else onOpen();
}

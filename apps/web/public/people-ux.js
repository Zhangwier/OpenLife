/*
 * 熟人页（people-ux）：陌生人清单编号、「怎么认识一个人」三步路标、搭话按钮的读屏名与点击反馈。
 * 只读 DOM、不改规则；用 MutationObserver 在 player.js 重绘 #relationshipOrbit 后补装。
 */
const ORDINALS = ["第一位", "第二位", "第三位", "第四位", "第五位", "第六位", "第七位", "第八位", "第九位", "第十位"];

export function ordinal(i) { return ORDINALS[i] ?? `第 ${i + 1} 位`; }

/** 三步路标：只在还没有任何相识的人时出现。 */
export function stepsMarkup() {
  const steps = [["1", "搭话", "走近，点「搭话」"], ["2", "当面聊几回", "多聊几次，不必着急"], ["3", "相识", "交情随来往慢慢加深"]];
  return `<ol class="pux-steps" aria-label="怎样认识一个人">${steps.map(([n, t, d], i) =>
    `<li${i === 0 ? ' class="is-first"' : ""}><b aria-hidden="true">${n}</b><span><strong>${t}</strong><small>${d}</small></span></li>`).join("")}</ol>`;
}

export function enhance(root) {
  if (!root || root.dataset.puxBusy) return;
  const list = root.querySelector(".stranger-list");
  if (list?.dataset.pux) return;
  root.dataset.puxBusy = "1";
  try {
    if (list) {
      list.dataset.pux = "1";
      [...list.children].forEach((li, i) => {
        const who = li.querySelector(".stranger-who");
        const btn = li.querySelector("button");
        const tag = document.createElement("span");
        tag.className = "pux-ord"; tag.textContent = ordinal(i); tag.setAttribute("aria-hidden", "true");
        li.prepend(tag);
        if (btn && who) btn.setAttribute("aria-label", `和${ordinal(i)}${who.textContent.trim()}搭话`);
      });
      const card = list.closest(".person-card--strangers");
      if (card && !root.querySelector(".person-card:not(.person-card--strangers)") && !root.querySelector(".pux-steps")) {
        card.insertAdjacentHTML("afterend", stepsMarkup());
      }
    }
    root.querySelectorAll("[data-person-route]").forEach(b => {
      if (b.dataset.puxBound) return;
      b.dataset.puxBound = "1";
      b.addEventListener("click", () => { b.classList.add("is-going"); b.setAttribute("aria-busy", "true"); b.dataset.label = b.textContent; b.textContent = "走过去…"; });
    });
  } finally { delete root.dataset.puxBusy; }
}

export function installPeopleUx(doc = globalThis.document) {
  if (!doc) return;
  const link = doc.createElement("link"); link.rel = "stylesheet"; link.href = "/people-ux.css"; doc.head.append(link);
  const root = doc.getElementById("relationshipOrbit");
  if (!root) return;
  enhance(root);
  new MutationObserver(() => enhance(root)).observe(root, { childList: true });
}
if (typeof document !== "undefined") installPeopleUx();

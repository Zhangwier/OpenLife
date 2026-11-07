/**
 * 职位面板：把 office 插件的投影翻成人能读的一页。
 *
 * 设计规范（docs/design/DESIGN.md）的三条硬规则在这里落地：
 *  1. **不给玩家看数字**：没有百分比、没有"好感 7/10"。程度用「多 / 一半 / 不多」。
 *  2. **不可选的选项要写明原因**：没有界石就说「村里还没有界石」，不能只灰掉。
 *  3. **口吻贴合时代**：石器村落说「推」「举手」「站队」，不说「选举」「投票」。
 *
 * 这个文件只管渲染与事件，不改世界——所有改动都通过 `dispatch` 发命令。
 */

/** 把 0..1 的比例翻成文字，不出现数字。 */
export function degree(ratio) {
  if (ratio >= 0.75) return "多";
  if (ratio >= 0.5) return "一半";
  if (ratio >= 0.25) return "不多";
  if (ratio > 0) return "几乎没有";
  return "没有";
}

/** 剩余天数翻成文字。 */
export function daysLeft(days) {
  if (days <= 0) return "就在今天";
  if (days === 1) return "还有一天";
  if (days <= 3) return "还有两三天";
  if (days <= 9) return "还有些日子";
  return "日子还长";
}

/** 职位名到「怎么当上的」的说法。 */
const HOW_WORD = {
  acclaim: "众人推的",
  vote: "举手选的",
  hereditary: "从上辈手里接的",
  appointed: "有人点的名",
};

/**
 * 渲染整个职位面板。
 *
 * @param {object} panel   office.panel 投影的结果
 * @param {object} registry office.registry 投影的结果
 * @returns {string} HTML
 */
export function renderOffice(panel, registry) {
  if (!panel) return "";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // 没有职位、也没有在选人：空状态要告诉玩家"什么时候可以站出来"。
  if (!panel.holding && !panel.race) {
    const missing = (registry?.missingFacilities ?? []).slice(0, 2);
    return `<section class="office-panel is-empty">
      <p class="office-line">你现在没有职位。到了推举的时候，可以站出来。</p>
      ${missing.length ? `<ul class="office-hint">${missing.map((f) =>
        `<li><span class="hint-name">${esc(f.name)}</span>${esc(f.why)}</li>`).join("")}</ul>` : ""}
    </section>`;
  }

  // 在选人：显示有几个对手、还剩几天，不显示票数。
  if (panel.race) {
    return `<section class="office-panel is-racing">
      <div class="office-head">
        <span class="office-title">在推${esc(panel.race.label)}</span>
        <span class="office-when">${esc(daysLeft(panel.race.closesInDays))}</span>
      </div>
      <p class="office-line">${panel.race.candidates > 1
        ? `站出来的人${degree(Math.min(1, panel.race.candidates / 4))}。`
        : "没人跟你争。"}${panel.race.leaningToMe > 0
        ? `已经有人站你这边，${degree(panel.race.leaningToMe / Math.max(1, panel.race.candidates))}。`
        : ""}</p>
      <div class="office-actions">
        <button class="choice-card" data-office="canvass-open">
          <span class="label">去走动走动</span>
          <span class="cost">登门、送礼、许诺，都能换来一句话</span>
        </button>
      </div>
    </section>`;
  }

  // 在位子上：显示职位、民心（一句话）、和等着断的事。
  const matter = panel.matter;
  const standingWord = panel.standing >= 3 ? "大多数人还服你"
    : panel.standing >= 1 ? "有人服，也有人不服"
    : panel.standing >= -1 ? "说什么都有人应，也有人说闲话"
    : panel.standing >= -3 ? "背后说话的人多了"
    : "差不多没人听你的了";

  return `<section class="office-panel is-holding">
    <div class="office-head">
      <span class="office-title">${esc(panel.holding.label)}</span>
      <span class="office-seal seal">${esc(panel.holding.label)}</span>
    </div>
    <p class="office-standing">${esc(standingWord)}</p>

    ${matter ? `
      <div class="office-matter">
        <p class="matter-title">${esc(matter.title)}</p>
        <div class="choice-list">
          ${matter.options.map((o) => `
            <button class="choice-card" data-office="decide" data-option="${esc(o.id)}"
              ${o.available ? "" : "disabled"}>
              <span class="label">${esc(o.label)}</span>
              ${o.available
                ? `<span class="cost">断下去就定了</span>`
                : `<span class="cost is-warning">${esc(o.why)}</span>`}
            </button>`).join("")}
        </div>
      </div>`
      : `<p class="office-line">眼下没有要你管的事。</p>`}

    ${panel.pledges?.length ? `
      <div class="office-pledges">
        <p class="pledges-title">你许过的话</p>
        ${panel.pledges.map((p) => `<p class="pledge">答应过${esc(p.to)}：${esc(p.what)}</p>`).join("")}
      </div>` : ""}
  </section>`;
}

/**
 * 把面板接到页面上。
 *
 * `send(action, payload)` 由调用方提供，负责真正发命令。这样渲染与协议解耦，
 * 测试可以只测 HTML，不必起服务器。
 */
export function installOffice(root, { getState, send }) {
  if (!root) return;

  const paint = () => {
    const state = getState();
    const panel = state?.office ?? null;
    const registry = state?.officeRegistry ?? null;
    root.innerHTML = renderOffice(panel, registry);
  };

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-office]");
    if (!button || button.disabled) return;
    const kind = button.dataset.office;
    if (kind === "decide") {
      await send("office.decide", { optionId: button.dataset.option });
    } else if (kind === "canvass-open") {
      await send("office.canvass.open", {});
    }
    paint();
  });

  paint();
  return { paint };
}

// voice-wizard-modal — "Optimize your Instagram voice" (flag networkVoices).
//
// Every Optimize on the Voice tab opens it: the four parts of a network voice,
// one step each (Opens with · Closes with · Formatting · Emoji & casing), then
// a review. Each step offers Archie's options (pre-picked), the base network's
// version, or your own — and a live preview of a post on that network changes
// as you choose. The progress ring in the header is the one on the Voice tab.
//
// A STAGED draft (the objective modal's pattern): nothing reaches the Playbook
// until Save; the host gets the four final values and writes them. Leaving with
// changes asks — in here, never through confirm-modal (requestOpen would close
// this dialog to open it).
//
// Public API: init() · open({ data, network, part?, onSave(result) }) · close()
//   result = { values: { [field]: value | undefined }, drafted: boolean }
//   undefined = the part follows the base voice.

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1799";
import { escapeHtml as esc } from "../utils.js?v=1799";
import { networkVoiceOptions } from "../context-mock-analysis.js?v=1799";
import {
  networkFields,
  isNewPart,
  networkLabel,
  networkIcon,
  baseNetwork,
  networkEntry,
  resolvedVoice,
  progressRingHtml,
} from "../network-voice.js?v=1799";

const MODAL_ID = "voiceWizard";

const PARTS = {
  signatureHooks: {
    title: "Opens with",
    list: true,
    ask: (n) => `How do your posts open on ${n}?`,
    keep: (b) => `Keep my ${b} openings`,
    add: "Write your own opening line…",
  },
  closingPatterns: {
    title: "Closes with",
    list: true,
    ask: (n) => `How do your posts end on ${n}?`,
    keep: (b) => `Keep my ${b} closings`,
    add: "Write your own closing line…",
  },
  formattingStyle: {
    title: "Formatting",
    list: false,
    ask: (n) => `How should a post be laid out on ${n}?`,
    keep: (b) => `Keep my ${b} formatting`,
    add: "How posts are structured on this network…",
  },
  hashtagStyle: {
    title: "Hashtags",
    list: false,
    ask: (n) => `How do you use hashtags on ${n}?`,
    keep: (b) => `Keep my ${b} hashtags`,
    add: "How many, where, which kind…",
  },
  visualStyle: {
    title: "Emoji & casing",
    list: false,
    ask: (n) => `Emoji, casing and hashtags on ${n}?`,
    keep: (b) => `Keep my ${b} conventions`,
    add: "Emoji, capitalisation, hashtags, links…",
  },
};

let backdrop = null;
let panel = null;
let headEl = null;
let bodyEl = null;
let footLeftEl = null;
let footRightEl = null;
let initialized = false;

// { data, net, base, opts, fields, step, parts: { [field]: part }, initial, startParts, leaving, onSave }
//   list part: { keep, picked: string[], custom: string[] }
//   text part: { choice: 0 | 1 | "keep" | "own", own }
let w = null;

// The step after the parts: the review.
const review = () => w.fields.length;

const SHELL = `
<div class="app-modal-backdrop vw__backdrop" id="vwBackdrop" hidden>
  <aside class="ap-dialog vw" id="vwModal" role="dialog" aria-modal="true" aria-labelledby="vwTitle" tabindex="-1">
    <div class="ap-dialog-header vw__header" id="vwHead"></div>
    <button type="button" class="ap-dialog-close" data-vw-close aria-label="Close"><i class="ap-icon-close"></i></button>
    <div class="ap-dialog-content vw__content" id="vwBody"></div>
    <div class="ap-dialog-footer">
      <div class="ap-dialog-footer-left" id="vwFootLeft"></div>
      <div class="ap-dialog-footer-right" id="vwFootRight"></div>
    </div>
  </aside>
</div>`;

export function init() {
  if (initialized) return;
  const host = document.createElement("div");
  host.innerHTML = SHELL;
  while (host.firstChild) document.body.appendChild(host.firstChild);
  backdrop = document.getElementById("vwBackdrop");
  panel = document.getElementById("vwModal");
  headEl = document.getElementById("vwHead");
  bodyEl = document.getElementById("vwBody");
  footLeftEl = document.getElementById("vwFootLeft");
  footRightEl = document.getElementById("vwFootRight");
  panel.addEventListener("click", onClick);
  panel.addEventListener("change", onChange);
  panel.addEventListener("input", onInput);
  panel.addEventListener("keydown", onKeydown);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) requestClose();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && w && !backdrop.hidden) {
      e.preventDefault();
      requestClose();
    }
  });
  // A navigation is not a choice to discard — but the page under is gone.
  window.addEventListener("hashchange", () => close());
  initialized = true;
}

export function open({ data, network, part = null, onSave }) {
  init();
  const opts = networkVoiceOptions(network);
  if (!data || !opts) return;
  requestOpen(MODAL_ID, close);
  const entry = networkEntry(data, network) || {};
  const parts = {};
  // The parts on screen when it opens (a flag can add one — voiceParts()).
  const fields = networkFields().filter((f) => opts[f]);
  for (const field of fields) parts[field] = initialPart(field, entry[field], opts[field]);
  const firstLeft = fields.findIndex((f) => entry[f] === undefined);
  const asked = part ? fields.indexOf(part) : -1;
  w = {
    data,
    net: network,
    base: baseNetwork(data),
    opts,
    fields,
    parts,
    step: asked >= 0 ? asked : firstLeft >= 0 ? firstLeft : 0,
    leaving: false,
    onSave,
  };
  w.initial = snapshot();
  w.startParts = Object.fromEntries(w.fields.map((f) => [f, JSON.stringify(parts[f])]));
  paint();
  backdrop.hidden = false;
  document.body.classList.add("has-modal");
  focusFirst();
}

export function close() {
  if (!backdrop || backdrop.hidden) return;
  backdrop.hidden = true;
  document.body.classList.remove("has-modal");
  w = null;
  headEl.innerHTML = bodyEl.innerHTML = footLeftEl.innerHTML = footRightEl.innerHTML = "";
  notifyClose(MODAL_ID);
}

function requestClose() {
  if (!w) return;
  if (snapshot() === w.initial || w.leaving) {
    close();
    return;
  }
  w.leaving = true;
  paint();
}

// ── The draft ────────────────────────────────────────────────────────────────

// What a part starts as: its own value when the network already has one,
// Archie's picks otherwise (the first two lines, the first option).
function initialPart(field, value, options) {
  if (PARTS[field].list) {
    if (value === undefined) return { keep: false, picked: options.slice(0, 2), custom: [] };
    return {
      keep: false,
      picked: options.filter((o) => value.includes(o)),
      custom: value.filter((v) => !options.includes(v)),
    };
  }
  if (value === undefined) return { choice: 0, own: "" };
  const i = options.indexOf(value);
  return i >= 0 ? { choice: i, own: "" } : { choice: "own", own: value };
}

// A part's final value — undefined = it follows the base voice.
function valueOf(field) {
  const p = w.parts[field];
  if (PARTS[field].list) {
    if (p.keep) return undefined;
    const lines = [...p.picked, ...p.custom.map((c) => c.trim()).filter(Boolean)];
    return lines.length ? lines : undefined;
  }
  if (p.choice === "keep") return undefined;
  if (p.choice === "own") return p.own.trim() || undefined;
  return w.opts[field][p.choice];
}

function isArchieDefault(field) {
  const p = w.parts[field];
  if (PARTS[field].list)
    return !p.keep && !p.custom.length && p.picked.join("\n") === w.opts[field].slice(0, 2).join("\n");
  return p.choice === 0;
}

function snapshot() {
  return JSON.stringify(w.fields.map(valueOf));
}

// Archie's picks for every part nobody has made their own — not the ones the
// network already had, not the ones changed in this wizard.
function archieAll() {
  for (const field of w.fields) {
    if (networkEntry(w.data, w.net)?.[field] !== undefined) continue;
    if (JSON.stringify(w.parts[field]) !== w.startParts[field]) continue;
    w.parts[field] = initialPart(field, undefined, w.opts[field]);
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

function paint() {
  if (!w) return;
  const label = networkLabel(w.net);
  const onPart = w.step < review();
  const done = w.fields.map((f) => valueOf(f) !== undefined);
  headEl.innerHTML = `
    ${progressRingHtml(w.net, {
      done,
      current: onPart ? w.step : -1,
      // A part the product just added, still on the base in the draft: orange.
      attention: w.fields.map((f) => isNewPart(f) && valueOf(f) === undefined),
      size: 48,
    })}
    <div class="vw__titles">
      <span class="ap-dialog-title" id="vwTitle">Optimize your ${esc(label)} voice</span>
      <span class="ap-dialog-subtitle">${
        onPart ? `${esc(PARTS[w.fields[w.step]].title)} · ${w.step + 1} of ${review()}` : "Review your choices"
      }</span>
    </div>`;
  bodyEl.innerHTML = `
    <div class="vw__main">${onPart ? renderPart(w.fields[w.step]) : renderReview()}</div>
    <div class="vw__aside">
      <p class="vw__aside-title"><i class="${networkIcon(w.net)}" aria-hidden="true"></i>Preview on ${esc(label)}</p>
      ${renderPreview(onPart ? w.fields[w.step] : null)}
    </div>`;
  paintFooter();
}

function paintFooter() {
  const label = networkLabel(w.net);
  if (w.leaving) {
    footLeftEl.innerHTML = `<span class="vw__leave">Your choices aren't saved yet.</span>`;
    footRightEl.innerHTML = `
      <button type="button" class="ap-button ghost grey" data-vw-discard>Discard changes</button>
      <button type="button" class="ap-button primary blue" data-vw-stay>Keep editing</button>`;
    return;
  }
  const onPart = w.step < review();
  // Left: the one-click way, kept — every part at Archie's pick, then review.
  footLeftEl.innerHTML = onPart
    ? `<button type="button" class="ap-button ghost grey" data-vw-archie><i class="ap-icon-sparkles" aria-hidden="true"></i><span>Use all of Archie's picks</span></button>`
    : "";
  footRightEl.innerHTML = `
    ${w.step > 0 ? `<button type="button" class="ap-button stroked grey" data-vw-back><i class="ap-icon-arrow-left" aria-hidden="true"></i><span>Back</span></button>` : ""}
    ${onPart ? `<button type="button" class="ap-button ghost grey" data-vw-skip>Skip</button>` : ""}
    ${
      onPart
        ? `<button type="button" class="ap-button primary blue" data-vw-next>Next</button>`
        : `<button type="button" class="ap-button primary orange" data-vw-save><span>Save ${esc(label)} voice</span></button>`
    }`;
}

// The base's version of a part, shortened for one line.
function baseSummary(field) {
  const v = baseValue(field);
  if (Array.isArray(v)) {
    const list = v.filter((x) => x && !/\[[^\]]*\]/.test(x));
    if (!list.length) return "Nothing set yet";
    return `“${list[0]}”${list.length > 1 ? ` and ${list.length - 1} more` : ""}`;
  }
  return v || "Nothing set yet";
}

function baseValue(field) {
  if (field === "signatureHooks" || field === "closingPatterns") return resolvedVoice(w.data, w.base)[field];
  return w.data[field] || "";
}

const ARCHIE_MARK = `<span class="vw-option__archie" title="Archie's pick"><i class="ap-icon-sparkles" aria-hidden="true"></i></span>`;

function renderPart(field) {
  const P = PARTS[field];
  const p = w.parts[field];
  const label = networkLabel(w.net);
  const baseLabel = networkLabel(w.base);
  const head = `<h3 class="vw__ask">${esc(P.ask(label))}${
    isNewPart(field) ? ` <span class="ap-status orange vw__new">New in your voice</span>` : ""
  }</h3>
    <p class="vw__hint">I picked these from how posts work on ${esc(label)}. Change anything.</p>`;
  if (P.list) {
    const rows = w.opts[field]
      .map((o, i) => {
        const on = !p.keep && p.picked.includes(o);
        return `<label class="ap-checkbox-container vw-option${p.keep ? " is-off" : ""}">
          <input type="checkbox" data-vw-pick="${i}" ${on ? "checked" : ""} ${p.keep ? "disabled" : ""} />
          <i aria-hidden="true"></i>
          <span class="vw-option__text">“${esc(o)}”</span>
          ${i < 2 ? ARCHIE_MARK : ""}
        </label>`;
      })
      .join("");
    const custom = p.custom
      .map(
        (c, i) => `<div class="vw-option vw-option--own${p.keep ? " is-off" : ""}">
          <span class="vw-option__text">“${esc(c)}”</span>
          <button type="button" class="ap-icon-button transparent grey" data-vw-unadd="${i}" aria-label="Remove this line" ${p.keep ? "disabled" : ""}><i class="ap-icon-close"></i></button>
        </div>`,
      )
      .join("");
    return `${head}
      <div class="vw-options">${rows}${custom}</div>
      <div class="vw-add">
        <div class="ap-input-group"><input type="text" data-vw-add placeholder="${esc(P.add)}" aria-label="${esc(P.add)}" ${p.keep ? "disabled" : ""} /></div>
        <button type="button" class="ap-button stroked blue" data-vw-add-btn ${p.keep ? "disabled" : ""}><i class="ap-icon-plus" aria-hidden="true"></i><span>Add</span></button>
      </div>
      <label class="ap-checkbox-container vw-option vw-option--keep">
        <input type="checkbox" data-vw-keep ${p.keep ? "checked" : ""} />
        <i aria-hidden="true"></i>
        <span class="vw-option__text">${esc(P.keep(baseLabel))}<span class="vw-option__sub">${esc(baseSummary(field))}</span></span>
      </label>`;
  }
  const radio = (value, title, text, archie = false) => `
    <label class="ap-radio-card card vw-radio">
      <input type="radio" name="vw-choice" data-vw-choice="${value}" ${String(p.choice) === String(value) ? "checked" : ""} />
      <div class="vw-radio__body">
        <span class="ap-radio-card-title">${esc(title)}${archie ? ARCHIE_MARK : ""}</span>
        ${text ? `<span class="vw-radio__text">${esc(text)}</span>` : ""}
      </div>
    </label>`;
  return `${head}
    <div class="vw-options">
      ${radio(0, "Archie's pick", w.opts[field][0], true)}
      ${radio(1, "Another way", w.opts[field][1])}
      ${radio("keep", P.keep(baseLabel), baseSummary(field))}
      ${radio("own", "Write my own", "")}
      ${
        p.choice === "own"
          ? `<div class="ap-textarea-field resizable vw-own"><textarea data-vw-own rows="3" placeholder="${esc(P.add)}" aria-label="${esc(P.add)}">${esc(p.own)}</textarea></div>`
          : ""
      }
    </div>`;
}

function renderReview() {
  const label = networkLabel(w.net);
  const baseLabel = networkLabel(w.base);
  const rows = w.fields
    .map((field, i) => {
      const v = valueOf(field);
      const shown =
        v === undefined
          ? baseSummary(field)
          : Array.isArray(v)
            ? `“${v[0]}”${v.length > 1 ? ` and ${v.length - 1} more` : ""}`
            : v;
      return `<li class="pb2-nv-row vw-review__row">
      <span class="pb2-nv-row__name">${esc(PARTS[field].title)}</span>
      <span class="vw-review__value">
        ${v === undefined ? `<span class="ap-status grey">Same as ${esc(baseLabel)}</span>` : `<span class="ap-status green">Optimized</span>`}
        <span class="vw-review__text">${esc(shown)}</span>
      </span>
      <span class="pb2-nv-row__action"><button type="button" class="ap-button ghost blue" data-vw-goto="${i}">Change</button></span>
    </li>`;
    })
    .join("");
  const n = w.fields.filter((f) => valueOf(f) !== undefined).length;
  return `<h3 class="vw__ask">Your ${esc(label)} voice</h3>
    <p class="vw__hint">${n} of ${review()} parts optimized for ${esc(label)}. The others follow your ${esc(baseLabel)} voice.</p>
    <ul class="pb2-nv-rows vw-review">${rows}</ul>`;
}

// ── The preview ──────────────────────────────────────────────────────────────
// A sample post in the network's shape, written with the draft. Hooks and
// closings are the draft's own lines; formatting and emoji & casing are read
// for a few tell-tale words.
// ponytail: keyword-read mock of how a layout or an emoji rule reshapes a post;
// the real preview is the generator writing a post with the draft voice.

function sampleBody() {
  const first = String(w.data.businessSummary || "")
    .split(/(?<=[.!?])\s+/)[0]
    .trim();
  const lead = first && first.length <= 160 ? first : "We changed how our team plans a week of posts.";
  return [lead, "Three habits made the difference. The last one surprised us."];
}

function hashtagsFor(n) {
  const brand = String(w.data.name || "Brand")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)[0];
  return [brand, "SocialMedia", "ContentStrategy", "MarketingOps", "Growth"].slice(0, n).map((t) => `#${t}`);
}

function hashtagCount(text) {
  const t = text.toLowerCase();
  if (/no hashtags?/.test(t)) return 0;
  if (/one hashtag|1 hashtag/.test(t)) return 1;
  if (/two hashtags|two niche/.test(t)) return 2;
  if (/three|3 hashtags/.test(t)) return 3;
  if (/five|four/.test(t)) return 5;
  return /hashtag/.test(t) ? 2 : 0;
}

function composePost() {
  const pick = (field) => {
    const v = valueOf(field);
    return v === undefined ? baseValue(field) : v;
  };
  const firstLine = (list) => (Array.isArray(list) ? list : []).find((l) => l && !/\[[^\]]*\]/.test(l)) || "";
  const formatting = String(pick("formattingStyle") || "");
  const visual = String(pick("visualStyle") || "");
  let hook = firstLine(pick("signatureHooks"));
  let body = sampleBody();
  let closing = firstLine(pick("closingPatterns"));
  if (/thread/i.test(formatting)) body = body.map((b, i) => `${i + 1}/ ${b}`);
  else if (/one idea|one-line caption|one line|single line|one short paragraph/i.test(formatting)) body = [body[0]];
  else if (/short paragraphs|line breaks|air between|three beats|short lines/i.test(formatting))
    body = body.flatMap((b) => b.split(/(?<=[.!?])\s+/));
  if (/no emoji/i.test(visual)) {
    /* nothing to add */
  } else if (/emoji as line bullets/i.test(visual)) body = body.map((b) => `✔︎ ${b}`);
  else if (/emoji/i.test(visual)) hook = hook ? `✨ ${hook}` : hook;
  if (/all lowercase|lowercase is fine|lowercase welcome/i.test(visual)) {
    hook = hook.toLowerCase();
    body = body.map((b) => b.toLowerCase());
    closing = closing.toLowerCase();
  }
  return { hook, body, closing, hashtags: hashtagsFor(hashtagCount(visual)) };
}

// Built by concatenation: .vwp__media--square / --tall / --wide (voice-wizard.css).
const MEDIA = { instagram: "square", tiktok: "tall", youtube: "wide" };

function renderPreview(touched) {
  const net = w.net;
  const post = composePost();
  const name = w.data.name || "Your brand";
  const handle = `@${String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")}`;
  const usesHandle = net === "x" || net === "instagram" || net === "tiktok";
  const color = (w.data.brandColors || [])[0]?.hex || "";
  const avatar = w.data.brandLogo
    ? `<img src="${esc(w.data.brandLogo)}" alt="" />`
    : `<span>${esc(String(name).charAt(0).toUpperCase())}</span>`;
  const mark = (on, inner) => (inner ? `<p class="vwp__line${on ? " is-touched" : ""}">${inner}</p>` : "");
  const all = touched === "visualStyle";
  const media = MEDIA[net]
    ? `<div class="vwp__media vwp__media--${MEDIA[net]}">${w.data.brandLogo ? `<img src="${esc(w.data.brandLogo)}" alt="" />` : `<span>${esc(name)}</span>`}</div>`
    : "";
  const caption = `
    ${mark(touched === "signatureHooks" || all, esc(post.hook))}
    <div class="vwp__body${touched === "formattingStyle" || all ? " is-touched" : ""}">${post.body.map((b) => `<p class="vwp__line">${esc(b)}</p>`).join("")}</div>
    ${mark(touched === "closingPatterns" || all, esc(post.closing))}
    ${post.hashtags.length ? `<p class="vwp__line vwp__tags${all ? " is-touched" : ""}">${esc(post.hashtags.join(" "))}</p>` : ""}`;
  return `<article class="vwp vwp--${esc(net)}" aria-label="Sample ${esc(networkLabel(net))} post">
      <header class="vwp__head">
        <span class="vwp__avatar"${color && !w.data.brandLogo ? ` style="background:${esc(color)}"` : ""}>${avatar}</span>
        <span class="vwp__who"><span class="vwp__name">${esc(usesHandle ? handle : name)}</span><span class="vwp__meta">Just now</span></span>
        <i class="${networkIcon(net)} vwp__net" aria-hidden="true"></i>
      </header>
      ${net === "youtube" ? media : ""}
      ${net === "instagram" || net === "tiktok" ? media : ""}
      <div class="vwp__caption">${caption}</div>
    </article>`;
}

// ── Events ───────────────────────────────────────────────────────────────────

function go(step) {
  w.step = Math.max(0, Math.min(review(), step));
  paint();
  focusFirst();
}

function focusFirst() {
  (bodyEl.querySelector(".vw__main input:not([disabled]), .vw__main button") || panel)?.focus?.({
    preventScroll: true,
  });
}

function addLine(field) {
  const input = bodyEl.querySelector("[data-vw-add]");
  const text = (input?.value || "").trim();
  if (!text) return;
  const p = w.parts[field];
  if (!p.custom.includes(text) && !w.opts[field].includes(text)) p.custom.push(text);
  else if (w.opts[field].includes(text) && !p.picked.includes(text)) p.picked.push(text);
  paint();
  bodyEl.querySelector("[data-vw-add]")?.focus();
}

function onClick(event) {
  if (!w) return;
  const t = event.target;
  const field = w.fields[w.step];
  if (t.closest("[data-vw-close]")) return requestClose();
  if (t.closest("[data-vw-discard]")) return close();
  if (t.closest("[data-vw-stay]")) {
    w.leaving = false;
    return paint();
  }
  if (t.closest("[data-vw-next]")) return go(w.step + 1);
  if (t.closest("[data-vw-back]")) return go(w.step - 1);
  if (t.closest("[data-vw-skip]")) {
    // Skip = this part keeps following the base voice.
    if (PARTS[field].list) w.parts[field].keep = true;
    else w.parts[field].choice = "keep";
    return go(w.step + 1);
  }
  if (t.closest("[data-vw-archie]")) {
    archieAll();
    return go(review());
  }
  const gotoBtn = t.closest("[data-vw-goto]");
  if (gotoBtn) return go(Number(gotoBtn.dataset.vwGoto));
  if (t.closest("[data-vw-add-btn]")) return addLine(field);
  const unadd = t.closest("[data-vw-unadd]");
  if (unadd) {
    w.parts[field].custom.splice(Number(unadd.dataset.vwUnadd), 1);
    return paint();
  }
  if (t.closest("[data-vw-save]")) {
    const values = {};
    for (const f of w.fields) values[f] = valueOf(f);
    const defined = w.fields.filter((f) => values[f] !== undefined);
    const drafted = defined.length > 0 && defined.every((f) => isArchieDefault(f));
    const onSave = w.onSave;
    close();
    onSave?.({ values, drafted });
  }
}

function onChange(event) {
  if (!w) return;
  const t = event.target;
  const field = w.fields[w.step];
  const p = w.parts[field];
  if (t.matches("[data-vw-pick]")) {
    const option = w.opts[field][Number(t.dataset.vwPick)];
    const set = new Set(p.picked);
    if (t.checked) set.add(option);
    else set.delete(option);
    p.picked = w.opts[field].filter((o) => set.has(o)); // keep Archie's order
    return paint();
  }
  if (t.matches("[data-vw-keep]")) {
    p.keep = t.checked;
    return paint();
  }
  if (t.matches("[data-vw-choice]")) {
    const v = t.dataset.vwChoice;
    p.choice = v === "keep" || v === "own" ? v : Number(v);
    paint();
    if (v === "own") bodyEl.querySelector("[data-vw-own]")?.focus();
  }
}

// Typing in "Write my own" updates the preview without repainting the field.
function onInput(event) {
  if (!w || !event.target.matches("[data-vw-own]")) return;
  w.parts[w.fields[w.step]].own = event.target.value;
  const aside = bodyEl.querySelector(".vw__aside .vwp");
  if (aside) aside.outerHTML = renderPreview(w.fields[w.step]);
}

function onKeydown(event) {
  if (!w) return;
  if (event.key === "Enter" && event.target.matches("[data-vw-add]")) {
    event.preventDefault();
    addLine(w.fields[w.step]);
  }
}

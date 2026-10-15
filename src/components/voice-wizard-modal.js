// voice-wizard-modal — "Optimize your Instagram voice" (flag networkVoices).
//
// Every Optimize on the Voice tab opens it: the parts of a network voice, one
// step each (Opens with · Closes with · Formatting · Emoji & casing …), then a
// review. A step reads top to bottom: what the network itself says about this
// part (a DS infobox — the reason before the picks), then Leave as default
// (the part follows the base voice) or Make it {network}'s, then the choices:
// for lines, Archie's suggestions and your own in ONE list you order by
// preference (drag, or ↑ ↓ on a row's handle) — the checked lines, in that
// order, are the value; for a single-value part, Archie's pick · another way ·
// your own. A live preview of a post on that network changes as you choose.
// The progress ring in the header is the one on the Voice tab.
//
// A STAGED draft (the objective modal's pattern): nothing reaches the Playbook
// until Save; the host gets the four final values and writes them. Leaving with
// changes asks — in here, never through confirm-modal (requestOpen would close
// this dialog to open it).
//
// Public API: init() · open({ data, network, part?, onSave(result) }) · close()
//   result = { values: { [field]: value | undefined }, drafted: boolean }
//   undefined = the part follows the base voice.

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1806";
import { escapeHtml as esc } from "../utils.js?v=1806";
import { networkVoiceOptions, networkGuidance } from "../context-mock-analysis.js?v=1806";
import {
  networkFields,
  isNewPart,
  networkLabel,
  networkIcon,
  baseNetwork,
  networkEntry,
  resolvedVoice,
  progressRingHtml,
} from "../network-voice.js?v=1806";

const MODAL_ID = "voiceWizard";

const PARTS = {
  signatureHooks: {
    title: "Opens with",
    list: true,
    ask: (n) => `How do your posts open on ${n}?`,
    add: "Write your own opening line…",
  },
  closingPatterns: {
    title: "Closes with",
    list: true,
    ask: (n) => `How do your posts end on ${n}?`,
    add: "Write your own closing line…",
  },
  formattingStyle: {
    title: "Formatting",
    list: false,
    ask: (n) => `How should a post be laid out on ${n}?`,
    add: "How posts are structured on this network…",
  },
  hashtagStyle: {
    title: "Hashtags",
    list: false,
    ask: (n) => `How do you use hashtags on ${n}?`,
    add: "How many, where, which kind…",
  },
  visualStyle: {
    title: "Emoji & casing",
    list: false,
    ask: (n) => `Emoji, casing and hashtags on ${n}?`,
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
//   list part: { keep, order: string[], picked: string[] } — order = every line
//     (Archie's + yours) in preference order; picked = the checked ones
//   text part: { choice: 0 | 1 | "keep" | "own", own, prev } — prev = the choice
//     to come back to when you leave "default"
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
  panel.addEventListener("dragstart", onDragStart);
  panel.addEventListener("dragover", onDragOver);
  panel.addEventListener("drop", onDrop);
  panel.addEventListener("dragend", onDragEnd);
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
    if (value === undefined) return { keep: false, order: [...options], picked: options.slice(0, 2) };
    // The saved order first, then Archie's other options to pick from.
    return { keep: false, order: [...value, ...options.filter((o) => !value.includes(o))], picked: [...value] };
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
    const lines = p.order.filter((l) => p.picked.includes(l));
    return lines.length ? lines : undefined;
  }
  if (p.choice === "keep") return undefined;
  if (p.choice === "own") return p.own.trim() || undefined;
  return w.opts[field][p.choice];
}

function isArchieDefault(field) {
  const p = w.parts[field];
  if (PARTS[field].list) return !p.keep && (valueOf(field) || []).join("\n") === w.opts[field].slice(0, 2).join("\n");
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

// What the network itself recommends for this part — the reason before the
// picks. The DS infobox, the network's glyph in place of the info icon.
function renderGuidance(field) {
  const lines = networkGuidance(w.net, field);
  if (!lines.length) return "";
  return `<div class="ap-infobox info has-title vw-guide">
      <i class="${networkIcon(w.net)}" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-title">What ${esc(networkLabel(w.net))} says</span>
          ${lines.map((l) => `<span class="ap-infobox-message">${esc(l)}</span>`).join("")}
        </div>
      </div>
    </div>`;
}

// Leave as default (the part follows the base voice) or make it the network's.
function renderMode(field, isDefault) {
  const label = networkLabel(w.net);
  const card = (value, title, text, on) => `
    <label class="ap-radio-card card vw-radio">
      <input type="radio" name="vw-mode" data-vw-mode="${value}" ${on ? "checked" : ""} />
      <div class="vw-radio__body">
        <span class="ap-radio-card-title">${esc(title)}</span>
        <span class="vw-radio__text">${esc(text)}</span>
      </div>
    </label>`;
  return `<div class="vw-mode" role="radiogroup" aria-label="${esc(PARTS[field].title)}">
      ${card("default", "Leave as default", `Same as your ${networkLabel(w.base)} voice: ${baseSummary(field)}`, isDefault)}
      ${card("own", `Make it ${label}'s`, PARTS[field].list ? "Pick, write and order the lines." : "Pick one, or write your own.", !isDefault)}
    </div>`;
}

function renderPart(field) {
  const P = PARTS[field];
  const p = w.parts[field];
  const isDefault = P.list ? p.keep : p.choice === "keep";
  const head = `<h3 class="vw__ask">${esc(P.ask(networkLabel(w.net)))}${
    isNewPart(field) ? ` <span class="ap-status orange vw__new">New in your voice</span>` : ""
  }</h3>
    ${renderGuidance(field)}
    ${renderMode(field, isDefault)}`;
  if (isDefault) return head;
  if (P.list) {
    const n = p.order.length;
    const rows = p.order
      .map((line, i) => {
        const own = !w.opts[field].includes(line);
        const archie = w.opts[field].slice(0, 2).includes(line);
        return `<div class="vw-option vw-line" data-vw-line="${i}" draggable="true">
          <button type="button" class="ap-icon-button transparent grey vw-line__handle" data-vw-handle="${i}" aria-label="${esc(`Move “${line}” — ${i + 1} of ${n}. Use the up and down arrow keys.`)}"><i class="ap-icon-move"></i></button>
          <label class="ap-checkbox-container vw-line__check">
            <input type="checkbox" data-vw-pick="${i}" ${p.picked.includes(line) ? "checked" : ""} />
            <i aria-hidden="true"></i>
            <span class="vw-option__text">“${esc(line)}”</span>
          </label>
          ${
            own
              ? `<button type="button" class="ap-icon-button transparent grey" data-vw-unadd="${i}" aria-label="Remove this line"><i class="ap-icon-close"></i></button>`
              : archie
                ? ARCHIE_MARK
                : ""
          }
        </div>`;
      })
      .join("");
    return `${head}
      <div class="vw-list-head"><span class="vw-list-head__title">Suggestions</span><span class="vw-list-head__hint">Drag to order by preference</span></div>
      <div class="vw-options">${rows}</div>
      <div class="vw-add">
        <div class="ap-input-group"><input type="text" data-vw-add placeholder="${esc(P.add)}" aria-label="${esc(P.add)}" /></div>
        <button type="button" class="ap-button stroked blue" data-vw-add-btn><i class="ap-icon-plus" aria-hidden="true"></i><span>Add</span></button>
      </div>`;
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
    <div class="vw-list-head"><span class="vw-list-head__title">Suggestions</span></div>
    <div class="vw-options">
      ${radio(0, "Archie's pick", w.opts[field][0], true)}
      ${radio(1, "Another way", w.opts[field][1])}
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

// A line you write goes to the end of the list, checked.
function addLine(field) {
  const input = bodyEl.querySelector("[data-vw-add]");
  const text = (input?.value || "").trim();
  if (!text) return;
  const p = w.parts[field];
  if (!p.order.includes(text)) p.order.push(text);
  if (!p.picked.includes(text)) p.picked.push(text);
  paint();
  bodyEl.querySelector("[data-vw-add]")?.focus();
}

// Preference order: move one line, by drag or by ↑ ↓ on its handle.
function moveLine(field, from, to) {
  const order = w.parts[field].order;
  if (to < 0 || to >= order.length || from === to) return false;
  const [line] = order.splice(from, 1);
  order.splice(to, 0, line);
  return true;
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
    const p = w.parts[field];
    const [line] = p.order.splice(Number(unadd.dataset.vwUnadd), 1);
    p.picked = p.picked.filter((l) => l !== line);
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
    const line = p.order[Number(t.dataset.vwPick)];
    p.picked = t.checked ? [...p.picked, line] : p.picked.filter((l) => l !== line);
    return paint();
  }
  if (t.matches("[data-vw-mode]")) {
    const toDefault = t.dataset.vwMode === "default";
    if (PARTS[field].list) p.keep = toDefault;
    else if (toDefault) {
      if (p.choice !== "keep") p.prev = p.choice;
      p.choice = "keep";
    } else p.choice = p.prev ?? 0;
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
  // ↑ ↓ on a row's handle: the keyboard way to reorder; focus follows the line.
  const handle = event.target.closest?.("[data-vw-handle]");
  if (handle && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    event.preventDefault();
    const from = Number(handle.dataset.vwHandle);
    const to = from + (event.key === "ArrowUp" ? -1 : 1);
    if (!moveLine(w.fields[w.step], from, to)) return;
    paint();
    bodyEl.querySelector(`[data-vw-handle="${to}"]`)?.focus();
  }
}

// Drag a row onto another to put it there. The row under the pointer takes
// the blue border (the drop target); the dragged one fades.
let dragFrom = -1;

function onDragStart(event) {
  const row = event.target.closest?.("[data-vw-line]");
  if (!w || !row) return;
  dragFrom = Number(row.dataset.vwLine);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(dragFrom));
  row.classList.add("is-dragging");
}

function onDragOver(event) {
  const row = event.target.closest?.("[data-vw-line]");
  if (!w || dragFrom < 0 || !row) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  bodyEl.querySelectorAll(".vw-line.is-drop").forEach((r) => r !== row && r.classList.remove("is-drop"));
  if (Number(row.dataset.vwLine) !== dragFrom) row.classList.add("is-drop");
}

function onDrop(event) {
  const row = event.target.closest?.("[data-vw-line]");
  if (!w || dragFrom < 0 || !row) return;
  event.preventDefault();
  const from = dragFrom;
  dragFrom = -1;
  if (moveLine(w.fields[w.step], from, Number(row.dataset.vwLine))) paint();
}

function onDragEnd() {
  dragFrom = -1;
  bodyEl
    ?.querySelectorAll(".vw-line.is-dragging, .vw-line.is-drop")
    .forEach((r) => r.classList.remove("is-dragging", "is-drop"));
}

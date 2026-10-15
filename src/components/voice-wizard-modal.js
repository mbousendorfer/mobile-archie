// voice-wizard-modal — "Optimize your Instagram voice" (flag networkVoices).
//
// Every Optimize on the Voice tab opens it: the parts of a network voice, one
// step each (Opens with · Closes with · Formatting · Emoji & casing …), then a
// review. The header names the steps — the DS stepper, each one clickable.
// A step: on the left, Leave as default (the part follows the base voice) or
// Make it {network}'s, then the choices. For lines: "Your … lines", the ones
// you keep, numbered in your order of preference (drag by the grip — the
// shared drag-reorder.js — or ↑ ↓ on it; × gives a line back), write your own,
// and under them, in the same list but lighter, his suggestions not kept yet
// (one click adds one). For a
// single-value part: Archie's pick · another way · your own. On the right,
// what the network itself recommends for that part.
// (2026-10-15: a live sample post stood in the right column; checkboxes AND an
// order in one list; a progress ring in the header whose "done" check read as
// "finished" on step 1; a Skip that said what "Leave as default" says.)
//
// A STAGED draft (the objective modal's pattern): nothing reaches the Playbook
// until Save; the host gets the four final values and writes them. Leaving with
// changes asks — in here, never through confirm-modal (requestOpen would close
// this dialog to open it).
//
// Public API: init() · open({ data, network, part?, onSave(result) }) · close()
//   result = { values: { [field]: value | undefined }, drafted: boolean }
//   undefined = the part follows the base voice.

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1823";
import { bindReorder } from "../drag-reorder.js?v=1823";
import { escapeHtml as esc } from "../utils.js?v=1823";
import { networkVoiceOptions, networkGuidance, networkGuidanceUrl } from "../context-mock-analysis.js?v=1823";
import {
  networkFields,
  isNewPart,
  networkLabel,
  networkIcon,
  baseNetwork,
  networkEntry,
  resolvedVoice,
} from "../network-voice.js?v=1823";

const MODAL_ID = "voiceWizard";

const PARTS = {
  signatureHooks: {
    title: "Opens with",
    list: true,
    yours: "Your opening lines",
    ask: (n) => `How do your posts open on ${n}?`,
    add: "Write your own opening line…",
  },
  closingPatterns: {
    title: "Closes with",
    list: true,
    yours: "Your closing lines",
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
    ask: (n) => `How do you use emoji and capitals on ${n}?`,
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
//   list part: { keep, lines: string[] } — the lines you keep, in preference
//     order; Archie's options not in it follow, as suggestions
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
  // Reorder the lines by their grip — the app's shared drag (drag-reorder.js).
  bindReorder(panel, (from, to) => {
    if (w) moveLine(w.fields[w.step], from, to);
    paint();
  });
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
  // The base network has no "default" to fall back on: the assistant works on
  // the base voice itself (the Playbook's own fields).
  const isBase = network === baseNetwork(data);
  const entry = isBase ? data : networkEntry(data, network) || {};
  const parts = {};
  // The parts on screen when it opens (a flag can add one — voiceParts()).
  const fields = networkFields().filter((f) => opts[f]);
  for (const field of fields) parts[field] = initialPart(field, own(entry[field]), opts[field]);
  const firstLeft = isBase ? -1 : fields.findIndex((f) => entry[f] === undefined);
  const asked = part ? fields.indexOf(part) : -1;
  w = {
    data,
    net: network,
    base: baseNetwork(data),
    isBase,
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

// A value worth starting from — an empty list or text counts as none.
function own(value) {
  if (Array.isArray(value)) return value.length ? value : undefined;
  return value ? value : undefined;
}

// What a part starts as: its own value when the network already has one,
// Archie's picks otherwise (the first two lines, the first option).
function initialPart(field, value, options) {
  if (PARTS[field].list) {
    return { keep: false, lines: value === undefined ? options.slice(0, 2) : [...value] };
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
    return p.lines.length ? [...p.lines] : undefined;
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
    const had = w.isBase ? own(w.data[field]) : networkEntry(w.data, w.net)?.[field];
    if (had !== undefined) continue;
    if (JSON.stringify(w.parts[field]) !== w.startParts[field]) continue;
    w.parts[field] = initialPart(field, undefined, w.opts[field]);
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

function paint() {
  if (!w) return;
  const label = networkLabel(w.net);
  const onPart = w.step < review();
  headEl.innerHTML = `
    <span class="ap-dialog-title vw__title" id="vwTitle"><i class="${networkIcon(w.net)}" aria-hidden="true"></i>Optimize your ${esc(label)} voice</span>
    ${renderSteps()}`;
  // Right column: what the network itself recommends for this step's part.
  // The review has none — it spans the dialog.
  const guide = onPart ? renderGuidance(w.fields[w.step]) : "";
  bodyEl.classList.toggle("vw__content--single", !guide);
  bodyEl.innerHTML = `
    <div class="vw__main">${onPart ? renderPart(w.fields[w.step]) : renderReview()}</div>
    ${guide}`;
  paintFooter();
}

// The DS stepper (CSS-UI .ap-stepper): every part, then Review. Passed steps
// read completed, the current one active; any step opens on click.
function renderSteps() {
  const names = [...w.fields.map((f) => PARTS[f].title), "Review"];
  return `<nav class="ap-stepper vw__steps" aria-label="Steps">${names
    .map((name, i) => {
      const state = i < w.step ? "completed" : i === w.step ? "active" : "pending";
      return `${i ? `<span class="ap-stepper-separator" aria-hidden="true"><i class="ap-icon-chevron-right"></i></span>` : ""}
        <div class="ap-stepper-item ${state} clickable" role="button" tabindex="0" data-vw-goto="${i}"${
          i === w.step ? ' aria-current="step"' : ""
        }><span>${state === "completed" ? `<i class="ap-icon-check" aria-hidden="true"></i>` : i + 1}</span><span>${esc(name)}</span></div>`;
    })
    .join("")}</nav>`;
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

// What the network itself recommends for this part — the reason behind
// Archie's picks, in the right column beside the choices.
function renderGuidance(field) {
  const label = esc(networkLabel(w.net));
  const items = networkGuidance(w.net, field);
  // The source, one click away (a new tab — the draft stays open here): the
  // page these sentences come from when they share one, else the network's
  // guidelines page.
  const sources = [...new Set(items.map((i) => i.source))];
  const url = sources.length === 1 ? sources[0] : networkGuidanceUrl(w.net);
  const body = items.length
    ? `<ul class="vw-guide">${items.map((i) => `<li>${esc(i.text)}</li>`).join("")}</ul>`
    : `<p class="vw-guide__none">${label} doesn't publish guidance on this part. My suggestions come from how posts that work there are written.</p>`;
  return `<aside class="vw__aside" aria-label="What ${label} says">
      <p class="vw__aside-title"><i class="${networkIcon(w.net)}" aria-hidden="true"></i>What ${label} says</p>
      ${body}
      ${
        url
          ? `<a class="ap-link standalone small vw-guide__link" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span>Read ${label}'s guidelines</span><i class="ap-icon-external-link" aria-hidden="true"></i></a>`
          : ""
      }
    </aside>`;
}

// Leave as default (the part follows the base voice) or make it the network's.
function renderMode(field, isDefault) {
  const label = networkLabel(w.net);
  const card = (value, title, text, on) => `
    <label class="ap-radio-card card vw-radio">
      <input type="radio" name="vw-mode" data-vw-mode="${value}" ${on ? "checked" : ""} />
      <div class="vw-radio__body">
        <span class="ap-radio-card-title">${esc(title)}</span>
        <span class="vw-radio__text" title="${esc(text)}">${esc(text)}</span>
      </div>
    </label>`;
  return `<div class="vw-mode" role="radiogroup" aria-label="${esc(PARTS[field].title)}">
      ${card("default", "Leave as default", `As on ${networkLabel(w.base)}: ${baseSummary(field)}`, isDefault)}
      ${card("own", `Make it ${label}'s`, `Written for ${label}, from my suggestions or your own.`, !isDefault)}
    </div>`;
}

function renderPart(field) {
  const P = PARTS[field];
  const p = w.parts[field];
  const isDefault = !w.isBase && (P.list ? p.keep : p.choice === "keep");
  const ask = `<h3 class="vw__ask">${esc(P.ask(networkLabel(w.net)))}${
    isNewPart(field) ? ` <span class="ap-status orange vw__new">New in your voice</span>` : ""
  }</h3>`;
  // Lines: first Leave as default / Make it X's, then the list. A one-value
  // part needs no such switch — "Leave as default" is simply its first choice
  // (two radio groups stacked read as a decision inside a decision).
  const head = `${ask}${w.isBase || !P.list ? "" : renderMode(field, isDefault)}`;
  if (P.list && isDefault) return head;
  if (P.list) {
    const n = p.lines.length;
    const kept = p.lines
      .map((line, i) => {
        const archie = w.opts[field].includes(line);
        return `<li class="vw-option vw-line app-reorder__item">
          <button type="button" class="app-reorder__grip" data-vw-handle="${i}" title="Drag to reorder" aria-label="${esc(`Move “${line}” — ${i + 1} of ${n}. Use the up and down arrow keys.`)}"><i class="ap-icon-move"></i></button>
          <span class="vw-line__rank" aria-hidden="true">${i + 1}</span>
          <span class="vw-option__text">“${esc(line)}”</span>
          ${archie ? ARCHIE_MARK : ""}
          <button type="button" class="ap-icon-button transparent grey" data-vw-unadd="${i}" aria-label="${esc(`Remove “${line}”`)}"><i class="ap-icon-close"></i></button>
        </li>`;
      })
      .join("");
    // Archie's other suggestions continue the same list, lighter: no card, a
    // + where the grip sits — one click and the line joins yours, last.
    const more = w.opts[field]
      .filter((o) => !p.lines.includes(o))
      .map(
        (o) => `<li><button type="button" class="vw-suggest" data-vw-take="${esc(o)}" aria-label="${esc(`Add “${o}”`)}">
          <i class="ap-icon-plus vw-suggest__plus" aria-hidden="true"></i>
          <span class="vw-option__text">“${esc(o)}”</span>
          ${ARCHIE_MARK}
        </button></li>`,
      )
      .join("");
    return `${head}
      <div class="vw-list-head"><span class="vw-list-head__title">${esc(P.yours)}</span>${
        n > 1 ? `<span class="vw-list-head__hint">I lead with the first one. Drag to reorder.</span>` : ""
      }</div>
      <div class="vw-lines">
        ${
          n
            ? `<ol class="vw-options app-reorder">${kept}</ol>`
            : `<p class="vw__empty">No line yet. Add one of my suggestions, or write your own.</p>`
        }
        ${more ? `<ul class="vw-suggests" aria-label="More suggestions">${more}</ul>` : ""}
      </div>
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
        ${text ? `<span class="vw-radio__text" title="${esc(text)}">${esc(text)}</span>` : ""}
      </div>
    </label>`;
  return `${head}
    <div class="vw-options">
      ${w.isBase ? "" : radio("keep", "Leave as default", `As on ${networkLabel(w.base)}: ${baseSummary(field)}`)}
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
          ? w.isBase
            ? "Not set yet"
            : baseSummary(field)
          : Array.isArray(v)
            ? `“${v[0]}”${v.length > 1 ? ` and ${v.length - 1} more` : ""}`
            : v;
      return `<li class="pb2-nv-row vw-review__row">
      <span class="pb2-nv-row__name">${esc(PARTS[field].title)}</span>
      <span class="vw-review__value">
        ${
          w.isBase
            ? "" // the base is the reference — nothing to be "the same as"
            : v === undefined
              ? `<span class="ap-status grey">Same as ${esc(baseLabel)}</span>`
              : `<span class="ap-status green">Optimized</span>`
        }
        <span class="vw-review__text">${esc(shown)}</span>
      </span>
      <span class="pb2-nv-row__action"><button type="button" class="ap-button ghost blue" data-vw-goto="${i}">Change</button></span>
    </li>`;
    })
    .join("");
  const n = w.fields.filter((f) => valueOf(f) !== undefined).length;
  return `<h3 class="vw__ask">Your ${esc(label)} voice</h3>
    <p class="vw__hint">${
      w.isBase
        ? `Every network that follows your ${esc(label)} voice picks up these changes.`
        : n === review()
          ? `Every part is written for ${esc(label)}.`
          : n === 0
            ? `Every part follows your ${esc(baseLabel)} voice.`
            : `${n} of ${review()} parts written for ${esc(label)}. The others follow your ${esc(baseLabel)} voice.`
    }</p>
    <ul class="pb2-nv-rows vw-review">${rows}</ul>`;
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

// A line you write goes to the end of your lines.
function addLine(field) {
  const input = bodyEl.querySelector("[data-vw-add]");
  const text = (input?.value || "").trim();
  if (!text) return;
  const p = w.parts[field];
  if (!p.lines.includes(text)) p.lines.push(text);
  paint();
  bodyEl.querySelector("[data-vw-add]")?.focus();
}

// Preference order: move one line, by drag or by ↑ ↓ on its handle.
function moveLine(field, from, to) {
  const order = w.parts[field].lines;
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
  if (t.closest("[data-vw-archie]")) {
    archieAll();
    return go(review());
  }
  const gotoBtn = t.closest("[data-vw-goto]");
  if (gotoBtn) return go(Number(gotoBtn.dataset.vwGoto));
  if (t.closest("[data-vw-add-btn]")) return addLine(field);
  const unadd = t.closest("[data-vw-unadd]");
  if (unadd) {
    w.parts[field].lines.splice(Number(unadd.dataset.vwUnadd), 1);
    return paint();
  }
  // One of Archie's other suggestions joins your lines, last.
  const take = t.closest("[data-vw-take]");
  if (take) {
    const p = w.parts[field];
    if (!p.lines.includes(take.dataset.vwTake)) p.lines.push(take.dataset.vwTake);
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

// Typing in "Write my own" keeps the draft current without repainting the field.
function onInput(event) {
  if (!w || !event.target.matches("[data-vw-own]")) return;
  w.parts[w.fields[w.step]].own = event.target.value;
}

function onKeydown(event) {
  if (!w) return;
  if (event.key === "Enter" && event.target.matches("[data-vw-add]")) {
    event.preventDefault();
    addLine(w.fields[w.step]);
  }
  // A step of the stepper is a div (the DS's markup): Enter / Space opens it.
  const step = event.target.closest?.("[data-vw-goto][role='button']");
  if (step && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    go(Number(step.dataset.vwGoto));
    return;
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

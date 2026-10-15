// voice-wizard-modal — "Optimize your Instagram voice" (flag networkVoices).
//
// Every Optimize on the Voice tab opens it: the parts of a network voice, one
// step each (Opens with · Closes with · Formatting · Emoji & casing …), then a
// review. The header names the steps — the DS stepper (V2 Atoms, ported as
// .app-stepper), each one clickable.
// A step: on the left, the choices — the job is to write this part for the
// network, so they come first, with nothing pre-picked. While nothing is
// picked the part keeps the base voice; a small note under the choices says
// so; "Use default voice" in the footer, beside Next, puts the part back on
// the base and moves on — the default is never offered as a choice.
// For lines: "Your … lines", the ones
// you keep, numbered in your order of preference (drag by the grip — the
// shared drag-reorder.js — or ↑ ↓ on it; × gives a line back), write your own,
// and under them, in the same list but lighter, his suggestions not kept yet
// (one click adds one). For a
// single-value part: Archie's pick · another way · your own. On the right,
// what the network itself recommends for that part.
// (2026-10-15: a live sample post stood in the right column; checkboxes AND an
// order in one list; a progress ring in the header whose "done" check read as
// "finished" on step 1; a Skip; "Leave as default / Make it X's" cards at the
// top of each step — the default set level with the job.)
//
// A STAGED draft (the objective modal's pattern): nothing reaches the Playbook
// until Save; the host gets the four final values and writes them. Leaving with
// changes asks — in here, never through confirm-modal (requestOpen would close
// this dialog to open it).
//
// Public API: init() · open({ data, network, part?, onSave(result) }) · close()
//   result = { values: { [field]: value | undefined }, drafted: boolean }
//   undefined = the part follows the base voice.

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1845";
import { bindReorder } from "../drag-reorder.js?v=1845";
import { escapeHtml as esc } from "../utils.js?v=1845";
import { networkVoiceOptions, networkGuidance, networkGuidanceUrl } from "../context-mock-analysis.js?v=1845";
import {
  networkFields,
  isNewPart,
  networkLabel,
  networkIcon,
  baseNetwork,
  networkEntry,
  resolvedVoice,
  progressRingHtml,
} from "../network-voice.js?v=1845";

const MODAL_ID = "voiceWizard";

const PARTS = {
  signatureHooks: {
    title: "Opens with",
    noun: "openings",
    list: true,
    yours: "Your opening lines",
    ask: (n) => `How do your posts open on ${n}?`,
    add: "Write your own opening line…",
  },
  closingPatterns: {
    title: "Closes with",
    noun: "closings",
    list: true,
    yours: "Your closing lines",
    ask: (n) => `How do your posts end on ${n}?`,
    add: "Write your own closing line…",
  },
  formattingStyle: {
    title: "Formatting",
    noun: "formatting",
    list: false,
    ask: (n) => `How should a post be laid out on ${n}?`,
    add: "How posts are structured on this network…",
  },
  hashtagStyle: {
    title: "Hashtags",
    noun: "hashtags",
    list: false,
    ask: (n) => `How do you use hashtags on ${n}?`,
    add: "How many, where, which kind…",
  },
  visualStyle: {
    title: "Emoji & casing",
    noun: "emoji and capitals",
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
//   list part: { lines: string[] } — the lines you keep, in preference
//     order; Archie's options not in it follow, as suggestions
//   text part: { choice: null | 0 | 1 | "own", own, before } — null = nothing
//     picked; before = the suggestion picked when you started typing your own
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

// What a part starts as: its own value when it has one, nothing picked
// otherwise (= it keeps the base voice). Archie's picks are suggestions to
// choose, never pre-selected: a Next must not optimize a part behind your back.
function initialPart(field, value, options) {
  if (PARTS[field].list) return { lines: value === undefined ? [] : [...value] };
  if (value === undefined) return { choice: null, own: "" };
  const i = options.indexOf(value);
  return i >= 0 ? { choice: i, own: "" } : { choice: "own", own: value };
}

// Archie's picks for a part — what "Use all of Archie's picks" writes: the
// first two lines, or the first option.
function archiePart(field, options) {
  return PARTS[field].list ? { lines: options.slice(0, 2) } : { choice: 0, own: "" };
}

// A part's final value — undefined = it follows the base voice.
function valueOf(field) {
  const p = w.parts[field];
  if (PARTS[field].list) return p.lines.length ? [...p.lines] : undefined;
  if (p.choice === null) return undefined;
  if (p.choice === "own") return p.own.trim() || undefined;
  return w.opts[field][p.choice];
}

function isArchieDefault(field) {
  const p = w.parts[field];
  if (PARTS[field].list) return (valueOf(field) || []).join("\n") === w.opts[field].slice(0, 2).join("\n");
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
    w.parts[field] = archiePart(field, w.opts[field]);
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

// The DS stepper — the V2 Atoms version (Figma 7873:1568), ported in
// ds-patches.css as .app-stepper until CSS-UI ships it: every part, then
// Review; the current step filled blue, the others outlined. Any step opens
// on click.
function renderSteps() {
  const names = [...w.fields.map((f) => PARTS[f].title), "Review"];
  return `<nav class="app-stepper vw__steps" aria-label="Steps">${names
    .map((name, i) => {
      const current = i === w.step;
      return `${i ? `<i class="ap-icon-chevron-right app-stepper__sep" aria-hidden="true"></i>` : ""}<button type="button" class="app-stepper__step${
        current ? " is-current" : ""
      }" data-vw-goto="${i}"${current ? ' aria-current="step"' : ""}><span class="app-stepper__badge">${i + 1}</span><span>${esc(name)}</span></button>`;
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
  // Left: the one-click way — every part at Archie's pick, then review. Archie
  // doing the work for you: the AI action, so primary orange (the house
  // convention), set apart on the left from the step's own Next (blue).
  footLeftEl.innerHTML = onPart
    ? `<button type="button" class="ap-button primary orange" data-vw-archie><i class="ap-icon-sparkles" aria-hidden="true"></i><span>Use all of Archie's picks</span></button>`
    : "";
  footRightEl.innerHTML = `
    ${w.step > 0 ? `<button type="button" class="ap-button stroked grey" data-vw-back><i class="ap-icon-arrow-left" aria-hidden="true"></i><span>Back</span></button>` : ""}
    ${
      // The base voice for this part, then on — beside Next, where a skip
      // goes (ghost grey), never as a choice among the options.
      onPart && !w.isBase
        ? `<button type="button" class="ap-button ghost grey" data-vw-skip>Use default voice</button>`
        : ""
    }
    ${
      onPart
        ? `<button type="button" class="ap-button primary blue" data-vw-next>Next</button>`
        : `<button type="button" class="ap-button primary orange" data-vw-save><span>Save ${esc(label)} voice</span></button>`
    }`;
}

function baseValue(field) {
  if (field === "signatureHooks" || field === "closingPatterns") return resolvedVoice(w.data, w.base)[field];
  return w.data[field] || "";
}

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

// The base voice, said small under the choices — never offered as a choice.
// Nothing picked: the part keeps it. Something picked: a small link back.
function renderDefaultNote(field) {
  if (w.isBase) return "";
  const what = `${networkLabel(w.base)} ${PARTS[field].noun}`;
  // Said while nothing is picked; going back to the base is the footer's
  // "Use default voice".
  return `<p class="vw-default"${valueOf(field) === undefined ? "" : " hidden"}>Until you pick one, ${esc(
    networkLabel(w.net),
  )} uses your ${esc(what)}.</p>`;
}

function renderPart(field) {
  const P = PARTS[field];
  const p = w.parts[field];
  const head = `<h3 class="vw__ask" tabindex="-1">${esc(P.ask(networkLabel(w.net)))}${
    isNewPart(field) ? ` <span class="ap-status orange vw__new">New in your voice</span>` : ""
  }</h3>`;
  if (P.list) {
    const n = p.lines.length;
    // Two sections, each element its own: your lines (white cards, a rank
    // badge, draggable) with the field to write one and the note on the base
    // under them; then "My suggestions" (grey cards, + Add). Every element
    // spans the column; 8px inside a section, 24px between sections.
    const kept = p.lines
      .map(
        (line, i) => `<li class="vw-kept app-reorder__item">
          <button type="button" class="app-reorder__grip" data-vw-handle="${i}" title="Drag to reorder" aria-label="${esc(`Move “${line}” — ${i + 1} of ${n}. Use the up and down arrow keys.`)}"><i class="ap-icon-move"></i></button>
          <span class="vw-kept__rank" aria-hidden="true">${i + 1}</span>
          <span class="vw-kept__text">“${esc(line)}”</span>
          <button type="button" class="ap-icon-button transparent grey" data-vw-unadd="${i}" aria-label="${esc(`Remove “${line}”`)}"><i class="ap-icon-close"></i></button>
        </li>`,
      )
      .join("");
    const more = w.opts[field]
      .filter((o) => !p.lines.includes(o))
      .map(
        (o) => `<li><button type="button" class="vw-pick" data-vw-take="${esc(o)}" aria-label="${esc(`Add “${o}”`)}">
          <span class="vw-pick__text">“${esc(o)}”</span>
          <span class="vw-pick__add" aria-hidden="true"><i class="ap-icon-plus"></i>Add</span>
        </button></li>`,
      )
      .join("");
    return `${head}
      <section class="vw-section">
        <div class="vw-list-head"><span class="vw-list-head__title">${esc(P.yours)}</span>${
          n > 1 ? `<span class="vw-list-head__hint">I lead with the first one. Drag to reorder.</span>` : ""
        }</div>
        ${n ? `<ol class="vw-stack app-reorder">${kept}</ol>` : ""}
        <div class="vw-add">
          <div class="ap-input-group"><input type="text" data-vw-add placeholder="${esc(P.add)}" aria-label="${esc(P.add)}" /></div>
          <button type="button" class="ap-button stroked blue" data-vw-add-btn><i class="ap-icon-plus" aria-hidden="true"></i><span>Add</span></button>
        </div>
        ${renderDefaultNote(field)}
      </section>
      ${
        more
          ? `<section class="vw-section">
              <div class="vw-list-head"><span class="vw-list-head__title" id="vwSuggestHead">My suggestions</span></div>
              <ul class="vw-stack" aria-labelledby="vwSuggestHead">${more}</ul>
            </section>`
          : ""
      }`;
  }
  // Every option is one of Archie's suggestions, so a card IS its text — no
  // "Archie's pick" / "Another way" titles. The one he recommends wears his
  // status (the butter .ap-status). Your own is not his: its own section,
  // "Your own", a field always open — typing in it makes it the choice (the
  // suggestions untick), picking a suggestion sets it aside (its text kept).
  const radio = (value, inner) => `
    <label class="ap-radio-card card vw-radio">
      <input type="radio" name="vw-choice" data-vw-choice="${value}" ${String(p.choice) === String(value) ? "checked" : ""} />
      <div class="vw-radio__body">${inner}</div>
    </label>`;
  const option = (i) =>
    radio(
      i,
      `<span class="vw-radio__option">${esc(w.opts[field][i])}</span>${
        i === 0 ? `<span class="ap-status mermaid vw-radio__pick">Archie's pick</span>` : ""
      }`,
    );
  return `${head}
    <section class="vw-section">
    <div class="vw-list-head"><span class="vw-list-head__title">My suggestions</span></div>
    <div class="vw-options">
      ${option(0)}
      ${option(1)}
    </div>
    </section>
    <section class="vw-section">
    <div class="vw-list-head"><label class="vw-list-head__title" for="vwOwn">Your own</label></div>
    <div class="ap-textarea-field resizable vw-own${p.choice === "own" ? " is-picked" : ""}"><textarea id="vwOwn" data-vw-own rows="3" placeholder="${esc(P.add)}">${esc(p.own)}</textarea></div>
    ${renderDefaultNote(field)}
    </section>`;
}

// The review is the voice as it will read: the network's band (its ring —
// closed with a check once every part is written for it — and one sentence),
// then the same blocks as the Voice tab, two by two, each with its whole
// content: lines as quote lines, text as prose. A part that keeps the base
// reads like on the tab — grey ground, "Same as LinkedIn", the base's words.
// Change, in each block's head, goes back to that step.
// (2026-10-15: a table of truncated values with a green pill per row.)
function renderReview() {
  const label = networkLabel(w.net);
  const baseLabel = networkLabel(w.base);
  const n = w.fields.filter((f) => valueOf(f) !== undefined).length;
  const sentence = w.isBase
    ? `Every network that follows your ${label} voice picks up these changes.`
    : n === review()
      ? `Every part is written for ${label}.`
      : n === 0
        ? `Every part follows your ${baseLabel} voice.`
        : `${n} of ${review()} parts written for ${label}. The others follow your ${baseLabel} voice.`;
  const lines = (list) =>
    `<ul class="pb2-lines">${list
      .filter(Boolean)
      .map((l) => `<li class="pb2-line"><i class="ap-icon-quote" aria-hidden="true"></i><span>${esc(l)}</span></li>`)
      .join("")}</ul>`;
  const blocks = w.fields
    .map((field, i) => {
      const v = valueOf(field);
      const borrowed = v === undefined && !w.isBase;
      const shown = v === undefined ? baseValue(field) : v;
      const empty = Array.isArray(shown) ? !shown.filter(Boolean).length : !String(shown || "").trim();
      const body = empty
        ? `<p class="pb2-empty">Not set yet.</p>`
        : Array.isArray(shown)
          ? lines(shown)
          : `<p class="pb2-prose">${esc(shown)}</p>`;
      return `<section class="pb2-block vw-review__block${borrowed ? " pb2-nv-placeholder" : ""}">
        <header class="pb2-block__head">
          <h3 class="pb2-block__title">${esc(PARTS[field].title)}</h3>
          ${borrowed ? `<span class="pb2-block__caption">Same as ${esc(baseLabel)}</span>` : ""}
          <button type="button" class="ap-button ghost blue vw-review__change" data-vw-goto="${i}">Change</button>
        </header>
        <div class="pb2-block__body">${body}</div>
      </section>`;
    })
    .join("");
  return `<div class="pb2-nv-progress vw-review__band">
      ${progressRingHtml(w.net, { done: w.fields.map((f) => valueOf(f) !== undefined), base: w.isBase, size: 56 })}
      <div class="pb2-nv-progress__text">
        <h3 class="pb2-nv-progress__count vw__ask" tabindex="-1">Your ${esc(label)} voice</h3>
        <p class="pb2-nv-progress__sub">${esc(sentence)}</p>
      </div>
    </div>
    <div class="vw-review">${blocks}</div>`;
}

// ── Events ───────────────────────────────────────────────────────────────────

function go(step) {
  w.step = Math.max(0, Math.min(review(), step));
  paint();
  focusFirst();
}

function focusFirst() {
  // The step's question: read first by a screen reader, and no control lit up
  // (the first button of a line step is a grip).
  (bodyEl.querySelector(".vw__ask") || panel)?.focus?.({
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
  // Use default voice: this part goes back to the base (nothing picked), on.
  if (t.closest("[data-vw-skip]")) {
    w.parts[field] = PARTS[field].list ? { lines: [] } : { choice: null, own: "" };
    return go(w.step + 1);
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
  if (t.matches("[data-vw-choice]")) {
    const v = t.dataset.vwChoice;
    p.choice = Number(v);
    paint();
  }
}

// Typing in "Write my own" keeps the draft current without repainting the field.
function onInput(event) {
  if (!w || !event.target.matches("[data-vw-own]")) return;
  const field = w.fields[w.step];
  const p = w.parts[field];
  p.own = event.target.value;
  // Typing makes your own text the choice. No repaint (the field keeps focus): the radios, the field's
  // picked edge and the note follow in place.
  // Emptying it gives back the suggestion picked before you typed, if any.
  if (p.own.trim()) {
    if (p.choice !== "own") p.before = p.choice;
    p.choice = "own";
  } else if (p.choice === "own") p.choice = p.before ?? null;
  bodyEl.querySelectorAll("[data-vw-choice]").forEach((r) => (r.checked = String(p.choice) === r.dataset.vwChoice));
  event.target.closest(".vw-own")?.classList.toggle("is-picked", p.choice === "own");
  const note = bodyEl.querySelector(".vw-default");
  if (note) note.hidden = valueOf(field) !== undefined;
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

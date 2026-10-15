// Hover preview for an inline reference in Archie's messages (chat-refs.js).
//
//   <button class="chat-ref" data-chat-ref="post:post-acme-1">…</button>
//
// Same mechanics as tooltip.js — document-delegated, mounted on <body> so no
// scroll container clips it, one at a time, gone on leave / Esc / scroll — but
// the body is the object's own card, drawn by the renderer the right panel
// uses, so the preview IS what a click opens. The card is inert: a picture of
// the object, not a second set of its controls.

import { resolveRef } from "../chat-refs.js?v=1829";
import { getIdeas, getSources } from "../library.js?v=1829";
import { renderPostEchoRow } from "./top-post-card.js?v=1829";
import { renderCompactIdeaCard } from "./idea-card-compact.js?v=1829";
import { renderSourceCard } from "./source-card.js?v=1829";

const ANCHOR_SEL = "[data-chat-ref]";
const DELAY = 250;
const GAP = 8;
const EDGE = 8;

let initialized = false;
let el = null;
let anchor = null;
let timer = null;

export function init() {
  if (initialized) return;
  initialized = true;
  document.addEventListener("mouseover", onOver);
  document.addEventListener("mouseout", onOut);
  document.addEventListener("focusin", (e) => (e.target.matches?.(ANCHOR_SEL) ? schedule(e.target) : hide()));
  document.addEventListener("focusout", hide);
  document.addEventListener("scroll", hide, true);
  document.addEventListener("click", hide, true);
  window.addEventListener("resize", hide);
  document.addEventListener("keydown", (e) => e.key === "Escape" && hide());
}

function onOver(event) {
  const next = event.target.closest?.(ANCHOR_SEL);
  if (next && next !== anchor) schedule(next);
}

function onOut(event) {
  if (!anchor || event.target.closest?.(ANCHOR_SEL) !== anchor) return;
  if (anchor.contains(event.relatedTarget)) return;
  hide();
}

function schedule(next) {
  hide();
  anchor = next;
  timer = setTimeout(show, DELAY);
}

function body(kind, obj, sessionId) {
  if (kind === "post") return renderDraftRow(obj);
  if (kind === "idea") return renderCompactIdeaCard(obj, getSources(sessionId), { showMention: false });
  return renderSourceCard(obj, getIdeas(sessionId), { sessionId });
}

// A draft, in the compact post row the thread already uses for a top post
// (renderPostEchoRow): thumbnail, posting profile, two lines of copy. A draft has
// no metrics, and its state (ready, needs fixes) isn't what a glance is for.
function renderDraftRow(post) {
  const text = (Array.isArray(post.text) ? post.text.join(" ") : post.text || "").replace(/<[^>]*>/g, "");
  const image = post.imageUrl || (Array.isArray(post.carousel) ? post.carousel[0] : null);
  const mediaType = image ? "image" : post.clipRef ? "video" : "text";
  return renderPostEchoRow({ network: post.network, when: "Draft", excerpt: text, mediaType, image });
}

function show() {
  timer = null;
  if (!anchor || !document.body.contains(anchor)) return;
  const [kind, id] = anchor.dataset.chatRef.split(/:(.*)/s);
  const sessionId = anchor.dataset.chatRefSession;
  const obj = resolveRef(kind, id, sessionId);
  if (!obj) return;
  el = document.createElement("div");
  el.className = `chat-ref-preview chat-ref-preview--${kind}`;
  el.setAttribute("role", "tooltip");
  el.inert = true;
  el.innerHTML = body(kind, obj, sessionId);
  document.body.appendChild(el);
  place();
  watchAnchor();
}

// A thread re-render (a new turn lands) replaces the anchor without any
// mouseout — the card would outlive what it points at. Checked per frame, only
// while a card is open.
function watchAnchor() {
  if (!el) return;
  if (!anchor?.isConnected) return hide();
  requestAnimationFrame(watchAnchor);
}

export function hide() {
  clearTimeout(timer);
  timer = null;
  if (el) el.remove();
  el = null;
  anchor = null;
}

// Above the reference, flipped below when there isn't room, clamped to the viewport.
function place() {
  const a = anchor.getBoundingClientRect();
  // offset*, not getBoundingClientRect: the entry animation's translate would skew it.
  const t = { width: el.offsetWidth, height: el.offsetHeight };
  let top = a.top - t.height - GAP;
  if (top < EDGE) {
    top = Math.min(a.bottom + GAP, window.innerHeight - t.height - EDGE);
    el.classList.add("is-below"); // so it rises from the reference, not into it
  }
  const left = Math.min(Math.max(a.left, EDGE), Math.max(EDGE, window.innerWidth - t.width - EDGE));
  el.style.top = `${Math.round(Math.max(EDGE, top) + window.scrollY)}px`;
  el.style.left = `${Math.round(left + window.scrollX)}px`;
}

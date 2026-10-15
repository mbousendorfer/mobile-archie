// Inline references in Archie's messages — the ONE way Archie names a draft, an
// idea or a source it is talking about.
//
//   "I drafted [[post:post-acme-1]] from [[idea:idea-acme-1]]."
//
// The token carries the id only; the label is resolved from THIS session's
// stores at render time, so a renamed idea reads right and a deleted draft
// degrades to plain text instead of a dead link. Rendered as an underlined
// inline button (`.chat-ref`): hover previews the object (ref-preview.js),
// click opens it in the right panel (session.js → focusInPanel).

import { getPosts } from "./posts-store.js?v=1833";
import { getIdeas, getSources } from "./library.js?v=1833";
import { networkLabel } from "./network-voice.js?v=1833";
import { getQueue } from "./schedule-store.js?v=1833";
import { escapeHtml, escapeAttr } from "./utils.js?v=1833";

const TOKEN = /\[\[(post|idea|source):([^\]\s]+)\]\]/g;
const GONE = { post: "a deleted draft", idea: "a deleted idea", source: "a deleted source" };

export function resolveRef(kind, id, sessionId) {
  if (!sessionId) return null;
  if (kind === "post") return getPosts(sessionId).find((p) => p.id === id) || null;
  if (kind === "idea") return getIdeas(sessionId).find((i) => i.id === id) || null;
  if (kind === "source") return getSources(sessionId).find((s) => s.id === id) || null;
  return null;
}

function plain(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

// Network + the opening words — two LinkedIn drafts must not read the same.
function postLabel(post) {
  const first = plain(Array.isArray(post.text) ? post.text[0] : post.text);
  const words = first.length > 32 ? `${first.slice(0, 32).trimEnd()}…` : first;
  const network = networkLabel(post.network);
  return words ? `${network} · ${words}` : `${network} draft`;
}

export function refLabel(kind, obj) {
  if (kind === "post") return postLabel(obj);
  if (kind === "idea") return plain(obj.title) || "Untitled idea";
  return plain(obj.filename || obj.title || obj.name) || "Source";
}

// A message may list objects one per line — "- [[post:a]], ready" — and those
// lines become a bulleted list; everything else stays running text.
function renderLines(text) {
  if (!text.includes("\n")) return text;
  const out = [];
  let items = [];
  const flush = () => {
    if (items.length) out.push(`<ul class="chat-bubble-list">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`);
    items = [];
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("- ")) items.push(line.slice(2));
    else {
      flush();
      if (line.trim()) out.push(`<p>${line}</p>`);
    }
  }
  flush();
  return out.join("");
}

// A scheduled draft leaves posts-store for the calendar queue (schedule-store),
// whose entry ids are `q-<postId>-<when>`. It isn't deleted: name it, say so.
function scheduledLabel(postId) {
  const entry = getQueue().find((e) => e.id.startsWith(`q-${postId}-`));
  if (!entry) return "";
  const day = new Date(entry.when).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${escapeHtml(postLabel(entry))} (scheduled for ${day})`;
}

export function renderRefs(text, sessionId) {
  if (typeof text !== "string") return text;
  text = renderLines(text);
  if (!text.includes("[[")) return text;
  return text.replace(TOKEN, (_, kind, id) => {
    const obj = resolveRef(kind, id, sessionId);
    if (!obj) return kind === "post" ? scheduledLabel(id) || GONE.post : GONE[kind];
    return `<button type="button" class="chat-ref" data-chat-ref="${escapeAttr(`${kind}:${id}`)}" data-chat-ref-session="${escapeAttr(sessionId)}">${escapeHtml(refLabel(kind, obj))}</button>`;
  });
}

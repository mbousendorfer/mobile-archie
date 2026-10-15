// The Batch studio as the session screen hosts it — the "Batch of posts" flow:
// stage sources, pick a Playbook, then replay them through the classic source →
// idea workflow in a new chat. Moved out of session.js, unchanged.
//
// A single-stage source-intake screen. The hero is one unified "drop & paste"
// card: drag/drop or browse files, AND a smart field where you paste or type a
// link OR text (auto-detected on add — a bare URL becomes a link, anything else
// becomes a pasted-text source; pasting files uploads them). Below it: the
// staged-source list + a Playbook picker, and the CTA hands the staged sources
// off to a fresh chat (see the batch wiring in bindSession).
//
// The intake card lives OUTSIDE [data-batch-rest]; staging-loader ticks repaint
// only the rest (list + commit), so the field is never clobbered mid-typing.

import * as batchStudio from "../../batch-studio.js?v=1797";
import { isFlagOn } from "../../feature-flags.js?v=1797";
import { getConnectedConnectors } from "../../connectors-store.js?v=1797";
import { escapeHtml, html, raw } from "../../utils.js?v=1797";
import { dropzoneHTML } from "../../components/dropzone.js?v=1797";
import { getContextById } from "../../contexts-store.js?v=1797";
import { renderSourceCard } from "../../components/source-card.js?v=1797";
import { isWorkspaceMode, playbookForNewWork } from "../../active-playbook.js?v=1797";
import { usableContexts } from "../../playbook-access.js?v=1797";
import {
  classifyFile,
  startFileUpload,
  startUrlImport,
  startTextImport,
  startConnectorImport,
} from "../../sources-stream.js?v=1797";
import { showToast } from "../../components/toast.js?v=1797";
import { setHashQuery } from "../../url-state.js?v=1797";
import { navigate } from "../../router.js?v=1797";
import { dotColorVar } from "../session.js?v=1797";
import { buildWorkflowFlow } from "./workflow-flow.js?v=1797";

// Origin sub-line for a staged batch source, shown in the source-card's meta row
// (in place of the usual "N ideas · Processed · Added X").
function batchSourceSub(s) {
  if (s.origin === "url") return "Public link";
  if (s.origin === "text") return "Pasted text";
  if (s.origin === "connector") {
    return s.connector?.name ? `${s.connector.name}${s.kind ? ` · ${s.kind}` : ""}` : "Connected source";
  }
  return s.kind ? `${s.kind} · From your computer` : "From your computer";
}

const BATCH_STUDIO_STEPS = [
  {
    tone: "in",
    icon: "ap-icon-upload",
    title: "Add your sources",
    text: "Upload files, paste a link, or drop in text — add as many as you like.",
  },
  {
    tone: "ai",
    icon: "ap-icon-archie-official",
    title: "I find the strongest ideas",
    text: "I read every source and pull out the angles genuinely worth posting about.",
  },
  {
    tone: "out",
    icon: "ap-icon-stack",
    title: "A batch of drafts",
    text: "I draft a post for each idea in your playbook's voice — ready to review and schedule.",
  },
];

function buildBatchStudioSteps() {
  return buildWorkflowFlow(BATCH_STUDIO_STEPS);
}

export function renderBatchStudio(session) {
  const st = batchStudio.getState(session.id);
  if (!st) return "";

  // Connected connectors → a gated "Connected source" picker (only when the
  // connectors feature flag is on AND at least one connector is connected).
  const connectors = isFlagOn("connectors") ? getConnectedConnectors() : [];
  const connectorMenu = connectors.length
    ? `
      <details class="ap-select batch-studio__connector" data-batch-connector>
        <summary class="ap-button stroked grey batch-studio__method batch-studio__connector-trigger">
          <i class="ap-icon-link" aria-hidden="true"></i><span>Connected source</span>
        </summary>
        <div class="ap-select-dropdown batch-studio__connector-dropdown" role="listbox" aria-label="Connected sources">
          <div class="ap-select-options">
            ${connectors
              .map(
                (c) => `
              <div class="ap-select-option" data-batch-connector-pick="${escapeHtml(c.id)}" role="option">
                <span class="ap-select-option-text">${escapeHtml(c.name)}</span>
              </div>`,
              )
              .join("")}
          </div>
        </div>
      </details>`
    : "";

  return html`
    <aside class="session__assistant batch-studio batch-studio--upload" aria-label="Batch from a source">
      <div class="batch-studio__scroll">
        <div class="batch-studio__inner">
          <div class="batch-studio__intro">
            <span class="batch-studio__ai-badge"><i class="ap-icon-archie-official" aria-hidden="true"></i>Batch</span>
            <h1 class="batch-studio__title">Turn your sources into a batch of posts</h1>
            <p class="batch-studio__sub">
              Drop files, paste a link, or paste any text — add as many sources as you like and I'll pull the strongest
              ideas and draft a set of posts.
            </p>
          </div>

          ${raw(buildBatchStudioSteps())}

          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md,.mp4,.mov,.mp3,.wav,.m4a,.png,.jpg,.jpeg"
            id="batchFileInput"
            data-batch-file
            multiple
            hidden
          />

          <div class="batch-studio__dropzone">
            ${raw(
              dropzoneHTML({
                lead: "Drag & drop files here",
                sub: "PDF, Word, text, video, audio or images · up to 100MB each",
                large: true,
                withInput: false,
                rootAttrs: "data-batch-dropzone",
                ariaLabel: "Add files from your computer",
                action: { label: "Browse files" },
              }),
            )}
            <div class="batch-studio__dropzone-extra">
              <span class="batch-studio__dropzone-extra-label">Or add another way</span>
              <button type="button" class="ap-button stroked grey batch-studio__method" data-batch-link>
                <i class="ap-icon-link" aria-hidden="true"></i><span>A link</span>
              </button>
              <button type="button" class="ap-button stroked grey batch-studio__method" data-batch-paste>
                <i class="ap-icon-file--text" aria-hidden="true"></i><span>Pasted text</span>
              </button>
              ${raw(connectorMenu)}
            </div>
            <div class="batch-studio__dropzone-overlay" aria-hidden="true">
              <i class="ap-icon-upload" aria-hidden="true"></i><span>Drop files to upload</span>
            </div>
          </div>

          <div data-batch-rest>${raw(renderBatchRest(session))}</div>
        </div>
      </div>
    </aside>
  `;
}

// The repaint-on-staging-change region: staged-source list + Playbook + CTA.
// Re-rendered wholesale on every batchStudio notify (add / remove / pick /
// loader tick) while the intake card above stays put. Returns a trusted HTML
// string (dynamic bits escaped by renderSourceCard / renderBatchPlaybookControl).
function renderBatchRest(session) {
  const st = batchStudio.getState(session.id);
  if (!st) return "";
  const ctx = st.contextId ? getContextById(st.contextId) : null;
  const sources = st.sources || [];
  const canStart = sources.length > 0;
  const countLabel = sources.length === 1 ? "1 source" : `${sources.length} sources`;

  const sourceList = sources.length
    ? `
      <div class="batch-studio__list" aria-label="Staged sources">
        ${sources
          .map((s) =>
            renderSourceCard({ id: s.uid, filename: s.name, kind: s.kind, iconKey: s.iconKey, status: s.status }, [], {
              staged: true,
              removeValue: s.uid,
              stagedSub: batchSourceSub(s),
            }),
          )
          .join("")}
      </div>`
    : "";

  return `
    ${sourceList}
    <div class="batch-studio__commit">
      <div class="batch-studio__commit-row">
        ${renderBatchPlaybookControl(ctx)}
        <button
          type="button"
          class="ap-button primary orange batch-studio__start"
          data-batch-start
          ${canStart ? "" : "disabled"}
        >
          <i class="ap-icon-archie-official" aria-hidden="true"></i>
          <span>Extract ideas${canStart ? ` · ${countLabel}` : ""}</span>
        </button>
      </div>
      <p class="batch-studio__field-hint muted">I'll draft every post in this playbook's voice, audience, and CTAs.</p>
    </div>
  `;
}

// ⚠️ In workspace mode the in-flow Playbook pickers render NOTHING.
//
// Batch, Clip Studio and the repurpose board each asked "which Playbook governs
// these drafts?" in their own select. The rail answered it before the flow
// started, so the question is gone — and so is the control. It was a disabled
// trigger for one commit, on the theory that the flow should still SAY which
// brand: a greyed-out field that repeats what the rail prints two inches away
// is chrome the reader has to rule out, not information. The commit rows are
// `justify-content: flex-end`, so the CTA simply keeps its place.

// Playbook picker for the Batch Studio commit group — same DS form-select shape
// as the composer's renderPlaybookControl, but full-width and its picks route
// through the `data-batch-playbook-pick` delegate (→ batchStudio.setContext)
// instead of mutating session.contextId.
function renderBatchPlaybookControl(ctx) {
  if (isWorkspaceMode()) return "";
  const playbooks = usableContexts();
  const items = playbooks
    .map((c) => {
      const isSel = ctx && c.id === ctx.id;
      return `
        <div
          class="ap-select-option${isSel ? " selected" : ""}"
          data-batch-playbook-pick="${escapeHtml(c.id)}"
          role="option"
          aria-selected="${isSel ? "true" : "false"}"
        >
          <span class="composer-context__dot" style="background: ${dotColorVar(c.color || "grey")};"></span>
          <span class="ap-select-option-text">${escapeHtml(c.name)}</span>
          ${isSel ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>`;
    })
    .join("");
  const valueMarkup = ctx
    ? `<span class="ap-select-value">${escapeHtml(ctx.name)}</span>`
    : `<span class="ap-select-value ap-select-placeholder">Select a playbook</span>`;
  return `
    <details class="ap-select batch-studio__playbook" data-batch-playbook>
      <summary class="ap-select-trigger" title="Choose the playbook for this chat">
        <span class="ap-select-inline-label">Playbook</span>
        ${valueMarkup}
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox" aria-label="Choose a playbook">
        <div class="ap-select-options">${items}</div>
      </div>
    </details>
  `;
}

// ── Batch Studio helpers ──────────────────────────────────────────────────────
// Stage every accepted file; toast (once) when some are rejected.
export function handleBatchFiles(session, fileList) {
  const rejected = [];
  for (const file of Array.from(fileList)) {
    const classification = classifyFile(file);
    if (!classification.ok) {
      rejected.push(file.name);
      continue;
    }
    batchStudio.addFileSource(session.id, file, classification);
  }
  if (rejected.length) {
    showToast(
      rejected.length === 1 ? `Unsupported file: ${rejected[0]}` : `${rejected.length} files skipped (unsupported)`,
    );
  }
}

// Targeted repaint of the staged list + Playbook + CTA, leaving the upload box
// (and the connector popover) untouched. Used by the batchStudio subscription so
// staging-loader ticks don't tear down the whole intake.
export function repaintBatchRest(root, session) {
  const rest = root.querySelector("[data-batch-rest]");
  if (rest) rest.innerHTML = renderBatchRest(session);
}

// "Start drafting" — mint a fresh chat bound to the chosen Playbook, stash the
// staged sources for it to replay on mount (the classic source → idea workflow),
// then leave the batch screen. Files can't ride a sessionStorage handoff, so the
// payload travels in batch-studio's in-memory pendingBatch slot.
export function startBatchChat(session) {
  const st = batchStudio.getState(session.id);
  if (!st || !st.sources.length) return;
  const contextId = st.contextId || playbookForNewWork()?.id || "";
  if (!batchStudio.stashPending(session.id)) return;
  batchStudio.exit(session.id);
  const newId = `new-${Date.now().toString(36)}`;
  const path = `/session/${newId}`;
  if (contextId) setHashQuery(path, { contextId });
  else navigate(path);
}

// Replay batch-staged sources into the freshly mounted chat so each runs the
// classic intake (loading → ready → ideas). Sources must be added AFTER mount —
// the intake-lifecycle only posts intake turns for ids appearing past its
// baseline snapshot. URLs/connectors process on their own timers; files run the
// upload→processing pipeline.
export function replayBatchSources(sessionId, batch) {
  for (const src of batch.sources) {
    if (src.origin === "file" && src.file && src.classification) {
      startFileUpload(src.file, src.classification, sessionId);
    } else if (src.origin === "url" && src.url) {
      startUrlImport(src.url, sessionId);
    } else if (src.origin === "text" && src.text) {
      startTextImport(src.text, sessionId);
    } else if (src.origin === "connector" && src.connector && src.doc) {
      startConnectorImport(src.connector, src.doc, sessionId);
    }
  }
}

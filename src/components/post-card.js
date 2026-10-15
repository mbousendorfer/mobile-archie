// post-card — full-fidelity LinkedIn-style draft preview card.
//
// Originally rendered inside the session screen's Posts tab (dropped at
// Lot 4.4). Lot 21 lifts the renderer out so the right-panel Drafts
// surface can use the rich format the user wanted instead of the
// compact BatchCard.
//
// Each card shows: author block (avatar + name + title + visibility),
// status pill or scheduled/error notice above the card, full body text
// + hashtags + CTA, image (or "Generate an image" placeholder),
// engagement stats, and a decorative LinkedIn-style action footer
// (Like / Comment / Repost / Send). To the right of the card sits an
// action stack — sparkles (rewrite) / bookmark (save as draft) /
// calendar (schedule) / trash (delete). Each carries a `data-post-*`
// attribute ; the consumer wires the actions via event delegation.
//
// Render is pure ; no module-local state. Caller passes the post
// object (cf. posts-store.js / mocks.js) and an optional `opts.focusPost`
// id used to apply the focus pulse animation when navigating in via
// `?focusPost=<id>`.

import { html, raw, formatClock, escapeText, escapeAttr } from "../utils.js?v=1823";
import { isPortraitFormat } from "../clip-formats.js?v=1823";
import { presetById } from "../clip-captions.js?v=1823";
import { renderFeedbackControl } from "./feedback-control.js?v=1823";
import { networkMeta } from "../social-profiles.js?v=1823";
import { REVEAL_MS } from "../archie-pixels.js?v=1823";

// The media slot of a draft that has no image yet. ONE dashed slot, two tiers
// (2026-10-07):
//
//   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
//            [✦ Generate an image]              tier 1 — the shortcut (mermaid)
//          In <look>, <shape>. Change              + what it will make
//
//      [🖼 Image Studio] [⬆ Upload]            tier 2 — doing it yourself,
//   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘    two stroked grey buttons
//
// Tier 1: `.ap-button.mermaid`, the DS's AI treatment (a gradient BORDER: the
//    DS ships no filled AI button). Under it, small, the shortcut it runs (flag
//    sexySquirrel, `opts.imagePreset` from the drafts panel — the card never
//    reads the Playbook): the look's name and this network's shape. "Change"
//    opens the PLAYBOOK, where that preset is set — ⚠️ NOT the Image Studio
//    (rejected): the preset is a setting, the studio a tool.
// Tier 2: the Image Studio and Upload as one row of `stroked grey` buttons, a
//    group-gap below Generate — never BESIDE it (side by side, two outlined
//    rectangles read as equals: rejected). Ghost, they floated in the dashed
//    frame with nothing to hold them; stacked one per row, four centred lines
//    of different widths had no shared edge (both 2026-10-07).
// The WHOLE slot is the drop target (dashed = a real drop, wired in
// right-panel.js on `[data-post-drop]`, drag events only); Upload reuses the
// rail's `data-post-image-upload`.
function renderImagePreset(opts) {
  const p = opts.imagePreset;
  if (!p || !opts.playbookId) return "";
  const shape = p.shape ? `${escapeText(p.shape.label.toLowerCase())} ${escapeText(p.shape.ratio)}` : "";
  const playbook = (label) =>
    `<button type="button" class="ap-link small" data-post-image-preset="${escapeAttr(opts.playbookId)}">${label}</button>`;
  return p.look
    ? `<p class="posts__card-media-preset">In ${escapeText(p.look.label)}${shape ? `, ${shape}` : ""}. ${playbook("Change")}</p>`
    : "";
}

// The image loader / reveal (src/archie-pixels.js) in a draft's image box.
// Generating — first image or Try another, over the current one — the field
// and its narrated stages; just after, the arrival over the new <img>. The
// element writes its own narration and holds its own (Archie's) colours.
function renderImagePixels(post) {
  if (post.isGeneratingImage)
    return `<archie-pixels role="status" aria-busy="true" data-since="${post.imageGeneratingSince || ""}"></archie-pixels>`;
  return post.imageRevealAt && Date.now() - post.imageRevealAt < REVEAL_MS
    ? `<archie-pixels data-reveal-at="${post.imageRevealAt}"></archie-pixels>`
    : "";
}

// `opts.brandGaps` / `opts.playbookId` come from the host (the drafts panel) —
// the card never resolves a Context itself. A host that passes neither, like the
// studio's own in-feed preview, simply gets no hint.
function renderEmptyMedia(post, opts) {
  // Generating: the image's own 4:3 box, filled by the pixel field — the
  // reveal then lands exactly where the image stays.
  if (post.isGeneratingImage) {
    return `<div class="posts__card-media-generating">${renderImagePixels(post)}</div>`;
  }

  const gaps = Array.isArray(opts.brandGaps) ? opts.brandGaps : [];
  // "a logo, brand colors and reference images" — the list names what is
  // missing, because "your brand kit is incomplete" sends you hunting.
  const labels = gaps.map((g) => g.label);
  const gapList =
    labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` : labels[0] || "";
  const hint =
    gaps.length && opts.playbookId
      ? `<p class="posts__card-media-empty-hint muted">
          Add ${gapList} to the Playbook and I'll work them into every image I make.
          <button type="button" class="ap-link small" data-post-playbook-gap="${opts.playbookId}">Open the Playbook</button>
        </p>`
      : "";

  return `<div class="posts__card-media-empty">
    <div class="posts__card-media-slot" data-post-drop="${escapeAttr(post.id)}">
      <div class="posts__card-media-shortcut">
        <button type="button" class="ap-button mermaid" data-post-image="${post.id}">
          <i class="ap-icon-archie-official"></i>
          <span>Generate an image</span>
        </button>
        ${renderImagePreset(opts)}
      </div>
      <div class="posts__card-media-alt">
        <button type="button" class="ap-button stroked grey" data-post-studio="${escapeAttr(post.id)}">
          <i class="ap-icon-image"></i>
          <span>Image Studio</span>
        </button>
        <button type="button" class="ap-button stroked grey" data-post-image-upload="${escapeAttr(post.id)}" title="Or drop an image anywhere here">
          <i class="ap-icon-upload"></i>
          <span>Upload</span>
        </button>
      </div>
    </div>
    ${hint}
  </div>`;
}

export function renderPostCard(post, opts = {}) {
  const inlineEdit = opts.inlineEdit === true;
  const editing = inlineEdit && opts.editing === true;
  const selectable = opts.selectable === true;
  const selected = selectable && opts.selected === true;

  // Multi-select affordance — a checkbox sits in the .posts__row-check
  // gutter, which CSS reserves at a fixed width on every row so a
  // non-selectable card (e.g. a scheduled post) stays left-aligned with
  // its selectable siblings instead of sliding into the gutter. Only
  // selectable rows fill the gutter with an actual checkbox.
  const checkbox = `<div class="posts__row-check"${selectable ? "" : ' aria-hidden="true"'}>${
    selectable
      ? `<label class="ap-checkbox-container" aria-label="Select draft">
          <input type="checkbox" data-post-select="${post.id}" ${selected ? "checked" : ""} />
          <i></i>
        </label>`
      : ""
  }</div>`;

  const bodyParagraphs = post.text.map((p) => `<p class="posts__card-paragraph">${p}</p>`).join("");

  const hashtags = post.hashtags.length
    ? `<p class="posts__card-hashtags">${post.hashtags.map((h) => `<a>#${h}</a>`).join(" ")}</p>`
    : "";

  const cta = post.cta ? `<p class="posts__card-cta">${post.cta}</p>` : "";

  // Regenerate state (sparkles click → draft-rewrite.js). Two stages :
  //   - thinking  : show a 3-bar shimmer skeleton, hashtags + CTA hidden.
  //   - streaming : empty body container that the streamer fills directly
  //                 with paragraph tokens + a blinking caret.
  // In both stages the inline-edit affordance is suppressed and the
  // .posts__row-actions buttons render with `disabled` so the user
  // can't fire conflicting actions mid-stream.
  const regenerating = post.isRegenerating === true;
  const regenerateStage = regenerating ? post.regenerateStage || "thinking" : null;

  // In edit mode the entire body (paragraphs + hashtags + CTA) collapses
  // into one contenteditable region. Hashtags lose their styling during
  // edit and re-style on save (per spec).
  let editorBody;
  if (regenerating && regenerateStage === "thinking") {
    editorBody = `<div class="posts__card-body posts__card-body--ghost" data-regenerating-body>
        <span class="posts__card-ghost-bar"></span>
        <span class="posts__card-ghost-bar"></span>
        <span class="posts__card-ghost-bar"></span>
      </div>`;
  } else if (regenerating && regenerateStage === "streaming") {
    // Empty container — draft-rewrite.js streams paragraphs into it.
    editorBody = `<div class="posts__card-body" data-regenerating-body></div>`;
  } else if (editing) {
    editorBody = `<div
        class="posts__card-body posts__card-editor"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        aria-label="Edit post body"
        data-post-editor="${post.id}"
        spellcheck="true"
      >${escapeText(serializeBody(post))}</div>`;
  } else {
    editorBody = `<div class="posts__card-body">${bodyParagraphs} ${hashtags} ${cta}</div>`;
  }

  // Per-network character count (alpha feedback #3 — Mari wanted an
  // at-a-glance count). Mirrors the DS "CharacterCounts" component: a
  // small chip with the network's full-colour logo + the remaining
  // characters, turning red when the draft runs over the network limit.
  // Hidden while editing / regenerating since the count is mid-flux.
  const charCount = !editing && !regenerating ? renderCharCount(post) : "";

  const editActions = editing
    ? `<div class="posts__card-edit-actions">
        <button type="button" class="ap-button ghost grey" data-post-edit-cancel="${post.id}">Cancel</button>
        <button type="button" class="ap-button primary orange" data-post-edit-save="${post.id}">Save changes</button>
      </div>`
    : "";

  // "How's this draft?" feedback strip — sits below the LinkedIn-preview
  // card (not inside it, so it reads as product feedback rather than a faux
  // LinkedIn reaction). Suppressed while the body is mid-flux.
  const feedbackStrip =
    !editing && !regenerating
      ? renderFeedbackControl(`draft:${post.id}`, { kind: "draft", label: "How's this draft?" })
      : "";

  // Below-card foot row: the feedback strip on the left, the "Generation
  // context" disclosure toggle on the right (same line). A hidden checkbox +
  // label drives a CSS-only collapse so the panel can drop full-width beneath
  // the row without any JS wiring. When the draft has no provenance, the
  // feedback strip renders on its own.
  const gcBody = !editing && !regenerating ? renderGenerationContextBody(post) : "";
  const belowCard = gcBody
    ? `<input type="checkbox" id="gc-${post.id}" class="posts__gencontext-check" hidden />
       <div class="posts__card-footrow">
         ${feedbackStrip}
         <label class="posts__gencontext-toggle" for="gc-${post.id}">
           <i class="ap-icon-information-circle posts__gencontext-info" aria-hidden="true"></i>
           <span class="posts__gencontext-toggle-label">Generation context</span>
           <i class="ap-icon-chevron-down posts__gencontext-chevron" aria-hidden="true"></i>
         </label>
       </div>
       <div class="posts__gencontext-panel">${gcBody}</div>`
    : feedbackStrip;

  const stats = post.stats || {};
  const engagement =
    stats.likes || stats.comments || stats.reposts
      ? `
        <div class="posts__card-engagement">
          <span
            class="posts__card-reactions"
            aria-label="${stats.likes || 0} reactions"
          >
            <span class="posts__card-reaction posts__card-reaction--thumb">
              <i class="ap-icon-thumb-up_fill" aria-hidden="true"></i>
            </span>
            <span class="posts__card-reaction posts__card-reaction--heart">
              <i class="ap-icon-heart_fill" aria-hidden="true"></i>
            </span>
            <span class="posts__card-reaction-count">${stats.likes || 0}</span>
          </span>
          <span class="posts__card-meta muted">${stats.comments || 0} comments · ${stats.reposts || 0} reposts</span>
        </div>
      `
      : "";

  // Media block — when the draft was generated from a video clip the card
  // surfaces a native-feeling video player (faux frame + play overlay +
  // duration chip + scrubber). Vertical networks (TikTok, Instagram) use
  // a portrait aspect ratio so the preview matches what the post would
  // actually look like in feed. Otherwise the existing image / generate
  // placeholder path is preserved.
  const subtitleLabel = post.clipRef ? subtitleLabelFor(post.subtitleStyle) : null;
  const subtitleBadge = subtitleLabel
    ? `<span class="ap-status grey no-dot posts__card-subtitle-pill">Subtitles · ${subtitleLabel}</span>`
    : "";

  const isCarousel = Array.isArray(post.carousel) && post.carousel.length > 1;
  const mediaBlock = post.clipRef
    ? `${renderClipPlayer(post)}${subtitleBadge}`
    : isCarousel
      ? `<div class="posts__card-image-wrap posts__card-image-wrap--carousel">
          <img class="posts__card-image" src="${post.carousel[0]}" alt="Carousel slide 1 for this post" loading="lazy" />
          <span class="posts__card-carousel-badge"><i class="ap-icon-multiple-images" aria-hidden="true"></i>${post.carousel.length}</span>
          <div class="posts__card-carousel-dots" aria-hidden="true">${post.carousel
            .map((_, i) => `<span class="posts__card-carousel-dot${i === 0 ? " is-active" : ""}"></span>`)
            .join("")}</div>
          <div class="posts__card-image-controls">
            <button type="button" class="ap-button ghost grey" data-post-image-edit="${post.id}">
              <i class="ap-icon-archie-official"></i>
              <span>Edit slides</span>
            </button>
            <button type="button" class="ap-button ghost red" data-post-image-remove="${post.id}">
              <i class="ap-icon-trash"></i>
              <span>Remove</span>
            </button>
          </div>
        </div>`
      : post.imageUrl
        ? `<div class="posts__card-image-wrap">
          <img class="posts__card-image" src="${post.imageUrl}" alt="Image for this post" loading="lazy" />
          ${renderImagePixels(post)}
          <!-- Edit / Change / Remove. Edit was left out while "Generate an image"
               still opened the studio — back then it was a third near-equal grey
               competing with Change for no gain. Now that Generate produces an
               image in place, Edit is the ONLY way into the Image Studio for a
               single image, so it earns its slot. It reads as one AI action next
               to two greys (the archie glyph), exactly like the carousel's
               "Edit slides" above. -->
          <div class="posts__card-image-controls">
            <button type="button" class="ap-button ghost grey" data-post-image-edit="${post.id}">
              <i class="ap-icon-archie-official"></i>
              <span>Edit</span>
            </button>
            <button type="button" class="ap-button ghost grey" data-post-image-upload="${post.id}">
              <i class="ap-icon-upload"></i>
              <span>Change</span>
            </button>
            <button type="button" class="ap-button ghost red" data-post-image-remove="${post.id}">
              <i class="ap-icon-trash"></i>
              <span>Remove</span>
            </button>
          </div>
        </div>`
        : renderEmptyMedia(post, opts);

  return html`
    <article
      class="posts__row ${opts.focusPost === post.id ? "is-focused" : ""} ${selected ? "is-selected" : ""}"
      data-post-id="${post.id}"
      ${regenerating ? `data-regenerating="true" data-stage="${regenerateStage}"` : ""}
    >
      ${raw(checkbox)}
      <div class="posts__card-wrap">
        ${raw(renderPostErrors(post))}
        <article class="ap-card posts__card ${editing ? "is-editing" : ""}">
          <header class="posts__card-header">
            <div class="posts__card-avatar" aria-hidden="true">${post.author.initials}</div>
            <div class="posts__card-author">
              <div class="row posts__card-author-row">
                <span class="posts__card-name">${post.author.name}</span>
                <span class="muted">· ${post.author.connection}</span>
              </div>
              <div class="muted posts__card-title">${post.author.title}</div>
              <div class="muted posts__card-meta">${post.timeLabel} · ${post.author.visibility}</div>
            </div>
          </header>

          ${raw(editorBody)} ${raw(charCount)} ${raw(editActions)} ${raw(mediaBlock)} ${raw(engagement)}

          <!-- Footer is a non-interactive LinkedIn-style preview of the
               engagement bar — decoration only, not real actions (see
               aria-hidden). The actionable controls live in the
               .posts__row-actions stack to the right of the card. -->
          <footer class="posts__card-footer" aria-hidden="true">
            <span class="posts__card-action">
              <i class="ap-icon-thumb-up"></i>
              <span>Like</span>
            </span>
            <span class="posts__card-action">
              <i class="ap-icon-single-chat-bubble"></i>
              <span>Comment</span>
            </span>
            <span class="posts__card-action">
              <i class="ap-icon-repost"></i>
              <span>Repost</span>
            </span>
            <span class="posts__card-action">
              <i class="ap-icon-paper-plane"></i>
              <span>Send</span>
            </span>
          </footer>
        </article>
        ${raw(belowCard)}
      </div>

      <div class="posts__row-actions" aria-label="Post actions">
        <button
          type="button"
          class="ap-icon-button stroked blue"
          aria-label="Reference in chat"
          title="Reference"
          data-post-mention="${post.id}"
          ${regenerating ? "disabled" : ""}
        >
          <i class="ap-icon-at"></i>
        </button>
        ${raw(
          inlineEdit
            ? `<button
                type="button"
                class="ap-icon-button stroked"
                aria-label="Edit post"
                title="Edit"
                data-post-edit="${post.id}"
                ${regenerating ? "disabled" : ""}
              >
                <i class="ap-icon-pen"></i>
              </button>`
            : "",
        )}
        <div class="posts__rewrite">
          <button
            type="button"
            class="ap-icon-button stroked ${regenerating ? "loading" : ""}"
            aria-label="Regenerate draft"
            aria-haspopup="true"
            aria-expanded="false"
            data-post-rewrite-menu="${post.id}"
            ${regenerating ? "disabled" : ""}
          >
            <i class="ap-icon-sparkles"></i>
          </button>
          <div
            class="ap-action-dropdown posts__rewrite-menu"
            data-post-rewrite-menu-for="${post.id}"
            role="menu"
            hidden
          >
            ${raw(
              [
                { intent: "shorter", label: "Shorter", icon: "ap-icon-shorten" },
                { intent: "longer", label: "Longer", icon: "ap-icon-lenghten" },
                { intent: "warmer", label: "Warmer", icon: "ap-icon-heart" },
                { intent: "formal", label: "More formal", icon: "ap-icon-user-graduate" },
              ]
                .map(
                  ({ intent, label, icon }) => html`
                    <button
                      type="button"
                      class="ap-action-dropdown-item"
                      role="menuitem"
                      data-post-rewrite-intent="${intent}"
                      data-post-id="${post.id}"
                    >
                      <i class="${icon}" aria-hidden="true"></i>
                      <div class="ap-action-dropdown-item-text">
                        <div class="ap-action-dropdown-item-label-container">
                          <span class="ap-action-dropdown-item-label">${label}</span>
                        </div>
                      </div>
                    </button>
                  `,
                )
                .join(""),
            )}
            <div class="ap-action-dropdown-divider" role="separator"></div>
            <button
              type="button"
              class="ap-action-dropdown-item"
              role="menuitem"
              data-post-rewrite-intent="fresh"
              data-post-id="${post.id}"
            >
              <i class="ap-icon-sparkles" aria-hidden="true"></i>
              <div class="ap-action-dropdown-item-text">
                <div class="ap-action-dropdown-item-label-container">
                  <span class="ap-action-dropdown-item-label">Regenerate</span>
                </div>
              </div>
            </button>
          </div>
        </div>
        <!-- Image Studio. It lives in the rail rather than in the media block
             because it is the ONE entry that has to work in every media state:
             no image (steer a generation instead of the one-click Generate), a
             single image (open it in Edit), or a carousel (reopen the set). The
             media block's own controls are contextual and partly hover-only, so
             on an image-less draft nothing reached the studio at all. -->
        <button
          type="button"
          class="ap-icon-button stroked"
          aria-label="Open the Image Studio"
          title="Image Studio"
          data-post-studio="${post.id}"
          ${regenerating ? "disabled" : ""}
        >
          <i class="ap-icon-image"></i>
        </button>
        <!-- Upload. It is in the rail and NOT in the empty slot because the slot
             holds exactly one filled primary plus one link — a third action
             there flattened the hierarchy every time it was tried. The rail is
             also the only place it can work once the draft HAS an image, and it
             is the keyboard route to a file: dragging onto the slot cannot be
             the sole way in. Same handler as the slot's old link. -->
        <button
          type="button"
          class="ap-icon-button stroked"
          aria-label="Upload an image"
          title="Upload"
          data-post-image-upload="${post.id}"
          ${regenerating ? "disabled" : ""}
        >
          <i class="ap-icon-upload"></i>
        </button>
        <button
          type="button"
          class="ap-icon-button stroked"
          aria-label="Save as draft"
          data-post-save-draft="${post.id}"
          ${regenerating ? "disabled" : ""}
        >
          <i class="ap-icon-bookmark"></i>
        </button>
        <button
          type="button"
          class="ap-icon-button stroked"
          aria-label="Schedule post"
          data-post-schedule="${post.id}"
          ${regenerating ? "disabled" : ""}
        >
          <i class="ap-icon-calendar"></i>
        </button>
        <button
          type="button"
          class="ap-icon-button stroked posts__row-action--danger"
          aria-label="Delete post"
          data-post-delete="${post.id}"
          ${regenerating ? "disabled" : ""}
        >
          <i class="ap-icon-trash"></i>
        </button>
      </div>
    </article>
  `;
}

// Generation context panel body — the provenance a generated draft drew on:
// a tinted headline (the angle picked, or the winner it was repurposed from) +
// the source. Returns "" when the draft has no provenance. The toggle + the
// collapse mechanism live in renderPostCard's foot row (a CSS checkbox toggle),
// so the panel can expand full-width while the toggle stays inline on the right.
function renderGenerationContextBody(post) {
  const gc = post.generationContext || {};
  const voice = renderVoiceContext(post);
  if (!post.generationContext) return voice;
  const tone = gc.kind === "repurpose" ? "repurpose" : gc.kind === "clip" ? "clip" : "angle";
  const headline = gc.headline
    ? `<div class="posts__gencontext-headline posts__gencontext-headline--${tone}">
        <i class="${gc.headline.icon}" aria-hidden="true"></i>
        <span>${gc.headline.text}</span>
      </div>`
    : "";
  const source = gc.source
    ? `<div class="posts__gencontext-source">
        <span class="posts__gencontext-source-head">
          <i class="${gc.source.icon}" aria-hidden="true"></i>
          <span>${gc.source.label}</span>
        </span>
        ${gc.source.detail ? `<p class="posts__gencontext-source-detail">${gc.source.detail}</p>` : ""}
      </div>`
    : "";
  return `${headline}${source}${voice}`;
}

// Voice per network (flag networkVoices): which network voice wrote this draft
// and the rules it follows — the proof that what Archie learned is used.
function renderVoiceContext(post) {
  const v = post.voice;
  if (!v?.network) return "";
  const label = networkMeta(v.network)?.label || v.network;
  const rules = v.rules || [];
  const detail = rules.length
    ? `<ul class="posts__gencontext-rules">${rules.map((r) => `<li>${escapeText(r)}</li>`).join("")}</ul>`
    : `<p class="posts__gencontext-source-detail">Its hooks and closings. No rules learned for ${escapeText(label)} yet.</p>`;
  return `<div class="posts__gencontext-source">
      <span class="posts__gencontext-source-head">
        <i class="${networkMeta(v.network)?.icon || "ap-icon-sparkles"}" aria-hidden="true"></i>
        <span>Your ${escapeText(label)} voice${rules.length ? ` · follows ${rules.length} ${rules.length === 1 ? "rule" : "rules"}` : ""}</span>
      </span>
      ${detail}
    </div>`;
}

// Per-network character budgets + the full-colour DS logo used by the count
// chip come from the shared NETWORKS table (`twitter` is the posts-store alias
// for `x`). A network without a `limit` renders no chip.
// Characters a post consumes against its network limit — body paragraphs,
// hashtags, and the CTA, joined the way they'd publish (blank line between
// blocks). Matches what the user sees in the rendered card.
function usedCharacters(post) {
  const blocks = [];
  if (post.text?.length) blocks.push(post.text.join("\n\n"));
  if (post.hashtags?.length) blocks.push(post.hashtags.map((h) => `#${h}`).join(" "));
  if (post.cta) blocks.push(post.cta);
  return blocks.join("\n\n").length;
}

// CharacterCounts chip (DS component 3185:48434). Shows the remaining
// characters for the draft's network; goes red + negative when over.
function renderCharCount(post) {
  const meta = networkMeta(post.network);
  if (!meta) return "";
  const remaining = meta.limit - usedCharacters(post);
  const over = remaining < 0;
  const title = over
    ? `${Math.abs(remaining)} characters over the ${meta.label} limit`
    : `${remaining} characters left for ${meta.label}`;
  return `
    <div class="posts__card-count-row">
      <span class="posts__charcount ${over ? "is-over" : ""}" title="${title}">
        <i class="${meta.icon}" aria-hidden="true"></i>
        <span class="posts__charcount-num">${remaining}</span>
      </span>
    </div>
  `;
}

// "needs_fixes" notice — sits above the card. Surfaces every error from
// post.errors[], single-line for one error, bulleted list for multiple.
function renderPostErrors(post) {
  if (!post.errors?.length) return "";
  const body =
    post.errors.length === 1
      ? post.errors[0].message
      : `<ul class="posts__card-errors-list">${post.errors.map((e) => `<li>${e.message}</li>`).join("")}</ul>`;
  return `
    <div class="ap-infobox error" role="alert">
      <i class="ap-icon-error_fill" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-message">${body}</span>
        </div>
      </div>
    </div>
  `;
}

// Build the editable plain-text body shown inside the contenteditable
// region. Paragraphs separated by blank lines ; hashtags rendered as
// "#tag #tag2" on their own line ; CTA on its own line.
// The reverse parse lives in right-panel.js (parseEditorBody).
function serializeBody(post) {
  const parts = [];
  if (post.text?.length) parts.push(post.text.join("\n\n"));
  if (post.hashtags?.length) parts.push(post.hashtags.map((h) => `#${h}`).join(" "));
  if (post.cta) parts.push(post.cta);
  return parts.join("\n\n");
}

// HTML-escape user content before injecting into the contenteditable.
// innerText reads back the literal characters, so escaping here avoids
// the editor rendering injected markup on first paint.

// ── Video clip player (faux) ────────────────────────────────────────
//
// Mimics what a native video post looks like on the destination network:
// 9:16 frame for TikTok / Instagram (Reels-style), 16:9 for everything
// else. The frame itself is a hue-driven gradient so each draft feels
// like a real extracted thumbnail; play overlay + duration chip + a
// 1-px scrubber bar at the bottom (paused mid-clip) round out the
// "this is a player" affordance. Filename surfaces in a top-left bezel
// so the user still sees where the clip came from.

const PORTRAIT_NETWORKS = new Set(["tiktok", "instagram"]);

const SUBTITLE_LABEL = {
  // Legacy light styles (Video Clips modal caption tab).
  bold: "Bold",
  clean: "Clean",
  caption: "Caption",
  // Clip-draft flow styles (align with the subtitle-style card grid).
  karaoke: "Karaoké",
  "deep-diver": "Deep Diver",
  youshaei: "Youshaei",
  popline: "PopLine",
  mozi: "Mozi",
  thinkmedia: "ThinkMedia",
  beasty: "Beasty",
  simple: "Simple",
};

// Resolve a subtitle style id to a human label. The conversational draft flow
// uses the light bold/clean/caption set; editing a clip in the Video Clips
// modal can set any caption preset id (karaoke, …) — fall back to the preset
// catalog's label so the badge stays accurate after an edit.
function subtitleLabelFor(style) {
  if (!style || style === "none") return null;
  if (SUBTITLE_LABEL[style]) return SUBTITLE_LABEL[style];
  const preset = presetById(style);
  return preset ? preset.label : style;
}

function renderClipPlayer(post) {
  const clip = post.clipRef;
  const duration = Math.max(1, Math.round(clip.end - clip.start));
  // Prefer the explicit export format chosen in the clip-draft flow; fall
  // back to the network's default orientation when no format was set.
  const portrait = post.format ? isPortraitFormat(post.format) : PORTRAIT_NETWORKS.has(post.network);
  const h = typeof clip.hue === "number" ? clip.hue : 24;
  const bg = `linear-gradient(135deg, oklch(0.28 0.08 ${h}) 0%, oklch(0.14 0.05 ${h}) 100%)`;
  const blob1 = `radial-gradient(circle at 30% 35%, oklch(0.74 0.20 ${h}) 0%, transparent 48%)`;
  const blob2 = `radial-gradient(circle at 75% 70%, oklch(0.55 0.16 ${(h + 50) % 360}) 0%, transparent 44%)`;
  const blob3 = `radial-gradient(circle at 50% 88%, oklch(0.42 0.12 ${(h + 25) % 360}) 0%, transparent 36%)`;
  const aspectClass = portrait ? "posts__card-clip-player--portrait" : "posts__card-clip-player--landscape";
  const source = clip.sourceName || "";
  // The "Edit clip" affordance only works when the draft carries a back-ref to
  // its source clip (sourceId + clipId). Legacy / manual clipRefs omit them.
  const editBtn =
    clip.sourceId && clip.clipId
      ? `<button type="button" class="posts__card-clip-edit" data-post-clip-edit="${post.id}" aria-label="Edit clip" title="Edit clip">
        <i class="ap-icon-pen" aria-hidden="true"></i>
        <span>Edit clip</span>
      </button>`
      : "";
  return `
    <div
      class="posts__card-clip-player ${aspectClass}"
      style="background-image: ${blob1}, ${blob2}, ${blob3}, ${bg}"
      role="img"
      aria-label="Video preview from ${escapeAttr(source)} (${formatPlayerTime(duration)})"
    >
      <span class="posts__card-clip-player-source" title="${escapeAttr(source)}">
        <i class="ap-icon-file--video" aria-hidden="true"></i>
        <span>${escapeText(source)}</span>
      </span>
      <span class="posts__card-clip-player-dur">${formatPlayerTime(duration)}</span>
      ${editBtn}
      <button type="button" class="posts__card-clip-player-play" aria-label="Play preview" tabindex="-1">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M8 5v14l11-7z" fill="currentColor" />
        </svg>
      </button>
      <span class="posts__card-clip-player-scrubber" aria-hidden="true">
        <span class="posts__card-clip-player-progress" style="width: 24%"></span>
      </span>
    </div>
  `;
}

const formatPlayerTime = (sec) => formatClock(sec, { round: true });

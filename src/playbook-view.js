// Shared Playbook view + per-section editor. Renders a product-grade detail
// surface — a compact identity header, a sticky section-nav rail with quick
// facts, and three section panels (Audience & goals · Voice & style · Brand) —
// plus the inline per-section edit machine. Driven by a `cfg` adapter so the
// same surface powers two contexts:
//   • onboarding (welcome-alt-recap) — a context-builder DRAFT, with a
//     staged loader and a "Save and start" finish.
//   • library (/playbook/:id)        — a saved Context, in the app shell,
//     editing straight into the store, with header actions (Start chat /
//     Edit name / Delete).
//
// The renderers operate on a plain `data` object (draft or Context — both
// expose the same field names). Persistence + chrome + copy are injected
// via `cfg`; the edit state (editScope / snapshot) lives module-local and
// is safe because only one route renders at a time.

import { html, raw, escapeHtml as esc } from "./utils.js?v=1799";
import {
  renderColorRole,
  colorRoleCaption,
  renderLogoVariants,
  renderVisualRules,
  handleImageStylesClick,
  handleKitClick,
  handleKitInput,
  handleKitChange,
  kitSnapshot,
  renderImagesTab,
} from "./playbook-brand-kit.js?v=1799";
import { analyzeWebsite, discoverCompetitors, competitorKey } from "./context-mock-analysis.js?v=1799";
import { LANGUAGE_OPTIONS, emptyVoiceEntry } from "./languages.js?v=1799";
import { isFlagOn } from "./feature-flags.js?v=1799";
import { parseHashParams } from "./url-state.js?v=1799";
import {
  networkVoicesOn,
  baseNetwork,
  voiceNetworks,
  networkEntry,
  isOverridden,
  isOptimized,
  maturity,
  partsDone,
  partsNew,
  isNewPart,
  voiceParts,
  progressRingHtml,
  networkLabel,
  networkIcon,
  memoryCardHtml,
} from "./network-voice.js?v=1799";
import {
  getSuggestions,
  accept as acceptVoiceSuggestion,
  dismiss as dismissVoiceSuggestion,
} from "./voice-coach-store.js?v=1799";
import { showToast } from "./components/toast.js?v=1799";
import { open as openConfirmModal } from "./components/confirm-modal.js?v=1799";
import { open as openVoiceWizard } from "./components/voice-wizard-modal.js?v=1799";
import { NETWORK_ICON_BY_PLATFORM, NETWORK_LABEL } from "./social-profiles.js?v=1799";

// Audience & goals — chip fields (multi-value), in display order.
const GOAL_FIELDS = [
  { key: "audience", label: "Primary audience", placeholder: "Add an audience…" },
  { key: "contentStyle", label: "Content style", placeholder: "Add a style…" },
  { key: "objective", label: "Primary goal", placeholder: "Add a goal…" },
  { key: "contentAction", label: "Content action", placeholder: "Add an action…" },
];

// Voice & style — line-list fields (quoted snippets).
const LINE_FIELDS = [
  { key: "signatureHooks", label: "Signature hooks", placeholder: "A line that often opens a post…" },
  { key: "closingPatterns", label: "Closing patterns", placeholder: "A line that often ends a post…" },
];

// Competitors and Influencers close the list on purpose: the panel renderers
// address the first three positionally (SECTIONS[0..2]), and they read as the
// least core sections — market context after audience, voice and brand. Who
// you're up against first, then who your audience listens to.
//
// A Playbook is a FACT SHEET: every section answers "who are you?" — brand,
// audience, voice, who you compete with. Operational config (which listening
// sources are live, how often they refresh) belongs on the route that owns the
// feature, not here — see screens/topics.js. That's why there's no Topics
// section: it was tried, and a grid of switches read as a settings panel wedged
// into a profile.
const SECTIONS = [
  { id: "pbk-sec-goals", scope: "goals", icon: "ap-icon-target", title: "Audience & goals" },
  { id: "pbk-sec-voice", scope: "voice", icon: "ap-icon-quote", title: "Voice & style" },
  { id: "pbk-sec-brand", scope: "brand", icon: "ap-icon-image", title: "Brand" },
  { id: "pbk-sec-competitors", scope: "competitors", icon: "ap-icon-buildings", title: "Competitors" },
  { id: "pbk-sec-influencers", scope: "influencers", icon: "ap-icon-star", title: "Influencers" },
];

// Edit-mode guidance. Surfaced only while a section is being edited (one at a
// time), so the read view stays clean. Audience & goals gets a per-field hint
// (q = prompt, a = what Archie does with it); Voice & style and Brand each get
// a single "captured by Archie" banner.
const FIELD_HINTS = {
  languages: {
    q: "Which languages do you publish in?",
    a: "Pick one or more. I write posts in the language you choose — and use the native Voice examples for that language, never a translation.",
  },
  businessSummary: {
    q: "Does this describe your business correctly?",
    a: "Archie analysed your website and wrote this summary.",
  },
  audience: {
    q: "Who is your primary audience?",
    a: "Archie will tailor post topics and framing to speak directly to them.",
  },
  contentStyle: {
    q: "What content style fits your brand?",
    a: "This guides the structure and format of every post Archie writes.",
  },
  objective: {
    q: "What's your primary social media objective?",
    a: "Archie will prioritise content angles that serve this goal.",
  },
  contentAction: {
    q: "What action should your content drive?",
    a: "Archie will include relevant CTAs aligned with this action.",
  },
  ctaLinks: {
    q: "Call to action",
    a: "Archie surfaces these links when posts call for an action.",
  },
  brandLogo: {
    q: "Which mark should I default to?",
    a: "I stamp the default bottom-right on the images I generate. The others stay available to place by hand.",
  },
  imageDefaults: {
    q: "What should generated images look like by default?",
    a: "I start every image here. Change any of it per post in the Image Studio — nothing you do there comes back to this fiche.",
  },
};

const SECTION_HINTS = {
  voice: {
    q: "Voice profile",
    a: "Archie captured this voice from your connected profile's recent posts.",
  },
  brand: {
    // "Your logo, plus…" because the logo is the one thing in this section Archie
    // can't find for you — a banner claiming it picked everything up from the site
    // would be contradicted by the very first row.
    q: "Visual identity",
    a: "Your logo, plus the colours and type Archie picked up from your site — so visuals stay on-brand.",
  },
  competitors: {
    q: "Who you're up against",
    a: "Archie scans your market and proposes competitors. Add the ones that matter — a dismissed suggestion won't come back.",
  },
};

const STAGE_MS = 2400;

let mountTarget = null;
let cfg = null;
let editScope = null; // null (read) | "goals" | "voice" | "brand" | "competitors" | "influencers"
let refModalIndex = null; // open reference-image detail modal (index) or null
let rosterModal = null; // open competitor/influencer detail modal: { kind, index } or null
let rosterScanning = null; // roster whose "Discover" scan is in flight ("competitors") or null — Influencers has no Discover
let rosterScanTimer = null; // the scan's pending timeout
let rosterFoundNone = null; // roster whose last scan returned nothing new (show the note) or null
let infAdd = null; // the "Add an influencer" dialog's draft ({ name, websiteUrl, socials }), or null
let refModalHost = null; // body-level portal node for the open detail modal
let snapshot = null; // deep copy of editable fields, for Cancel
let editBaseline = null; // the same fields as JSON once the editor has painted — "anything changed?"
let audienceCustom = false; // "Other…" picked in the Primary audience dropdown
let activeVoiceLang = null; // which language the Voice & style panel is showing/editing
let activeNetwork = null; // flag networkVoices: the network voice the Voice tab shows (null = the base)
let loadingTimer = null;
let loadingStage = 0;
let phase = "ready"; // "loading" | "ready"
let activeTab = "goals"; // Playbook 2.0: the tab on screen

// ── Public API ───────────────────────────────────────────────────────────

// cfg: {
//   mode: "onboarding" | "library",
//   getData(): object,                 // the live data object (draft | Context)
//   isReady(): boolean,                // analysis landed? (loader waits on it)
//   commit(): void,                    // Save — persist + notify
//   revert(snapshot): void,            // Cancel — restore editable fields
//   onPaint(): void,                   // each ready paint (e.g. reload snapshot)
//   loader: [{title,sub}] | null,      // staged loader (onboarding); null = none
//   skipLoader: boolean,               // force straight to ready
//   onIntroDone(): void,               // loader finished
//   showTop: boolean,                  // render the Archie/BETA top strip
//   canEdit: boolean,                  // default true; false = read-only fiche
//                                      // (someone else's shared Playbook)
//   ownership: {                       // null = don't say anything about it
//     tag: string,                     //   mark beside the name ("Shared by Sam")
//     owner: string, initials: string, //   the Owner quick-fact
//   } | null,
//   notice(): string,                  // html above the layout (read-only banner)
//   headerActions(): string | null,    // html for the header action bar (library)
//   onEditName(): void,                // header name pencil (rename)
//   onAnalyzeVoice(): void,            // Voice & style → analyze social profiles
//   onFooter(event): boolean,          // catch-all click handler (header actions)
// }
export function mount(target, config) {
  cfg = config;
  mountTarget = target;
  activeTab = tabFromUrl();
  activeNetwork = parseHashParams().get("net") || null;
  editScope = null;
  snapshot = null;
  audienceCustom = false;
  rosterModal = null;
  rosterScanning = null;
  rosterFoundNone = null;
  infAdd = null;

  if (cfg.loader && !cfg.skipLoader) {
    phase = "loading";
    loadingStage = 0;
    paint();
    startLoadingSequence();
  } else {
    phase = "ready";
    paint();
  }

  const onClickH = (e) => onClick(e);
  const onInputH = (e) => onInput(e);
  const onChangeH = (e) => onChange(e);
  const onKeydownH = (e) => onKeydown(e);
  const onErrorH = (e) => onLoadError(e);
  target.addEventListener("click", onClickH);
  target.addEventListener("input", onInputH);
  target.addEventListener("change", onChangeH);
  target.addEventListener("keydown", onKeydownH);
  // Competitor favicons come from a remote service, so a domain with no icon
  // (or an offline session) has to fall back to the monogram tile. `error`
  // doesn't bubble, so this listener has to run in the CAPTURE phase — that's
  // what lets us keep the repo's "delegated handlers, no inline on*" rule.
  target.addEventListener("error", onErrorH, true);
  // A reload can't save (nothing persists across it), so it's the one exit
  // that still has to ask — only while there is something to lose.
  const onBeforeUnloadH = (e) => {
    if (!isLibrary() || !editScope || !isDirty(cfg.getData())) return;
    e.preventDefault();
    e.returnValue = "";
  };
  window.addEventListener("beforeunload", onBeforeUnloadH);

  return () => {
    // Leaving the fiche — a chat in the rail, Start a chat, any route — saves
    // the open section rather than dropping it (Playbook 2.0).
    if (isLibrary()) saveOnLeave();
    window.removeEventListener("beforeunload", onBeforeUnloadH);
    stopLoading();
    stopRosterScan();
    target.removeEventListener("click", onClickH);
    target.removeEventListener("input", onInputH);
    target.removeEventListener("change", onChangeH);
    target.removeEventListener("keydown", onKeydownH);
    target.removeEventListener("error", onErrorH, true);
    if (refModalHost) {
      refModalHost.remove();
      refModalHost = null;
    }
    refModalIndex = null;
    rosterModal = null;
    mountTarget = null;
    cfg = null;
    editScope = null;
    snapshot = null;
    editBaseline = null;
  };
}

// Every repaint keeps the reader where they are. paint() rebuilds the whole
// `.welcome-screen` (the scroll container), so its scrollTop resets to 0 — and
// in edit mode nearly every click repaints (Add a logo, Add colour, a chip's ×,
// a role picked…), which threw the page back to the top under the pointer. The
// few moves that SHOULD land at the top (a tab switch) scroll there themselves
// after the repaint; mount() paints fresh and starts at the top anyway.
function repaint() {
  if (!mountTarget) return;
  const top = mountTarget.querySelector(".welcome-screen")?.scrollTop ?? 0;
  paint();
  const next = mountTarget.querySelector(".welcome-screen");
  if (next && top) next.scrollTop = top;
}

function isReady() {
  return cfg.isReady ? cfg.isReady() : true;
}

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// ── Loader ─────────────────────────────────────────────────────────────

function stopLoading() {
  if (loadingTimer) {
    window.clearInterval(loadingTimer);
    loadingTimer = null;
  }
}

function startLoadingSequence() {
  stopLoading();
  loadingTimer = window.setInterval(() => {
    if (loadingStage < cfg.loader.length - 1) {
      loadingStage += 1;
      repaint();
    } else if (isReady()) {
      stopLoading();
      cfg.onIntroDone?.();
      phase = "ready";
      repaint();
    }
    // else: hold on the final stage until the data lands.
  }, STAGE_MS);
}

// ── Data helpers ───────────────────────────────────────────────────────

function brandSite(data) {
  const sites = data?.imageVoice?.websites;
  return Array.isArray(sites) && sites.length ? sites[0] : null;
}

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function prettyUrl(url) {
  return (url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// Default brand colours derived from the scraped site palette, so a Playbook
// that has never been hand-edited still shows named swatches the user can
// then rename / extend. Used to seed `data.brandColors` on first edit.
function deriveBrandColors(site) {
  const c = site?.colors || {};
  return [
    { name: "Primary", hex: c.primary },
    { name: "Accent", hex: c.accent },
    { name: "Background", hex: c.background },
    { name: "Text", hex: c.textPrimary },
    { name: "Link", hex: c.link },
  ].filter((s) => s.hex);
}

// The marks Archie found on the site, in the order the Brand section offers
// them. Mirrors deriveBrandColors: the scraped material is the default the user
// then prunes and adds to.
function deriveBrandLogos(site) {
  const found = site?.images?.logos;
  if (!Array.isArray(found)) return [];
  return found
    .filter((l) => l && l.url)
    .map((l, i) => ({ id: `site-logo-${i}`, label: l.label || "Logo", url: l.url }));
}

// The Playbook's marks — authored `brandLogos` if present, else what the site
// analysis turned up.
function brandLogoList(data) {
  if (Array.isArray(data.brandLogos) && data.brandLogos.length) return data.brandLogos;
  return deriveBrandLogos(brandSite(data));
}

// Which mark is the default: `brandLogo` is the resolved url (see
// contexts-store#normalizeBrandLogos), so an index is derived, never stored.
function defaultLogoIndex(data, list) {
  const i = list.findIndex((l) => l.url === data.brandLogo);
  return i === -1 ? (list.length ? 0 : -1) : i;
}

// The authored brand palette — user-edited `brandColors` if present, else the
// derived site palette (read-only view falls back to this).
function visualColors(data) {
  if (Array.isArray(data.brandColors) && data.brandColors.length) return data.brandColors;
  return deriveBrandColors(brandSite(data));
}

function brandFonts(data) {
  const site = brandSite(data);
  const t = data.brandTypography || {};
  return {
    headingFont: t.headingFont || site?.typography?.headingFont || site?.typography?.primaryFont || "",
    bodyFont: t.bodyFont || site?.typography?.primaryFont || "",
  };
}

// Lazily promote the derived palette / scraped fonts into editable fields the
// first time the user opens the Brand editor (alpha feedback #10).
function ensureBrand(data) {
  if (!Array.isArray(data.brandColors) || !data.brandColors.length) {
    data.brandColors = deriveBrandColors(brandSite(data));
  }
  // Promote the scraped marks so the gallery has entries to reorder / remove,
  // and adopt the first as the default if nothing was chosen yet.
  if (!Array.isArray(data.brandLogos) || !data.brandLogos.length) {
    data.brandLogos = deriveBrandLogos(brandSite(data));
  }
  if (!data.brandLogo && data.brandLogos.length) data.brandLogo = data.brandLogos[0].url;
  if (!data.brandTypography || typeof data.brandTypography !== "object") {
    data.brandTypography = brandFonts(data);
  }
  if (!Array.isArray(data.referenceImages)) data.referenceImages = [];
  // Shape only, deliberately NOT derived like the four above: the pre-fill is the
  // analysis's job (context-builder#imageDefaultsFromAnalysis). Guessing a look the
  // first time someone opens the editor would be a silent write to the fiche.
  if (!data.imageDefaults || typeof data.imageDefaults !== "object") {
    data.imageDefaults = { imageType: "", style: "", refMode: "" };
  }
}

// Snapshot only the user-editable fields so Cancel can restore them.
export function snapshotEditable(d) {
  return JSON.parse(
    JSON.stringify({
      name: d.name || "",
      businessSummary: d.businessSummary || "",
      audience: d.audience || [],
      contentStyle: d.contentStyle || [],
      objective: d.objective || [],
      contentAction: d.contentAction || [],
      ctaLinks: d.ctaLinks || [],
      language: d.language || "",
      languages: d.languages || [],
      primaryLanguage: d.primaryLanguage || "",
      voiceByLanguage: d.voiceByLanguage || {},
      voiceBaseNetwork: d.voiceBaseNetwork || "",
      voiceByNetwork: d.voiceByNetwork || {},
      signatureHooks: d.signatureHooks || [],
      closingPatterns: d.closingPatterns || [],
      formattingStyle: d.formattingStyle || "",
      visualStyle: d.visualStyle || "",
      hashtagStyle: d.hashtagStyle || "",
      voiceMode: d.voiceMode || "guided",
      voiceManual: d.voiceManual || "",
      brandPersonality: d.brandPersonality || "",
      brandTypography: d.brandTypography || null,
      brandColors: d.brandColors || [],
      brandLogos: d.brandLogos || [],
      brandLogo: d.brandLogo || "",
      imageDefaults: d.imageDefaults || { imageType: "", style: "", refMode: "" },
      competitors: d.competitors || [],
      dismissedCompetitors: d.dismissedCompetitors || [],
      ...kitSnapshot(d),
      influencers: d.influencers || [],
    }),
  );
}

// ── Language helpers (multilingual Playbook) ───────────────────────────────

// Multilingual Playbooks are gated behind a feature flag (default OFF). When
// OFF, a Playbook behaves single-language: only the primary language surfaces,
// no per-language voice switcher, no draft-time language question.
function multilingualOn() {
  return isFlagOn("multilingualPlaybook");
}

// The Playbook's declared languages, always a non-empty array. Collapses to
// the primary language alone when the multilingual flag is OFF (secondary
// languages stay in the data, just hidden).
function contextLanguages(data) {
  const langs = Array.isArray(data.languages) && data.languages.length ? data.languages : null;
  const primary = data.primaryLanguage || (langs && langs[0]) || data.language || "English";
  if (!multilingualOn()) return [primary];
  return langs || [primary];
}

// The language the Voice & style panel currently shows/edits — kept valid
// against the declared languages, defaulting to the primary.
function currentVoiceLang(data) {
  const langs = contextLanguages(data);
  if (!activeVoiceLang || !langs.includes(activeVoiceLang)) {
    activeVoiceLang = data.primaryLanguage && langs.includes(data.primaryLanguage) ? data.primaryLanguage : langs[0];
  }
  return activeVoiceLang;
}

// The per-language voice entry for the active language (created on demand).
// Voice examples (signatureHooks / closingPatterns / cta) are authored per
// language and NEVER machine-translated.
//
// When the entry is missing, the PRIMARY language seeds from the flat legacy
// fields — a draft fresh from the website analysis has flat signatureHooks /
// closingPatterns populated but no per-language map yet, so without this the
// recap would read "Not set yet". Secondary languages start empty (authored
// natively per language).
function voiceEntry(data) {
  const lang = currentVoiceLang(data);
  if (!data.voiceByLanguage || typeof data.voiceByLanguage !== "object") data.voiceByLanguage = {};
  if (!data.voiceByLanguage[lang]) {
    const primary = data.primaryLanguage || contextLanguages(data)[0];
    data.voiceByLanguage[lang] =
      lang === primary
        ? {
            signatureHooks: Array.isArray(data.signatureHooks) ? data.signatureHooks.slice() : [],
            closingPatterns: Array.isArray(data.closingPatterns) ? data.closingPatterns.slice() : [],
            cta: data.cta || "",
            ctaLabels: {},
          }
        : emptyVoiceEntry(data);
  }
  return data.voiceByLanguage[lang];
}

// ── Shared bits ──────────────────────────────────────────────────────────

function editActionButtons() {
  return `
    <button type="button" class="ap-button ghost grey recap__edit-cancel" data-recap-cancel>
      <span>Cancel</span>
    </button>
    <button type="button" class="ap-button primary blue recap__edit-save" data-recap-save>
      <i class="ap-icon-check"></i><span>Save changes</span>
    </button>
  `;
}

function canEditView() {
  return cfg?.canEdit !== false;
}

function panelPen(scope) {
  return `<button type="button" class="ap-icon-button transparent recap__panel-edit" data-recap-edit-card="${scope}" title="Edit" aria-label="Edit section"><i class="ap-icon-pen"></i></button>`;
}

function panelEditActions() {
  return `<div class="recap__panel-actions">${editActionButtons()}</div>`;
}

function renderPanelHead(section, edit, extraAction = "") {
  return `
    <header class="recap__panel-head pb2-panel-head">
      <p class="pb2-panel-lead">${esc(SECTION_LEADS[section.scope] || "")}</p>
      ${edit ? panelEditActions() : `${extraAction}${canEditView() ? panelPen(section.scope) : ""}`}
    </header>
  `;
  return `
    <header class="recap__panel-head">
      <span class="recap__panel-icon"><i class="${section.icon}" aria-hidden="true"></i></span>
      <h2 class="recap__panel-title">${esc(section.title)}</h2>
      ${edit ? panelEditActions() : `${extraAction}${canEditView() ? panelPen(section.scope) : ""}`}
    </header>
  `;
}

// The brand marks — a GALLERY, because a site carries several and Archie brings
// back all of them: the header lockup, the reversed one, the icon, the favicon.
// One is the default (`brandLogo`), which is what the header shows and what the
// image generator stamps; the rest stay available to place by hand in the studio.
//
// Read mode shows the whole set with the default marked rather than the default
// alone: seeing that four marks were found is the thing worth knowing, and it's
// what tells you there's a choice here at all without entering edit mode.
//
// Tiles are SQUARE thumbnails with the label underneath — at 72px a wordmark and
// its reversed twin are hard to tell apart, and "Reversed" vs "Icon" is not
// something a thumbnail can say on its own.
//
// Upload is a button + a hidden input rather than the shared `.ap-dropzone`,
// because the "Reference images" row one line below in this same section is
// already a button + hidden input. Two different upload affordances that close
// together would read as two different kinds of control.
const MAX_BRAND_LOGOS = 8;

function renderBrandLogo(data, edit) {
  const list = brandLogoList(data);
  if (!list.length && !edit) return `<span class="recap__row-empty">Not set yet</span>`;
  const active = defaultLogoIndex(data, list);
  const tiles = list
    .map((logo, i) => {
      const on = i === active;
      const label = esc(logo.label || "Logo");
      // Read mode is a recap — nothing is clickable, the badge just reports
      // which mark is in use. Edit mode makes each tile the pick control.
      const frame = edit
        ? `<button type="button" class="recap__logotile${on ? " is-default" : ""}" aria-pressed="${on}" data-recap-logo-pick="${i}" title="${on ? "Default mark" : "Use as default"}">`
        : `<span class="recap__logotile${on ? " is-default" : ""}">`;
      return `
      <div class="recap__logoslot">
        ${frame}
          <img src="${esc(logo.url)}" alt="${label}" loading="lazy" />
          ${on ? `<span class="recap__logotile-badge" aria-hidden="true"><i class="ap-icon-check"></i></span>` : ""}
        ${edit ? "</button>" : "</span>"}
        ${edit ? `<button type="button" class="recap__logo-remove" data-recap-logo-remove="${i}" aria-label="Remove ${label}"><i class="ap-icon-close"></i></button>` : ""}
        <span class="recap__logotile-label">${label}${on ? ` <span class="recap__logotile-tag">Default</span>` : ""}</span>
      </div>`;
    })
    .join("");
  const gallery = tiles ? `<div class="recap__logos">${tiles}</div>` : "";
  if (!edit) return gallery;
  return `
    <div class="recap__logo-edit">
      ${gallery}
      ${
        list.length < MAX_BRAND_LOGOS
          ? `<button type="button" class="ap-button secondary blue recap__logo-add" data-recap-logo-add>
               <i class="ap-icon-upload" aria-hidden="true"></i><span>Add a logo</span>
             </button>`
          : ""
      }
      <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" multiple hidden data-recap-logo-input />
    </div>`;
}

// ── Edit-mode field renderers ──────────────────────────────────────────

function renderEditChips(field, values, placeholder) {
  const list = Array.isArray(values) ? values : [];
  const chips = list
    .map(
      (v, i) => `
      <span class="ap-tag blue recap__chip recap__chip--editable">
        <span>${esc(v)}</span>
        <button type="button" data-recap-chip-remove="${field}" data-recap-chip-index="${i}" aria-label="Remove ${esc(v)}">
          <i class="ap-icon-close"></i>
        </button>
      </span>
    `,
    )
    .join("");
  return `
    <div class="recap__chips recap__chips--edit">
      ${chips}
      <span class="recap__chip-add">
        <div class="ap-input-group recap__chip-add-field">
          <input type="text" data-recap-chip-input="${field}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" />
        </div>
        <button type="button" class="ap-icon-button stroked grey recap__chip-add-btn" data-recap-chip-add="${field}" aria-label="Add">
          <i class="ap-icon-plus"></i>
        </button>
      </span>
    </div>
  `;
}

// Primary audience is single-select. Build the option pool from Archie's
// analysed audiences (the onboarding draft carries them in
// `suggestions.audience`; a saved Playbook with a website re-derives them
// live), unioned with whatever's currently selected so nothing is ever lost.
function audienceOptionPool(data) {
  const current = Array.isArray(data.audience) ? data.audience : [];
  let analysed = data.suggestions && Array.isArray(data.suggestions.audience) ? data.suggestions.audience : [];
  if (!analysed.length && data.websiteUrl) {
    try {
      analysed = analyzeWebsite(data.websiteUrl)?.suggestions?.audience || [];
    } catch {
      analysed = [];
    }
  }
  const pool = [];
  const seen = new Set();
  const add = (v) => {
    const t = (v || "").trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    pool.push(t);
  };
  analysed.forEach(add);
  current.forEach(add);
  return pool;
}

// Single-select audience picker: Archie's analysed audiences are the options
// of a native dropdown (one choice only), with a trailing "Other…" entry that
// reveals a free-text input to define a custom audience. Built on the DS
// `.ap-select` dropdown (the same component as the Batch Studio playbook picker)
// so the single-choice nature reads as a proper dropdown. Options are addressed
// by index — the pool is recomputed deterministically on pick. `audienceCustom`
// (module-local, reset whenever the edit scope changes) tracks the "Other…" state.
function renderAudiencePicker(data) {
  const pool = audienceOptionPool(data);
  const selected = Array.isArray(data.audience) && data.audience.length ? data.audience[0] : "";
  const options = pool
    .map((v, i) => {
      const on = !audienceCustom && v.toLowerCase() === selected.toLowerCase();
      return `<div class="ap-select-option${on ? " selected" : ""}" data-recap-audience-pick="${i}" role="option" aria-selected="${on}">
          <span class="ap-select-option-text">${esc(v)}</span>
          ${on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>`;
    })
    .join("");
  const otherOption = `<div class="ap-select-option${audienceCustom ? " selected" : ""}" data-recap-audience-pick="other" role="option" aria-selected="${audienceCustom}">
      <i class="ap-icon-plus ap-select-option-icon" aria-hidden="true"></i>
      <span class="ap-select-option-text">Other — define your own…</span>
    </div>`;
  const triggerLabel = audienceCustom ? "Other — define your own…" : selected;
  return `
    <div class="recap__audience-picker">
      <details class="ap-select recap__audience-select" data-recap-audience-details>
        <summary class="ap-select-trigger">
          <span class="ap-select-value${triggerLabel ? "" : " ap-select-placeholder"}">${esc(triggerLabel || "Choose an audience")}</span>
          <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
        </summary>
        <div class="ap-select-dropdown" role="listbox" aria-label="Primary audience">
          <div class="ap-select-options">${options}${otherOption}</div>
        </div>
      </details>
      ${
        audienceCustom
          ? `<span class="recap__chip-add recap__audience-add">
        <div class="ap-input-group recap__chip-add-field">
          <input type="text" data-recap-audience-input placeholder="Define your audience…" aria-label="Define your audience" />
        </div>
        <button type="button" class="ap-icon-button stroked grey recap__chip-add-btn" data-recap-audience-add aria-label="Add audience">
          <i class="ap-icon-plus"></i>
        </button>
      </span>`
          : ``
      }
    </div>
  `;
}

function renderLineEditor(field, values, placeholder) {
  const list = Array.isArray(values) ? values : [];
  const rows = list
    .map(
      (v, i) => `
      <div class="recap__line-edit">
        <div class="ap-input-group recap__line-edit-field">
          <input type="text" data-recap-line-field data-recap-line-list="${field}" data-recap-line-index="${i}" value="${esc(v)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" />
        </div>
        <button type="button" class="recap__cta-remove" data-recap-line-remove data-recap-line-list="${field}" data-recap-line-index="${i}" aria-label="Remove line">
          <i class="ap-icon-close"></i>
        </button>
      </div>`,
    )
    .join("");
  return `
    <div class="recap__line-list">${rows}</div>
    <button type="button" class="ap-button secondary blue recap__add-row" data-recap-line-add="${field}">
      <i class="ap-icon-plus"></i><span>Add line</span>
    </button>
  `;
}

function renderTextarea(field, value, placeholder) {
  return `
    <div class="ap-textarea-field resizable">
      <textarea data-recap-text="${field}" rows="3" placeholder="${esc(placeholder)}">${esc(value || "")}</textarea>
    </div>
  `;
}

function renderCtaEditor(data) {
  const allCtas = Array.isArray(data.ctaLinks) ? data.ctaLinks : [];
  const rows = allCtas
    .map((c, i) => ({ ...c, _i: i }))
    .filter((c) => c.checked || c.suggested === false)
    .map(
      (c) => `
      <div class="recap__cta-edit">
        <div class="ap-input-group recap__cta-edit-label">
          <input type="text" data-recap-cta-field="label" data-recap-cta-index="${c._i}" value="${esc(c.label || "")}" placeholder="Label" aria-label="CTA label" />
        </div>
        <div class="ap-input-group recap__cta-edit-url">
          <input type="text" data-recap-cta-field="url" data-recap-cta-index="${c._i}" value="${esc(c.url || "")}" placeholder="https://…" aria-label="CTA URL" />
        </div>
        <button type="button" class="recap__cta-remove" data-recap-cta-remove="${c._i}" aria-label="Remove link">
          <i class="ap-icon-close"></i>
        </button>
      </div>
    `,
    )
    .join("");
  return `
    <div class="recap__cta-edit-list">${rows}</div>
    <button type="button" class="ap-button secondary blue recap__add-row" data-recap-cta-add>
      <i class="ap-icon-plus"></i><span>Add link</span>
    </button>
  `;
}

// Reference-image gallery (#11) — up to 10 visual references, each with
// optional usage guidance (a freeform note + target networks).
const MAX_REF_IMAGES = 10;
const REF_NETWORKS = ["facebook", "instagram", "linkedin", "x", "tiktok", "youtube"];

// Read-only network mini-badges (icons only) for an image's target networks.
function renderRefNetBadges(networks) {
  const nets = Array.isArray(networks) ? networks.filter((n) => NETWORK_ICON_BY_PLATFORM[n]) : [];
  if (!nets.length) return "";
  return `<span class="recap__refimg-nets">${nets
    .map(
      (n) =>
        `<i class="${NETWORK_ICON_BY_PLATFORM[n]}" title="${esc(NETWORK_LABEL[n] || n)}" aria-label="${esc(NETWORK_LABEL[n] || n)}"></i>`,
    )
    .join("")}</span>`;
}

// Edit-mode network toggles — compact icon-only buttons (recognizable logos +
// a selection ring) so they stay one tidy row at any panel width. The platform
// name rides on title/aria-label.
function renderRefNetChips(networks, i) {
  const nets = Array.isArray(networks) ? networks : [];
  return `<div class="recap__refedit-nets">${REF_NETWORKS.map((n) => {
    const on = nets.includes(n);
    const label = esc(NETWORK_LABEL[n] || n);
    return `<button type="button" class="recap__refedit-net" aria-pressed="${on}" data-recap-refnet="${n}" data-recap-refimg-index="${i}" title="${label}" aria-label="${label}"><i class="${NETWORK_ICON_BY_PLATFORM[n]}" aria-hidden="true"></i></button>`;
  }).join("")}</div>`;
}

// Deterministic mock "vision" read of an image — the indications Archie surfaces
// (dominant colours + scene/subject tags). Stable per image (hashed from its
// label/seed), since the prototype has no real image analysis.
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const REF_TAG_POOLS = [
  [/ui|product|screen|app|dashboard/, ["Product UI", "Screens", "Tech"]],
  [/team|people|candid|portrait|face|hiring/, ["People", "Candid", "Human"]],
  [/brand|board|palette|logo|identity/, ["Brand", "Studio", "Graphic"]],
  [/office|desk|work|laptop/, ["Workplace", "Indoor", "Lifestyle"]],
  [/nature|outdoor|landscape|mountain|city|street|scene/, ["Outdoor", "Scene", "Editorial"]],
];
const REF_TAG_FALLBACK = ["Photographic", "Editorial", "Lifestyle", "Minimal", "Vibrant", "Muted", "Candid", "Studio"];

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const to = (n) =>
    Math.round(f(n) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(0)}${to(8)}${to(4)}`;
}

// Deterministic mock signals for an image that has no stored tags/colours yet.
function refImageSignals(img) {
  const key = (img.label || img.id || img.url || "image").toLowerCase();
  const h = hashStr(key);
  const palette = [30, 50, 66, 82].map((lig, i) => {
    const hue = (((h >> (i * 5)) % 360) + 360) % 360;
    const sat = 42 + ((h >> (i * 3)) % 34);
    return hslToHex(hue, sat, lig);
  });
  let tags = null;
  for (const [re, t] of REF_TAG_POOLS) {
    if (re.test(key)) {
      tags = t;
      break;
    }
  }
  if (!tags) tags = [0, 1, 2].map((i) => REF_TAG_FALLBACK[(h >> (i * 4)) % REF_TAG_FALLBACK.length]);
  return { palette, tags: [...new Set(tags)] };
}

// An image's tags / colours — stored on the image once edited, else the mock
// signals (seeded lazily so the first edit has something to mutate).
function refTags(img) {
  return Array.isArray(img.tags) ? img.tags : refImageSignals(img).tags;
}
function refColors(img) {
  return Array.isArray(img.colors) ? img.colors : refImageSignals(img).palette;
}
// Promote the mock signals onto the image so the first edit has arrays to mutate.
function ensureRefTagsColors(img) {
  if (!Array.isArray(img.tags)) img.tags = refImageSignals(img).tags.slice();
  if (!Array.isArray(img.colors)) img.colors = refImageSignals(img).palette.slice();
}

// Per-image detail modal — big preview + Archie's extracted indications, then
// the usage notes + target networks (editable in edit mode, read-only otherwise).
function renderRefModal(data) {
  if (refModalIndex == null) return "";
  const imgs = Array.isArray(data.referenceImages) ? data.referenceImages : [];
  const img = imgs[refModalIndex];
  if (!img) return "";
  const i = refModalIndex;
  const edit = editScope === "brand"; // editable only while the Brand section is
  const tags = refTags(img);
  const colors = refColors(img);

  const tagsBlock = edit
    ? `<div class="recap__reftags">
        ${tags
          .map(
            (t, ti) =>
              `<span class="ap-tag grey"><span>${esc(t)}</span><button type="button" data-recap-reftag-remove data-recap-refimg-index="${i}" data-recap-tag-index="${ti}" aria-label="Remove ${esc(t)}"><i class="ap-icon-close"></i></button></span>`,
          )
          .join("")}
        <input type="text" class="recap__reftag-input" data-recap-reftag-input data-recap-refimg-index="${i}" placeholder="Add tag…" aria-label="Add tag" />
      </div>`
    : `<div class="recap__reftags">${
        tags.map((t) => `<span class="ap-tag grey"><span>${esc(t)}</span></span>`).join("") ||
        `<span class="recap__refmodal-empty">None</span>`
      }</div>`;

  const colorsBlock = edit
    ? `<div class="recap__refcolors">
        ${colors
          .map(
            (c, ci) =>
              `<span class="recap__refcolor"><input type="color" class="recap__refcolor-input" value="${esc(c)}" data-recap-refcolor data-recap-refimg-index="${i}" data-recap-color-index="${ci}" aria-label="Colour ${ci + 1}" /><button type="button" class="recap__refcolor-x" data-recap-refcolor-remove data-recap-refimg-index="${i}" data-recap-color-index="${ci}" aria-label="Remove colour"><i class="ap-icon-close"></i></button></span>`,
          )
          .join("")}
        <button type="button" class="recap__refcolor-add" data-recap-refcolor-add data-recap-refimg-index="${i}" aria-label="Add colour"><i class="ap-icon-plus"></i></button>
      </div>`
    : `<div class="recap__refcolors">${
        colors
          .map((c) => `<span class="recap__refmodal-dot" style="background:${esc(c)};" title="${esc(c)}"></span>`)
          .join("") || `<span class="recap__refmodal-empty">None</span>`
      }</div>`;

  const notes = edit
    ? `<div class="ap-textarea-field resizable">
        <textarea data-recap-refnote data-recap-refimg-index="${i}" rows="3" placeholder="How &amp; when to use this image — do's &amp; don'ts, style notes…" aria-label="Usage guidance">${esc(img.note || "")}</textarea>
      </div>`
    : img.note && img.note.trim()
      ? `<p class="recap__refmodal-note">${esc(img.note)}</p>`
      : `<p class="recap__refmodal-empty">No notes yet.</p>`;
  const netsBlock = edit
    ? renderRefNetChips(img.networks, i)
    : renderRefNetBadges(img.networks) || `<span class="recap__refmodal-empty">Any network.</span>`;
  const removeBtn = edit
    ? `<button type="button" class="ap-button transparent grey" data-recap-refimg-remove="${i}"><i class="ap-icon-trash"></i><span>Remove image</span></button>`
    : "";
  // DS dialog chrome (.ap-dialog + header/close/content/footer) inside a
  // centered .app-modal-backdrop scrim.
  return `
  <div class="app-modal-backdrop recap__refmodal-backdrop" data-recap-refmodal-backdrop>
    <aside class="ap-dialog recap__refmodal" role="dialog" aria-modal="true" aria-label="Reference image">
      <div class="ap-dialog-header"><span class="ap-dialog-title">Reference image</span></div>
      <button type="button" class="ap-dialog-close" data-recap-refimg-close aria-label="Close"><i class="ap-icon-close"></i></button>
      <div class="ap-dialog-content recap__refmodal-content">
        <div class="recap__refmodal-grid">
          <div class="recap__refmodal-preview"><img src="${esc(img.url)}" alt="${esc(img.label || "Reference image")}" /></div>
          <div class="recap__refmodal-panel">
            <div class="recap__refmodal-sec">
              <span class="recap__refedit-flabel">Tags</span>
              ${tagsBlock}
            </div>
            <div class="recap__refmodal-sec">
              <span class="recap__refedit-flabel">Dominant colours</span>
              ${colorsBlock}
            </div>
            <div class="recap__refmodal-sec">
              <span class="recap__refedit-flabel">Usage notes</span>
              ${notes}
            </div>
            <div class="recap__refmodal-sec">
              <span class="recap__refedit-flabel">Best for</span>
              ${netsBlock}
            </div>
          </div>
        </div>
      </div>
      <div class="ap-dialog-footer">
        <div class="ap-dialog-footer-left">${removeBtn}</div>
        <div class="ap-dialog-footer-right">
          <button type="button" class="ap-button primary orange" data-recap-refimg-close><span>Done</span></button>
        </div>
      </div>
    </aside>
  </div>`;
}

// Static Archie brand mark (same glyph as the loader, sans the SMIL pop
// animation). Paints with currentColor so the banner can tint it brand orange.
const ARCHIE_MARK_SVG = `<svg class="recap__panel-hint-icon" viewBox="0 0 227.15 170.03" aria-hidden="true"><path fill="currentColor" d="M227.15,81.98v29.37c0,4.69-3.81,8.5-8.5,8.5h-29.37c-4.69,0-8.5-3.81-8.5-8.5v-27.11c0-4.69-3.78-8.5-8.47-8.5h-27.45c-4.69,0-8.5,3.81-8.5,8.5v26.91c0,4.69-3.78,8.47-8.47,8.47h-28.92c-4.69,0-8.5,3.81-8.5,8.5v33.89c0,4.69-3.78,8.47-8.47,8.47h-32.67c-4.69,0-8.47-3.78-8.47-8.47v-34.03c0-4.69-3.81-8.47-8.5-8.47H8.47c-4.69,0-8.47-3.81-8.47-8.5v-23.86c0-4.69,3.78-8.47,8.47-8.47h23.89c4.69,0,8.5-3.81,8.5-8.5v-14.18c0-4.69,3.78-8.5,8.47-8.5h16.07c4.69,0,8.47-3.78,8.47-8.44V8.5C73.87,3.81,77.66,0,82.34,0h32.64C119.67,0,123.46,3.81,123.46,8.5v32.11c0,4.69-3.78,8.47-8.47,8.47h-32.64c-4.69,0-8.47,3.81-8.47,8.5v14.46c0,4.69-3.81,8.5-8.5,8.5h-16.04c-4.69,0-8.47,3.78-8.47,8.47v20.05c0,4.69,3.78,8.5,8.47,8.5h32.67c4.69,0,8.47-3.81,8.47-8.5v-26.83c0-4.72,3.81-8.5,8.5-8.5h30.38c3.87,0,7-3.13,7-7v-26.94c0-4.69,3.81-8.5,8.5-8.5h27.45c4.69,0,8.47,3.81,8.47,8.5v25.22c0,4.69,3.81,8.47,8.5,8.47h29.37c4.69,0,8.5,3.81,8.5,8.5Z"/></svg>`;

// Section-level edit banner (Voice & style, Brand) — where Archie sourced it.
// Butter background + the Archie mark in brand orange ("captured by Archie").
function renderSectionHint(hint) {
  if (!hint) return "";
  return `
    <div class="recap__panel-hint">
      ${ARCHIE_MARK_SVG}
      <div class="recap__panel-hint-text">
        <span class="recap__panel-hint-q">${esc(hint.q)}</span>
        <span class="recap__panel-hint-a">${esc(hint.a)}</span>
      </div>
    </div>`;
}

// ── Section panels ─────────────────────────────────────────────────────

// Edit view — toggle chips for language membership + a primary-language picker
// when more than one is selected. Voice examples are then authored per language
// in the Voice & style panel (never machine-translated).
function renderLanguagePicker(data) {
  const selected = contextLanguages(data);
  const primary = data.primaryLanguage || selected[0];
  // Single-language mode (flag OFF) — a plain picker fixed to the primary
  // language, matching the pre-multilingual behaviour.
  if (!multilingualOn()) {
    return `<select class="ap-native-select recap__lang-select" data-recap-primary-language aria-label="Language">
      <option value="${esc(primary)}" selected>${esc(primary)}</option>
    </select>`;
  }
  const chips = LANGUAGE_OPTIONS.map((o) => {
    const on = selected.includes(o);
    return `<button type="button" class="ap-filter-chip" aria-pressed="${on}" data-recap-lang-toggle="${esc(o)}">${esc(o)}</button>`;
  }).join("");
  const primaryPicker =
    selected.length > 1
      ? `<label class="recap__lang-primary">
           <span class="recap__lang-primary-label">Primary — the language I write in by default</span>
           <select class="ap-native-select recap__lang-select" data-recap-primary-language aria-label="Primary language">
             ${selected.map((o) => `<option value="${esc(o)}" ${o === primary ? "selected" : ""}>${esc(o)}</option>`).join("")}
           </select>
         </label>`
      : "";
  return `<div class="recap__lang-picker" data-recap-langs>${chips}</div>${primaryPicker}`;
}

// Guided ⇄ Free-form switch for the Voice & style section (edit mode).
function renderVoiceModeToggle(mode) {
  const manual = mode === "manual";
  return `
    <div class="recap__voice-mode" role="group" aria-label="Voice format">
      <button type="button" class="ap-filter-chip" aria-pressed="${!manual}" data-recap-voice-mode="guided">Guided</button>
      <button type="button" class="ap-filter-chip" aria-pressed="${manual}" data-recap-voice-mode="manual">Write it yourself</button>
    </div>`;
}

// Per-language switcher for the guided Voice examples. Only shown when the
// Playbook has more than one language — signature hooks + closing patterns are
// authored natively per language, never translated.
function renderVoiceLangSwitcher(data) {
  const langs = contextLanguages(data);
  if (langs.length < 2) return "";
  const active = currentVoiceLang(data);
  return `
    <div class="recap__voice-langs" role="group" aria-label="Voice language">
      <span class="recap__voice-langs-label">Examples for</span>
      <div class="recap__voice-langs-group">
        ${langs
          .map(
            (l) =>
              `<button type="button" class="ap-filter-chip" aria-pressed="${l === active}" data-recap-voice-lang="${esc(l)}">${esc(l)}</button>`,
          )
          .join("")}
      </div>
    </div>`;
}

// "Learn from…" — a single DS dropdown that merges the old "Learn from my
// posts" (social profiles) and document analysis, both scoped to Voice & style.
function learnMenu() {
  return cfg.onAnalyzeVoice
    ? `<details class="recap__panel-menu" data-recap-learn-menu>
          <summary class="ap-button ghost grey recap__panel-action recap__panel-menu-toggle">
            <i class="ap-icon-double-chat-bubbles" aria-hidden="true"></i>
            <span>Learn from…</span>
            <i class="ap-icon-chevron-down recap__menu-caret" aria-hidden="true"></i>
          </summary>
          <div class="ap-action-dropdown recap__panel-menu-pop" role="menu" aria-label="Learn voice from">
            <button type="button" class="ap-action-dropdown-item" data-recap-learn="posts" role="menuitem">
              <i class="ap-icon-double-chat-bubbles"></i>
              <div class="ap-action-dropdown-item-text"><div class="ap-action-dropdown-item-label-container"><span class="ap-action-dropdown-item-label">My posts</span></div></div>
            </button>
            <button type="button" class="ap-action-dropdown-item" data-recap-learn="documents" role="menuitem">
              <i class="ap-icon-file--text"></i>
              <div class="ap-action-dropdown-item-text"><div class="ap-action-dropdown-item-label-container"><span class="ap-action-dropdown-item-label">Documents…</span></div></div>
            </button>
          </div>
        </details>`
    : "";
}

// The brand's colours as editable rows — one per colour, plus "Add colour".
// Shared by the recap panel and the Playbook 2.0 Colour block.
function renderColorEditor(data) {
  const colorRows = (Array.isArray(data.brandColors) ? data.brandColors : [])
    .map(
      (c, i) => `
        <div class="recap__color-row">
          <span class="recap__color-swatch" data-recap-color-swatch="${i}" style="background:${esc(c.hex || "#ffffff")};"></span>
          <input type="text" class="recap__color-name" data-recap-color-field="name" data-recap-color-index="${i}" value="${esc(c.name || "")}" placeholder="Name" aria-label="Colour name" />
          <input type="text" class="recap__color-hex" data-recap-color-field="hex" data-recap-color-index="${i}" value="${esc(c.hex || "")}" placeholder="#1A1F36" aria-label="Hex value" spellcheck="false" />
          ${renderColorRole(c, i)}
          <button type="button" class="ap-icon-button transparent grey" data-recap-color-remove="${i}" aria-label="Remove colour"><i class="ap-icon-close"></i></button>
        </div>`,
    )
    .join("");
  return `<div class="recap__colors" data-recap-colors>${colorRows}</div>
    <button type="button" class="ap-button secondary blue recap__color-add" data-recap-color-add>
      <i class="ap-icon-plus"></i><span>Add colour</span>
    </button>`;
}

// Headings + body font, as two inputs. Shared like the colour editor.
function renderTypoEditor(data) {
  const fonts = data.brandTypography || brandFonts(data);
  return `<div class="recap__typo-edit">
      <div class="ap-input-group">
        <input type="text" data-recap-typo="headingFont" value="${esc(fonts.headingFont || "")}" placeholder="Headings font" aria-label="Headings font" />
      </div>
      <div class="ap-input-group">
        <input type="text" data-recap-typo="bodyFont" value="${esc(fonts.bodyFont || "")}" placeholder="Body font" aria-label="Body font" />
      </div>
    </div>`;
}

// ── Competitors + Influencers (the two rosters) ────────────────────────
//
// Two lists of people and brands OUTSIDE this one, with the same life cycle:
// Archie pre-fills each from the website analysis (every entry flagged
// `suggested`) and can scan for more on demand; the user prunes it and adds
// the ones Archie missed. Competitors are who the brand is measured against,
// influencers the creators its audience already listens to.
//
// Competitors render through the card grid below; Influencers through the
// beta's list shape (renderInfluencersPanel, after this block). They share the
// data helpers and the name / website / remove / social hooks, which keep
// their `cmp` prefix; which roster a hook acts on is read from the nearest
// [data-recap-roster].
//
// An entry's logo is never stored — it's resolved from its domain through a
// favicon service at render time, with a monogram tile as the fallback (wired
// by the capturing `error` listener in mount()).

const ROSTER_SCAN_MS = 1600;

const ROSTERS = {
  competitors: {
    scope: "competitors",
    listKey: "competitors",
    dismissedKey: "dismissedCompetitors",
    max: 12,
    idPrefix: "cmp",
    networks: REF_NETWORKS,
    discover: discoverCompetitors,
    key: competitorKey,
    noun: "competitor",
    title: "Competitor",
    untitled: "Untitled competitor",
    namePlaceholder: "Competitor name",
    sitePlaceholder: "https://competitor.com",
    descPlaceholder: "How they position, who they win with, where you differ…",
    ownGroup: "Your competitors",
    pendingEmpty: "None added yet — pick from Archie's suggestions below.",
    emptyEdit: "No competitors yet. Add the ones you know — Archie can find the rest.",
    emptyRead: "No competitors yet — Archie can scan your market and suggest a few.",
    scanning: "Scanning your market for competitors…",
    noneFound: "No new competitors found. Add one by hand instead.",
    discoverFirst: "Discover competitors",
  },
  // Influencers keep only what the beta's list shape reads (renderInfluencersPanel):
  // no suggestions, so no discover / key / tray copy.
  influencers: {
    scope: "influencers",
    listKey: "influencers",
    max: 12,
    idPrefix: "inf",
    // No TikTok: an influencer profile is only worth adding on a network the
    // listening follows creators on.
    networks: REF_NETWORKS.filter((n) => n !== "tiktok"),
    noun: "influencer",
    untitled: "Untitled influencer",
    namePlaceholder: "Influencer name",
    sitePlaceholder: "https://…",
  },
};

// The roster a delegated hook belongs to. Every panel and modal root carries
// data-recap-roster, so a hook with no roster around it is a bug — falling
// back to competitors keeps it from writing into a list nobody asked for.
function rosterOf(el) {
  return ROSTERS[el?.closest?.("[data-recap-roster]")?.dataset.recapRoster] || ROSTERS.competitors;
}

function rosterDomain(c) {
  const raw = (c?.websiteUrl || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function rosterLogoUrl(c) {
  if (c?.logo) return c.logo;
  const domain = rosterDomain(c);
  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : "";
}

// Deterministic monogram tint so an entry keeps the same colour across
// repaints. Reuses the reference-image hash + HSL helpers rather than adding
// a second bit of colour maths to this file.
function rosterAccent(c) {
  const key = (c?.name || rosterDomain(c) || "roster").toLowerCase();
  const h = hashStr(key);
  return hslToHex(h % 360, 44 + ((h >> 5) % 26), 42);
}

// Monogram letter. A leading article is skipped so names like "The category
// incumbent" / "The low-cost challenger" don't all read as the same "T".
function rosterInitial(c) {
  const source = (c?.name || rosterDomain(c) || "").trim().replace(/^(the|a|an)\s+/i, "");
  return (source.charAt(0) || "?").toUpperCase();
}

function rosterList(data, r) {
  if (!Array.isArray(data[r.listKey])) data[r.listKey] = [];
  return data[r.listKey];
}

function dismissedList(data, r) {
  if (!Array.isArray(data[r.dismissedKey])) data[r.dismissedKey] = [];
  return data[r.dismissedKey];
}

// `suggested: true` is a PENDING proposal from Archie — it is NOT part of the
// Playbook until the user accepts it. Anything that counts a Playbook's
// entries (the section's own grid, the /contexts card counters) must skip
// them; only the "Suggested by Archie" tray reads them.
function pendingEntries(data, r) {
  return rosterList(data, r).filter((c) => c.suggested);
}

// Logo tile — the remote favicon plus a monogram twin that onLoadError reveals
// when the favicon can't load (domain with no icon, blocked request, offline).
// An entry with no website has nothing to resolve, so it renders monogram-only.
function renderRosterLogo(c, size = 36) {
  const px = Number(size) || 36;
  const url = rosterLogoUrl(c);
  const mono = `<span class="recap__cmp-logo recap__cmp-logo--mono${url ? " is-hidden" : ""}" style="--cmp-accent:${esc(
    rosterAccent(c),
  )};--cmp-logo-size:${px}px;" aria-hidden="true">${esc(rosterInitial(c))}</span>`;
  if (!url) return mono;
  return `<img class="recap__cmp-logo" src="${esc(
    url,
  )}" alt="" width="${px}" height="${px}" loading="lazy" style="--cmp-logo-size:${px}px;" data-recap-cmp-logo />${mono}`;
}

// Read-only network badges for an entry's social profiles. Rendered as plain
// icons on the card (which is itself a button — no nested links) and as real
// links in the modal.
function rosterSocials(c) {
  return (Array.isArray(c?.socials) ? c.socials : []).filter((s) => s && NETWORK_ICON_BY_PLATFORM[s.network]);
}

function renderRosterNetIcons(c) {
  const socials = rosterSocials(c);
  if (!socials.length) return "";
  return `<span class="recap__cmp-nets">${socials
    .map((s) => {
      const label = esc(NETWORK_LABEL[s.network] || s.network);
      return `<i class="${NETWORK_ICON_BY_PLATFORM[s.network]}" title="${label}" aria-label="${label}"></i>`;
    })
    .join("")}</span>`;
}

function renderRosterNetLinks(c) {
  const socials = rosterSocials(c);
  if (!socials.length) return `<span class="recap__cmpmodal-empty">No social profiles yet.</span>`;
  return `<span class="recap__cmp-netlinks">${socials
    .map((s) => {
      const label = esc(NETWORK_LABEL[s.network] || s.network);
      return `<a class="recap__cmp-netlink" href="${esc(
        s.url,
      )}" target="_blank" rel="noopener noreferrer" title="${label}"><i class="${
        NETWORK_ICON_BY_PLATFORM[s.network]
      }" aria-hidden="true"></i><span>${label}</span></a>`;
    })
    .join("")}</span>`;
}

// One card. `i` is the index into the FULL list (both states share it) so the
// handlers stay index-addressed.
//
// A pending card reads as a proposal, not as a Playbook entry: dashed border,
// recessed surface, and its own Add / Dismiss row. Those two buttons must be
// SIBLINGS of the open-button (the card body is itself a <button>, so nesting
// them would be invalid HTML), hence the flex-column card container.
function renderRosterCard(r, c, i, { edit = false, pending = false } = {}) {
  const domain = rosterDomain(c);
  const desc = (c.description || "").trim();
  const name = esc(c.name || r.noun);
  const nets = renderRosterNetIcons(c);
  return `
    <div class="recap__cmpcard${pending ? " recap__cmpcard--suggested" : ""}">
      <button type="button" class="recap__cmpcard-open" data-recap-cmp-open="${i}" aria-label="${
        edit && !pending ? "Edit" : "View"
      } ${name} details">
        <span class="recap__cmpcard-head">
          ${renderRosterLogo(c, 36)}
          <span class="recap__cmpcard-id">
            <span class="recap__cmpcard-name">${esc(c.name || r.untitled)}</span>
            ${domain ? `<span class="recap__cmpcard-domain">${esc(domain)}</span>` : ""}
          </span>
        </span>
        <span class="recap__cmpcard-desc${desc ? "" : " recap__cmpcard-desc--empty"}">${
          desc ? esc(desc) : "No description yet"
        }</span>
        ${nets ? `<span class="recap__cmpcard-foot">${nets}</span>` : ""}
      </button>
      ${
        pending && canEditView()
          ? `<div class="recap__cmpcard-actions">
               <button type="button" class="ap-button secondary blue recap__cmpcard-act" data-recap-cmp-accept="${i}">
                 <i class="ap-icon-plus" aria-hidden="true"></i><span>Add</span>
               </button>
               <button type="button" class="ap-button ghost grey recap__cmpcard-act" data-recap-cmp-dismiss="${i}">
                 <span>Dismiss</span>
               </button>
             </div>`
          : edit
            ? `<button type="button" class="recap__refimg-remove recap__cmpcard-remove" data-recap-cmp-remove="${i}" aria-label="Remove ${name}"><i class="ap-icon-close"></i></button>`
            : ""
      }
    </div>`;
}

// Scan-in-flight state, scoped to this panel — the whole-Playbook staged loader
// would be far too heavy for a single-section action.
function renderRosterScan(r) {
  const skeletons = [0, 1, 2]
    .map(
      () => `
      <div class="recap__cmpcard recap__cmpcard--skeleton" aria-hidden="true">
        <span class="recap__cmpskel recap__cmpskel--logo"></span>
        <span class="recap__cmpskel recap__cmpskel--line"></span>
        <span class="recap__cmpskel recap__cmpskel--line is-short"></span>
      </div>`,
    )
    .join("");
  return `
    <p class="recap__cmp-scanning" role="status">
      <span class="archie-loader" aria-hidden="true"></span>
      <span>${esc(r.scanning)}</span>
    </p>
    <div class="recap__cmpgrid">${skeletons}</div>`;
}

function renderRosterPanel(data, r, edit) {
  const section = SECTIONS.find((s) => s.scope === r.scope);
  const list = rosterList(data, r);
  // Index into the full array, so accept/dismiss/remove stay index-addressed
  // while the two states render in separate groups.
  const indexed = list.map((c, i) => ({ c, i }));
  const active = indexed.filter(({ c }) => !c.suggested);
  const pending = indexed.filter(({ c }) => c.suggested);

  const gridOf = (entries, opts) =>
    `<div class="recap__cmpgrid">${entries.map(({ c, i }) => renderRosterCard(r, c, i, opts)).join("")}</div>`;

  // Archie's proposals live in their own tray below the Playbook's own
  // entries — a pending suggestion is not part of this brand yet.
  const pendingGroup = pending.length
    ? `<section class="recap__cmpgroup recap__cmpgroup--suggested">
         <header class="recap__cmpgroup-head">
           <span class="recap__cmpgroup-title">
             <i class="ap-icon-sparkles" aria-hidden="true"></i>
             <span>Suggested by Archie</span>
             <span class="ap-tag grey mini recap__cmpgroup-count">${pending.length}</span>
           </span>
           ${
             pending.length > 1 && canEditView()
               ? `<button type="button" class="ap-button ghost grey recap__cmpgroup-act" data-recap-cmp-accept-all>
                    <i class="ap-icon-check" aria-hidden="true"></i><span>Add all</span>
                  </button>`
               : ""
           }
         </header>
         <p class="recap__cmpgroup-sub">Not in your Playbook yet — add the ones that matter.</p>
         ${gridOf(pending, { edit, pending: true })}
       </section>`
    : "";

  // The panel body is a flex column of padded .recap__row blocks; this section
  // has no label→value rows, so its content gets its own padded wrapper.
  let hint = "";
  let inner;
  if (rosterScanning === r.scope) {
    inner = renderRosterScan(r);
  } else {
    const activeEmpty = `<p class="recap__cmp-empty">${esc(
      pending.length ? r.pendingEmpty : edit ? r.emptyEdit : r.emptyRead,
    )}</p>`;
    const activeGroup = active.length ? gridOf(active, { edit, pending: false }) : activeEmpty;
    // Only label the active group when a suggestions tray sits under it —
    // a lone grid needs no heading.
    const activeBlock = pending.length
      ? `<section class="recap__cmpgroup">
           <header class="recap__cmpgroup-head">
             <span class="recap__cmpgroup-title"><span>${esc(r.ownGroup)}</span>
               <span class="ap-tag grey mini recap__cmpgroup-count">${active.length}</span>
             </span>
           </header>
           ${activeGroup}
         </section>`
      : activeGroup;

    if (edit) hint = renderSectionHint(SECTION_HINTS[r.scope]);
    inner = [
      activeBlock,
      edit && list.length < r.max
        ? `<button type="button" class="ap-button secondary blue recap__add-row" data-recap-cmp-add>
             <i class="ap-icon-plus"></i><span>Add ${esc(r.noun)}</span>
           </button>`
        : "",
      pendingGroup,
      !edit && rosterFoundNone === r.scope
        ? `<p class="recap__cmp-note"><i class="ap-icon-info" aria-hidden="true"></i><span>${esc(r.noneFound)}</span></p>`
        : "",
    ].join("");
  }
  const body = `${hint}<div class="recap__cmpsec">${inner}</div>`;

  // One scan at a time across both rosters: the timer and the result slot are
  // shared, and two skeleton panels at once would read as the page reloading.
  const discoverBtn =
    !edit && !rosterScanning && canEditView()
      ? `<button type="button" class="ap-button ghost grey recap__panel-action" data-recap-cmp-discover>
           <i class="ap-icon-sparkles" aria-hidden="true"></i>
           <span>${esc(list.length ? "Discover more" : r.discoverFirst)}</span>
         </button>`
      : "";

  // Playbook 2.0, reading: the tab's own head (lead + Discover + Edit), like the
  // other tabs, and the cards in a block below — no panel head repeating it.
  if (!edit)
    return `${pb2TabHead("competitors", discoverBtn)}
      <section class="pb2-block pb2-block--bare" id="${section.id}">${body}</section>`;
  return `
    <section class="recap__panel ${edit ? "is-editing" : ""}" id="${section.id}" data-recap-roster="${r.scope}" ${
      edit ? "data-recap-editing-card" : ""
    }>
      ${renderPanelHead(section, edit, discoverBtn)}
      <div class="recap__panel-body">${body}</div>
    </section>
  `;
}

// Per-entry detail modal — the card stays a summary, everything editable
// (name, website, description, social profiles) lives here. Editable while its
// section is in edit scope, read-only otherwise; same rule as the
// reference-image modal.
function renderRosterModal(data) {
  if (!rosterModal) return "";
  const r = ROSTERS[rosterModal.kind];
  const list = rosterList(data, r);
  const c = list[rosterModal.index];
  if (!c) return "";
  const i = rosterModal.index;
  const edit = editScope === r.scope;
  const domain = rosterDomain(c);

  const nameBlock = edit
    ? `<div class="ap-input-group">
         <input type="text" data-recap-cmp-field="name" data-recap-cmp-index="${i}" value="${esc(
           c.name || "",
         )}" placeholder="${esc(r.namePlaceholder)}" aria-label="${esc(r.namePlaceholder)}" />
       </div>`
    : `<p class="recap__cmpmodal-value">${esc(c.name || r.untitled)}</p>`;

  const siteBlock = edit
    ? `<div class="ap-input-group">
         <input type="text" data-recap-cmp-field="websiteUrl" data-recap-cmp-index="${i}" value="${esc(
           c.websiteUrl || "",
         )}" placeholder="${esc(r.sitePlaceholder)}" aria-label="Website" spellcheck="false" />
       </div>`
    : domain
      ? `<a class="recap__cmpmodal-link" href="${esc(
          c.websiteUrl,
        )}" target="_blank" rel="noopener noreferrer"><i class="ap-icon-link" aria-hidden="true"></i><span>${esc(
          domain,
        )}</span><i class="ap-icon-external-link" aria-hidden="true"></i></a>`
      : `<span class="recap__cmpmodal-empty">No website yet.</span>`;

  const descBlock = edit
    ? `<div class="ap-textarea-field resizable">
         <textarea data-recap-cmp-field="description" data-recap-cmp-index="${i}" rows="4" placeholder="${esc(
           r.descPlaceholder,
         )}" aria-label="Description">${esc(c.description || "")}</textarea>
       </div>`
    : (c.description || "").trim()
      ? `<p class="recap__cmpmodal-note">${esc(c.description)}</p>`
      : `<p class="recap__cmpmodal-empty">No description yet.</p>`;

  const socials = Array.isArray(c.socials) ? c.socials : [];
  const socialsBlock = edit
    ? `<div class="recap__cmp-socialedit">
         ${socials
           .map((s, si) => {
             // A profile saved on a network the roster no longer offers keeps its
             // own option, so the select never shows a value it didn't store.
             const nets = r.networks.includes(s.network) ? r.networks : [...r.networks, s.network];
             const options = nets
               .map(
                 (n) =>
                   `<option value="${n}"${s.network === n ? " selected" : ""}>${esc(NETWORK_LABEL[n] || n)}</option>`,
               )
               .join("");
             return `
             <div class="recap__cmp-socialrow">
               <select class="ap-native-select recap__cmp-socialnet" data-recap-cmp-social-network data-recap-cmp-index="${i}" data-recap-cmp-social-index="${si}" aria-label="Network">
                 ${options}
               </select>
               <div class="ap-input-group recap__cmp-socialurl">
                 <input type="text" data-recap-cmp-social-url data-recap-cmp-index="${i}" data-recap-cmp-social-index="${si}" value="${esc(
                   s.url || "",
                 )}" placeholder="https://…" aria-label="Profile URL" spellcheck="false" />
               </div>
               <button type="button" class="recap__cta-remove" data-recap-cmp-social-remove data-recap-cmp-index="${i}" data-recap-cmp-social-index="${si}" aria-label="Remove profile">
                 <i class="ap-icon-close"></i>
               </button>
             </div>`;
           })
           .join("")}
         <button type="button" class="ap-button secondary blue recap__add-row" data-recap-cmp-social-add="${i}">
           <i class="ap-icon-plus"></i><span>Add profile</span>
         </button>
       </div>`
    : renderRosterNetLinks(c);

  const removeBtn = edit
    ? `<button type="button" class="ap-button transparent grey" data-recap-cmp-remove="${i}"><i class="ap-icon-trash"></i><span>Remove ${esc(
        r.noun,
      )}</span></button>`
    : "";

  return `
  <div class="app-modal-backdrop recap__cmpmodal-backdrop" data-recap-cmpmodal-backdrop data-recap-roster="${r.scope}">
    <aside class="ap-dialog recap__cmpmodal" role="dialog" aria-modal="true" aria-label="${esc(r.title)}">
      <div class="ap-dialog-header"><span class="ap-dialog-title">${esc(r.title)}</span></div>
      <button type="button" class="ap-dialog-close" data-recap-cmp-close aria-label="Close"><i class="ap-icon-close"></i></button>
      <div class="ap-dialog-content recap__cmpmodal-content">
        <div class="recap__cmpmodal-id">
          ${renderRosterLogo(c, 48)}
          ${
            c.suggested
              ? `<span class="ap-tag grey mini recap__cmp-badge"><i class="ap-icon-sparkles" aria-hidden="true"></i><span>Suggested — not added yet</span></span>`
              : ""
          }
        </div>
        <div class="recap__cmpmodal-sec">
          <span class="recap__refedit-flabel">Name</span>
          ${nameBlock}
        </div>
        <div class="recap__cmpmodal-sec">
          <span class="recap__refedit-flabel">Website</span>
          ${siteBlock}
        </div>
        <div class="recap__cmpmodal-sec">
          <span class="recap__refedit-flabel">Description</span>
          ${descBlock}
        </div>
        <div class="recap__cmpmodal-sec">
          <span class="recap__refedit-flabel">Social profiles</span>
          ${socialsBlock}
        </div>
      </div>
      <div class="ap-dialog-footer">
        <div class="ap-dialog-footer-left">${c.suggested ? "" : removeBtn}</div>
        <div class="ap-dialog-footer-right">
          ${
            c.suggested && canEditView()
              ? `<button type="button" class="ap-button ghost grey" data-recap-cmp-dismiss="${i}"><span>Dismiss</span></button>
                 <button type="button" class="ap-button primary orange" data-recap-cmp-accept="${i}">
                   <i class="ap-icon-plus" aria-hidden="true"></i><span>Add to Playbook</span>
                 </button>`
              : `<button type="button" class="ap-button primary orange" data-recap-cmp-close><span>Done</span></button>`
          }
        </div>
      </div>
    </aside>
  </div>`;
}

// ── Influencers (the beta's list shape) ────────────────────────────────
//
// Copied from the Competitors section as it ships on app.beta.agorapulse.com,
// not from this prototype's Competitors: a plain LIST, no suggestion tray, no
// Discover, no detail dialog.
//   • read — one full-width row per influencer: name, a line of real links
//     (website, then each profile with its network's icon and name), the
//     description. The header carries "Add an influencer" beside the pencil.
//   • add  — a dialog: name, website, then ONE fixed field per network.
//     Works from read mode and commits on the spot, like the beta.
//   • edit — the pencil turns every row into its own inline form (name,
//     website, the fixed network fields) with a trash button; the description
//     isn't editable and hides, exactly as it does there.
// Nothing lands at creation: every Playbook starts on the empty state.

const INF_INTRO = "The creators your audience already follows, with their website and social profiles.";

function influencerSocialUrl(c, network) {
  return (Array.isArray(c?.socials) ? c.socials : []).find((s) => s?.network === network)?.url || "";
}

function renderInfluencerLinks(c, r) {
  const domain = rosterDomain(c);
  const links = [];
  if (domain) {
    links.push(
      `<a class="ap-link standalone small recap__inf-link" href="${esc(
        c.websiteUrl.startsWith("http") ? c.websiteUrl : `https://${c.websiteUrl}`,
      )}" target="_blank" rel="noopener noreferrer"><i class="ap-icon-web" aria-hidden="true"></i><span>${esc(
        domain,
      )}</span></a>`,
    );
  }
  rosterSocials(c)
    .filter((s) => (s.url || "").trim() && r.networks.includes(s.network))
    .forEach((s) => {
      links.push(
        `<a class="ap-link standalone small recap__inf-link" href="${esc(
          s.url,
        )}" target="_blank" rel="noopener noreferrer"><i class="${
          NETWORK_ICON_BY_PLATFORM[s.network]
        }" aria-hidden="true"></i><span>${esc(NETWORK_LABEL[s.network] || s.network)}</span></a>`,
      );
    });
  return links.length ? `<span class="recap__inf-links">${links.join("")}</span>` : "";
}

// One fixed URL field per network, icon outside the input — the same row in
// the add dialog and in the inline editor. `attrs` says which of the two.
function renderInfluencerSocialFields(r, valueOf, attrs) {
  return r.networks
    .map((n) => {
      const label = NETWORK_LABEL[n] || n;
      return `
      <div class="recap__inf-field">
        <i class="${NETWORK_ICON_BY_PLATFORM[n]}" aria-hidden="true"></i>
        <div class="ap-input-group">
          <input type="url" ${attrs(n)} value="${esc(valueOf(n))}" placeholder="${esc(
            label,
          )} URL" aria-label="${esc(label)} URL" spellcheck="false" />
        </div>
      </div>`;
    })
    .join("");
}

function renderInfluencerEditRow(r, c, i) {
  return `
    <div class="recap__inf-edit">
      <div class="recap__inf-edit-head">
        <span class="recap__inf-name">${esc(c.name || r.untitled)}</span>
        <button type="button" class="ap-icon-button stroked transparent" data-recap-cmp-remove="${i}" aria-label="Remove this ${esc(
          r.noun,
        )}" title="Remove this ${esc(r.noun)}"><i class="ap-icon-trash"></i></button>
      </div>
      <div class="ap-input-group">
        <input type="text" data-recap-cmp-field="name" data-recap-cmp-index="${i}" value="${esc(
          c.name || "",
        )}" placeholder="${esc(r.namePlaceholder)}" aria-label="${esc(r.namePlaceholder)}" />
      </div>
      <div class="recap__inf-field">
        <i class="ap-icon-web" aria-hidden="true"></i>
        <div class="ap-input-group">
          <input type="url" data-recap-cmp-field="websiteUrl" data-recap-cmp-index="${i}" value="${esc(
            c.websiteUrl || "",
          )}" placeholder="${esc(r.sitePlaceholder)}" aria-label="Website" spellcheck="false" />
        </div>
      </div>
      <span class="recap__inf-label">Social profiles</span>
      ${renderInfluencerSocialFields(
        r,
        (n) => influencerSocialUrl(c, n),
        (n) => `data-recap-inf-social="${n}" data-recap-cmp-index="${i}"`,
      )}
    </div>`;
}

function renderInfluencersPanel(data, edit) {
  const r = ROSTERS.influencers;
  const section = SECTIONS.find((s) => s.scope === r.scope);
  const list = rosterList(data, r);

  let rows;
  if (!list.length) {
    rows = renderInfluencersEmpty(edit);
  } else if (edit) {
    rows = list.map((c, i) => renderInfluencerEditRow(r, c, i)).join("");
  } else {
    rows = `<ul class="recap__inf-list">${list
      .map((c) => {
        const desc = (c.description || "").trim();
        return `
        <li class="recap__inf-row">
          <span class="recap__inf-name">${esc(c.name || r.untitled)}</span>
          ${renderInfluencerLinks(c, r)}
          ${desc ? `<p class="recap__inf-desc">${esc(desc)}</p>` : ""}
        </li>`;
      })
      .join("")}</ul>`;
  }

  // The beta hides Add while the section is being edited — Save/Cancel own
  // the header then.
  const addBtn =
    !edit && canEditView() && list.length && list.length < r.max
      ? `<button type="button" class="ap-button ghost grey recap__panel-action" data-recap-infadd-open>
           <i class="ap-icon-plus" aria-hidden="true"></i><span>Add an influencer</span>
         </button>`
      : "";

  return `
    <section class="recap__panel ${edit ? "is-editing" : ""}" id="${section.id}" data-recap-roster="${r.scope}" ${
      edit ? "data-recap-editing-card" : ""
    }>
      ${renderPanelHead(section, edit, addBtn)}
      <div class="recap__panel-body">
        <div class="recap__infsec">
          ${list.length ? `<p class="recap__inf-intro">${esc(INF_INTRO)}</p>` : ""}
          ${rows}
        </div>
      </div>
    </section>
  `;
}

// Empty is the state every Playbook starts in: Archie cannot suggest creators
// (Google's grounding terms forbid keeping what a grounded search finds), so
// the section has to sell the one thing it unlocks — Topics from what creators
// post — and hand over the way in. Its CTA is the only Add while it is empty;
// the header's comes back with the first entry.
function renderInfluencersEmpty(edit) {
  const cta =
    !edit && canEditView()
      ? `<button type="button" class="ap-button primary blue" data-recap-infadd-open>
           <i class="ap-icon-plus" aria-hidden="true"></i><span>Add your first influencer</span>
         </button>`
      : "";
  return `
    <div class="recap__inf-empty">
      <span class="topic-badge topic-badge--lg topic-badge--red" aria-hidden="true"><i class="ap-icon-star"></i></span>
      <div class="recap__inf-empty-text">
        <h3 class="recap__inf-empty-title">Turn what creators post into Topics</h3>
        <p class="recap__inf-empty-body">Add the creators your audience already follows. Every week I read their new posts and bring the ones worth reacting to into your Topic Feed.</p>
      </div>
      ${cta}
    </div>`;
}

function emptyInfluencerDraft() {
  return { name: "", websiteUrl: "", socials: {} };
}

// The add dialog. Rendered with the recap body and portalled to <body> like
// the other detail modals (portalModal matches .recap__cmpmodal-backdrop).
function renderInfluencerAddModal() {
  if (!infAdd) return "";
  const r = ROSTERS.influencers;
  const ready = infAdd.name.trim().length > 0;
  return `
  <div class="app-modal-backdrop recap__cmpmodal-backdrop" data-recap-infadd-backdrop data-recap-roster="${r.scope}">
    <aside class="ap-dialog recap__cmpmodal" role="dialog" aria-modal="true" aria-label="Add an influencer">
      <div class="ap-dialog-header"><span class="ap-dialog-title">Add an influencer</span></div>
      <button type="button" class="ap-dialog-close" data-recap-infadd-close aria-label="Close"><i class="ap-icon-close"></i></button>
      <div class="ap-dialog-content recap__cmpmodal-content recap__infadd">
        <p class="recap__inf-intro">Enter the influencer's name, website and social profiles.</p>
        <div class="ap-input-group">
          <input type="text" data-recap-infadd-field="name" value="${esc(infAdd.name)}" placeholder="${esc(
            r.namePlaceholder,
          )}" aria-label="${esc(r.namePlaceholder)}" />
        </div>
        <div class="recap__inf-field">
          <i class="ap-icon-web" aria-hidden="true"></i>
          <div class="ap-input-group">
            <input type="url" data-recap-infadd-field="websiteUrl" value="${esc(infAdd.websiteUrl)}" placeholder="${esc(
              r.sitePlaceholder,
            )}" aria-label="Website" spellcheck="false" />
          </div>
        </div>
        <span class="recap__inf-label">Social profiles</span>
        ${renderInfluencerSocialFields(
          r,
          (n) => infAdd.socials[n] || "",
          (n) => `data-recap-infadd-social="${n}"`,
        )}
      </div>
      <div class="ap-dialog-footer">
        <div class="ap-dialog-footer-right">
          <button type="button" class="ap-button ghost grey" data-recap-infadd-close><span>Cancel</span></button>
          <button type="button" class="ap-button primary blue" data-recap-infadd-submit${ready ? "" : " disabled"}>
            <i class="ap-icon-plus" aria-hidden="true"></i><span>Add influencer</span>
          </button>
        </div>
      </div>
    </aside>
  </div>`;
}

// ── Header + rail ──────────────────────────────────────────────────────

// The Playbook's mark: its logo when it has one, the initials monogram
// otherwise. A brand that HAS a logo is recognised by it, so a tinted "AC"
// standing in front of one is a worse identity than the real thing.
//
// Both are rendered and one is hidden — the same image + monogram-twin pattern
// renderRosterLogo uses, so a logo that can't load (a data URL from a file
// the browser then rejected) falls back to the initials instead of an empty box.
// The swap is wired by onLoadError().
// ── Playbook 2.0 — the fiche in tabs ─────────────────────
// The long single page (rail + four stacked panels) became one TAB per section,
// opening on the first. (An Overview tab of four cards, one per section, was
// DELETED: every card restated a tab — git log -S renderOverview.) Only the saved Playbook's
// page (mode "library") changes; the onboarding recap keeps its reveal. The
// section renderers are the SAME — a tab hosts one panel, edit mode included.

const TABS = [
  { id: "goals", title: "Audience & goals" },
  { id: "voice", title: "Voice & style" },
  { id: "brand", title: "Brand" },
  // How the brand's images are made (flag sexySquirrel) — kept apart from Brand,
  // which says what the brand looks like.
  { id: "images", title: "Image generation" },
  { id: "competitors", title: "Competitors" },
  { id: "influencers", title: "Influencers" },
];

// What each section is FOR, said once at the top of its tab — the tab already
// names it, so the panel head carries the sentence instead of repeating the title.
const SECTION_LEADS = {
  goals: "Who the posts are for, and what they should make happen.",
  voice: "How the brand sounds — the lines it opens and closes on, and its writing conventions.",
  brand: "How the brand looks — its marks, colours, type and the rules its images follow.",
  images: "How I make this brand's images — the styles I draw them in, and what Generate image does on a draft.",
  competitors: "Who the brand is measured against, so Archie can position it.",
  influencers: "The creators the audience already listens to.",
};

// The saved Playbook's page, as opposed to the creation recap: only there does
// leaving save an open section, or a reload ask first. Both pages share ONE
// layout (tabs + blocks) — the recap's old panels were deleted (2026-10-15).
function isLibrary() {
  return cfg?.mode === "library";
}

// The tabs on screen. Creation has no Images tab: image styles hang off a saved
// Playbook (their routes need its id), and the old recap never had them either.
function visibleTabs() {
  return isLibrary() ? TABS : TABS.filter((t) => t.id !== "images");
}

function tabFromUrl() {
  const q = parseHashParams();
  const wanted = q.get("tab") || q.get("section");
  const tabs = visibleTabs();
  return tabs.some((t) => t.id === wanted) ? wanted : tabs[0].id;
}

// The tab is the page's state, kept in the URL without a route change (the
// router would remount the fiche and drop an open edit).
function setTab(id) {
  activeTab = id;
  const [path] = window.location.hash.slice(1).split("?");
  const q = parseHashParams();
  q.delete("section");
  if (id === TABS[0].id) q.delete("tab");
  else q.set("tab", id);
  const query = q.toString();
  history.replaceState(null, "", `#${path}${query ? `?${query}` : ""}`);
}

function renderHeader2(data) {
  const colors = visualColors(data);
  const accent = colors.find((c) => /accent/i.test(c.name))?.hex || colors[0]?.hex || "var(--ref-color-orange-100)";
  const primary = colors[0]?.hex || accent;
  const site = brandSite(data);
  const domain = site?.domain || prettyUrl(data.websiteUrl);
  const usedIn = typeof data.usedIn === "number" ? data.usedIn : null;
  const langs = contextLanguages(data);
  // One line of facts about the brand, each with its own glyph so the eye can
  // pick one out without reading the row, thin rules between them. The site is
  // the one live item: it opens the brand's own website.
  // (ap-icon-link, not ap-icon-web: that one is a full-colour glyph and ignores the grey.)
  const href = data.websiteUrl
    ? /^https?:\/\//.test(data.websiteUrl)
      ? data.websiteUrl
      : `https://${data.websiteUrl}`
    : domain
      ? `https://${domain}`
      : "";
  const item = (icon, body, title = "") =>
    `<span class="pb2-meta__item"${title ? ` title="${esc(title)}"` : ""}><i class="${icon} pb2-meta__icon" aria-hidden="true"></i>${body}</span>`;
  const meta = [
    domain
      ? `<span class="pb2-meta__item"><a class="pb2-meta__link" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="Open ${esc(domain)} in a new tab"><i class="ap-icon-link pb2-meta__icon" aria-hidden="true"></i>${esc(domain)}</a></span>`
      : "",
    langs.length ? item("ap-icon-translate", esc(langs.join(" · ")), langs.length > 1 ? "Languages" : "Language") : "",
    usedIn !== null ? item("ap-icon-single-chat-bubble", `Used in ${usedIn} ${usedIn === 1 ? "chat" : "chats"}`) : "",
    data.updatedAt ? item("ap-icon-history", `Updated ${esc(data.updatedAt)}`) : "",
    cfg.ownership?.owner
      ? `<span class="pb2-meta__item"><span class="ap-avatar size-24" aria-hidden="true"><span class="ap-avatar-initials">${esc(
          cfg.ownership.initials || "?",
        )}</span></span>${esc(cfg.ownership.owner)}</span>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  return `
    <header class="pb2-hero">
      <div class="pb2-hero__id">
        <span class="pb2-hero__mark">${renderHeaderMark(data, accent, primary, { square: true })}</span>
        <div class="pb2-hero__text">
          <div class="pb2-hero__titlerow">
            <h1 class="pb2-hero__name">${esc(data.name || "Untitled Playbook")}</h1>
            ${
              cfg.onEditName
                ? `<button type="button" class="ap-icon-button transparent grey" data-recap-edit-name title="Rename" aria-label="Rename Playbook"><i class="ap-icon-pen"></i></button>`
                : ""
            }
            ${
              cfg.ownership?.tag
                ? `<span class="ap-tag grey mini" title="${esc(cfg.ownership.tag)}"><span>${esc(cfg.ownership.tag)}</span></span>`
                : ""
            }
          </div>
          <div class="pb2-meta">${meta}</div>
        </div>
      </div>
      ${cfg.headerActions?.() ? `<div class="pb2-hero__actions">${cfg.headerActions()}</div>` : ""}
    </header>
  `;
}

// The tab head (lead + Edit, or Cancel / Save) is sticky. At rest it needs no
// edge; once content slides under it, a hairline says where the bar ends —
// otherwise a card is simply guillotined by a band of the same grey as the page.
// Wired per paint: paint() replaces the scroller, and its listener with it.
function watchTabHeadStuck() {
  const scroller = mountTarget?.querySelector(".welcome-screen.pb2");
  const head = scroller?.querySelector(".pb2-tabhead");
  const tabs = scroller?.querySelector(".pb2-tabs");
  if (!head || !tabs) return;
  const sync = () =>
    head.classList.toggle(
      "is-stuck",
      scroller.scrollTop > 0 && head.getBoundingClientRect().top <= tabs.getBoundingClientRect().bottom + 0.5,
    );
  scroller.addEventListener("scroll", sync, { passive: true });
  sync();
}

function renderTabs2(data) {
  // Pending suggestions are not part of the Playbook: they are never counted.
  const cmpCount = rosterList(data, ROSTERS.competitors).filter((c) => !c.suggested).length;
  return `
    <div class="ap-tabs flush pb2-tabs">
      <div class="ap-tabs-nav" role="tablist" aria-label="Playbook sections">
        ${visibleTabs()
          .map((t) => {
            const on = t.id === activeTab;
            return `<button type="button" class="ap-tabs-tab${on ? " active" : ""}" role="tab" aria-selected="${on}"
            data-pb2-tab="${t.id}">
            <span>${esc(t.title)}</span>
            ${t.id === "competitors" && cmpCount ? `<span class="ap-counter normal grey">${cmpCount}</span>` : ""}
          </button>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

const pb2Empty = (text) => `<p class="pb2-empty">${esc(text)}</p>`;
// Static facts, so grey tags — blue is for what you can act on.
const pb2Tags = (values) =>
  `<span class="pb2-tags">${values.map((v) => `<span class="ap-tag grey" title="${esc(v)}"><span>${esc(v)}</span></span>`).join("")}</span>`;

// The palette, as a brand guideline shows it: ONE continuous strip, then each
// colour's name, hex and (brand kit) role. One band per COLOUR — two roles on
// one hex (Primary = Accent) share their band.
function pb2Palette(data, { roles = false, max = 6 } = {}) {
  const colors = [];
  for (const c of visualColors(data)) {
    const hex = String(c.hex || "").toUpperCase();
    const same = colors.find((x) => x.hex.toUpperCase() === hex);
    if (same) same.name = [same.name, c.name].filter(Boolean).join(" · ");
    else colors.push({ ...c });
  }
  colors.splice(max);
  if (!colors.length) return pb2Empty("No colours captured yet.");
  return `<div class="pb2-strip" role="img" aria-label="Brand colours: ${esc(colors.map((c) => c.name || c.hex).join(", "))}">
      ${colors.map((c) => `<span class="pb2-strip__band" style="background:${esc(c.hex)}"></span>`).join("")}
    </div>
    <ul class="pb2-swatches">${colors
      .map((c) => {
        const role = roles ? colorRoleCaption(c) : "";
        return `<li class="pb2-swatch"><span class="pb2-swatch__name">${esc(c.name || "Colour")}</span><span class="pb2-swatch__hex">${esc(
          (c.hex || "").toUpperCase(),
        )}</span>${role ? `<span class="pb2-swatch__role">${esc(role)}</span>` : ""}</li>`;
      })
      .join("")}</ul>`;
}

// ── The tabs, in read mode ──────────────────────────────────────────────────
// A tab reads as a spread of blocks; EDIT opens the section's own form (the
// recap panel, unchanged), so every field, hint and save path stays one code.

// `aside`: trusted html in the caption's place (a badge, a tag) — for what a
// caption would only say in words.
function pb2Block(title, body, { wide = false, caption = "", aside = "", index = 0, icon = "", className = "" } = {}) {
  return `
    <section class="pb2-block${wide ? " pb2-block--wide" : ""}${className ? ` ${className}` : ""}" style="--pb2-i:${index}">
      <header class="pb2-block__head">
        ${icon ? `<i class="${icon} pb2-block__icon" aria-hidden="true"></i>` : ""}
        <h3 class="pb2-block__title">${esc(title)}</h3>
        ${caption ? `<span class="pb2-block__caption">${esc(caption)}</span>` : ""}
        ${aside}
      </header>
      <div class="pb2-block__body">${body}</div>
    </section>
  `;
}

// `editing`: Cancel / Save take Edit's place — same bar, same spot, sticky.
// `below` rides in the same sticky bar, under the lead — the Voice tab's
// network tabs, so the network you're reading stays named as you scroll.
function pb2TabHead(scope, extra = "", { editing = false, noEdit = false, below = "" } = {}) {
  const edit =
    canEditView() && !noEdit
      ? `<button type="button" class="ap-button stroked blue" data-recap-edit-card="${scope}"><i class="ap-icon-pen" aria-hidden="true"></i><span>Edit</span></button>`
      : "";
  return `
    <header class="pb2-tabhead${below ? " pb2-tabhead--stacked" : ""}">
      <p class="pb2-tabhead__lead">${esc(SECTION_LEADS[scope] || "")}</p>
      <div class="pb2-tabhead__actions">${editing ? editActionButtons() : `${extra}${edit}`}</div>
      ${below}
    </header>
  `;
}

// ── The tabs, in edit mode ───────────────────────────────────────────────
// Editing is the SAME page as reading: the same blocks, titles, icons, widths
// and order, each value swapped for its field. Only the head says you're
// editing — Cancel / Save where Edit was. (It used to open the onboarding
// recap's panel: one long card, labels in a left column, groups and a banner —
// a second layout for the same content.)

// A field's guidance, minus its question: the block title already asks it.
const pb2Hint = (hint) => (hint?.a ? `<p class="pb2-hint">${esc(hint.a)}</p>` : "");

function pb2EditGrid(scope, blocks, before = "", below = "") {
  return `${pb2TabHead(scope, "", { editing: true, below })}${before}<div class="pb2-grid" data-recap-editing-card>${blocks
    .filter(Boolean)
    .join("")}</div>`;
}

function renderGoalsEdit2(data) {
  const placeholder = (key) => GOAL_FIELDS.find((f) => f.key === key)?.placeholder || "";
  const chips = (key) => pb2Hint(FIELD_HINTS[key]) + renderEditChips(key, data[key], placeholder(key));
  return pb2EditGrid("goals", [
    pb2Block(
      "The business",
      `${pb2Hint(FIELD_HINTS.businessSummary)}<div class="ap-textarea-field resizable">
         <textarea data-recap-summary rows="4" placeholder="Describe your business in a few sentences…">${esc(data.businessSummary || "")}</textarea>
       </div>
       <div><span class="pb2-sub">Written in</span>${multilingualOn() ? pb2Hint(FIELD_HINTS.languages) : ""}${renderLanguagePicker(data)}</div>`,
      { wide: true, index: 0, icon: "ap-icon-buildings" },
    ),
    pb2Block("Speaking to", pb2Hint(FIELD_HINTS.audience) + renderAudiencePicker(data), {
      index: 1,
      icon: "ap-icon-user",
    }),
    pb2Block("Content style", chips("contentStyle"), { index: 2, icon: "ap-icon-quote" }),
    pb2Block("What posts should achieve", chips("objective"), { index: 3, icon: "ap-icon-target" }),
    pb2Block("What readers should do", chips("contentAction"), { index: 4, icon: "ap-icon-arrow-right" }),
    pb2Block("Where posts point to", pb2Hint(FIELD_HINTS.ctaLinks) + renderCtaEditor(data), {
      wide: true,
      index: 5,
      icon: "ap-icon-link",
    }),
  ]);
}

function renderVoiceEdit2(data) {
  const ve = voiceEntry(data);
  const line = (key) => LINE_FIELDS.find((f) => f.key === key)?.placeholder || "";
  const voice = pb2Block(
    "The voice",
    `${pb2VoiceHeadline(data)}<div><span class="pb2-sub">Written as</span>${renderVoiceModeToggle(data.voiceMode)}</div>`,
    { wide: true, index: 0, icon: "ap-icon-quote" },
  );
  if (nvOn() && data.voiceMode !== "manual" && activeNetworkFor(data) !== baseNetwork(data))
    return pb2EditGrid(
      "voice",
      nvNetworkEditBlocks(data, activeNetworkFor(data)),
      renderVoiceLangSwitcher(data),
      renderNetworkSwitcher(data),
    );
  if (data.voiceMode === "manual")
    return pb2EditGrid("voice", [
      voice,
      pb2Block(
        "In your own words",
        `<div class="ap-textarea-field resizable">
           <textarea data-recap-text="voiceManual" rows="10" placeholder="Write your voice in your own words — how you open, your tone, the way you format posts, and anything to avoid…">${esc(data.voiceManual || "")}</textarea>
         </div>`,
        { wide: true, index: 1, icon: "ap-icon-quote" },
      ),
    ]);
  return pb2EditGrid(
    "voice",
    [
      voice,
      // The base network's learned rules, editable like the rest of its voice.
      nvOn()
        ? pb2Block(
            "What I've learned",
            renderLineEditor("rules", networkEntry(data, baseNetwork(data))?.rules || [], "A rule for this network…"),
            { wide: true, index: 1, icon: MEMORY_MARK, caption: `${networkLabel(baseNetwork(data))} only` },
          )
        : "",
      pb2Block("Opens with", renderLineEditor("signatureHooks", ve.signatureHooks, line("signatureHooks")), {
        index: 1,
        caption: "Signature hooks",
      }),
      pb2Block("Closes with", renderLineEditor("closingPatterns", ve.closingPatterns, line("closingPatterns")), {
        index: 2,
        caption: "Closing patterns",
      }),
      pb2Block(
        "Formatting",
        renderTextarea(
          "formattingStyle",
          data.formattingStyle,
          "How posts are structured — line breaks, lists, rhythm…",
        ),
        { index: 3 },
      ),
      pb2Block(
        "Emoji & casing",
        renderTextarea("visualStyle", data.visualStyle, "Emoji use, capitalisation, hashtags, links…"),
        { index: 4 },
      ),
      voiceParts().some((p) => p.field === "hashtagStyle")
        ? pb2Block("Hashtags", renderTextarea("hashtagStyle", data.hashtagStyle, "How many, where, which kind…"), {
            index: 4,
          })
        : "",
      pb2Block("Words to avoid", renderEditChips("voiceAvoid", data.voiceAvoid, "Add a word or phrase…"), {
        wide: true,
        index: 5,
        icon: "ap-icon-ban",
        caption: nvOn() ? "Every network" : "",
      }),
    ],
    renderVoiceLangSwitcher(data),
    nvOn() ? renderNetworkSwitcher(data) : "",
  );
}

function renderBrandEdit2(data) {
  const blocks = [
    pb2Block(
      "Logos",
      `${pb2Hint(FIELD_HINTS.brandLogo)}${renderBrandLogo(data, true)}<div><span class="pb2-sub">Versions</span>${renderLogoVariants(data, true, data.brandLogos)}</div>`,
      { wide: true, index: 0, icon: "ap-icon-image" },
    ),
    pb2Block("Colour", renderColorEditor(data), { wide: true, index: 1 }),
    pb2Block("Typography", renderTypoEditor(data), { index: 2 }),
    pb2Block(
      "Personality",
      renderTextarea(
        "brandPersonality",
        data.brandPersonality,
        "How the brand comes across — its character in a few sentences…",
      ),
      { index: 3 },
    ),
  ];
  blocks.push(pb2Block("Visual rules", renderVisualRules(data, true), { wide: true, index: 4 }));
  return pb2EditGrid("brand", blocks);
}

const pb2Text = (text, empty = "Not set yet.") => (text ? `<p class="pb2-prose">${esc(text)}</p>` : pb2Empty(empty));

function renderGoalsRead2(data) {
  const audience = (data.audience || [])[0];
  const ctas = (Array.isArray(data.ctaLinks) ? data.ctaLinks : []).filter((l) => l.checked);
  const blocks = [
    pb2Block(
      "The business",
      `${data.businessSummary ? `<p class="pb2-lead pb2-lead--xl">${esc(data.businessSummary)}</p>` : pb2Empty("No business summary yet.")}
       <div class="pb2-inline"><span class="pb2-sub">Written in</span>${pb2Tags(contextLanguages(data))}</div>`,
      { wide: true, index: 0, icon: "ap-icon-buildings" },
    ),
    pb2Block("Speaking to", audience ? `<p class="pb2-lead">${esc(audience)}</p>` : pb2Empty("No audience set yet."), {
      index: 1,
      icon: "ap-icon-user",
    }),
    pb2Block(
      "Content style",
      (data.contentStyle || []).length ? pb2Tags(data.contentStyle) : pb2Empty("No content style yet."),
      { index: 2, icon: "ap-icon-quote" },
    ),
    pb2Block(
      "What posts should achieve",
      (data.objective || []).length ? pb2Checklist(data.objective) : pb2Empty("No goal set yet."),
      { index: 3, icon: "ap-icon-target" },
    ),
    pb2Block(
      "What readers should do",
      (data.contentAction || []).length
        ? pb2Checklist(data.contentAction, "ap-icon-arrow-right")
        : pb2Empty("No action set yet."),
      { index: 4, icon: "ap-icon-arrow-right" },
    ),
    pb2Block(
      "Where posts point to",
      ctas.length
        ? `<ul class="pb2-links">${ctas
            .map(
              (c) =>
                `<li class="pb2-link"><span class="pb2-link__icon" aria-hidden="true"><i class="ap-icon-link"></i></span><span class="pb2-link__text"><span class="pb2-link__label">${esc(
                  c.label || prettyUrl(c.url),
                )}</span>${c.url ? `<span class="pb2-link__url">${esc(prettyUrl(c.url))}</span>` : ""}</span></li>`,
            )
            .join("")}</ul>`
        : pb2Empty("No links yet — add the pages a post can send readers to."),
      { wide: true, index: 5, icon: "ap-icon-link" },
    ),
  ];
  return `${pb2TabHead("goals")}<div class="pb2-grid">${blocks.join("")}</div>`;
}

function pb2Checklist(values, icon = "ap-icon-check") {
  return `<ul class="pb2-checks">${values
    // The circle is a wrapper: an ap-icon-* class masks its own element.
    .map(
      (v) =>
        `<li class="pb2-check"><span class="pb2-check__mark" aria-hidden="true"><i class="${icon}"></i></span><span>${esc(v)}</span></li>`,
    )
    .join("")}</ul>`;
}

function pb2Lines(values, icon = "ap-icon-quote") {
  const list = (values || []).filter(Boolean);
  if (!list.length) return pb2Empty("None captured yet.");
  return `<ul class="pb2-lines">${list
    .map((h) => `<li class="pb2-line"><i class="${icon}" aria-hidden="true"></i><span>${esc(h)}</span></li>`)
    .join("")}</ul>`;
}

// The voice as Archie heard it — three words, then the writing style. Read-only
// in both modes: it's what the analysis found, not a field.
function pb2VoiceHeadline(data) {
  const traits = String(data.voiceProfile?.headline || "")
    .split(/\s*[·•|,]\s*/)
    .filter(Boolean)
    .slice(0, 4);
  return `${
    traits.length
      ? `<p class="pb2-traits">${traits
          .map((t) => `<span class="pb2-trait">${esc(t.charAt(0).toUpperCase() + t.slice(1))}</span>`)
          .join('<span class="pb2-trait__dot" aria-hidden="true"></span>')}</p>`
      : ""
  }${data.voiceProfile?.writingStyle ? `<p class="pb2-lead">${esc(data.voiceProfile.writingStyle)}</p>` : ""}${
    !traits.length && !data.voiceProfile?.writingStyle ? pb2Empty("No voice captured yet.") : ""
  }`;
}

// The words this brand never says — one list, true on every network.
function pb2AvoidBlock(data, index, caption = "") {
  return pb2Block(
    "Words to avoid",
    (data.voiceAvoid || []).length
      ? `<span class="pb2-tags">${data.voiceAvoid
          .map(
            (w) =>
              `<span class="ap-tag grey pb2-avoid"><i class="ap-icon-ban" aria-hidden="true"></i><span>${esc(w)}</span></span>`,
          )
          .join("")}</span>`
      : pb2Empty("None yet — add the words this brand never says."),
    { wide: true, index, icon: "ap-icon-ban", caption },
  );
}

// The four parts of a voice, read — from `index` on.
function pb2VoiceFieldBlocks(data, ve, index) {
  return [
    pb2Block("Opens with", pb2Lines(ve.signatureHooks), { index, caption: "Signature hooks" }),
    pb2Block("Closes with", pb2Lines(ve.closingPatterns), { index: index + 1, caption: "Closing patterns" }),
    pb2Block("Formatting", pb2Text(data.formattingStyle), { index: index + 2 }),
    pb2Block("Emoji & casing", pb2Text(data.visualStyle), { index: index + 3 }),
    // A part the product added (flag voiceNewSection): until the brand fills it
    // in, it says New and what to write.
    ...(voiceParts().some((p) => p.field === "hashtagStyle")
      ? [
          pb2Block("Hashtags", pb2Text(data.hashtagStyle, "Not set yet — add how this brand uses hashtags."), {
            index: index + 4,
            aside: String(data.hashtagStyle || "").trim()
              ? ""
              : `<span class="ap-status orange pb2-nv-status">New</span>`,
          }),
        ]
      : []),
  ];
}

function renderVoiceRead2(data, learnMenu) {
  const ve = voiceEntry(data);
  if (data.voiceMode === "manual") {
    const own = pb2Block("In your own words", pb2Text(data.voiceManual), { wide: true, icon: "ap-icon-quote" });
    return `${pb2TabHead("voice", learnMenu)}${renderVoiceLangSwitcher(data)}<div class="pb2-grid">${own}</div>`;
  }
  if (nvAllView())
    return `${pb2TabHead("voice", "", { noEdit: true, below: renderNetworkSwitcher(data) })}${nvAllMatrix(data)}`;
  if (nvOn()) {
    const net = activeNetworkFor(data);
    const grid = net === baseNetwork(data) ? nvBaseBlocks(data, ve) : nvNetworkReadBlocks(data, net);
    return `${pb2TabHead("voice", learnMenu, { below: renderNetworkSwitcher(data) })}${renderVoiceLangSwitcher(data)}<div class="pb2-grid">${grid.join("")}</div>`;
  }
  const blocks = [
    pb2Block("The voice", pb2VoiceHeadline(data), { wide: true, index: 0, icon: "ap-icon-quote" }),
    ...pb2VoiceFieldBlocks(data, ve, 1),
    pb2AvoidBlock(data, 5),
  ];
  return `${pb2TabHead("voice", learnMenu)}${renderVoiceLangSwitcher(data)}<div class="pb2-grid">${blocks.join("")}</div>`;
}

// ── Voice per network (flag networkVoices, Playbook 2.0 only) ────────────────
// The tab shows ONE network voice at a time: the base (learned at creation)
// reads exactly as before; any other network reads as the base with its own
// differences, the rules it learned, and what Archie proposes for it. The
// proposals are not the Playbook — they come from voice-coach-store and only an
// Add brings one in (CONCEPTS §1, "propose beside, never write inside").

function nvOn() {
  return networkVoicesOn();
}

function activeNetworkFor(data) {
  const nets = voiceNetworks(data);
  return nets.includes(activeNetwork) ? activeNetwork : baseNetwork(data);
}

// The "All networks" tab: the voice on every network at once — the overview
// and the offers to optimize. A view, not a voice: nothing to edit there.
const ALL_NETWORKS = "all";
function nvAllView() {
  return nvOn() && activeNetwork === ALL_NETWORKS && !editScope;
}

// The network entry an editor writes into, created on demand.
function nvWritableEntry(data, net) {
  if (!data.voiceByNetwork || typeof data.voiceByNetwork !== "object") data.voiceByNetwork = {};
  if (!data.voiceByNetwork[net]) data.voiceByNetwork[net] = { rules: [] };
  if (!Array.isArray(data.voiceByNetwork[net].rules)) data.voiceByNetwork[net].rules = [];
  // Every write goes through here from a click or a keystroke: the voice is
  // now yours, no longer only what Archie drafted.
  delete data.voiceByNetwork[net].drafted;
  return data.voiceByNetwork[net];
}

// Where a line editor writes: a network's own lines (and every network's
// rules, the base's included) go to voiceByNetwork; the rest stays per language.
function editEntry(data, field) {
  if (nvOn()) {
    const net = activeNetworkFor(data);
    if (field === "rules" || net !== baseNetwork(data)) return nvWritableEntry(data, net);
  }
  return voiceEntry(data);
}

function renderNetworkSwitcher(data) {
  const active = activeNetworkFor(data);
  const activeBase = baseNetwork(data);
  // DS tabs, a second row under the section tabs: one per network — all of
  // them, from the start (a network not optimized yet writes in the base
  // voice). The base is not flagged here — "The voice" block says where it was learned.
  return `
    <div class="pb2-netbar">
      <div class="ap-tabs pb2-nettabs">
        <div class="ap-tabs-nav" role="tablist" aria-label="Voice per network">
          <button type="button" class="ap-tabs-tab${nvAllView() ? " active" : ""}" role="tab" aria-selected="${nvAllView()}" data-nv-net="${ALL_NETWORKS}"${
            // Disabled, not hidden, while a voice is edited: a vanishing tab
            // would slide every other one under the cursor.
            editScope ? ' disabled title="Save or cancel your changes to see every network"' : ""
          }>
            <i class="ap-icon-view-grid" aria-hidden="true"></i><span>All networks</span>
          </button>
          ${voiceNetworks(data)
            .map((n) => {
              const on = !nvAllView() && n === active;
              const pending = getSuggestions(data.id, { network: n }).length;
              const borrowed = n !== activeBase && !isOptimized(data, n);
              return `<button type="button" class="ap-tabs-tab${on ? " active" : ""}" role="tab" aria-selected="${on}" data-nv-net="${n}"${borrowed ? ` title="Not optimized — writes like your ${esc(networkLabel(activeBase))} voice"` : ""}>
                <i class="${networkIcon(n)}" aria-hidden="true"></i>
                <span>${esc(networkLabel(n))}</span>
                ${
                  partsNew(data, n).some(Boolean)
                    ? `<span class="pb2-nv-tab-new" title="New part to optimize" aria-label="New part to optimize"></span>`
                    : n !== activeBase && nvOptimizedCount(data, n) === nvFields().length
                      ? `<i class="ap-icon-rounded-check_fill pb2-nv-tab-done" title="Optimized" aria-label="Optimized"></i>`
                      : ""
                }
                ${pending ? `<span class="ap-counter normal grey" title="${pending} for Archie to remember">${pending}</span>` : ""}
              </button>`;
            })
            .join("")}
        </div>
      </div>
    </div>`;
}

// Archie offers to optimize a network still writing in the base voice: one
// click, it adapts the parts to how posts work there (rules kept). Read mode
// only — in edit, "Adapt for X" does it part by part.
// `short`: "Optimize" alone, for a list whose row already names the network —
// same width on every row, one clean column.
function nvOptimizeButton(data, net, { tone = "primary orange", short = false } = {}) {
  if (!canEditView() || editScope || net === baseNetwork(data)) return "";
  const done = nvOptimizedCount(data, net);
  if (done === nvFields().length) return "";
  const label = short ? "Optimize" : done ? "Optimize what's left" : `Optimize for ${networkLabel(net)}`;
  const aria = short ? ` aria-label="Optimize your ${esc(networkLabel(net))} voice"` : "";
  return `<button type="button" class="ap-button ${tone}" data-nv-optimize="${net}"${aria}><i class="ap-icon-sparkles" aria-hidden="true"></i><span>${esc(label)}</span></button>`;
}

// A rule already in the voice — plain text beside the olive mark
// (styles/components/voice-coach.css). Proposals are memory cards.
const MEMORY_MARK = "ap-icon-sparkles memory-mark";

function memoryNote(text) {
  return `<li class="memory-note memory-note--kept">
    <i class="${MEMORY_MARK}" aria-hidden="true"></i>
    <p class="memory-note__text">${esc(text)}</p>
  </li>`;
}

// What Archie wants to remember for one network — one memory card each.
// A Remember moves the rule into "What I've learned" below, so the tray only
// ever shows the pending ones.
function nvSuggestionsBlock(data, net, index) {
  const list = canEditView() ? getSuggestions(data.id, { network: net }) : [];
  if (!list.length) return "";
  return pb2Block(
    "Archie wants to remember",
    `<div class="memory-cards">${list.map((sg) => memoryCardHtml(sg, { attr: "nv", value: sg.id })).join("")}</div>`,
    { wide: true, index, icon: MEMORY_MARK, caption: "Nothing is kept without your OK" },
  );
}

function nvRulesBlock(data, net, index) {
  const rules = networkEntry(data, net)?.rules || [];
  return pb2Block(
    "What I've learned",
    rules.length
      ? `<ul class="memory-notes">${rules.map((r) => memoryNote(r)).join("")}</ul>`
      : pb2Empty(
          `Nothing yet. Rework one of your ${networkLabel(net)} drafts or tell me what was off, and I'll suggest what to remember here.`,
        ),
    { wide: true, index, icon: MEMORY_MARK, caption: `${networkLabel(net)} only`, className: "pb2-block--memory" },
  );
}

// One order on every network voice, in read and in edit: who it is, what
// Archie has learned and wants to remember (side by side, so a Remember moves
// a rule one block down, in view), then its parts, then the words to avoid.

// The base network: the voice as it always read, plus its proposals and rules.
function nvBaseBlocks(data, ve) {
  const net = baseNetwork(data);
  return [
    pb2Block("The voice", pb2VoiceHeadline(data), {
      wide: true,
      index: 0,
      icon: "ap-icon-quote",
      caption: `${maturity(data, net).detail} Other networks start from it.`,
    }),
    nvSuggestionsBlock(data, net, 1),
    nvRulesBlock(data, net, 2),
    ...pb2VoiceFieldBlocks(data, ve, 3),
    pb2AvoidBlock(data, 7, "Every network"),
  ].filter(Boolean);
}

// State, everywhere, as the DS status pill (.ap-status: a dot and a word) —
// never a logo or a check mark: a greyed logo read as "disabled".
//   a part:     green Optimized · grey Same as LinkedIn (a network's state is
//               its progress ring, progressRingHtml in network-voice.js)
function nvSourceBadge(data, net, field) {
  if (isOverridden(data, net, field)) return `<span class="ap-status green pb2-nv-status">Optimized</span>`;
  if (isNewPart(field)) return `<span class="ap-status orange pb2-nv-status">New</span>`;
  return `<span class="ap-status grey pb2-nv-status">Same as ${esc(networkLabel(baseNetwork(data)))}</span>`;
}

// The new parts a network still has to do, as titles.
function nvNewTitles(data, net) {
  const fresh = partsNew(data, net);
  return nvFields()
    .filter((_, i) => fresh[i])
    .map(([, title]) => title);
}

// How many of a network's four parts are optimized — its own, not the base's.
function nvOptimizedCount(data, net) {
  return nvFields().filter(([field]) => isOverridden(data, net, field)).length;
}

// The arcs a wizard save just completed — set for one repaint, so they fill once.
let nvFresh = null;
const nvFreshFor = (n) => (nvFresh?.net === n ? nvFresh.arcs : []);

// Where a network stands, in words, under its ring.
// `short`: for a tile, where the sentence sits beside a button.
function nvProgressText(data, net, { short = false } = {}) {
  if (net === baseNetwork(data)) return "Base voice";
  const done = nvOptimizedCount(data, net);
  const all = nvFields().length;
  const fresh = nvNewTitles(data, net).length;
  if (done === all) return "Optimized";
  if (short) {
    if (!done) return fresh ? `Not optimized · ${fresh} new` : "Not optimized";
    return fresh ? `${done} of ${all} · ${fresh} new` : `${done} of ${all} optimized`;
  }
  return done ? `${done} of ${all} parts optimized` : "Not optimized yet";
}

// Where a network's voice stands — a progress band ON the page, above the
// parts, not a card: it reports on the voice, it isn't one of its settings
// (dressed as a block, it read as a fifth part). The parts below carry their
// own state and Optimize; the band carries the count and Optimize what's left.
function nvIdentityBlock(data, net) {
  const label = networkLabel(net);
  const done = nvOptimizedCount(data, net);
  const fresh = nvNewTitles(data, net);
  const offer = nvOptimizeButton(data, net);
  const sub = fresh.length
    ? `New in your voice: ${fresh.join(", ")}.`
    : done === nvFields().length
      ? `Every part is written for ${label}.`
      : `The others follow your ${networkLabel(baseNetwork(data))} voice.`;
  return `<div class="pb2-nv-progress" role="status">
      ${progressRingHtml(net, { done: partsDone(data, net), attention: partsNew(data, net), size: 48, fresh: nvFreshFor(net) })}
      <div class="pb2-nv-progress__text">
        <p class="pb2-nv-progress__count">${esc(nvProgressText(data, net))}${
          fresh.length
            ? ` <span class="ap-status orange">${fresh.length} new ${fresh.length === 1 ? "part" : "parts"}</span>`
            : ""
        }</p>
        <p class="pb2-nv-progress__sub">${esc(sub)}</p>
      </div>
      ${offer ? `<div class="pb2-nv-progress__action">${offer}</div>` : ""}
    </div>`;
}

// The "All networks" tab: one line per network — its name, where its voice
// stands overall (the progress ring + the state in words), Optimize. No detail
// per part: that's what a network's own tab is for. The base first, then the
// networks you publish on, then the rest; a line opens its network.
// (2026-10-15: tiles, then a table per part — "TMI", "pas le détail des sections".)
function nvAllMatrix(data) {
  const base = baseNetwork(data);
  const fields = nvFields();
  const nets = voiceNetworks(data);
  const optimizedNets = nets.filter((n) => n !== base && nvOptimizedCount(data, n) === fields.length).length;
  const rows = nets
    .map((n) => {
      const isBase = n === base;
      const label = networkLabel(n);
      const complete = !isBase && nvOptimizedCount(data, n) === fields.length;
      const fresh = partsNew(data, n);
      const state = isBase ? "Base voice — every network starts from it" : nvProgressText(data, n);
      const action = isBase || complete ? "" : nvOptimizeButton(data, n, { tone: "stroked blue", short: true });
      return `<li class="pb2-nv-line${isBase ? " is-base" : ""}">
        <button type="button" class="pb2-nv-line__open" data-nv-net="${n}" aria-label="Open your ${esc(label)} voice">
          <i class="${networkIcon(n)}" aria-hidden="true"></i><span class="pb2-nv-line__name">${esc(label)}</span>
        </button>
        <span class="pb2-nv-line__state">
          ${progressRingHtml(n, { done: partsDone(data, n), base: isBase, attention: fresh, size: 28, fresh: nvFreshFor(n) })}
          <span>${esc(state)}</span>
          ${fresh.some(Boolean) && !isBase ? `<span class="ap-status orange">New part</span>` : ""}
        </span>
        <span class="pb2-nv-line__action">${action}</span>
      </li>`;
    })
    .join("");
  return `<p class="pb2-nv-intro">${optimizedNets} of ${nets.length - 1} networks fully optimized.</p>
    <ul class="pb2-nv-lines">${rows}</ul>`;
}

// Another network: the difference is the content. What it adapted reads in
// full; what it inherits folds into one block that names it and points at the
// base — repeating the base word for word made every network look the same.
function nvNetworkReadBlocks(data, net) {
  // The same four blocks as the base, in the same order and size. A part not
  // optimized yet shows the base's version inside, as a placeholder — the block
  // reads disabled (grey ground, grey-60 ink) under its "Same as LinkedIn" pill.
  const parts = nvFields().map(([field, title], n) => {
    const own = isOverridden(data, net, field);
    const value = nvFieldValue(data, net, field);
    const content = field === "signatureHooks" || field === "closingPatterns" ? pb2Lines(value) : pb2Text(value);
    // A borrowed part carries its own way out: Optimize, the wizard on this part.
    const go =
      !own && canEditView() && !editScope
        ? `<div class="pb2-nv-block-go"><button type="button" class="ap-button stroked blue" data-nv-optimize-part="${field}" aria-label="${esc(`Optimize ${title.toLowerCase()} for ${networkLabel(net)}`)}"><i class="ap-icon-sparkles" aria-hidden="true"></i><span>Optimize</span></button></div>`
        : "";
    return pb2Block(title, content + go, {
      index: 3 + n,
      aside: nvSourceBadge(data, net, field),
      className: own ? "" : "pb2-nv-placeholder",
    });
  });
  return [
    nvIdentityBlock(data, net),
    nvSuggestionsBlock(data, net, 1),
    nvRulesBlock(data, net, 2),
    ...parts,
    pb2AvoidBlock(data, 7, "Every network"),
  ].filter(Boolean);
}

// Edit, on a network that isn't the base: an inherited field reads as the
// base's value with "Adapt for X"; an adapted one is its own editor with "Use
// the base voice" to drop the difference. `show` renders an inherited value in
// the host's own vocabulary (Playbook 2.0 blocks, or the recap's rows).
const NV_PLACEHOLDERS = {
  formattingStyle: "How posts are structured on this network…",
  visualStyle: "Emoji, hashtags, links on this network…",
  hashtagStyle: "How many hashtags, where, which kind…",
};

function nvFieldEdit(data, net, field, show = { list: pb2Lines, text: pb2Text }) {
  const e = networkEntry(data, net) || {};
  const own = e[field] !== undefined;
  const btn = own
    ? `<button type="button" class="ap-button ghost grey pb2-nv-toggle" data-nv-reset="${field}"><i class="ap-icon-close" aria-hidden="true"></i><span>Use the ${esc(networkLabel(baseNetwork(data)))} voice</span></button>`
    : `<button type="button" class="ap-button stroked grey pb2-nv-toggle" data-nv-adapt="${field}"><i class="ap-icon-pen" aria-hidden="true"></i><span>Adapt for ${esc(networkLabel(net))}</span></button>`;
  if (field === "signatureHooks" || field === "closingPatterns") {
    const placeholder = LINE_FIELDS.find((f) => f.key === field)?.placeholder || "";
    return (own ? renderLineEditor(field, e[field], placeholder) : show.list(voiceEntry(data)[field])) + btn;
  }
  return (
    (own
      ? `<div class="ap-textarea-field resizable"><textarea data-nv-text="${field}" rows="3" placeholder="${esc(NV_PLACEHOLDERS[field])}">${esc(e[field] || "")}</textarea></div>`
      : show.text(data[field])) + btn
  );
}

// What a network reads as: its own value where it adapted one, else the base's.
function nvFieldValue(data, net, field) {
  const e = networkEntry(data, net) || {};
  if (e[field] !== undefined) return e[field];
  return field === "signatureHooks" || field === "closingPatterns" ? voiceEntry(data)[field] : data[field];
}

// Edit keeps the four parts in a fixed order (a part must not jump when you
// adapt it); the words to avoid read here and are edited on the base.
function nvNetworkEditBlocks(data, net) {
  const e = networkEntry(data, net) || {};
  const label = networkLabel(net);
  return [
    nvIdentityBlock(data, net),
    pb2Block("What I've learned", renderLineEditor("rules", e.rules || [], `A rule for ${label}…`), {
      wide: true,
      index: 1,
      icon: MEMORY_MARK,
      caption: `${label} only`,
    }),
    ...nvFields().map(([field, title], i) =>
      pb2Block(title, nvFieldEdit(data, net, field), { index: i + 2, aside: nvSourceBadge(data, net, field) }),
    ),
    pb2AvoidBlock(data, 6, `Edit it on the ${networkLabel(baseNetwork(data))} tab`),
  ];
}

// The parts of a voice as [field, title] — from the one registry
// (network-voice.js VOICE_PARTS), so a part the product adds appears everywhere.
function nvFields() {
  return voiceParts().map((p) => [p.field, p.title]);
}

function setNetworkInUrl(net) {
  const [path] = window.location.hash.slice(1).split("?");
  const q = parseHashParams();
  q.set("net", net);
  history.replaceState(null, "", `#${path}?${q.toString()}`);
}

// Adapt one part for the active network: it starts as a copy of the base's.
function nvAdaptField(data, field) {
  const base =
    field === "signatureHooks" || field === "closingPatterns" ? voiceEntry(data)[field] || [] : data[field] || "";
  nvWritableEntry(data, activeNetworkFor(data))[field] = Array.isArray(base) ? base.slice() : base;
}

function onNetworkVoiceClick(event) {
  if (!nvOn()) return false;
  const data = cfg.getData();
  if (!data) return false;
  // Optimize opens the wizard on the network — on the part asked, or the first
  // still on the base. Nothing is written until its Save, which lands here.
  const optimize = event.target.closest("[data-nv-optimize], [data-nv-optimize-part]");
  if (optimize) {
    const net = optimize.dataset.nvOptimize || activeNetworkFor(data);
    openVoiceWizard({
      data,
      network: net,
      part: optimize.dataset.nvOptimizePart || null,
      onSave: ({ values, drafted }) => {
        const before = partsDone(data, net);
        const entry = nvWritableEntry(data, net);
        for (const [field] of nvFields()) {
          if (!(field in values)) continue; // a part the wizard didn't show
          if (values[field] === undefined) delete entry[field];
          else entry[field] = Array.isArray(values[field]) ? values[field].slice() : values[field];
        }
        if (drafted) entry.drafted = true;
        // The arcs this save completed fill once on the rings that show them.
        const after = partsDone(data, net);
        nvFresh = { net, arcs: after.map((on, i) => (on && !before[i] ? i : -1)).filter((i) => i >= 0) };
        activeNetwork = net;
        setNetworkInUrl(net);
        cfg.commit?.();
        const done = after.filter(Boolean).length;
        showToast(`${networkLabel(net)} voice saved — ${done} of ${nvFields().length} parts optimized.`);
        repaint();
        nvFresh = null;
      },
    });
    return true;
  }
  // A tab, a tile, a network's name — after Optimize, which sits inside a tile.
  const pick = event.target.closest("[data-nv-net]");
  if (pick) {
    activeNetwork = pick.dataset.nvNet;
    setNetworkInUrl(activeNetwork);
    repaint();
    return true;
  }
  const yes = event.target.closest("[data-nv-accept]");
  if (yes) {
    acceptVoiceSuggestion(data.id, yes.dataset.nvAccept);
    showToast(`Remembered for your ${networkLabel(activeNetworkFor(data))} voice.`);
    repaint();
    return true;
  }
  const no = event.target.closest("[data-nv-dismiss]");
  if (no) {
    dismissVoiceSuggestion(data.id, no.dataset.nvDismiss);
    repaint();
    return true;
  }
  const adapt = event.target.closest("[data-nv-adapt]");
  if (adapt) {
    nvAdaptField(data, adapt.dataset.nvAdapt);
    repaint();
    return true;
  }
  const reset = event.target.closest("[data-nv-reset]");
  if (reset) {
    delete nvWritableEntry(data, activeNetworkFor(data))[reset.dataset.nvReset];
    repaint();
    return true;
  }
  return false;
}

const PB2_LOGO_VERSIONS = { color: "Colour", white: "White", black: "Black", icon: "Icon only" };

function renderBrandRead2(data) {
  const logos = brandLogoList(data);
  const { headingFont, bodyFont } = brandFonts(data);
  const r = data.brandRules || {};
  const specimen = (role, font, sample) =>
    `<div class="pb2-font">
      <span class="pb2-font__glyphs" style="font-family:'${esc(font)}', var(--sys-text-style-body-font-family);">Aa</span>
      <div class="pb2-font__meta">
        <span class="pb2-sub">${esc(role)}</span>
        <span class="pb2-font__name">${esc(font)}</span>
        <span class="pb2-font__sample" style="font-family:'${esc(font)}', var(--sys-text-style-body-font-family);">${esc(sample)}</span>
      </div>
    </div>`;
  const marks = logos.length
    ? `<ul class="pb2-logos">${logos
        .map(
          (l) => `<li class="pb2-logo-tile">
            <span class="pb2-logo-tile__art${l.variant === "white" || /revers|white|negative/i.test(l.label || "") ? " is-dark" : ""}"><img src="${esc(l.url)}" alt="${esc(l.label || "Logo")}" /></span>
            <span class="pb2-logo-tile__name">${esc(l.label || "Logo")}${l.url === data.brandLogo ? ' <span class="ap-tag grey mini"><span>Default</span></span>' : ""}</span>
            ${l.variant ? `<span class="pb2-logo-tile__version">${esc(PB2_LOGO_VERSIONS[l.variant] || "")}</span>` : ""}
          </li>`,
        )
        .join("")}</ul>`
    : pb2Empty("No logo yet — add the marks this brand uses.");
  const pairs = (r.forbiddenPairs || []).map(
    ([a, b]) =>
      `<span class="pb2-pair"><span class="pb2-pair__chip" style="background:${esc(a)}"></span><span class="pb2-pair__chip" style="background:${esc(b)}"></span></span>`,
  );
  const blocks = [
    pb2Block("Logos", marks, { wide: true, index: 0, icon: "ap-icon-image" }),
    pb2Block("Colour", pb2Palette(data, { roles: true, max: 8 }), { wide: true, index: 1 }),
    pb2Block(
      "Typography",
      headingFont || bodyFont
        ? `<div class="pb2-fonts">${specimen("Headings", headingFont || bodyFont, "Every objective names its signal.")}${specimen(
            "Body",
            bodyFont || headingFont,
            "Short paragraphs, one idea each, and a line break that lets it land.",
          )}</div>`
        : pb2Empty("No typography captured yet."),
      { index: 2 },
    ),
    pb2Block(
      "Personality",
      data.brandPersonality
        ? `<p class="pb2-statement">${esc(data.brandPersonality)}</p>`
        : pb2Empty("No personality captured yet."),
      { index: 3 },
    ),
  ];
  blocks.push(
    pb2Block(
      "Visual rules",
      // Do / Don't moved into each image style (the style creator), 2026-10-05.
      `<dl class="pb2-facts pb2-facts--alone">
        <div><dt>Logo minimum size</dt><dd>${esc(r.logoMinPx ?? 48)} px</dd></div>
        <div><dt>Clear space</dt><dd>${esc(r.clearSpace ?? 0.5)} × logo height</dd></div>
        <div><dt>Distortion</dt><dd>${r.noLogoDistortion === false ? "Allowed" : "Never stretch or skew"}</dd></div>
        <div><dt>Colours that never meet</dt><dd>${pairs.length ? `<span class="pb2-pairs">${pairs.join("")}</span>` : "None"}</dd></div>
      </dl>`,
      { wide: true, index: 4 },
    ),
  );
  return `${pb2TabHead("brand")}<div class="pb2-grid">${blocks.join("")}</div>`;
}

// The Images tab saves as it changes (styles, reference images, Generate image
// settings), so its head has no Edit. Image styles lead — making one is the
// tab's main act.
function renderImagesPanel(data) {
  const parts = renderImagesTab(data, canEditView());
  if (!parts) return "";
  return `${pb2TabHead("images", "", { noEdit: true })}<div class="pb2-grid">${[
    pb2Block("Image styles", parts.styles, { wide: true, index: 0, icon: "ap-icon-sparkles" }),
    pb2Block("Reference images", parts.references, { wide: true, index: 1, icon: "ap-icon-image" }),
    pb2Block("Generate an image", parts.generate, { wide: true, index: 2, icon: "ap-icon-sparkles-mermaid" }),
  ].join("")}</div>`;
}

function renderActivePanel(data) {
  const scope = editScope;
  // Editing opens the section's own form; reading gets the tab's spread.
  if (activeTab === "voice") return scope === "voice" ? renderVoiceEdit2(data) : renderVoiceRead2(data, learnMenu());
  if (activeTab === "brand") return scope === "brand" ? renderBrandEdit2(data) : renderBrandRead2(data);
  if (activeTab === "images") return renderImagesPanel(data);
  if (activeTab === "competitors") return renderRosterPanel(data, ROSTERS.competitors, scope === "competitors");
  if (activeTab === "influencers") return renderInfluencersPanel(data, scope === "influencers");
  return scope === "goals" ? renderGoalsEdit2(data) : renderGoalsRead2(data);
}

// `square`: the tile is square, and a wide lockup shrunk into it reads as an
// empty box — so the brand's square mark (its "Icon" version) takes the tile
// when it has one. The default logo stays the default everywhere else.
function renderHeaderMark(data, accent, primary, { square = false } = {}) {
  const tint = `--brand-accent:${esc(accent)}; --brand-primary:${esc(primary)};`;
  const mono = `<span class="recap__monogram${data.brandLogo ? " is-hidden" : ""}" style="${tint}">${esc(initials(data.name))}</span>`;
  if (!data.brandLogo) return mono;
  const icon = square ? brandLogoList(data).find((l) => /^icon$/i.test(l.label || ""))?.url : "";
  return `<span class="recap__monogram recap__monogram--mark"><img src="${esc(icon || data.brandLogo)}" alt="${esc(
    data.name || "Brand",
  )} logo" data-recap-brand-logo /></span>${mono}`;
}

// ── Loader + top strip ─────────────────────────────────────────────────

function renderLoading(stageIdx) {
  const stages = cfg.loader || [];
  const idx = Math.min(stageIdx, stages.length - 1);
  const stage = stages[idx] || { title: "", sub: "" };
  const steps = stages
    .map((_, i) => {
      const c = i < idx ? "is-done" : i === idx ? "is-active" : "";
      return `<span class="recap-loading__step ${c}"></span>`;
    })
    .join("");
  return `
    <div class="recap-loading">
      <span class="recap-loading__spinner archie-loader" aria-hidden="true"></span>
      <span class="recap-loading__eyebrow"><i class="ap-icon-archie-official" aria-hidden="true"></i> Crafting your Playbook</span>
      <h1 class="recap-loading__title">${esc(stage.title)}</h1>
      <p class="recap-loading__sub">${esc(stage.sub)}</p>
      <div
        class="recap-loading__steps"
        role="progressbar"
        aria-valuemin="1"
        aria-valuemax="${stages.length}"
        aria-valuenow="${idx + 1}"
        aria-label="${esc(stage.title)}"
      >${steps}</div>
    </div>
  `;
}

function renderTop() {
  if (!cfg.showTop) return "";
  return `
    <header class="welcome-screen__top">
      <span class="welcome-screen__brand">
        <i class="ap-icon-archie-official"></i>
        Archie
      </span>
      <span class="welcome-screen__chip">BETA</span>
    </header>
  `;
}

function paint() {
  cfg.onPaint?.();
  const modeClass = cfg.mode === "library" ? "welcome-screen--library" : "";

  if (phase === "loading") {
    mountTarget.innerHTML = html`
      <section class="welcome-screen welcome-screen--reveal welcome-screen--loading ${modeClass}">
        <div class="welcome-screen__bg" aria-hidden="true"></div>
        ${raw(renderTop())}
        <div class="welcome-screen__body recap recap--loading">${raw(renderLoading(loadingStage))}</div>
      </section>
    `;
    return;
  }

  const data = cfg.getData();
  const scope = editScope;
  mountTarget.innerHTML = html`
    <section class="welcome-screen welcome-screen--reveal ${modeClass} pb2 ${scope ? "is-editing" : ""}">
      ${raw(renderTop())}
      <div class="welcome-screen__body recap pb2__body">
        ${raw(renderHeader2(data))} ${raw(cfg.notice?.() || "")} ${raw(renderTabs2(data))}
        <div class="pb2__panel" role="tabpanel">${raw(renderActivePanel(data))}</div>
        ${raw(renderRefModal(data))} ${raw(renderRosterModal(data))} ${raw(renderInfluencerAddModal())}
      </div>
    </section>
  `;
  // The edit bar sticks right under the tabs, so it needs their height.
  const tabsEl = mountTarget.querySelector(".pb2-tabs");
  if (tabsEl) mountTarget.querySelector(".pb2")?.style.setProperty("--pb2-tabs-h", `${tabsEl.offsetHeight}px`);
  watchTabHeadStuck();
  portalModal();
}

// The detail modals (reference image, competitor) are rendered inside the recap
// body, but the recap scroll container / reveal transform stops their fixed
// backdrop from covering the viewport. Move whichever one is open onto <body>
// (like the app's real modals) and bind the same delegated handlers so its
// controls keep working. Only one can be open at a time — refModalIndex and
// rosterModal are mutually exclusive — so one host covers both.
function portalModal() {
  if (refModalHost) {
    refModalHost.remove();
    refModalHost = null;
  }
  const modalEl = mountTarget?.querySelector(".recap__refmodal-backdrop, .recap__cmpmodal-backdrop");
  if (!modalEl) return;
  refModalHost = document.createElement("div");
  refModalHost.className = "recap__refmodal-host";
  refModalHost.appendChild(modalEl);
  refModalHost.addEventListener("click", onClick);
  refModalHost.addEventListener("input", onInput);
  refModalHost.addEventListener("change", onChange);
  refModalHost.addEventListener("keydown", onKeydown);
  refModalHost.addEventListener("error", onLoadError, true);
  document.body.appendChild(refModalHost);
}

// ── Section-nav scroll-spy ─────────────────────────────────────────────

function setActiveNav(id) {
  mountTarget?.querySelectorAll("[data-recap-nav]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.recapNav === id);
  });
}

// ── Competitor logo fallback + discovery scan ───────────────────────────

// A competitor favicon that can't load (no icon for that domain, blocked
// request, offline session) hides itself and reveals its monogram twin. Runs in
// the capture phase because `error` events don't bubble.
function onLoadError(event) {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  // Same twin swap for the header's brand mark, one level up: the image is
  // wrapped in the tile, so it's the TILE that hides and the monogram after it
  // that comes back.
  if (img.hasAttribute("data-recap-brand-logo")) {
    const tile = img.closest(".recap__monogram--mark");
    tile?.classList.add("is-hidden");
    tile?.nextElementSibling?.classList.remove("is-hidden");
    return;
  }
  if (!img.hasAttribute("data-recap-cmp-logo")) return;
  img.classList.add("is-hidden");
  img.nextElementSibling?.classList.remove("is-hidden");
}

function stopRosterScan() {
  if (rosterScanTimer) {
    window.clearTimeout(rosterScanTimer);
    rosterScanTimer = null;
  }
  rosterScanning = null;
}

// Mock "scan" — shows the section-scoped skeleton, then merges only the
// entries that aren't already known (so a repeat scan is idempotent and
// removing one brings just that one back).
function startRosterScan(r) {
  const data = cfg?.getData();
  if (!data || rosterScanning) return;
  stopRosterScan();
  rosterScanning = r.scope;
  rosterFoundNone = null;
  repaint();
  rosterScanTimer = window.setTimeout(() => {
    rosterScanTimer = null;
    rosterScanning = null;
    const live = cfg?.getData();
    if (!live || !mountTarget) return;
    const existing = rosterList(live, r);
    // Exclude what's already on the Playbook (accepted or still pending) AND
    // everything the user dismissed — Archie never re-proposes a rejection.
    const found = r.discover(live.websiteUrl || live.sourceUrl || "", {
      exclude: [...existing, ...dismissedList(live, r)],
    });
    const room = Math.max(0, r.max - existing.length);
    const added = found.slice(0, room).map((c) => ({ ...c, suggested: true }));
    added.forEach((c) => existing.push(c));
    rosterFoundNone = added.length === 0 ? r.scope : null;
    // Persist in library mode (no-op in onboarding, where the draft IS the data).
    if (added.length) cfg.commit?.();
    repaint();
  }, ROSTER_SCAN_MS);
}

// ── Edit-mode mutations ──────────────────────────────────────────────────

function addChip(field) {
  const data = cfg.getData();
  if (!data || !mountTarget) return;
  const input = mountTarget.querySelector(`[data-recap-chip-input="${field}"]`);
  const val = (input?.value || "").trim();
  if (!val) return;
  const list = Array.isArray(data[field]) ? data[field].slice() : [];
  if (!list.some((v) => v.toLowerCase() === val.toLowerCase())) list.push(val);
  data[field] = list;
  repaint();
  mountTarget.querySelector(`[data-recap-chip-input="${field}"]`)?.focus();
}

// Single-select: replace the audience with exactly the picked value.
function setAudience(value) {
  const data = cfg.getData();
  if (!data) return;
  const t = (value || "").trim();
  if (!t) return;
  data.audience = [t];
  repaint();
}

function addAudienceCustom() {
  const data = cfg.getData();
  if (!data || !mountTarget) return;
  const input = mountTarget.querySelector("[data-recap-audience-input]");
  const val = (input?.value || "").trim();
  if (!val) return;
  audienceCustom = false;
  setAudience(val);
}

function addLine(field) {
  const data = cfg.getData();
  if (!data) return;
  // Signature hooks / closing patterns are authored per language — write into
  // the active language's voice entry, not the flat mirror.
  const entry = editEntry(data, field);
  const list = Array.isArray(entry[field]) ? entry[field].slice() : [];
  list.push("");
  entry[field] = list;
  repaint();
  const inputs = mountTarget?.querySelectorAll(`[data-recap-line-list="${field}"]`);
  inputs?.[inputs.length - 1]?.focus();
}

// Every hook that writes to the Playbook. In read-only mode they're not rendered
// — this list is the second line of defence, so a stale DOM node or a hook added
// later without thinking can't slip a write past the gate.
const WRITE_HOOKS = [
  "[data-recap-edit-card]",
  "[data-recap-edit-name]",
  "[data-recap-save]",
  "[data-recap-cmp-add]",
  "[data-recap-cmp-remove]",
  "[data-recap-cmp-accept]",
  "[data-recap-cmp-accept-all]",
  "[data-recap-cmp-dismiss]",
  "[data-recap-cmp-discover]",
  "[data-recap-infadd-open]",
  "[data-recap-infadd-submit]",
  "[data-recap-refimg-add]",
  "[data-recap-refimg-remove]",
  "[data-recap-learn]",
  "[data-recap-look]",
  "[data-recap-kit-pick]",
  "[data-recap-kit-pair-add]",
  "[data-recap-kit-pair-remove]",
  "[data-nv-optimize]",
  "[data-nv-accept]",
  "[data-nv-dismiss]",
  "[data-nv-adapt]",
  "[data-nv-optimize-part]",
  "[data-nv-reset]",
].join(",");

// ── Edit lifecycle ───────────────────────────────────────────────────────

// Open a section in edit: the snapshot Cancel restores, then the baseline the
// "unsaved changes" check compares against.
function openEdit(data, scope) {
  if (scope === "brand") ensureBrand(data);
  const editRoster = ROSTERS[scope];
  if (editRoster) rosterList(data, editRoster);
  snapshot = snapshotEditable(data);
  editScope = scope;
  audienceCustom = false;
  repaint();
  // Taken AFTER the editor paints: rendering it seeds fields (a language's voice
  // entry), which would otherwise read as an edit nobody made.
  editBaseline = JSON.stringify(snapshotEditable(data));
}

function resetEdit() {
  snapshot = null;
  editBaseline = null;
  editScope = null;
  refModalIndex = null;
  rosterModal = null;
  infAdd = null;
  audienceCustom = false;
}

function isDirty(data) {
  return !!data && editBaseline !== null && JSON.stringify(snapshotEditable(data)) !== editBaseline;
}

// Save — tidy what the editor left half-filled, persist, close the section.
function commitEdit(data) {
  if (typeof data.name === "string") data.name = data.name.trim();
  if (Array.isArray(data.ctaLinks)) {
    data.ctaLinks = data.ctaLinks.filter((c) => (c.label || "").trim() || (c.url || "").trim() || c.suggested);
  }
  // Drop empty lines from the flat mirror AND every per-language voice entry.
  ["signatureHooks", "closingPatterns"].forEach((f) => {
    if (Array.isArray(data[f])) data[f] = data[f].filter((s) => (s || "").trim());
  });
  if (data.voiceByLanguage && typeof data.voiceByLanguage === "object") {
    Object.values(data.voiceByLanguage).forEach((entry) => {
      ["signatureHooks", "closingPatterns"].forEach((f) => {
        if (Array.isArray(entry[f])) entry[f] = entry[f].filter((s) => (s || "").trim());
      });
    });
  }
  // Same for every network voice — its own lines and its learned rules.
  Object.values(data.voiceByNetwork || {}).forEach((entry) => {
    ["signatureHooks", "closingPatterns", "rules"].forEach((f) => {
      if (Array.isArray(entry[f])) entry[f] = entry[f].filter((s) => (s || "").trim());
    });
  });
  // Drop roster entries left completely blank (an "Add competitor" row the
  // user opened and abandoned) and social rows with no URL. `suggested` is
  // kept: an unaccepted proposal stays pending across a Save rather than
  // being silently adopted into the Playbook.
  Object.values(ROSTERS).forEach(({ listKey }) => {
    if (!Array.isArray(data[listKey])) return;
    data[listKey] = data[listKey].filter(
      (c) => (c.name || "").trim() || (c.websiteUrl || "").trim() || (c.description || "").trim(),
    );
    data[listKey].forEach((c) => {
      c.socials = (Array.isArray(c.socials) ? c.socials : []).filter((s) => (s.url || "").trim());
    });
  });
  cfg.commit?.();
  resetEdit();
}

// Playbook 2.0: a section in edit left by a ROUTE (a chat in the rail, Start a
// chat…) is SAVED — the page is going away, there is nowhere to ask; the toast
// says so and carries the way back. A TAB switch asks instead (switchTab).
// Nothing changed → the editor simply closes.
function saveOnLeave() {
  if (!editScope || !cfg) return;
  const data = cfg.getData();
  if (!isDirty(data)) {
    resetEdit();
    return;
  }
  const title = SECTIONS.find((x) => x.scope === editScope)?.title || "Playbook";
  const before = snapshot;
  const revert = cfg.revert;
  commitEdit(data);
  showToast(`${title} changes saved.`, {
    action: {
      label: "Undo",
      onClick: () => {
        revert?.(before);
        repaint();
      },
    },
  });
}

// Changing tab with unsaved changes asks what to do with them (2026-10-06, the
// user's call over the silent save): Save changes, Discard changes, or — the X
// or Esc — stay on the edit. Nothing changed → the editor closes, no question.
function switchTab(id) {
  const go = () => {
    setTab(id);
    repaint();
    mountTarget?.querySelector(".welcome-screen")?.scrollTo({ top: 0 });
  };
  const data = cfg?.getData();
  if (!editScope || !isDirty(data)) {
    if (editScope) resetEdit();
    go();
    return;
  }
  const title = SECTIONS.find((x) => x.scope === editScope)?.title || "this section";
  openConfirmModal({
    title: `Save your changes to ${title}?`,
    body: "You're leaving this tab with changes you haven't saved.",
    confirmLabel: "Save changes",
    cancelLabel: "Discard changes",
    onConfirm: () => {
      commitEdit(cfg.getData());
      go();
    },
    onCancel: () => {
      if (snapshot) cfg.revert?.(snapshot);
      resetEdit();
      go();
    },
  });
}

function onClick(event) {
  // Playbook 2.0 tabs — never locked; leaving a section with changes asks.
  const tab = event.target.closest("[data-pb2-tab]");
  if (tab) {
    if (tab.dataset.pb2Tab !== activeTab) switchTab(tab.dataset.pb2Tab);
    return;
  }
  if (!canEditView() && event.target.closest(WRITE_HOOKS)) return;
  if (onNetworkVoiceClick(event)) return;

  // Section-nav — scroll the panel into view (buttons, not anchors, so the
  // hash router is never triggered).
  const nav = event.target.closest("[data-recap-nav]");
  if (nav) {
    const el = mountTarget?.querySelector(`#${nav.dataset.recapNav}`);
    el?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    setActiveNav(nav.dataset.recapNav);
    return;
  }

  // Header name pencil → rename (mode-specific handler).
  if (event.target.closest("[data-recap-edit-name]")) {
    cfg.onEditName?.();
    return;
  }

  const data = cfg.getData();
  if (!data) return;

  // Image styles (flag sexySquirrel) — live in and out of edit mode.
  if (handleImageStylesClick(event, data, repaint)) return;

  // Brand kit rows (flag sexySquirrel) — only live while a section is edited.
  if (editScope && handleKitClick(event, data)) {
    repaint();
    return;
  }

  const penBtn = event.target.closest("[data-recap-edit-card]");
  if (penBtn) {
    openEdit(data, penBtn.dataset.recapEditCard);
    mountTarget
      ?.querySelector(
        "[data-recap-editing-card] input, [data-recap-editing-card] textarea, [data-recap-editing-card] select",
      )
      ?.focus();
    return;
  }

  if (event.target.closest("[data-recap-cancel]")) {
    if (snapshot) cfg.revert?.(snapshot);
    resetEdit();
    repaint();
    return;
  }

  if (event.target.closest("[data-recap-save]")) {
    commitEdit(data);
    repaint();
    return;
  }

  // ── Add an influencer (dialog, from read mode) ──
  if (event.target.closest("[data-recap-infadd-open]")) {
    infAdd = emptyInfluencerDraft();
    repaint(); // the page stays on the section behind the dialog
    document.querySelector("[data-recap-infadd-field='name']")?.focus();
    return;
  }
  if (event.target.closest("[data-recap-infadd-close]") || event.target.matches?.("[data-recap-infadd-backdrop]")) {
    infAdd = null;
    repaint();
    return;
  }
  if (event.target.closest("[data-recap-infadd-submit]")) {
    if (!infAdd || !infAdd.name.trim()) return;
    const r = ROSTERS.influencers;
    const list = rosterList(data, r);
    if (list.length < r.max) {
      list.push({
        id: `${r.idPrefix}-new-${list.length + 1}-${Date.now().toString(36)}`,
        name: infAdd.name.trim(),
        description: "",
        websiteUrl: infAdd.websiteUrl.trim(),
        socials: r.networks
          .map((network) => ({ network, url: (infAdd.socials[network] || "").trim() }))
          .filter((x) => x.url),
      });
      cfg.commit?.();
    }
    infAdd = null;
    repaint();
    return;
  }

  // ── Competitors + Influencers ──
  // Every hook below acts on the roster it sits in (rosterOf).
  if (event.target.closest("[data-recap-cmp-discover]")) {
    startRosterScan(rosterOf(event.target));
    return;
  }

  // Accept a proposal — it becomes one of the Playbook's own entries.
  // Deliberately available in READ mode: adopting a suggestion shouldn't
  // require entering the section editor, that's the point of the tray.
  const cmpAccept = event.target.closest("[data-recap-cmp-accept]");
  if (cmpAccept) {
    const c = rosterList(data, rosterOf(cmpAccept))[Number(cmpAccept.dataset.recapCmpAccept)];
    if (!c) return;
    delete c.suggested;
    rosterModal = null;
    if (!editScope) cfg.commit?.(); // in edit mode the section's Save commits
    repaint();
    return;
  }

  const cmpAcceptAll = event.target.closest("[data-recap-cmp-accept-all]");
  if (cmpAcceptAll) {
    pendingEntries(data, rosterOf(cmpAcceptAll)).forEach((c) => delete c.suggested);
    rosterModal = null;
    if (!editScope) cfg.commit?.();
    repaint();
    return;
  }

  // Dismiss a proposal — drop it and remember the rejection so a later scan
  // doesn't surface it again.
  const cmpDismiss = event.target.closest("[data-recap-cmp-dismiss]");
  if (cmpDismiss) {
    const r = rosterOf(cmpDismiss);
    const list = rosterList(data, r);
    const idx = Number(cmpDismiss.dataset.recapCmpDismiss);
    const c = list[idx];
    if (!c) return;
    const key = r.key(c);
    const dismissed = dismissedList(data, r);
    if (key && !dismissed.includes(key)) dismissed.push(key);
    list.splice(idx, 1);
    rosterModal = null; // indices shifted — the open modal no longer means anything
    if (!editScope) cfg.commit?.();
    repaint();
    return;
  }

  const cmpOpen = event.target.closest("[data-recap-cmp-open]");
  if (cmpOpen) {
    rosterModal = { kind: rosterOf(cmpOpen).scope, index: Number(cmpOpen.dataset.recapCmpOpen) };
    repaint();
    return;
  }

  if (event.target.closest("[data-recap-cmp-close]") || event.target.matches?.("[data-recap-cmpmodal-backdrop]")) {
    rosterModal = null;
    repaint();
    return;
  }

  const cmpRemove = event.target.closest("[data-recap-cmp-remove]");
  if (cmpRemove) {
    const idx = Number(cmpRemove.dataset.recapCmpRemove);
    const list = rosterList(data, rosterOf(cmpRemove));
    if (idx >= 0 && idx < list.length) list.splice(idx, 1);
    rosterModal = null; // the open modal's index no longer means anything
    repaint();
    return;
  }

  const cmpAdd = event.target.closest("[data-recap-cmp-add]");
  if (cmpAdd) {
    const r = rosterOf(cmpAdd);
    const list = rosterList(data, r);
    if (list.length >= r.max) return;
    list.push({
      id: `${r.idPrefix}-new-${list.length + 1}-${Date.now().toString(36)}`,
      name: "",
      description: "",
      websiteUrl: "",
      socials: [],
    });
    rosterModal = { kind: r.scope, index: list.length - 1 }; // open the blank card straight away
    repaint();
    mountTarget?.querySelector("[data-recap-cmp-field='name']")?.focus();
    return;
  }

  const cmpSocialAdd = event.target.closest("[data-recap-cmp-social-add]");
  if (cmpSocialAdd) {
    const c = rosterList(data, rosterOf(cmpSocialAdd))[Number(cmpSocialAdd.dataset.recapCmpSocialAdd)];
    if (!c) return;
    if (!Array.isArray(c.socials)) c.socials = [];
    c.socials.push({ network: rosterOf(cmpSocialAdd).networks[0], url: "" });
    repaint();
    const inputs = document.querySelectorAll("[data-recap-cmp-social-url]");
    inputs[inputs.length - 1]?.focus();
    return;
  }

  const cmpSocialRemove = event.target.closest("[data-recap-cmp-social-remove]");
  if (cmpSocialRemove) {
    const c = rosterList(data, rosterOf(cmpSocialRemove))[Number(cmpSocialRemove.dataset.recapCmpIndex)];
    const si = Number(cmpSocialRemove.dataset.recapCmpSocialIndex);
    if (c && Array.isArray(c.socials) && si >= 0 && si < c.socials.length) c.socials.splice(si, 1);
    repaint();
    return;
  }

  // Voice & style: switch between the guided fields and a free-form textarea.
  const voiceMode = event.target.closest("[data-recap-voice-mode]");
  if (voiceMode) {
    data.voiceMode = voiceMode.dataset.recapVoiceMode;
    repaint();
    mountTarget?.querySelector("[data-recap-text='voiceManual']")?.focus();
    return;
  }

  // Languages (Audience & goals) — toggle a language in/out of the Playbook.
  const langToggle = event.target.closest("[data-recap-lang-toggle]");
  if (langToggle) {
    const lang = langToggle.dataset.recapLangToggle;
    const langs = contextLanguages(data).slice();
    const at = langs.indexOf(lang);
    if (at >= 0) {
      if (langs.length <= 1) return; // never remove the last language
      langs.splice(at, 1);
      if (data.voiceByLanguage) delete data.voiceByLanguage[lang];
      if (data.primaryLanguage === lang) data.primaryLanguage = langs[0];
      if (activeVoiceLang === lang) activeVoiceLang = null;
    } else {
      langs.push(lang);
      if (!data.voiceByLanguage || typeof data.voiceByLanguage !== "object") data.voiceByLanguage = {};
      if (!data.voiceByLanguage[lang]) data.voiceByLanguage[lang] = emptyVoiceEntry(data);
    }
    data.languages = langs;
    if (!data.primaryLanguage || !langs.includes(data.primaryLanguage)) data.primaryLanguage = langs[0];
    repaint();
    return;
  }

  // Voice & style — switch which language's examples are shown/edited.
  const voiceLang = event.target.closest("[data-recap-voice-lang]");
  if (voiceLang) {
    activeVoiceLang = voiceLang.dataset.recapVoiceLang;
    repaint();
    return;
  }

  // Primary audience dropdown — pick an analysed option (by pool index) or
  // switch to "Other…", which reveals the free-text input. Picking closes the
  // DS .ap-select <details>.
  const audPick = event.target.closest("[data-recap-audience-pick]");
  if (audPick) {
    audPick.closest("details")?.removeAttribute("open");
    const val = audPick.dataset.recapAudiencePick;
    if (val === "other") {
      audienceCustom = true;
      repaint();
      mountTarget?.querySelector("[data-recap-audience-input]")?.focus();
    } else {
      audienceCustom = false;
      const pool = audienceOptionPool(data);
      const idx = Number(val);
      if (pool[idx] != null) setAudience(pool[idx]);
      else repaint();
    }
    return;
  }
  // Confirm a custom value typed under the "Other…" option.
  if (event.target.closest("[data-recap-audience-add]")) {
    addAudienceCustom();
    return;
  }

  const chipRemove = event.target.closest("[data-recap-chip-remove]");
  if (chipRemove) {
    const field = chipRemove.dataset.recapChipRemove;
    const idx = Number(chipRemove.dataset.recapChipIndex);
    if (Array.isArray(data[field])) data[field] = data[field].filter((_, i) => i !== idx);
    repaint();
    return;
  }

  const chipAdd = event.target.closest("[data-recap-chip-add]");
  if (chipAdd) {
    addChip(chipAdd.dataset.recapChipAdd);
    return;
  }

  // Line-list editor (signature hooks / closing patterns).
  const lineRemove = event.target.closest("[data-recap-line-remove]");
  if (lineRemove) {
    const field = lineRemove.dataset.recapLineList;
    const idx = Number(lineRemove.dataset.recapLineIndex);
    const entry = editEntry(data, field);
    if (Array.isArray(entry[field])) entry[field] = entry[field].filter((_, i) => i !== idx);
    repaint();
    return;
  }
  const lineAdd = event.target.closest("[data-recap-line-add]");
  if (lineAdd) {
    addLine(lineAdd.dataset.recapLineAdd);
    return;
  }

  const ctaRemove = event.target.closest("[data-recap-cta-remove]");
  if (ctaRemove) {
    const idx = Number(ctaRemove.dataset.recapCtaRemove);
    if (Array.isArray(data.ctaLinks)) data.ctaLinks = data.ctaLinks.filter((_, i) => i !== idx);
    repaint();
    return;
  }

  if (event.target.closest("[data-recap-cta-add]")) {
    const ctas = Array.isArray(data.ctaLinks) ? data.ctaLinks.slice() : [];
    ctas.push({ label: "", url: "", checked: true, suggested: false });
    data.ctaLinks = ctas;
    repaint();
    const inputs = mountTarget?.querySelectorAll('[data-recap-cta-field="label"]');
    inputs?.[inputs.length - 1]?.focus();
    return;
  }

  // Brand colours — add / remove a named #hex swatch.
  const colorRemove = event.target.closest("[data-recap-color-remove]");
  if (colorRemove) {
    const idx = Number(colorRemove.dataset.recapColorRemove);
    if (Array.isArray(data.brandColors)) data.brandColors = data.brandColors.filter((_, i) => i !== idx);
    repaint();
    return;
  }
  if (event.target.closest("[data-recap-color-add]")) {
    const list = Array.isArray(data.brandColors) ? data.brandColors.slice() : [];
    list.push({ name: "", hex: "#1A1F36" });
    data.brandColors = list;
    repaint();
    const inputs = mountTarget?.querySelectorAll('[data-recap-color-field="name"]');
    inputs?.[inputs.length - 1]?.focus();
    return;
  }

  // Brand logos — promote one to default / drop one / add more. All part of the
  // Brand section's Save/Cancel flow, like every other field in it.
  if (event.target.closest("[data-recap-logo-add]")) {
    mountTarget?.querySelector("[data-recap-logo-input]")?.click();
    return;
  }
  const logoPick = event.target.closest("[data-recap-logo-pick]");
  if (logoPick) {
    const logo = brandLogoList(data)[Number(logoPick.dataset.recapLogoPick)];
    // The default is stored as the url, not an index — an index would silently
    // point at a different mark as soon as one above it is removed.
    if (logo) data.brandLogo = logo.url;
    repaint();
    return;
  }
  // Default look — one hook for the three sub-controls, single-select with toggle-off.
  // Pressing the picked chip again clears the field, and cleared IS "no preference".
  const look = event.target.closest("[data-recap-look]");
  if (look) {
    const field = look.dataset.recapLook;
    const val = look.dataset.recapLookValue;
    if (!data.imageDefaults || typeof data.imageDefaults !== "object") {
      data.imageDefaults = { imageType: "", style: "", refMode: "" };
    }
    data.imageDefaults[field] = data.imageDefaults[field] === val ? "" : val;
    repaint();
    return;
  }
  const logoRemove = event.target.closest("[data-recap-logo-remove]");
  if (logoRemove) {
    const idx = Number(logoRemove.dataset.recapLogoRemove);
    const list = brandLogoList(data).slice();
    const [gone] = list.splice(idx, 1);
    data.brandLogos = list;
    // Removing the default hands the job to whatever's left, so the header and
    // the generator are never pointed at a mark that isn't in the set anymore.
    if (gone && gone.url === data.brandLogo) data.brandLogo = list[0]?.url || "";
    repaint();
    return;
  }

  // Reference images — open the file picker / open the detail modal / close it /
  // remove a thumbnail.
  if (event.target.closest("[data-recap-refimg-add]")) {
    mountTarget?.querySelector("[data-recap-refimg-input]")?.click();
    return;
  }
  const refOpen = event.target.closest("[data-recap-refimg-open]");
  if (refOpen) {
    refModalIndex = Number(refOpen.dataset.recapRefimgOpen);
    repaint();
    return;
  }
  // Close the modal (× / Done button, or a click on the backdrop itself).
  // Reference-image edits are part of the Brand section's Save/Cancel flow — no
  // separate commit here.
  if (event.target.closest("[data-recap-refimg-close]") || event.target.matches?.("[data-recap-refmodal-backdrop]")) {
    refModalIndex = null;
    repaint();
    return;
  }
  const refImgRemove = event.target.closest("[data-recap-refimg-remove]");
  if (refImgRemove) {
    const idx = Number(refImgRemove.dataset.recapRefimgRemove);
    if (Array.isArray(data.referenceImages)) data.referenceImages = data.referenceImages.filter((_, i) => i !== idx);
    refModalIndex = null; // the open image may be gone / indices shifted
    repaint();
    return;
  }
  // Reference image — toggle a target network on/off (in place, no page jump).
  const refNet = event.target.closest("[data-recap-refnet]");
  if (refNet) {
    const idx = Number(refNet.dataset.recapRefimgIndex);
    const net = refNet.dataset.recapRefnet;
    const img = data.referenceImages?.[idx];
    if (img) {
      const nets = Array.isArray(img.networks) ? img.networks : [];
      const on = nets.includes(net);
      img.networks = on ? nets.filter((n) => n !== net) : [...nets, net];
      refNet.setAttribute("aria-pressed", String(!on));
    }
    return;
  }
  // Reference image — remove a detected tag.
  const tagRm = event.target.closest("[data-recap-reftag-remove]");
  if (tagRm) {
    const img = data.referenceImages?.[Number(tagRm.dataset.recapRefimgIndex)];
    if (img) {
      ensureRefTagsColors(img);
      img.tags.splice(Number(tagRm.dataset.recapTagIndex), 1);
      repaint();
    }
    return;
  }
  // Reference image — remove / add a dominant colour.
  const colorRm = event.target.closest("[data-recap-refcolor-remove]");
  if (colorRm) {
    const img = data.referenceImages?.[Number(colorRm.dataset.recapRefimgIndex)];
    if (img) {
      ensureRefTagsColors(img);
      img.colors.splice(Number(colorRm.dataset.recapColorIndex), 1);
      repaint();
    }
    return;
  }
  const colorAdd = event.target.closest("[data-recap-refcolor-add]");
  if (colorAdd) {
    const img = data.referenceImages?.[Number(colorAdd.dataset.recapRefimgIndex)];
    if (img) {
      ensureRefTagsColors(img);
      img.colors.push("#3b4a6b");
      repaint();
    }
    return;
  }

  // Footer / header actions (mode-specific) — Save and start / Start chat / etc.
  cfg.onFooter?.(event);
}

// Text edits mutate the live data object WITHOUT a repaint so inputs keep
// focus mid-type.
function onInput(event) {
  // The add dialog lives in READ mode, so it answers before the edit guard.
  // No repaint: that would steal the caret — only the submit's state follows.
  const addField = event.target.closest?.("[data-recap-infadd-field], [data-recap-infadd-social]");
  if (addField && infAdd) {
    if (addField.dataset.recapInfaddField) infAdd[addField.dataset.recapInfaddField] = addField.value;
    else infAdd.socials[addField.dataset.recapInfaddSocial] = addField.value;
    const submit = document.querySelector("[data-recap-infadd-submit]");
    if (submit) submit.disabled = !infAdd.name.trim();
    return;
  }
  if (!editScope) return;
  const data = cfg.getData();
  if (!data) return;
  const t = event.target;
  if (handleKitInput(event, data)) return;
  if (t.matches("[data-recap-summary]")) {
    data.businessSummary = t.value;
  } else if (t.matches("[data-recap-refnote]")) {
    const idx = Number(t.dataset.recapRefimgIndex);
    if (data.referenceImages?.[idx]) data.referenceImages[idx].note = t.value;
  } else if (t.matches("[data-recap-refcolor]")) {
    const img = data.referenceImages?.[Number(t.dataset.recapRefimgIndex)];
    if (img) {
      ensureRefTagsColors(img);
      img.colors[Number(t.dataset.recapColorIndex)] = t.value;
    }
  } else if (t.matches("[data-nv-text]")) {
    const e = nvWritableEntry(data, activeNetworkFor(data));
    e[t.dataset.nvText] = t.value;
  } else if (t.matches("[data-recap-text]")) {
    data[t.dataset.recapText] = t.value;
  } else if (t.matches("[data-recap-typo]")) {
    if (!data.brandTypography || typeof data.brandTypography !== "object") data.brandTypography = brandFonts(data);
    data.brandTypography[t.dataset.recapTypo] = t.value;
  } else if (t.matches("[data-recap-line-field]")) {
    const list = t.dataset.recapLineList;
    const idx = Number(t.dataset.recapLineIndex);
    // Voice examples are per language — mutate the active language's entry.
    const entry = editEntry(data, list);
    if (Array.isArray(entry[list]) && entry[list][idx] !== undefined) entry[list][idx] = t.value;
  } else if (t.matches("[data-recap-cta-field]")) {
    const idx = Number(t.dataset.recapCtaIndex);
    const field = t.dataset.recapCtaField;
    if (data.ctaLinks?.[idx]) data.ctaLinks[idx][field] = t.value;
  } else if (t.matches("[data-recap-color-field]")) {
    const idx = Number(t.dataset.recapColorIndex);
    const field = t.dataset.recapColorField;
    if (data.brandColors?.[idx]) data.brandColors[idx][field] = t.value;
    if (field === "hex") {
      const sw = mountTarget?.querySelector(`[data-recap-color-swatch="${idx}"]`);
      if (sw) sw.style.background = t.value;
    }
  } else if (t.matches("[data-recap-cmp-field]")) {
    const c = data[rosterOf(t).listKey]?.[Number(t.dataset.recapCmpIndex)];
    if (c) c[t.dataset.recapCmpField] = t.value;
  } else if (t.matches("[data-recap-inf-social]")) {
    // One fixed field per network: write that network's profile, creating it
    // on first keystroke. Empty ones are pruned on Save.
    const c = data[rosterOf(t).listKey]?.[Number(t.dataset.recapCmpIndex)];
    if (c) {
      if (!Array.isArray(c.socials)) c.socials = [];
      let s = c.socials.find((x) => x.network === t.dataset.recapInfSocial);
      if (!s) c.socials.push((s = { network: t.dataset.recapInfSocial, url: "" }));
      s.url = t.value;
    }
  } else if (t.matches("[data-recap-cmp-social-url]")) {
    const c = data[rosterOf(t).listKey]?.[Number(t.dataset.recapCmpIndex)];
    const s = c?.socials?.[Number(t.dataset.recapCmpSocialIndex)];
    if (s) s.url = t.value;
  }
}

let refImgCounter = 0;
let brandLogoCounter = 0;

function onChange(event) {
  if (!editScope) return;
  const data = cfg.getData();
  if (!data) return;
  if (handleKitChange(event, data, repaint)) return;
  // Brand-logo upload — appended to the set, read as data URLs so they persist
  // with the Playbook (an object URL is ephemeral and wouldn't survive the store).
  if (event.target.matches("[data-recap-logo-input]")) {
    const picked = Array.from(event.target.files || []).filter((f) => f.type.startsWith("image/"));
    event.target.value = ""; // so re-picking the same file fires again
    if (!picked.length) return;
    const list = brandLogoList(data).slice();
    const room = Math.max(0, MAX_BRAND_LOGOS - list.length);
    Promise.all(
      picked.slice(0, room).map(
        (f) =>
          new Promise((res) => {
            const reader = new FileReader();
            brandLogoCounter += 1;
            const id = `logo-up-${brandLogoCounter}`;
            // The filename, minus its extension, is the only label the user has
            // given us — better than a generic "Logo" they'd have to tell apart.
            const label = f.name.replace(/\.[^.]+$/, "") || "Logo";
            reader.onload = () => res({ id, label, url: reader.result });
            reader.onerror = () => res(null);
            reader.readAsDataURL(f);
          }),
      ),
    ).then((loaded) => {
      loaded.filter(Boolean).forEach((logo) => list.push(logo));
      data.brandLogos = list;
      // First mark in an empty Playbook becomes the default on its own — there's
      // nothing to choose between yet, and leaving it unset would show a gallery
      // with no default while the generator still had nothing to stamp.
      if (!data.brandLogo && list.length) data.brandLogo = list[0].url;
      repaint();
    });
    return;
  }
  // Reference-image upload — read each picked image as a data URL and append,
  // capped at MAX_REF_IMAGES. Part of the Brand section's Save flow.
  if (event.target.matches("[data-recap-refimg-input]")) {
    const picked = Array.from(event.target.files || []).filter((f) => f.type.startsWith("image/"));
    if (!picked.length) return;
    if (!Array.isArray(data.referenceImages)) data.referenceImages = [];
    const room = Math.max(0, MAX_REF_IMAGES - data.referenceImages.length);
    Promise.all(
      picked.slice(0, room).map(
        (f) =>
          new Promise((res) => {
            const reader = new FileReader();
            refImgCounter += 1;
            const id = `ref-${refImgCounter}`;
            reader.onload = () => res({ id, label: f.name, url: reader.result, networks: [] });
            reader.onerror = () => res(null);
            reader.readAsDataURL(f);
          }),
      ),
    ).then((loaded) => {
      loaded.filter(Boolean).forEach((img) => data.referenceImages.push(img));
      repaint();
    });
    return;
  }
  if (event.target.matches("[data-recap-primary-language]")) {
    const val = event.target.value;
    const langs = contextLanguages(data);
    if (langs.includes(val)) {
      data.primaryLanguage = val;
      repaint(); // refresh the "primary" tag + header/rail
    }
    return;
  }
  // Roster social row — the network select. No repaint: the row's own
  // <select> already shows the new value, and repainting would steal focus.
  if (event.target.matches("[data-recap-cmp-social-network]")) {
    const c = data[rosterOf(event.target).listKey]?.[Number(event.target.dataset.recapCmpIndex)];
    const s = c?.socials?.[Number(event.target.dataset.recapCmpSocialIndex)];
    if (s) s.network = event.target.value;
    return;
  }
}

function onKeydown(event) {
  if (!editScope) return;
  if (event.target.matches("[data-recap-audience-input]") && event.key === "Enter") {
    event.preventDefault();
    addAudienceCustom();
  } else if (event.target.matches("[data-recap-chip-input]") && event.key === "Enter") {
    event.preventDefault();
    addChip(event.target.dataset.recapChipInput);
  } else if (event.target.matches("[data-recap-line-field]") && event.key === "Enter") {
    event.preventDefault();
    addLine(event.target.dataset.recapLineList);
  } else if (event.target.matches("[data-recap-reftag-input]") && event.key === "Enter") {
    event.preventDefault();
    const value = event.target.value.trim();
    if (!value) return;
    const data = cfg.getData();
    const img = data?.referenceImages?.[Number(event.target.dataset.recapRefimgIndex)];
    if (img) {
      ensureRefTagsColors(img);
      if (!img.tags.includes(value)) img.tags.push(value);
      repaint();
      // Re-focus the (fresh) tag input so the user can keep adding.
      refModalHost?.querySelector("[data-recap-reftag-input]")?.focus();
    }
  }
}

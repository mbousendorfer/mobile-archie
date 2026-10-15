// Deep links that open an overlay — for a screenshot, or to share one.
//
// The Figma sync workflow captures the app screen by screen, and a modal or
// a right-panel mode has no URL of its own — it lives behind a click. These
// two query params give the capture tool, and anyone sharing a link, a way in:
//
//   ?openModal=<id>                                        [&tab=upload|url|connectors]
//   ?openPanel=drafts|ideas|sources
//
// The modal ids are the keys of OVERLAYS below — that map is also what
// /handoff/overlays.html renders, so the index page and the dispatch cannot
// drift apart. Only overlays that open with NO target are in it: a dialog that
// needs a post, a Topic, a Playbook or a source has nothing to show without one.
//
// Note they are SEARCH params, not hash params — the hash belongs to the
// router (url-state.js), and the capture tool drives both independently.
//
// Kept out of app.js so the entry point stays a route table plus a boot
// sequence: this is tooling, and it is the only reason those overlay modules
// are imported twice in the app's graph.

import * as addSourceModal from "./components/add-source-modal.js?v=1841";
import * as bugReportModal from "./components/bug-report-modal.js?v=1841";
import * as feedbackModal from "./components/feedback-modal.js?v=1841";
import * as chatPickerModal from "./components/chat-picker-modal.js?v=1841";
import * as searchModal from "./components/search-modal.js?v=1841";
import * as skipConnectModal from "./components/skip-connect-modal.js?v=1841";
import * as connectorsModal from "./components/connectors-modal.js?v=1841";
import * as connectAccountModal from "./components/connect-account-modal.js?v=1841";
import * as analyzeProfilesModal from "./components/analyze-profiles-modal.js?v=1841";
import * as fillDocumentModal from "./components/fill-document-modal.js?v=1841";
import * as saveFolderModal from "./components/save-folder-modal.js?v=1841";
import * as shortcutLegend from "./components/shortcut-legend.js?v=1841";
import { openDrafts, openIdeas, openSources } from "./components/right-panel.js?v=1841";

// Both are deferred: the screen has to mount before an overlay can sit on it.
// The panel waits longer than the modal because a session screen seeds its
// stores on mount and the panel reads them.
const MODAL_DELAY_MS = 600;
const PANEL_DELAY_MS = 1000;

// id -> { label, hint, open }. Exported so the handoff index renders exactly
// what this file can dispatch.
export const OVERLAYS = {
  "add-source": {
    label: "Add a source",
    hint: "Upload / URL / Connectors tabs — &tab=upload|url|connectors",
    open: (tab) => addSourceModal.open({ tab: tab || "upload" }),
  },
  connectors: {
    label: "Connectors gallery",
    hint: "Needs the connectors flag ON",
    open: () => connectorsModal.open({}),
  },
  "connect-account": {
    label: "Connect a social account",
    hint: "The consent dialog behind the network grid",
    open: () => connectAccountModal.open({}),
  },
  "skip-connect": {
    label: "Skip connecting an account?",
    hint: "Onboarding's skip — reassures, then asks why",
    open: () => skipConnectModal.open(),
  },
  "analyze-profiles": {
    label: "Analyze social profiles",
    hint: "Profile multi-select",
    open: () => analyzeProfilesModal.open({}),
  },
  "fill-document": {
    label: "Fill from a document",
    hint: "Dropzone + connector picker",
    open: () => fillDocumentModal.open({}),
  },
  "save-folder": {
    label: "Save to folder",
    hint: "Folder picker + create",
    open: () => saveFolderModal.open({ count: 1 }),
  },
  "chat-picker": {
    label: "Pick a chat",
    hint: "Send an idea to an existing chat",
    open: () => chatPickerModal.open({ ideaId: null }),
  },
  search: { label: "Search", hint: "The Cmd-K dialog", open: () => searchModal.open() },
  shortcuts: { label: "Keyboard shortcuts", hint: "The ? legend", open: () => shortcutLegend.open() },
  feedback: { label: "Send feedback", hint: "Generic feedback form", open: () => feedbackModal.open({}) },
  bug: { label: "Report a bug", hint: "Bug report form", open: () => bugReportModal.open() },
};

function openModal(which, tab) {
  const entry = OVERLAYS[which];
  if (!entry) {
    console.warn("[capture] unknown overlay", which, "— known:", Object.keys(OVERLAYS).join(", "));
    return;
  }
  entry.open(tab);
}

function openPanel(panel) {
  switch (panel) {
    case "drafts":
      openDrafts();
      break;
    case "ideas":
      openIdeas();
      break;
    case "sources":
      openSources();
      break;
  }
}

export function initFigmaCapture() {
  const params = new URLSearchParams(window.location.search);
  const which = params.get("openModal");
  const panel = params.get("openPanel");
  if (!which && !panel) return;

  if (which) {
    const tab = params.get("tab");
    window.setTimeout(() => {
      try {
        openModal(which, tab);
      } catch (err) {
        console.error("[capture] failed to open modal", which, err);
      }
    }, MODAL_DELAY_MS);
  }

  if (panel) {
    window.setTimeout(() => {
      try {
        openPanel(panel);
      } catch (err) {
        console.error("[capture] failed to open panel", panel, err);
      }
    }, PANEL_DELAY_MS);
  }
}

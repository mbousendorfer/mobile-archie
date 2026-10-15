export const FLAGS = Object.freeze([
  {
    id: "insightsHub",
    label: "Insights hub (/insights)",
    // OFF: the feature lands dark. The flag gates the ROUTE as well as the nav
    // row — a typed /insights bounces home while the switch is off.
    default: false,
    hides:
      "When OFF, the Insights section disappears entirely. ON adds the active " +
      "brand's objectives, read in one of three layouts (Cockpit, a card " +
      "index, a side column — the View switch in the topbar): the counted verdict, a real trajectory toward target per " +
      "measure, and the posts drafted with Archie that moved it. It is the one " +
      "analytics surface you choose to open, which is why a wall of figures is " +
      "legitimate here and nowhere else.",
  },
  {
    id: "playbookWorkspace",
    label: "Playbook as a workspace (rail switcher)",
    // OFF: byte-for-byte the per-chat model — the Playbook is a field on a
    // session, asked in the composer on a fresh chat and fixed after that.
    default: false,
    hides:
      "Whether the Playbook is a FIELD on the things you make, or the LEVEL " +
      "ABOVE them. When OFF (default), each surface asks its own question: the " +
      "composer's select on a new chat, `?pb=` on the Topic Feed and its " +
      "settings, an implicit default Playbook for the clip / batch / repurpose " +
      "flows, and the Insights title. Any two of them could disagree.\n\n" +
      "When ON, one Playbook is active at all times, chosen from the switcher " +
      "under the wordmark in the rail, and everything below it is that brand's " +
      "work: the chat list, a new chat, the Topic Feed and its count, Insights, " +
      "the studios' drafts. The six pickers that each asked the question " +
      "(composer, feed toolbar, feed settings, batch / clip / repurpose) are " +
      "gone: the rail names the brand, nothing else re-asks it.\n\nThe cost is stated in " +
      "active-playbook.js: a scope HIDES. There is deliberately no " +
      '"All playbooks" view, which is why the switcher is permanent and always ' +
      "prints the brand name — the scope is only safe while it is legible. " +
      "/contexts stays unfiltered: it is the catalogue the switcher picks from — " +
      "and in this mode it lives on the account HOME the wordmark opens (/home), " +
      "beside a hero that starts a chat on the brand you pick and a Chats tab " +
      "listing every chat, all brands.",
  },
  {
    id: "draftInlineEdit",
    label: "Inline edit on draft posts",
    default: false,
    hides:
      "Inline editing affordance + handler for draft post cards in the " +
      "right panel (introduit par le commit 1e3076e — feat(rpanel): " +
      "inline editing for draft posts).",
  },
  {
    id: "connectors",
    label: "Connectors (live MCP sources)",
    default: false,
    hides:
      "When OFF (default), hides everything connectors-related: the " +
      "Connectors gallery (route /connectors + sidebar nav) and modal, the " +
      "composer Add → 'Connected sources' submenu, the Sources panel 'Live " +
      "connectors' group, and the Add-source modal's Connectors tab.",
  },
  {
    id: "conversationStatusCard",
    label: "Conversation status card",
    default: false,
    hides:
      "When OFF, hides the floating conversation status card (sources / " +
      "ideas / clips / drafts summary) entirely, including its 'i' toggle " +
      "button in the session topbar.",
  },
  {
    id: "multilingualPlaybook",
    label: "Multilingual Playbooks",
    default: false,
    hides:
      "When OFF (default), Playbooks are single-language: the Audience & goals " +
      "language row is a plain English-only picker, the Voice & style panel has " +
      "no per-language switcher, and the draft flow never asks which language to " +
      "write in. When ON, a Playbook holds several languages (languages[] / " +
      "primaryLanguage / voiceByLanguage), the Voice examples are authored per " +
      "language, and drafting asks the target language. Underlying multilingual " +
      "data is preserved either way — only the surfaces are gated.",
  },
  {
    id: "playbookSharing",
    label: "Playbook sharing",
    default: false,
    hides:
      "Whether a Playbook belongs to somebody. When OFF (default), there is " +
      "one implicit user: every Playbook is visible, editable and deletable, " +
      "exactly as before. The ownership data (owner, scope, change log) still " +
      "rides along in the seeds, like multilingualPlaybook. When ON, a Playbook " +
      "is personal, shared with named colleagues (a fixed list), or shared " +
      "with the whole organisation (a dynamic one, joiners included). Its " +
      "owner is the only one who can edit it; everyone it reaches may open it " +
      "READ-ONLY, use it in a chat, and duplicate it into a Playbook of their " +
      "own. A Playbook tied to a social profile only reaches people who can " +
      "reach that profile. A manager (Admin \u2192 Your role) GOVERNS shared " +
      "Playbooks — share, hand over, delete — but never edits their content, and every action " +
      "they take on someone else's notifies the owner and lands in the change " +
      "log. Losing access degrades the chats that used it: the drafts already " +
      "written can still be saved or scheduled, nothing new can be generated. " +
      "Also gates the Share modal, the ownership marks on /contexts cards, the " +
      "owner row on a Playbook, and the Your-role control in Admin.",
  },
  {
    id: "newScheduleModal",
    label: "New SM (schedule modal)",
    // ON: the redesigned schedule modal. OFF: the previous one, kept whole in
    // schedule-modal-legacy.js for comparison.
    default: true,
    hides:
      "Which schedule modal opens from the Drafts panel. When ON (default), " +
      'the redesign: dates proposed on open after a short "finding the best ' +
      'time" beat, one sentence saying how they were picked with its ' +
      "settings behind Adjust (rhythm, start, time of day, skipped days, and " +
      "a rhythm saved per Playbook), and the batch as one list — each draft " +
      "with its media, then its date, what else is already planned that day, " +
      "and a clash warning on the same network.\n\nWhen OFF, the previous " +
      "modal: Optimal / Custom mode cards, cadence chips, a free-text " +
      "strategy, a Compute best times button that unlocks Schedule, and a " +
      "month calendar beside the list.",
  },
  {
    id: "brandTintedPresets",
    label: "Ready-made styles in the brand's colours",
    // OFF: every ready-made style's thumbnail is drawn in Acme's palette.
    default: false,
    hides:
      "When OFF (default), the Image Generator's ready-made styles keep one " +
      "palette, Acme's, on every Playbook. ON redraws their thumbnails in the " +
      "active brand's colours, so the gallery previews what THIS brand would get.",
  },
  {
    id: "newConversationStyles",
    label: "New conversation styles",
    // OFF: the thread as of Monday 2026-10-05 — every conversation restyle
    // since then (Tuesday's card system included) is ON only; the Monday
    // values live in styles/chat-legacy.css (body:not(.conv-new)). Figma
    // "Conversation styles" § E1–E4 is the reference for ON.
    default: false,
    hides:
      "When ON, every turn of the chat takes one shape, mirrored: Archie on the " +
      "left, you on the right, each with a 24px avatar disc and a head line " +
      "(name, time, what happened). Archie's status pill moves into his head " +
      "line; your picks get a neutral pill ('Added a source', 'Picked 1 " +
      "account'). Your words lose the navy bubble and read like Archie's; " +
      "consecutive Archie messages fold into one turn; every object (source, " +
      "pick, result) is the same white chip. Butter stays Archie's alone. " +
      "OFF shows the thread as it was on Monday 5 October, for a before / after.",
  },
  {
    id: "networkVoices",
    label: "Voice per network, with coaching",
    // OFF: lands dark. The data (voiceBaseNetwork / voiceByNetwork) rides
    // along in the seeds either way, like multilingualPlaybook.
    default: false,
    hides:
      "When OFF, a Playbook has one voice. ON gives it a BASE voice — learned " +
      "from the network of the profile picked at creation — and an adaptation " +
      "per network it publishes on: each network overrides only what differs " +
      "(hooks, closings, formatting, emoji) and keeps the rules it was taught.\n\n" +
      "Archie coaches it over time, and never writes it silently: when you " +
      "rework a draft (needs draftInlineEdit), when you thumbs-down one with a " +
      "reason, or by asking a question after drafting for a network whose " +
      "voice is thin, it PROPOSES a rule — a card in the chat, and the " +
      "\"What I've learned\" block on the Voice tab, under Archie's butter header. Nothing enters the " +
      "Playbook without a click. Each network voice says how far along it is. " +
      "The per-network view lives on the Playbook 2.0 page (flag playbook2).",
  },
  {
    id: "voiceNewSection",
    label: "Voice: simulate a new section (Hashtags)",
    // A demo, not a feature: how the Voice tab tells a user the product added a
    // part to every voice. Needs networkVoices.
    default: false,
    hides:
      "Adds a fifth part to every voice — Hashtags — marked New. A network that " +
      "was fully optimized drops to 4 of 5 and says what's new: an orange arc on " +
      'its ring, "1 new part" in its band, a dot on its tab, a New pill on the ' +
      "Hashtags block, a New step in the Optimize wizard. On a Playbook whose " +
      "base voice has no hashtags yet, the base asks for them too. Turn it off and " +
      "the part disappears — what was written for it is kept. Needs networkVoices.",
  },
]);

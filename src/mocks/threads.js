// Scripted assistant threads, per session.
// Seed data only — no network, no persistence, no randomness.
// Re-exported by ../mocks.js, which stays the single import path.

// ---- Assistant thread seeds (per-session conversation history) -----------
//
// Each demo session gets a scripted thread so opening one looks like a
// real, mid-flight conversation instead of an empty hero. Turns mirror
// the live assistant.js shape exactly — assistant.js's seedThread()
// clones each turn, assigns a fresh id + createdAt, and drops them into
// the per-session thread map. Brand-new sessions (id === "new" or
// runtime-created) keep the default greeting → empty hero path.
//
// Ids on draft/extraction sub-items reference the actual ids in
// postsBySession / ideasBySession so the cards link back to the real
// content on click.

export const threadsBySession = {
  "s-brightline": [
    {
      role: "user",
      meta: "You",
      text: "Draft two launch posts from the Brightline brief — lead with the escape hatch, not the routing engine.",
    },
    {
      role: "assistant",
      variant: "draft",
      meta: "Archie",
      ideaTitle: "The automation ops leads actually asked for",
      drafts: [
        {
          id: "post-brightline-1",
          network: "linkedin",
          preview:
            "Brightline ships next month. The part we're proudest of isn't the routing engine — it's that ops leads can override it without calling us.",
        },
        {
          id: "post-brightline-2",
          network: "linkedin",
          preview:
            "We asked twelve ops leads what they'd automate last. Every single one said the exception queue — the thing most tools automate first.",
        },
      ],
      count: 2,
      open: false,
    },
  ],
  "s-acme-launch": [
    {
      role: "assistant",
      meta: "Archie",
      text: "Hi. Want me to compare ideas, pick the strongest one, or draft a post? You can also type a question or drop a source.",
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "PDF",
      filename: "q2-strategy-offsite-notes.pdf",
      size: "1.2mb",
      sourceId: "src-acme-1",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "q2-strategy-offsite-notes.pdf",
      ideas: [
        {
          id: "idea-acme-1",
          title: "The three constraints that killed our first launch",
          body: "A candid retro framed around the three bottlenecks we kept underestimating: scope, distribution, and onboarding.",
        },
        {
          id: "idea-acme-2",
          title: "Why we stopped writing quarterly OKRs",
          body: "Contrarian take grounded in the offsite notes. Frames OKRs as a lagging signal rather than a tool for focus.",
        },
      ],
      count: 2,
      open: false,
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "Video",
      filename: "founder-keynote.mp4",
      size: "34mb",
      sourceId: "src-acme-2",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "founder-keynote.mp4",
      ideas: [
        {
          id: "idea-acme-3",
          title: "What a founder keynote looks like at 50 people",
          body: "Behind-the-scenes recap of the keynote, including the bits that got cut.",
        },
        {
          id: "idea-acme-4",
          title: '"Studio isn\'t about replacing the writer."',
          body: "\"Studio isn't about replacing the writer — it's about removing the blank page.\"",
        },
      ],
      count: 2,
      open: false,
    },
    {
      role: "user",
      meta: "You",
      text: "Pull the strongest ideas from these and draft 4 posts across LinkedIn and X.",
    },
    {
      role: "assistant",
      meta: "Archie",
      text: [
        "I drafted 4 posts grounded in [[idea:idea-acme-1]], each sized for its network and following the Acme · Q2 marketing playbook:",
        "- [[post:post-acme-1]], ready",
        "- [[post:post-acme-3]], ready",
        "- [[post:post-acme-2]], past LinkedIn's caption limit",
        "- [[post:post-acme-4]], image at the wrong dimensions",
      ].join("\n"),
    },
    {
      role: "assistant",
      variant: "draft",
      meta: "Archie",
      ideaTitle: "The three constraints that killed our first launch",
      drafts: [
        {
          id: "post-acme-1",
          network: "twitter",
          preview:
            "Your Q2 plan isn't a plan, it's a wish list — unless every objective names the single signal you'll watch weekly.",
        },
        {
          id: "post-acme-2",
          network: "linkedin",
          preview:
            "Short version of today's offsite: we stopped writing quarterly OKRs. Here's what replaced them and why the team ships faster now.",
        },
        {
          id: "post-acme-3",
          network: "linkedin",
          preview:
            "Three constraints killed our first launch: scope, distribution, and onboarding. All three were visible at the offsite — and all three were missing from the retrospective doc.",
        },
        {
          id: "post-acme-4",
          network: "linkedin",
          preview:
            "Behind-the-scenes on the founder keynote — including the parts that got cut. The cuts are more instructive than the keynote itself.",
        },
      ],
      count: 4,
      open: false,
    },
  ],
  "s-riverside": [
    {
      role: "assistant",
      meta: "Archie",
      text: "Hi. Want me to compare ideas, pick the strongest one, or draft a post? You can also type a question or drop a source.",
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "Audio",
      filename: "riverside-discovery-call.mp3",
      size: "18mb",
      sourceId: "src-riv-1",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "riverside-discovery-call.mp3",
      ideas: [
        {
          id: "idea-riv-1",
          title: "Riverside's 6-week onboarding rebuild",
          body: "The arc: legacy CMS → unified Studio workflow. Three decisions that compounded, told from the customer's POV.",
        },
        {
          id: "idea-riv-2",
          title: "The metric Riverside cared about that we didn't track",
          body: "How a single discovery call reframed our success metric — and why it changed the roadmap that quarter.",
        },
        {
          id: "idea-riv-3",
          title: '"We just needed one place to start a draft."',
          body: '"We just needed one place to start a draft. Everything else followed from that."',
        },
      ],
      count: 3,
      open: false,
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "PDF",
      filename: "riverside-case-study-draft.pdf",
      size: "0.8mb",
      sourceId: "src-riv-2",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "riverside-case-study-draft.pdf",
      ideas: [
        {
          id: "idea-riv-4",
          title: "From spreadsheet chaos to one workflow — the Riverside arc",
          body: "The before/after of consolidating four tools into one. Numbers from the case study draft: 11 hours/week reclaimed.",
        },
      ],
      count: 1,
      open: false,
    },
    {
      role: "user",
      meta: "You",
      text: "Turn this into 5 customer-story posts — 4 LinkedIn, 1 X. Lead with their words.",
    },
    {
      role: "assistant",
      meta: "Archie",
      text: "Drafted 5 posts grounded in [[idea:idea-riv-1]]. Each leads with a customer quote, names the metric, and closes with a link to the case study. [[post:post-riv-3]] needs a longer LinkedIn body.",
    },
    {
      role: "assistant",
      variant: "draft",
      meta: "Archie",
      ideaTitle: "Riverside's 6-week onboarding rebuild",
      drafts: [
        {
          id: "post-riv-1",
          network: "linkedin",
          preview:
            "Riverside cut 11 hours a week off their content workflow. They didn't add tools — they removed three.",
        },
        {
          id: "post-riv-2",
          network: "linkedin",
          preview:
            '"We just needed one place to start a draft." — that line from the discovery call became the brief for the entire rebuild.',
        },
        {
          id: "post-riv-3",
          network: "linkedin",
          preview:
            "The metric Riverside cared about that we didn't track — until they told us. Sharing the reframe that flipped our roadmap.",
        },
        {
          id: "post-riv-4",
          network: "linkedin",
          preview:
            "Spreadsheet chaos → one workflow, in six weeks. The Riverside arc, told with the before/after metrics they tracked themselves.",
        },
        {
          id: "post-riv-5",
          network: "twitter",
          preview: '"We just needed one place to start a draft."',
        },
      ],
      count: 5,
      open: false,
    },
  ],
  "s-state-of-social": [
    {
      role: "assistant",
      meta: "Archie",
      text: "Hi. Want me to compare ideas, pick the strongest one, or draft a post? You can also type a question or drop a source.",
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "PDF",
      filename: "state-of-social-2026-report.pdf",
      size: "3.4mb",
      sourceId: "src-sos-1",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "state-of-social-2026-report.pdf",
      ideas: [
        {
          id: "idea-sos-1",
          title: "73% of social managers say context-switching is their #1 blocker",
          body: "Year-over-year jump in the State of Social 2026 — context-switching is now ranked above hiring and tooling cost.",
        },
        {
          id: "idea-sos-2",
          title: "The platform decline no one wants to call",
          body: "Two-year trend buried in the report: organic reach on the big-three networks is down 34% on average.",
        },
        {
          id: "idea-sos-3",
          title: "Why Gen Z marketers are leaving the funnel framework behind",
          body: "A hook framed around generational shifts the report names but doesn't unpack.",
        },
        {
          id: "idea-sos-4",
          title: "Three numbers from the 2026 report that flipped my Q3 plan",
          body: "A short-form retrospective listing three counter-intuitive findings and what I changed.",
        },
      ],
      count: 4,
      open: false,
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "Video",
      filename: "social-trends-keynote.mp4",
      size: "42mb",
      sourceId: "src-sos-2",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "social-trends-keynote.mp4",
      ideas: [
        {
          id: "idea-sos-5",
          title: '"Posting more is not strategy — it never was."',
          body: '"Posting more is not strategy — it never was. Picking the right beat is."',
        },
        {
          id: "idea-sos-6",
          title: "The one founder story we won't tell (and why)",
          body: "A meta-post about editorial restraint — when not posting is itself the brand move.",
        },
      ],
      count: 2,
      open: false,
    },
    {
      role: "user",
      meta: "You",
      text: "What's the strongest thought-leadership angle in here? Draft 2 posts.",
    },
    {
      role: "assistant",
      meta: "Archie",
      text: [
        "The strongest signal is [[idea:idea-sos-1]]: hard year-over-year delta, credible source. I drafted 2 posts:",
        "- [[post:post-sos-1]], long-form for LinkedIn",
        "- [[post:post-sos-2]], scheduled mid-week for the founder account",
      ].join("\n"),
    },
    {
      role: "assistant",
      variant: "draft",
      meta: "Archie",
      ideaTitle: "73% of social managers say context-switching is their #1 blocker",
      drafts: [
        {
          id: "post-sos-1",
          network: "linkedin",
          preview:
            "A quick operator note for B2B teams: weekly proof points build more trust than polished campaign reveals.",
        },
        {
          id: "post-sos-2",
          network: "linkedin",
          preview:
            "The one founder story we won't tell — and why editorial restraint is a better brand move than another launch anthem.",
        },
      ],
      count: 2,
      open: false,
    },
  ],
  "s-weekly-recap": [
    {
      role: "assistant",
      meta: "Archie",
      text: "Hi. Want me to compare ideas, pick the strongest one, or draft a post? You can also type a question or drop a source.",
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "PDF",
      filename: "analytics-week-12.pdf",
      size: "0.4mb",
      sourceId: "src-weekly-1",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "analytics-week-12.pdf",
      ideas: [
        {
          id: "idea-weekly-1",
          title: "What week 12 told us about Tuesday vs Thursday",
          body: "Engagement split this week ran 2.3× higher on Tuesday morning than Thursday afternoon — same length, same author.",
        },
        {
          id: "idea-weekly-2",
          title: "The post we almost skipped that pulled the week",
          body: "A short retro about the post we nearly didn't publish — and the reach numbers that came out of it.",
        },
      ],
      count: 2,
      open: false,
    },
    {
      role: "user",
      meta: "You",
      text: "Draft the recap post.",
    },
    {
      role: "assistant",
      meta: "Archie",
      text: "Drafted [[post:post-weekly-1]] from [[idea:idea-weekly-1]]. It opens with the 2.3× delta and closes on the cheapest lever most teams stop testing.",
    },
    {
      role: "assistant",
      variant: "draft",
      meta: "Archie",
      ideaTitle: "What week 12 told us about Tuesday vs Thursday",
      drafts: [
        {
          id: "post-weekly-1",
          network: "linkedin",
          preview:
            "Week 12 reach split: Tuesday morning 2.3× Thursday afternoon. Same length, same author, same hashtags.",
        },
      ],
      count: 1,
      open: false,
    },
  ],
};

// Image Generator — mocked copyService: hooks, CTAs, captions and hashtags, in the
// brand's voice (its tone, its examples' rhythm, never its "avoid" words).
//
// Contract:
//   hooks({ brand, brief, round? }) → Promise<string[3]>
//   ctas({ brand, brief, round? }) → Promise<string[3]>
//   caption({ brand, brief, network, headline }) → Promise<string>   (within the network's limit)
//   hashtags({ brand, brief, network }) → Promise<string[]>
//   promptFromImages({ colors, look }) → Promise<string>   (a style prompt read from reference images)

import { MOCK } from "../../config/mock.js?v=1829";
import { COPY_LIMITS } from "../../config/copy-limits.js?v=1829";
import { hashString, prng, shuffle } from "../../lib/prng.js?v=1829";
import { wait } from "../../lib/delegate.js?v=1829";

function delay(signal, [min, max] = MOCK.copy.delayMs) {
  return wait(min + Math.random() * (max - min), signal);
}

// The thing the post is about, as a short phrase: the headline if there is one,
// else the brief with its idea prefix ("Event: angle") and filler removed.
function subjectOf(brief) {
  const raw = String(brief?.headline || brief?.prompt || "").replace(/#\w+/g, "");
  const main = (raw.includes(":") ? raw.split(":")[0] : raw)
    .replace(/^(a|an|the|our|my)\s+/i, "")
    .replace(/\b(photo|image|picture|visual|illustration) of\s+/i, "")
    .trim();
  if (!main) return "what we do";
  const short = main.split(/\s+/).slice(0, 7).join(" ");
  return short.charAt(0).toLowerCase() + short.slice(1);
}

function scrub(text, brand) {
  let out = text;
  for (const word of brand?.voice?.avoid || []) {
    if (!word) continue;
    out = out.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "").replace(/\s{2,}/g, " ");
  }
  return out.trim();
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

const HOOKS = [
  (s) => `${cap(s)}, done properly`,
  (s) => `The story behind ${s}`,
  (s) => `What changes with ${s}`,
  (s) => `Three things nobody tells you about ${s}`,
  (s) => `${cap(s)} — this week only`,
  (s) => `We made ${s} simpler`,
  (s) => `Why ${s} matters now`,
  (s) => `${cap(s)}, in one picture`,
];

const CTAS_BY_SECTOR = {
  coffee: ["Order this week's roast", "Visit the roastery", "Find your blend", "Taste it this week"],
  finance: ["Book a 20-minute demo", "See how it works", "Start your free trial", "Talk to our team"],
  default: ["Discover more", "See how it works", "Get yours", "Learn more"],
};

/** Three hooks: two built on the subject, one taken from the brand's own voice examples. `round` varies them. */
export async function hooks({ brand, brief, round = 0 }, { signal } = {}) {
  await delay(signal);
  const rand = prng(hashString(`${brief?.prompt || ""}|${brand?.id || ""}|${round}`));
  const subject = subjectOf(brief);
  const built = shuffle(rand, HOOKS)
    .slice(0, 3)
    .map((fn) => scrub(fn(subject), brand));
  const voice = (brand?.voice?.examples || []).filter((e) => e.length <= 90);
  if (voice.length) built[2] = scrub(voice[Math.floor(rand() * voice.length)], brand);
  return built;
}

export async function ctas({ brand, round = 0 }, { signal } = {}) {
  await delay(signal);
  const list = CTAS_BY_SECTOR[brand?.sectorKey] || CTAS_BY_SECTOR.default;
  return shuffle(prng(hashString(`${brand?.id}|cta|${round}`)), list).slice(0, 3);
}

export async function hashtags({ brand, brief, network }, { signal } = {}) {
  await delay(signal);
  const limits = COPY_LIMITS[network] || COPY_LIMITS.instagram;
  const words = [
    brand?.name?.replace(/\s+/g, ""),
    ...(brief?.prompt || "").split(/\s+/).filter((w) => w.length > 4),
    ...(brand?.positioning?.objectives || []),
    ...(brand?.imageStyle?.moods || []),
  ]
    .filter(Boolean)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 2);
  const unique = [...new Set(words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)))];
  const count = Math.max(limits.hashtags.min, Math.min(limits.hashtags.max, unique.length));
  return unique.slice(0, count).map((w) => `#${w}`);
}

export async function caption({ brand, brief, network, headline }, { signal } = {}) {
  await delay(signal);
  const limits = COPY_LIMITS[network] || COPY_LIMITS.instagram;
  const example = brand?.voice?.examples?.[hashString(network) % Math.max(1, brand?.voice?.examples?.length || 1)];
  const subject = subjectOf(brief);
  const cta = (CTAS_BY_SECTOR[brand?.sectorKey] || CTAS_BY_SECTOR.default)[0];
  const byNetwork = {
    x: [headline || `${subject}.`, cta + "."],
    instagram: [headline || subject, example, `${cta} — link in bio.`],
    facebook: [headline || subject, example, `${cta}.`],
    linkedin: [headline || subject, example, brand?.positioning?.summary?.split(/(?<=\.)\s/)[0], `${cta}.`],
  };
  let text = scrub(
    (byNetwork[network] || byNetwork.facebook).filter(Boolean).join(network === "x" ? " " : "\n\n"),
    brand,
  );
  if (text.length > limits.maxChars) text = text.slice(0, limits.maxChars - 1).trimEnd() + "…";
  return text;
}

/**
 * An image brief from a post's text — what the post is about, as a picture
 * (the draft's image studio: "Suggest from the post"). The mock keeps the
 * post's first real sentence, drops its hashtags / links / emoji, and turns it
 * into a scene in the brand's moods.
 */
// A post is not a picture: the suggestion names a SCENE the post evokes, never
// restates its hook. Keyword themes first, the brand's products as the fallback
// subject, the brand's moods as the treatment.
const POST_SCENES = [
  [
    /\b(plan|objective|goal|okr|target|roadmap|strategy)\w*/i,
    "a single target pinned on a clean wall planner, one marker circled",
  ],
  [
    /\b(metric|kpi|data|signal|dashboard|report|analytics|number)\w*/i,
    "one bold gauge on a minimal dashboard, everything else quiet",
  ],
  [/\b(launch|release|announce|new|introduc)\w*/i, "the product on a plinth under a single spotlight, as if unveiled"],
  [
    /\b(team|hire|hiring|culture|people|together)\w*/i,
    "a small team around one table, mid-conversation, natural light",
  ],
  [
    /\b(event|webinar|conference|meetup|summit)\w*/i,
    "an empty stage with one chair and a warm backlight, just before it starts",
  ],
  [/\b(tip|how to|guide|lesson|mistake|learn)\w*/i, "a notebook open on a desk with three short handwritten points"],
  [/\b(customer|client|story|case)\w*/i, "a customer's hands using the product at their own desk"],
  [/\b(coffee|morning|ritual|break)\w*/i, "a steaming mug on a sunlit desk at the start of the day"],
];

export async function promptFromPost({ brand, text }, { signal } = {}) {
  await delay(signal, MOCK.suggest.delayMs);
  const clean = String(text || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/#\w+/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const scene =
    POST_SCENES.find(([re]) => re.test(clean))?.[1] ||
    (brand?.products?.[0]?.name
      ? `the ${brand.products[0].name} in a simple, uncluttered setting`
      : "one simple object that stands for the idea, on a plain background");
  const moods = (brand?.imageStyle?.moods || []).slice(0, 2).join(" and ");
  return `${scene[0].toUpperCase()}${scene.slice(1)}${moods ? `, ${moods}` : ""}. No text in the image.`;
}

// A headline for the image, lifted FROM the post: its clauses of three to eight
// words, the post's own opening first. `round` walks the candidates, so asking
// again offers the next line instead of the same one.
export async function headlineFromPost({ text, round = 0 }, { signal } = {}) {
  await delay(signal, MOCK.suggest.delayMs);
  const clean = String(text || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/#\w+/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const clauses = clean
    .split(/\s*(?:[,;:.!?…]|\s[—–-]\s)\s*/)
    .map((c) => c.replace(/^(and|but|so|or|unless|because)\s+/i, "").trim())
    .filter((c) => {
      const n = c.split(" ").length;
      return n >= 3 && n <= 8;
    });
  const unique = [...new Set(clauses)];
  if (!unique.length) {
    const words = clean.split(" ").slice(0, 6).join(" ");
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
  }
  const line = unique[round % unique.length];
  return line.charAt(0).toUpperCase() + line.slice(1);
}

// A colour, in words: its hue and how light it is — what a model would say it sees.
function colourWord(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  if (Number.isNaN(n)) return "";
  const r = (n >> 16) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2,
    d = max - min;
  if (d < 0.08) return l > 0.85 ? "white" : l < 0.18 ? "black" : l > 0.6 ? "light grey" : "grey";
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const hue =
    h < 15 || h >= 345
      ? "red"
      : h < 40
        ? "orange"
        : h < 65
          ? "yellow"
          : h < 160
            ? "green"
            : h < 200
              ? "teal"
              : h < 255
                ? "blue"
                : h < 290
                  ? "purple"
                  : "pink";
  return l > 0.72 ? `pale ${hue}` : l < 0.3 ? `deep ${hue}` : hue;
}

/** A style prompt read from the reference images: their look (the preset their
 * colours point to) and their palette, in words. As slow as the real call. */
export async function promptFromImages({ colors = [], look = null }, { signal } = {}) {
  await delay(signal, MOCK.suggest.delayMs);
  const words = [...new Set(colors.map(colourWord).filter(Boolean))].slice(0, 3);
  const base = (look?.description || "A consistent look across every image").replace(/\.$/, "");
  const palette = words.length ? ` A palette of ${words.join(", ").replace(/, ([^,]*)$/, " and $1")}.` : "";
  return `${base}.${palette} Soft, even light; one clear subject; an uncluttered background.`;
}

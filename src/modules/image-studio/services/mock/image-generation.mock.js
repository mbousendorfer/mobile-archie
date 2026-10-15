// Image Generator — mocked imageGenerationService.
//
// Contract (what a real implementation must honour):
//   generate(request, { signal }) → Promise<Variation[]>
//     request: { brief, brand, style, product?, format, textMode, text? }
//     Variation: { id, seed, bgSeed, subjectSeed, prompt }
//   similar(variation, request, { signal }) → Promise<Variation[]>   — close variations
//   regenerate(variation, part, request, { signal }) → Promise<Variation>
//     part: "background" | "subject" | "all"
//   Rejects with { code: "generation_failed" } on failure; AbortError on cancel.
//
// The mock returns SEEDS, not pixels: render/ draws them locally, on-style and
// on-palette, so the same variation always looks the same.

import { MOCK } from "../../config/mock.js?v=1791";
import { createVariation } from "../../model/schema.js?v=1791";
import { randomSeed } from "../../lib/prng.js?v=1791";
import { wait } from "../../lib/delegate.js?v=1791";
import { buildPrompt } from "../prompt.js?v=1791";

function delay(signal) {
  const [min, max] = MOCK.generation.delayMs;
  return wait(min + Math.random() * (max - min), signal);
}

function maybeFail(request) {
  const prompt = request?.brief?.prompt || "";
  if (prompt.includes(MOCK.generation.failKeyword) || Math.random() < MOCK.generation.failRate) {
    const error = new Error("Generation failed");
    error.code = "generation_failed";
    throw error;
  }
}

function variation(seed, request, extra = {}) {
  return createVariation(seed, {
    bgSeed: seed ^ 0x5bd1e995,
    subjectSeed: seed ^ 0x27d4eb2d,
    prompt: buildPrompt(request),
    ...extra,
  });
}

export async function generate(request, { signal } = {}) {
  await delay(signal);
  maybeFail(request);
  return Array.from({ length: request.count || MOCK.generation.variations }, () => variation(randomSeed(), request));
}

export async function similar(base, request, { signal } = {}) {
  await delay(signal);
  maybeFail(request);
  // Same background family and subject placement, small jitter: seeds near the base.
  return Array.from({ length: request.count || MOCK.generation.variations }, (_, i) =>
    variation(base.seed + (i + 1) * 7, request, { bgSeed: base.bgSeed + i + 1, subjectSeed: base.subjectSeed }),
  );
}

export async function regenerate(base, part, request, { signal } = {}) {
  await delay(signal);
  maybeFail(request);
  const fresh = randomSeed();
  if (part === "background") return { ...base, bgSeed: fresh, prompt: buildPrompt(request) };
  if (part === "subject") return { ...base, subjectSeed: fresh, prompt: buildPrompt(request) };
  return variation(fresh, request);
}

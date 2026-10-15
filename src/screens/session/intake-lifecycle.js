// Intake-turn lifecycle: loading → ready.
//
// Every new source landing in the session's sources-stream gets a
// matching "source-intake" turn posted to the assistant thread. The
// turn starts in loading state (Processing badge); when the source
// flips to Processed in sources-stream, we mark the turn ready so the
// chip switches to "Processed · N ideas".
//
// Pulled out of session.js (Lot H+). The session view owns when to
// kick the lifecycle off and when to tear it down — this module is
// just the subscription + bookkeeping.
//
// Public API:
//   startIntakeLifecycle(sessionId, { onSourcesChange }) → unsubscribe
//
// The `onSourcesChange` callback fires on every sources-stream notify
// so the caller can repaint the thread (intake turns derive
// ideaCount/status live from sources-stream).

import { subscribeSources, getSources as getStreamSources } from "../../sources-stream.js?v=1756";
import { getThread, postSourceIntake, markSourceIntakeReady } from "../../assistant.js?v=1756";

// The intake turn always shows "Uploading" for at least this long, even when
// the source is ready sooner — an upload that lands instantly reads as fake.
// A video, the heavy one, holds longer.
const MIN_LOADING_MS = 3000;
const MIN_LOADING_MS_VIDEO = 6000;

export function startIntakeLifecycle(sessionId, { onSourcesChange, onVideoReady, onSourceReady } = {}) {
  // seenSourceIds is a snapshot baseline of the session's sources at
  // mount time. Any sourceId that appears AFTER this baseline counts
  // as a "new upload" — we post a loading intake turn for it. When the
  // source flips to Processed, the turn flips to ready.
  //
  // sentReadyForSourceIds dedupes the markReady call: once a turn flips
  // to ready, we don't re-fire on every notify.
  const seenSourceIds = new Set(getStreamSources(sessionId).map((s) => s.id));
  const sentReadyForSourceIds = new Set();
  // Dedupe the per-video "what to do?" choice so it posts once per source.
  const askedVideoChoiceForSourceIds = new Set();
  // sourceId → when its loading turn was posted, for the minimum loading time.
  const postedAt = new Map();
  let disposed = false;
  let latest = [];

  const flipReady = (sources) => {
    const thread = getThread(sessionId);
    for (const msg of thread) {
      if (msg.role !== "source-intake") continue;
      if (!msg.sourceId || msg.status === "ready") continue;
      if (sentReadyForSourceIds.has(msg.sourceId)) continue;
      const src = sources.find((s) => s.id === msg.sourceId);
      if (!src || src.status !== "Processed") continue;
      const min = src.kind === "Video" ? MIN_LOADING_MS_VIDEO : MIN_LOADING_MS;
      const wait = (postedAt.get(src.id) ?? 0) + min - Date.now();
      if (wait > 0) {
        setTimeout(() => !disposed && flipReady(latest), wait);
        continue;
      }
      sentReadyForSourceIds.add(msg.sourceId);
      markSourceIntakeReady(sessionId, msg.sourceId);

      // A freshly-processed video defers its extraction — let the session
      // ask what to do with it (via the quick picker) before producing
      // anything. The session owns the picker + branch handlers.
      if (src.kind === "Video" && !askedVideoChoiceForSourceIds.has(src.id)) {
        askedVideoChoiceForSourceIds.add(src.id);
        onVideoReady?.(src.id, src.filename);
      } else if (src.kind !== "Video") {
        // Non-video sources extract their ideas during processing — surface
        // the "N ideas ready" composer bar now that they've landed.
        onSourceReady?.(src.id, src);
      }
    }
  };

  const unsubscribe = subscribeSources(sessionId, (sources) => {
    latest = sources;
    // Post intake turns for any new source ids.
    for (const src of sources) {
      if (seenSourceIds.has(src.id)) continue;
      seenSourceIds.add(src.id);
      postedAt.set(src.id, Date.now());
      // Every new source in this session is a fresh upload (no library
      // re-attach in the per-session model) → post a loading intake.
      postSourceIntake(sessionId, {
        kind: src.kind,
        filename: src.filename,
        sourceId: src.id,
        status: "loading",
      });
    }

    // Repaint the thread on every source flip — intake turns derive
    // ideaCount + status live from sources-stream, so re-rendering is
    // how "Processed · N ideas" lands.
    onSourcesChange?.();

    // Flip pending intake turns to ready as their source completes.
    flipReady(sources);
  });
  return () => {
    disposed = true;
    unsubscribe();
  };
}

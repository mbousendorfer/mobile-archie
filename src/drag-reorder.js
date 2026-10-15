// Drag-to-reorder by a grip — the app's one way to reorder a list (born in the
// schedule modal, shared since 2026-10-15). Pointer based, not native DnD: the
// grabbed item lifts and follows the pointer 1:1, the others slide to open the
// gap, the item settles into it, then the host commits and re-renders.
//
// Markup: a list `.app-reorder`, its items `.app-reorder__item`, and inside
// each item a `.app-reorder__grip` (the only handle — the rest of the item
// stays clickable). Styles: styles/components/drag-reorder.css.
//
// bindReorder(root, done) — delegated on `root`, so it survives re-renders.
//   done(from, to) runs once the item has settled (to === from when it didn't
//   move, or on cancel). The host reorders its state and re-renders: that is
//   what clears the inline transforms.

export function bindReorder(root, done) {
  let drag = null;

  root.addEventListener("pointerdown", (event) => {
    if (event.button) return; // primary button / touch only
    const grip = event.target.closest(".app-reorder__grip");
    const item = grip?.closest(".app-reorder__item");
    const list = item?.closest(".app-reorder");
    if (!list) return;
    const items = Array.from(list.querySelectorAll(".app-reorder__item"));
    if (items.length < 2) return;
    event.preventDefault();
    const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
    const fromIndex = items.indexOf(item);
    drag = {
      item,
      list,
      items,
      fromIndex,
      toIndex: fromIndex,
      startY: event.clientY,
      step: item.getBoundingClientRect().height + gap,
      pointerId: event.pointerId,
    };
    try {
      item.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    list.classList.add("is-reordering");
    item.classList.add("is-dragging");
    item.style.transition = "none";
    item.style.transform = "translateY(0) scale(1.02)";
  });

  root.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dy = event.clientY - drag.startY;
    drag.item.style.transform = `translateY(${dy}px) scale(1.02)`;
    const toIndex = Math.max(0, Math.min(drag.items.length - 1, drag.fromIndex + Math.round(dy / drag.step)));
    if (toIndex === drag.toIndex) return;
    drag.toIndex = toIndex;
    // Slide every other item to open the gap at toIndex.
    drag.items.forEach((el, i) => {
      if (i === drag.fromIndex) return;
      let shift = 0;
      if (drag.fromIndex < toIndex && i > drag.fromIndex && i <= toIndex) shift = -drag.step;
      else if (drag.fromIndex > toIndex && i >= toIndex && i < drag.fromIndex) shift = drag.step;
      el.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  });

  root.addEventListener("pointerup", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    try {
      d.item.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    // Settle into the gap, then hand over once.
    d.item.style.transition = "transform 160ms var(--app-ease-standard, ease)";
    d.item.style.transform = `translateY(${(d.toIndex - d.fromIndex) * d.step}px) scale(1)`;
    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      d.item.removeEventListener("transitionend", commit);
      done(d.fromIndex, d.toIndex);
    };
    d.item.addEventListener("transitionend", commit);
    setTimeout(commit, 220); // if transitionend doesn't fire
  });

  root.addEventListener("pointercancel", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const from = drag.fromIndex;
    drag = null;
    done(from, from);
  });
}

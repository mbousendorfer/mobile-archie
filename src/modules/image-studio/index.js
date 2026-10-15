// Image Generator — the module's entry point, behind the `sexySquirrel` flag.
// Three doors into Archie, and only three:
//   · openDraftStudio — the draft's image studio (right panel): where images
//     are generated, and the only place they are;
//   · renderImages* / handlePlaybookImagesClick — the Playbook's Images tab:
//     the brand's styles, reference images and Generate image settings;
//     renderPlaybookStyles / handlePlaybookStylesClick — the styles row of the
//     older fiche (playbook2 OFF) — both through playbook-brand-kit.js;
//   · ROUTES — the style creator, a page reached from that section.
// There is no Image Generator section any more: no History, no editor.
//
// What the module imports from Archie: the shell (router, flags, topbar) and,
// through state/playbook-brand.js only, the Playbooks — the brand IS the
// Playbook. See docs/audits/image-studio-integration.md.

import { navigate } from "../../router.js?v=1856";
import { renderTopbar } from "../../components/topbar.js?v=1856";
import { delegate, disposer } from "./lib/delegate.js?v=1856";
import { installMenus } from "./ui/menu.js?v=1856";
import { closeAllDialogs } from "./ui/dialog.js?v=1856";
import * as styleCreator from "./views/style-creator.js?v=1856";

/**
 * Wraps a view into a router handler: topbar, seed, the delegation
 * every view shares (navigation, menus, the brand picker), and a cleanup that
 * disposes whatever the view added. A view is `mount(target, params, ctx) → cleanup?`.
 */
function screen(mount) {
  return (params, target) => {
    renderTopbar();
    const bag = disposer();
    const ctx = { navigate, dispose: bag };
    bag.add(installMenus(target));
    bag.add(
      delegate(target, "click", "[data-imst-nav]", (event, el) => {
        event.preventDefault();
        navigate(el.dataset.imstNav);
      }),
    );
    bag.add(mount(target, params, ctx));
    bag.add(closeAllDialogs);
    return () => bag.run();
  };
}

export const ROUTES = Object.freeze([
  // Before /:styleId — route() takes the first match, and "new" would pass for an id.
  { pattern: "/playbook/:id/styles/new", handler: screen(styleCreator.mount) },
  { pattern: "/playbook/:id/styles/:styleId", handler: screen(styleCreator.mount) },
]);

export { openDraftStudio } from "./ui/draft-studio.js?v=1856";
export {
  defaultQuickLook,
  generateQuickImage,
  quickImageChoices,
  quickImagePreset,
  suggestImageSubject,
} from "./quick-image.js?v=1856";
export { renderPlaybookStyles, handlePlaybookStylesClick } from "./views/playbook-styles.js?v=1856";
export {
  renderImagesStyles,
  renderImagesReferences,
  renderImagesGenerate,
  handlePlaybookImagesClick,
} from "./views/playbook-images.js?v=1856";
export { shapesFor } from "./config/formats.js?v=1856";

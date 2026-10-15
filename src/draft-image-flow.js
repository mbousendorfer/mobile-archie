// "Generate an image" on a draft: one image, straight into the slot — nothing
// asked (2026-10-08, on request: "enlève les questions… remplace ça par
// l'animation de loading"). It used to ask up to three Quickpickers in the chat
// (style, shape, text) and a "What next?"; the click now goes straight to the
// image loader in the slot, which narrates what it's doing.
//
// What it uses, without asking — the same choices the slot's caption shows:
//   style    the Playbook's default look (Playbook › Image generation: a style
//            or a reference image), else its first style, else a preset
//   shape    the network's preferred one (already first)
//   text     none — it stays an editable layer, added in the studio
//   subject  read from the post, like the studio's "Suggest from the post"
//
// The read from the post is as slow as the real call (4–8 s): the loader
// starts at the click and its first stage is exactly that. No chat message: the
// image appearing in the slot is the feedback; a failure says so in a toast.

import { showToast } from "./components/toast.js?v=1849";
import { attachImageToDraft, getPosts, updatePostContent } from "./posts-store.js?v=1849";
import { getSessionById } from "./sessions-store.js?v=1849";
import {
  defaultQuickLook,
  generateQuickImage,
  quickImageChoices,
  suggestImageSubject,
} from "./modules/image-studio/index.js?v=1849";

const FALLBACK_SUBJECT = "One simple object that stands for the idea, on a plain background. No text in the image.";

const postText = (post) => (Array.isArray(post.text) ? post.text.join("\n") : post.text || "");

/**
 * @param {string} sessionId
 * @param {string} postId
 * @param {{ repaint: () => void }} host — the drafts panel: how to redraw it while it waits
 */
export async function startDraftImageFlow(sessionId, postId, { repaint }) {
  const post = getPosts(sessionId).find((p) => p.id === postId);
  if (!post) return;
  const brandId = getSessionById(sessionId)?.contextId || null;
  const choices = quickImageChoices({ brandId, network: post.network });
  if (!choices || !choices.styles.length) {
    showToast("This chat has no Playbook, so I don't know whose image to make.", { variant: "error" });
    return;
  }
  updatePostContent(sessionId, postId, { isGeneratingImage: true, imageGeneratingSince: Date.now() });
  repaint();
  const done = (patch) => {
    updatePostContent(sessionId, postId, { isGeneratingImage: false, ...patch });
    repaint();
  };
  try {
    const [look, prompt] = await Promise.all([
      defaultQuickLook(brandId),
      suggestImageSubject({ brandId, text: postText(post) }).catch(() => FALLBACK_SUBJECT),
    ]);
    const url = await generateQuickImage({
      brandId,
      prompt,
      styleId: (look || choices.styles[0]).id,
      formatId: choices.shapes[0].formatId,
    });
    // The draft may have been deleted while this ran.
    if (!getPosts(sessionId).some((p) => p.id === postId)) return;
    attachImageToDraft(sessionId, postId, url);
    done({ imageRevealAt: Date.now() });
  } catch {
    done({});
    showToast("That image didn't come out.", {
      variant: "error",
      action: { label: "Try again", onClick: () => startDraftImageFlow(sessionId, postId, { repaint }) },
    });
  }
}

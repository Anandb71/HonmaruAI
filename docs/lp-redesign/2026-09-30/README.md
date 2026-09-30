# Honmaru AI landing page: motion redesign

Design direction: a quiet center for decisions. Dia's large product-led storytelling, interactive use cases, trust section and closing CTA informed the hierarchy; the Honmaru identity, product UI, self-hosted fonts, store badges and five locales remain the source of truth.

## Self-review and improvements

| Before | After | Why |
| --- | --- | --- |
| Thin orbital backdrop with uniformly weighted sections | Layered violet architectural portal, restrained atmospheric cards, large typography, alternating feature canvases | Give the brand a distinct visual idea and create a clearer page rhythm |
| Scroll-only story | Scroll plus four keyboard-accessible chapter buttons, with an active step indicator | Let visitors control the pace and revisit a product moment |
| Mobile captions over a detailed background | Translucent caption surface with measured space below the device | Maintain reading contrast through the complete sequence |
| Scroll invitation could stop in a caption fade | Deterministic target at 20% of the sequence; shorter crossfades | Arrive at a fully readable first chapter |
| Decorative loops could resume while offscreen | Visibility-aware canvas and language-card updates | Reduce unnecessary work |
| Reduced-motion mode still used the pinned scroll timeline | Static hero and fully revealed brand explanation | Keep the page useful without spatial motion |
| Language changes left social/canonical metadata behind | Metadata updates with the active locale | Keep navigation and page metadata consistent |

## Verification

- `node lp/build.mjs /tmp/honmaru-lp-preview https://honmaruai.com https://app.honmaruai.com` passed for all five languages.
- `node --test lp/worker.test.mjs`: 8/8 passed.
- `node --check lp/main.js` and `git diff --check` passed.
- In-app browser: 320, 390, 768, 1280px × ja/en/es/fr/de × light/dark = 40 checks; no document or navigation horizontal overflow.
- Screenshot reviews: desktop hero in both appearances; 390px hero and recording chapter; feature section; 320px German trust section.
- Routing demo: design approval request reached Dana with a localized explanation.
- Scroll invitation reached an opaque first caption. Recording chapter showed the card swiped away and the GitHub banner at opacity 1.
- 390px chapter bounds: device y=83.9–589.1; caption panel y=601.6–826.6 in an 844px viewport.
- Mobile menu open/Escape closed; keyboard language switch updated language, title and canonical URL, then closed the menu.
- No captured browser console errors during the interaction checks.

Reduced-motion behavior was reviewed in source, but OS-level reduced-motion emulation, physical-device Safari, performance profiling and formal award evaluation were not performed. The visual ambition is an award-quality site; this is not a claim of certification or guaranteed award results.

## Preview

```sh
node lp/build.mjs /tmp/honmaru-lp-preview https://honmaruai.com https://app.honmaruai.com
python3 -m http.server 4178 --directory /tmp/honmaru-lp-preview
```

Open `http://localhost:4178/ja/`. Production is unchanged until this branch is merged and the existing LP deployment workflow succeeds.

# Inner Keep edition — review and iteration

## Outcome
A full-bleed commissioned AI artwork establishes the meaning of Honmaru before the scroll sequence resolves into the existing product. A new local decision sandbox lets visitors approve, decline, drag, and retry. The five feature rows become a selectable explorer on desktop and an accordion on mobile. Existing App Store/Web destinations, locale routing, security copy, product UI, and download availability are preserved.

The reference direction is Dia's clear product storytelling and spacious visual pacing; the artwork, narrative, interactions, and code are original to Honmaru. Awards are an ambition, not an externally verified status. No award score or guaranteed award claim is made.

## Review loop

1. **Distinctiveness / hierarchy**: replaced the previous pale CSS arch and split hero with a custom architectural inner keep, green/ivory palette, centered typography, and product preview cards. Inspected `iteration-1-hero.png`. Found description text over detailed foliage.
2. **Readability / rhythm**: moved the scene lower and strengthened the sky wash; retained a readable CTA area. Inspected desktop/mobile hero, pinned device sequence, decision demo, feature explorer, keep story and final CTA in the browser. Tightened the page by replacing five large alternating feature rows with a single explorable section.
3. **Interaction / responsive**: exercised approve, decline, retry, actual pointer drag, and keyboard Enter; checked result announcement, focus return and hidden completed card. A 40-case matrix (5 languages × 4 widths × 2 themes) found German action-label overflow at 320px. Reduced narrow-width padding/gaps and rechecked both themes (`layout-recheck.json`: no overflow). Mobile feature selection now brings the selected row below the fixed navigation.
4. **Performance / accessibility**: compressed the original artwork to 239,060 bytes; a separate mobile image is 58,380 bytes. Added responsive image selection, static-asset routing and caching. Scroll updates reuse unchanged progress and word-highlight state. Reduced-motion CSS/JS provides a static hero, readable story and immediate demo states; implementation reviewed, OS media-preference behavior not emulated in this run. Screen-reader copy for the character reveal remains a single sentence, while decorative characters are hidden.

## Validation
- `node --check lp/main.js`: passed.
- `node --test lp/worker.test.mjs`: 8/8 passed.
- `node lp/build.mjs /tmp/honmaru-lp-preview https://honmaruai.com https://app.honmaruai.com`: all 5 locales built, no missing translation keys.
- Duplicate HTML IDs: none in all 5 generated pages.
- Browser console: no errors observed.
- Layout matrix: 320, 390, 768, 1280px; Japanese, English, Spanish, French, German; both themes. No document/nav/hero overflow or broken images. The initial 320px German demo overflow is preserved in the initial evidence and resolved in the recheck.
- Actual UI verification: scroll entry; product chapters; decision approve/decline/reset and drag; keyboard activation/focus; desktop/mobile feature selection; light/dark download section.
- Browser screenshots are visual evidence, not physical-device or field-performance qualification. Core Web Vitals and actual award-jury assessment are not claimed.

## Artwork provenance
Generated with the built-in ImageGen tool (no stock artwork or reference-site asset copied). Final project assets:
- `lp/art/inner-keep.webp`
- `lp/art/inner-keep-mobile.webp`

Prompt: cinematic photoreal architectural landscape for Honmaru AI, a calm Japanese decision-making product; a monumental low continuous circular ivory travertine courtyard on a green hillside, one narrow gateway and a mature Japanese pine at its center; pale morning sky, mountain haze, tactile stone, subtle violet shadows, medium-format editorial photography, lower-frame architecture and generous upper negative space; no people, text, logo, UI, neon, spaceship or floating portal. The source was compressed with cwebp for delivery.

Production publication is verified separately via the deployment workflow and live domain after merge.

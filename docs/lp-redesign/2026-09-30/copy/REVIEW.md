# Copy refinement

The user approved the visual direction and asked for clearer, more polished, AI-native copy. The Japanese page was rewritten around one proposition: **AIが動く。あなたが決める。** The supporting line explains the mechanism: the user's AI reads the request, finds the owner, and hands it to the other person's AI; the human receives one decision card.

## Editorial changes
- Short headlines carry one idea; body copy explains the actual behavior.
- Replaced broad promises such as “everything takes care of itself,” “before your thumb leaves the glass,” guaranteed delivery, and the one-minute onboarding claim with specific, supported behavior.
- Removed implementation jargon (“relay,” “org graph,” “trust boundary”) from Japanese marketing copy while keeping access requirements accurate.
- Rewrote the story, scroll captions, demo instructions/results, features, security section and final CTA. Aligned the principal English copy with the same narrative. Other locales retain their existing localized copy.
- Retained the existing visual direction. Adjusted only Japanese mobile and English desktop headline sizing to keep intentional line breaks.

## Validation
- Japanese and English at 320/390/768/1280px: no document, hero or demo overflow. See layout.json.
- Checked the Japanese hero and decision-step caption in the browser, then shortened the decision explanation to improve breathing room.
- All 5 locale builds passed; Worker tests 8/8 passed.

## Production cache correction
Live testing after the design deployment found that a returning browser retained the previous unversioned main.js. It rendered the new HTML but had no new demo event handlers. The build now adds each minified script's SHA-256 content prefix to its URL. Both script URLs are verified against their emitted content in all 5 locale pages. The same previously cached browser is used for the post-deployment regression check.

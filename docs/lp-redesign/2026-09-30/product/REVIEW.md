# Current product materials — 2026-09-30

Reviewed against AppShell.swift, AppTabBar.swift, FeedView.swift,
DecisionCardView.swift and web-react/src/components/Inbox.tsx at main 2910f19.
These remain localized animated illustrations using fictional content, not
screenshots or an authenticated product session.

| Before | After | Why |
| --- | --- | --- |
| Old Home / plus / You navigation | Home / Chat / You glass capsule and separate compose control | Matches current AppTabBar |
| No AI prompt | Persistent prompt with plus, microphone and disabled send appearance | Matches current AppShell |
| Workspace text and global two-priority legend | Workspace mark, avatar and per-card priority | Matches current FeedView and DecisionCardView |
| Oversized card text and neon outline | Current typography hierarchy, original-request affordance, content-sized card, restrained edge light | More faithful product rendering |
| Decorative business columns | Search, business filters, waiting and decided inbox rows | Represents the current web inbox structure |
| Old pages.dev notification origin | app.honmaruai.com | Current public web origin |
| Tilted GitHub card | Level card with softer depth | Consistent material treatment |

Validation: five-locale static build; JS syntax; 8 worker tests; diff check.
Browser: Japanese and German at 320/390/768/1280 px, no horizontal overflow
and no clipped phone card content. Japanese mobile light/dark reviewed.
Story step 4 reaches second card and count 2. Browser error log empty.
Existing brand icon matches current AppIcon; castle art retained.

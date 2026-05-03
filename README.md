# Japan Memory Lane

Japan Memory Lane is a quiet static mock for collecting small memories of Japan as vertical poems.

This version is not a finished product. It is a front-end mock only:

- No AI connection
- No persistent upload storage
- No login
- No social sharing
- No sound or decorative effects

## Current State

The site is designed as a mobile-first tanzaku experience. Each screen holds one quiet memory: a photo, a vertical Japanese poem, and a small English poem.

It is intended for temporary deployment on Cloudflare Pages as a static site.

## Version Notes

- v0.1: First single tanzaku UI mock with one quiet rain-window memory.
- v0.2: Added five tanzaku memories and vertical scroll-snap paging.
- v0.3: Adjusted spacing, quietness, English text weight, current-position display, and subtle opacity fade-in.
- v0.4: Added public-facing metadata, README, and a temporary favicon for static deployment.
- v0.5: Reduced scroll flicker by preventing repeated image fade triggers.
- v0.6: Added a quiet local photo-selection mock for the first tanzaku.
- v0.7: Added temporary predefined poem switching after photo selection.
- v0.8: Added a pause so poems appear after the selected photo.
- v0.9: Fixed the future AI poem-generation rules in `AI_GENERATION_RULES.md`.
- v1.0: Defined the future AI API connection behavior in `AI_CONNECTION_SPEC.md`.
- v1.1: Added a minimal Cloudflare Pages Function at `functions/api/poem.js` that returns fixed JSON.
- v1.3: Connected `functions/api/poem.js` to the OpenAI Responses API through Cloudflare environment variables.

## Thought

Japan Memory Lane is not a tourism guide, social feed, or AI tool interface. It is a narrow, quiet lane for small remembered moments: photographs, vertical Japanese words, small English echoes, and enough empty space to breathe.

## AI Generation Rules

AI connection is implemented server-side through Cloudflare Pages Functions.

- Writing rules are documented in `AI_GENERATION_RULES.md`.
- API connection behavior is documented in `AI_CONNECTION_SPEC.md`.

Required Cloudflare environment variables:

- `OPENAI_API_KEY`: OpenAI API key used only by `functions/api/poem.js`.
- `OPENAI_MODEL`: Optional model override. Defaults to `gpt-4o-mini`.

Do not commit `.env` files or API keys to GitHub.

## Deploy

Cloudflare Pages can serve this folder directly as a static site.

Expected public files:

- `index.html`
- `style.css`
- `main.js`
- `favicon.svg`
- `assets/`
　

# Japan Memory Lane

Japan Memory Lane is a quiet static mock for collecting small memories of Japan as vertical poems.

This version is not a finished product:

- The front end is static.
- AI poem generation runs only through Cloudflare Pages Functions.
- There is no persistent upload storage.
- There is no login.
- There is no social sharing.
- There is no sound or decorative effect.

## Current State

The site is designed as a mobile-first tanzaku experience. Each screen holds one quiet memory: a photo, a vertical Japanese poem, and a small English poem.

It is intended for temporary deployment on Cloudflare Pages.

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
- v1.5: Strengthened image-aware generation so the model uses one visible detail from the uploaded photo instead of generic quiet phrasing.
- v1.6: Removed the old fixed fallback poem and added trace logs for API output, parsed poems, frontend JSON, and rendered text.
- v1.7: Split the loading poem from fallback so the waiting state reads as quiet space, not failure.
- v1.8: Clarified GitHub auto deploy, added source logs for API versus fallback, and softened the waiting text animation.

## Thought

Japan Memory Lane is not a tourism guide, social feed, or AI tool interface. It is a narrow, quiet lane for small remembered moments: photographs, vertical Japanese words, small English echoes, and enough empty space to breathe.

## AI Generation Rules

AI connection is implemented server-side through Cloudflare Pages Functions.

- Writing rules are documented in `AI_GENERATION_RULES.md`.
- API connection behavior is documented in `AI_CONNECTION_SPEC.md`.
- Uploaded images are read from multipart form data, converted to a base64 data URL, and sent to OpenAI as an `input_image` from `functions/api/poem.js`.
- Function logs include image type, image bytes, OpenAI status, raw output head, poem lengths, mood tags, and `source` values for API/fallback tracing. API keys, full base64 strings, and image bodies must never be logged.

Required Cloudflare environment variables:

- `OPENAI_API_KEY`: OpenAI API key used only by `functions/api/poem.js`.
- `OPENAI_MODEL`: Optional model override. Defaults to `gpt-4o-mini`.

Do not commit `.env` files or API keys to GitHub.

## Deploy

Cloudflare Pages can serve this folder directly as a static site with Pages Functions.

Production deployment should normally happen through GitHub push auto deploy.

Cloudflare Pages must have Git repository connection enabled for this to work. The connected repository should be the GitHub repository for this project, and pushes to the production branch should trigger Cloudflare Pages builds.

Cloudflare Pages settings:

- Build command: none
- Build output directory: `/` or `.`
- Functions directory: `functions/` at the project root

Use manual deploy only when an immediate manual reflection is needed:

```bash
npx wrangler pages deploy . --project-name japanmemorylane-site --branch main
```

Do not use `npx wrangler deploy` for this project. That command deploys a Worker and will not enable the `functions/api/poem.js` Pages Functions route.

Expected public files:

- `index.html`
- `style.css`
- `main.js`
- `favicon.svg`
- `assets/`
- `functions/api/poem.js`
- `_routes.json`

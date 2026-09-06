# Japan Memory Lane AI Connection Spec

Current implementation: v2.26 Quiet Reliability Core.
Originally drafted for v1.0; this document now describes the implemented connection. README is the development entry point; SITE_SPEC.md covers the complete journey and AI_GENERATION_RULES.md covers writing.

## Architecture

The static frontend lives in public/. Cloudflare Pages Functions handles POST /api/poem and calls the OpenAI Responses API with an image data URL and strict JSON Schema. OPENAI_API_KEY is read only on the server; OPENAI_MODEL is optional. store: false remains enabled. The frontend never contacts OpenAI directly. /api/journey is not used by the current frontend.

## Seven-card flow

1. Select seven browser-decodable photos in the gate. Invalid files do not count; valid partial selections stay.
2. Decode sequentially and optimize once: JPEG, maximum long side 1280px, quality 0.72, then 0.66 / 0.60 only above 1MB. Each decode/encode has a 12000ms bound. Reuse the optimized File for sending, display, and export. An encoding-only failure may display the decoded original with a local fallback poem.
3. Show 巡りの前 / before the path. Back and Escape remain usable; the lane is inert.
4. Start seven isolated /api/poem requests 1500ms apart.
5. Hold completed poems internally. Each attempt times out after 16000ms. Retry a transient failure at most once after 800ms, only if at least 3000ms remains after that delay.
6. At the 30000ms generation deadline abort unfinished work, retaining completed cards and filling only unfinished cards with fallback.
7. Once every card settles, compute heat-to-calm order, create cards in that order, and enter the lane. Never change content/order after entry.

## Request and response

POST /api/poem receives multipart/form-data with image (sent as moment.jpg).
The server accepts JPEG, PNG, WebP up to 8MB. The current browser sends optimized JPEG.

Response fields:
- japanese_poem: exactly three nonempty lines, separated by two newline characters.
- english_poem: a short supporting interpretation.
- mood_tags: one to five lowercase atmosphere tags, used internally only.

After balancing, the server rejects poems with fewer/more than three lines, punctuation-only lines, Latin characters, or lines over eight code points. English must not be empty. Tags must be valid nonempty strings. No additional provider call is made to repair validation errors. Existing writing direction, Japanese-only rule, and avoidance of casual stone imagery in English are preserved.

## Cancellation and failures

A lifecycle AbortController cancels staged delays, retries, requests, and response-body reads. Each attempt has its own AbortController and timeout. requestId prevents late results from reaching a new journey. Reset, gate Back/Escape, and beforeunload release requests and timers; object URLs are revoked when the displayed journey ends.

Retry only network errors, request timeouts, HTTP 429/5xx, or diagnostic status 429/5xx. Do not retry invalid_image, schema_validation, openai_response_parse, missing_api_key, other 4xx, cancellation, stale work, or the journey deadline. No technical error text, progress, or retry controls appear in the UI.

Fallback uses seven deterministic local poems in public/main.js, selected by original photo index. Each is three Japanese lines with one or two English lines and neutral moodTags: ["fallback"]. No one-line ellipsis fallback remains. One failed card does not stop the other six; even seven failures produce a complete journey.

Safe error JSON contains error, stage, status, message. Provider raw bodies, photos, base64 payloads, filenames, and poem text are not logged or returned in diagnostics.

## Photo handling

Selected photos are sent to OpenAI to produce words. Japan Memory Lane does not keep an account, gallery, or image history. No new database, analytics, cookies, or tracking are introduced.

OpenAI states that API data is not used for training by default. Abuse-monitoring data is normally retained for up to 30 days, with legal and safety exceptions, including review of certain flagged image inputs. store: false does not establish Zero Data Retention.
Official policy: https://developers.openai.com/api/docs/guides/your-data
Public explanation: /colophon/#photo-handling

## Verification

Use local mocked requests for success, partial failure, offline, timeout, deadline, cancellation, and a second journey. Do not submit private photos for testing. The frozen export canvas, PC download/mobile sharing, star/water, and 15-second return delay remain the SITE_SPEC contract.

# Japan Memory Lane AI Connection Spec v1.0

This document defines the future AI connection for Japan Memory Lane.

The AI connection is not implemented yet. This spec exists so the later implementation can stay quiet, small, and consistent with the tanzaku experience.

## Purpose

After a user selects a photo, the site should ask a server-side API to generate:

- a Japanese poem
- a small English poem
- mood tags for internal use

The AI should not feel like a feature. It should feel like the selected photo slowly finds words.

## Core Principles

- Do not make AI the main experience.
- Do not show UI text such as `Generate`, `AI`, or `Prompt`.
- Keep the flow: photo, pause, Japanese poem, English poem.
- Do not show a loading state.
- Do not show a spinner.
- Do not show generation progress.
- If generation fails, fall back quietly.
- Never expose the API key in browser code.

## Recommended Architecture

### Frontend

Static files:

- `index.html`
- `style.css`
- `main.js`

The frontend should:

- show the selected photo immediately
- hide the first tanzaku poem while waiting
- send the image to the API in the background
- apply the returned poem using the existing delayed reveal timing
- fall back to predefined poem candidates if the API fails

### API

Use Cloudflare Pages Functions or Cloudflare Workers.

Reasons:

- keeps the site mostly static
- keeps the API key server-side
- works naturally with Cloudflare Pages
- avoids exposing provider credentials to the browser

## Endpoint

```text
POST /api/poem
```

### Request

Use `multipart/form-data`.

Fields:

- `image`: one image file

Allowed input formats:

- `jpg`
- `jpeg`
- `png`
- `webp`

The server should reject unsupported file types quietly with an error response. The frontend should not show that error to the user.

### Response

Return JSON only.

```json
{
  "japanese_poem": "窓に\n雨の跡が\n残っていた",
  "english_poem": "The rain had stopped,\nbut the window still remembered.",
  "mood_tags": ["rain", "quiet", "memory"]
}
```

## JSON Schema

Use this schema for structured output validation.

```json
{
  "name": "japan_memory_lane_poem",
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "japanese_poem": {
        "type": "string"
      },
      "english_poem": {
        "type": "string"
      },
      "mood_tags": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "maxItems": 5
      }
    },
    "required": ["japanese_poem", "english_poem", "mood_tags"]
  },
  "strict": true
}
```

## Frontend Flow

1. The user selects a photo from `Upload a quiet moment in Japan.`
2. The selected photo appears immediately in the first tanzaku.
3. The Japanese and English poems are hidden.
4. The frontend sends the image to `/api/poem` in the background.
5. If the API returns a valid result, update the poem text.
6. If the API fails, choose one predefined local poem candidate.
7. After a short pause, reveal the Japanese poem.
8. A little later, reveal the English poem.

The mood tags are not displayed in the UI for v1.0.

## Timing

Keep the existing v0.8 feeling:

- photo appears immediately
- Japanese poem appears after about 1.2 to 1.5 seconds
- English poem appears about 0.4 to 0.6 seconds after the Japanese
- opacity only
- no movement animation

If the API takes longer than the first pause, the frontend should keep the poem hidden until either:

- a valid API result arrives
- the request times out and fallback is used

The pause should feel intentional, not like loading.

## Failure Behavior

If AI generation fails:

- do not show an error message
- do not show technical text
- do not show a retry button
- do not change the visual layout
- use the existing predefined poem candidates
- continue the same delayed reveal flow

Failure should feel like the quiet mock still works.

## API Prompt

Use this baseline prompt for the server-side request.

```text
You are writing for Japan Memory Lane.

This is not a travel guide.
This is not an AI caption generator.
This is a quiet memory of Japan.

Look at the uploaded photo.
Find only a small trace of atmosphere:
light, rain, silence, sound, distance, season, time, or stillness.

Write a short Japanese poem first.
The Japanese must be natural, quiet, and suitable for vertical writing.
Do not explain the photo.
Do not describe everything.
Do not say emotions directly.
Do not use dramatic or overly poetic words.
Leave space.

Then write a small English poem as a gentle interpretation.
The English should support the Japanese, not replace it.

Return only JSON.
```

Detailed writing rules live in `AI_GENERATION_RULES.md`.

## Security Rules

- Never write the AI provider API key in `main.js`.
- Store the API key in Cloudflare environment variables.
- The browser should only call `/api/poem`.
- The API should validate file type and size.
- The API should return only the JSON needed by the UI.
- The frontend should not expose raw provider errors.

## UI Restrictions

Do not add:

- AI labels
- Generate buttons
- prompt boxes
- loading text
- spinners
- progress bars
- error banners
- social sharing
- sound
- star effects

## Completion Criteria

The future implementation is acceptable when:

- selecting a photo immediately makes it the first tanzaku photo
- the Japanese poem appears after a quiet pause
- the English poem appears slightly later and remains secondary
- the output does not feel like an AI result
- fallback behavior is invisible
- no API key is exposed to the browser


# Japan Memory Lane AI Generation Rules v2.2

This document fixes the rules for image-aware poem generation and stable tanzaku display.

The AI must not be the main experience. It should only help a selected photo become a quiet memory on a tanzaku.

## Purpose

Japan Memory Lane does not use AI to explain photos, sell places, or produce impressive writing.

The generated words should feel like a small trace placed beside the photo:

- quiet
- short
- restrained
- based on one visible detail
- balanced for vertical tanzaku writing
- supported by a small English interpretation

This is not caption generation. The model should look at the photo, pick one small trace, and leave space.

## Expected JSON

The endpoint must return only JSON.

```json
{
  "japanese_poem": "石の段に\n昨日の雨が\n残っていた",
  "english_poem": "On the stone step,\nyesterday's rain stayed.",
  "mood_tags": ["stone", "rain", "quiet"]
}
```

Rules:

- Return valid JSON only.
- Do not wrap the response in Markdown.
- Do not include explanations.
- `japanese_poem` should contain 2 to 3 lines by default.
- `english_poem` should contain 1 to 2 lines.
- `mood_tags` should contain 1 to 5 short lowercase English tags.

## Image Rules

The model must look at the uploaded image.

It should:

- pick exactly one small visible detail from the photo
- use that detail indirectly
- avoid generic quiet poems
- avoid prepared-sounding phrases
- avoid mentioning everything in the photo
- avoid inventing details that are not visible
- avoid forcing Japan when no clear Japan marker is visible

Good details include a rope, wet stone, window edge, sign, shadow, rail, step, curtain, reflection, vending-machine button, shrine paper, puddle, leaf, wire, or tile.

## Japanese Poem Rules

The Japanese poem is the primary text.

It should be:

- 2 to 3 lines by default
- 1 line only when the photo truly needs very few words
- around 6 to 8 characters per line
- short
- natural
- sparse
- observational rather than explanatory
- visually balanced in vertical writing

It should:

- assume the poem will be displayed vertically as a tanzaku
- keep visual balance in vertical writing
- avoid overly long continuous phrases
- avoid long connected patterns like `...の...の...`
- pick one concrete thing
- avoid turning the photo into a caption
- reduce explicit subjects
- prioritize empty space over readability
- prefer atmosphere over explanation
- avoid naming emotions too directly
- avoid tourism language
- avoid social-media language
- avoid forced poetry
- avoid dramatic or self-important phrasing
- vary sentence shape
- use punctuation only when it feels necessary

Avoid overusing:

- 光
- 静か
- 遠い
- 待っていた
- 少し
- だけ
- 美しい
- 懐かしい

These ideas can be implied, but should not be announced.

## English Poem Rules

The English poem is secondary.

It should:

- support the Japanese
- be a gentle interpretation, not a direct translation
- be 1 to 2 lines
- stay short
- remain quieter than the Japanese
- avoid becoming a complete caption by itself
- avoid being too poetic
- avoid drama

## Forbidden Tone

Avoid tourism, advertising, influencer, motivational, and fantasy-like language.

Avoid words and phrases such as:

- miracle
- magic
- dream
- soul
- destiny
- eternal
- beautiful memory
- unforgettable Japan
- hidden gem
- must-see
- perfect spot

Also avoid common generic poem phrases such as:

- a small light waited
- the silence felt complete
- a little far away
- the night remembered

## Generation Prompt

Use this prompt as the baseline for the API request.

```text
You are writing for Japan Memory Lane.

This is not a travel guide.
This is not an AI caption generator.
This is a quiet memory of Japan.

You must look at the uploaded image before writing.
Do not write a generic quiet poem.
Do not reuse prepared-sounding phrases.

Pick exactly one small visual detail from the photo:
a rope, wet stone, window edge, sign, shadow, rail, step, curtain, reflection,
vending-machine button, shrine paper, puddle, leaf, wire, tile, or another visible thing.
Use that detail indirectly.
Do not mention everything in the photo.
Do not invent details that are not visible.
If the photo has no obvious Japan marker, use a visible detail instead of forcing Japan.

Write a short Japanese poem first.
The Japanese must be natural, quiet, and suitable for vertical writing.
The Japanese poem will be displayed vertically as a tanzaku.
Keep visual balance in vertical writing.
Prefer 2 or 3 balanced short columns.
Use 2 to 3 short lines unless the image only needs one very small line.
Keep each Japanese line around 6 to 8 characters.
Avoid overly long continuous phrases.
Avoid repeating connected の phrases such as の...の...の.
Prioritize empty space over readability.
Reduce explicit subjects.
Pick one concrete thing, but do not turn it into a caption.
Do not explain the photo.
Do not describe everything.
Do not say emotions directly.
Do not use dramatic or overly poetic words.
Do not use tourism, advertising, influencer, motivational, or fantasy language.
Avoid words like miracle, magic, dream, soul, destiny, eternal, hidden gem, must-see, and perfect spot.
Avoid overusing common quiet-poem words such as light, silence, distant, waiting, little, stillness.
Avoid repeating common Japanese words and endings such as 光, 静か, 遠い, 待っていた, 少し, だけ.
Vary the sentence shape.
Let punctuation appear only when it feels natural.
Leave space.

Then write a small English poem as a gentle interpretation.
The English should support the Japanese, not replace it.
Use 1 to 2 short lines.
Keep it quieter than the Japanese.
Do not make the English a full caption.

Return only JSON.
```

## Review Checklist

Before accepting generated output, check:

- The uploaded image is sent as an `input_image`.
- The Japanese picks one visible detail from the photo.
- The Japanese usually fits into 2 to 3 vertical columns.
- Each Japanese line is usually around 6 to 8 characters.
- The Japanese leaves visible space around it.
- The English does not compete with the Japanese.
- The output is not a photo description.
- The output is not tourism copy.
- The output does not feel like an AI caption.

# Japan Memory Lane Site

Quiet Japanese memories, written as vertical poems.

Japan Memory Lane is a small static site for moving through seven quiet moments. It is not a travel guide, not a social feed, and not an AI tool interface. Photos and short vertical poems are kept sparse so the memory has room to breathe.

## Current Scope

- Static frontend: `public/index.html`, `public/style.css`, `public/main.js`
- Cloudflare Pages Functions: `functions/api/`
- Functions routes: `public/_routes.json`
- OpenAI generation rules: `AI_GENERATION_RULES.md`
- API specs: `AI_CONNECTION_SPEC.md`, `SITE_SPEC.md`
- Environment variables: `OPENAI_API_KEY`, optional `OPENAI_MODEL`

AI is used only to place a small amount of language beside the photo. The browser never receives the OpenAI API key.

## Quiet Reliability (v2.26)

- The seventh sample offers a quiet bridge to your own seven after 1800ms. Samples never trigger the star, water, or take-one action.
- The photo gate has Back / Escape in both selection and preparation. Valid partial selections remain available until cancelled; unreadable photos do not count.
- Photos are decoded one at a time, then optimized once (1280px maximum, JPEG 0.72 / 0.66 / 0.60). The same optimized file supplies the API, card, and take-one canvas. If JPEG encoding alone fails, the decoded original can supply display while that card uses a local poem.
- Seven `/api/poem` calls start 1500ms apart. Each attempt has a 16000ms timeout; transient failures get at most one retry after 800ms, only with at least 3000ms left after the delay. A 30000ms journey deadline releases all unfinished cards into distinct three-line local poems.
- Completed poems and heat-to-calm order are fixed before the lane appears. Cancelled and old responses cannot update a new journey.
- Reduced motion, keyboard focus, safe-area spacing, and resource cleanup cover selection, generation, take-one, and return. The completed export canvas composition is unchanged.

### Photo handling

Selected photos are sent to OpenAI through Pages Functions with `store: false`. This site does not retain an account, public gallery, or image history. OpenAI states that API data is not used for training by default; abuse-monitoring retention is normally up to 30 days, with legal and safety exceptions. `store: false` is not a claim of Zero Data Retention. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) and `/colophon/#photo-handling`.

Five existing sample image files serve seven cards. Cards six and seven still reuse samples. Two user-owned photos are needed for seven unique samples: `residential-evening.jpg` and `winter-morning.jpg`. No replacement images or placeholder files have been added.

### Reliability checks

`node --test tests/reliability.test.mjs` checks server validation, static controls, and the frozen canvas/prompt. With Playwright available, run `node tests/reliability.browser.mjs` against `npm run dev -- --port 8789`; `PLAYWRIGHT_MODULE` may point to an existing Playwright entry point. Browser checks mock poem requests and never call OpenAI. Test captures stay under ignored `.wrangler/`.

## Do Not Commit

- `.env`
- `.dev.vars`
- API keys or screenshots containing keys
- Full base64 image payloads
- Private Cloudflare or OpenAI credentials

## Cloudflare Pages Deployment

Production deployment should normally be handled by Cloudflare Pages Git integration:

1. Commit changes locally.
2. Push to GitHub with `git push origin main`.
3. Confirm that Cloudflare Pages Deployments shows the latest commit from `main` as successful.

Manual deploys are not the normal workflow. Use them only when intentionally doing an emergency/manual reflection and after confirming that this is desired:

```bash
npx wrangler pages deploy public --project-name japanmemorylane-site --branch main
```

For the standard workflow, Cloudflare must have a Git repository connection to `yukiPHZ/japanmemorylane-site`, auto deployments must be enabled for the `main` branch, and the project root must contain:

- `functions/`
- `public/index.html`
- `public/style.css`
- `public/main.js`
- `public/_routes.json`
- `wrangler.toml`

Build command is normally empty. Build output directory is `public`.

If a pushed commit does not appear in Cloudflare Pages Deployments, check the Cloudflare dashboard before running a manual deploy:

- Pages project Git repository connection
- Auto deployments setting
- Production branch set to `main`
- GitHub installation permissions for the repository
- Webhook delivery status in GitHub
- Whether Cloudflare shows a queued, failed, or cancelled deployment

## Local Development

```bash
npm install
npm run dev
```

`npm run deploy` exists as a manual helper only. It is not the default production release path.

## favicon / app icon

- favicon assets: `/assets/favicon/`
- SVG, ICO, apple-touch-icon, 192px / 512px PNG, and `site.webmanifest` を配置する。
- HTML head には favicon / apple-touch-icon / manifest / theme-color を設定する。
- 仮アイコンは後から差し替え可能。小サイズでの識別性と静かな空気感を優先する。
## sitemap / robots

- 新しい公開HTMLページを追加したら `sitemap.xml` にURLを追加する。
- 検索に出したくないページは `sitemap.xml` に入れない。
- `robots.txt` の Sitemap URL が本番ドメインを指しているか確認する。
- GitHub push後、Cloudflare反映後に `/sitemap.xml` と `/robots.txt` を確認する。
- 生成する場合は `node scripts/generate-sitemap.js` を実行する。npm build化は不要。


## DAKE_WEB_META

```json
{
    "site_key":  "japanmemorylane-site",
    "display_name":  "Japan Memory Lane",
    "repo_name":  "japanmemorylane-site",
    "domain":  "japanmemorylane.com",
    "cloudflare_project":  "japanmemorylane-site",
    "site_type":  "functions",
    "has_functions":  true,
    "has_openai_api":  true,
    "health_url":  "https://japanmemorylane.com/api/health",
    "production_url":  "https://japanmemorylane.com",
    "status":  "active",
    "category":  "other",
    "show_on_dashboard":  true
}
```

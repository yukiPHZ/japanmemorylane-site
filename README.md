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

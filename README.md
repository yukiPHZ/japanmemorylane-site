# Japan Memory Lane Site

## サイト役割

`japanmemorylane.com` の静かな記憶レーン。写真、縦書きの日本語詩、小さな英語詩を並べ、Japan の小さな記憶を短冊のように残す。

## 世界観

観光ガイドでも SNS でも AI ツール画面でもない。狭く静かな路地として、写真と言葉と余白だけで呼吸できる体験を守る。

## 技術構成

- 静的 HTML / CSS / JavaScript
- Cloudflare Pages Functions: `functions/api/`
- サイト固有仕様: `SITE_SPEC.md`
- OpenAI 連携仕様: `AI_CONNECTION_SPEC.md`
- 生成ルール: `AI_GENERATION_RULES.md`
- 設定: `package.json`, `wrangler.toml`, `_routes.json`
- 環境変数: `OPENAI_API_KEY`, 任意で `OPENAI_MODEL`

## 触ってよい範囲

- UI 文言、静的メモリー、表示調整
- `functions/api/` の安全な API 処理
- AI 生成ルールと接続仕様の明文化
- README の運用ルール更新

## 触らない範囲

- API キー、`.env`、秘密情報
- 画像本文や base64 全体をログに出す変更
- 本番ドメイン `japanmemorylane.com`
- Cloudflare Pages Functions を Worker deploy に置き換える変更

## deploy手順

1. 変更前にこの README、`SITE_SPEC.md`、`AI_CONNECTION_SPEC.md` を読む。
2. `git status` で既存変更を確認する。
3. Functions 変更時は `/api/health` と `/api/poem` の安全な応答を確認する。
4. `git add . && git commit -m "Update japan memory lane site"`
5. `git push origin main`
6. Cloudflare Pages のデプロイ完了と Functions ログを確認する。

手動反映が必要な場合のみ:

```bash
npx wrangler pages deploy . --project-name japanmemorylane-site --branch main
```

## 次にやること

- 本番で `/api/health` を確認する。
- AI 生成の fallback / source 表示が意図どおりか確認する。
- ログが秘密情報を含まないことを維持する。

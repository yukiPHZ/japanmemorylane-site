# Japan Memory Lane Site Spec

このファイルは Japan Memory Lane 固有の体験仕様です。実装変更の前に README とあわせて読むこと。

## 体験の固定仕様

- 7枚選択固定。
- 7枚未満では journey に入らない。
- 7枚を超える選択は受け取らず、最初の7枚に収める。
- before words gate を通してから lane に入る。
- gate は待機表示ではなく、言葉になる前の余白として扱う。
- heat -> calm ordering は、7枚の流れを熱量のある記憶から静かな記憶へ沈めるために使う。
- DOM reorder しない。
- 表示後にカードを並べ替える演出は禁止。
- reorder 風のアニメーションも禁止。

## 詞の仕様

- poem は日本語3行固定。
- `japanese_poem` は3つの非空行、改行2つ。
- punctuation-only line 禁止。
- `。` や `、` だけの行を返さない。
- 日本語詞を主役寄りにする。
- 英語は補助。翻訳ではなく、小さな解釈に留める。
- 英語が日本語より強くならないようにする。
- AIを主役にしない。
- 静かな体験を優先する。

## fallback behavior

- API 失敗時は静かに fallback poem を使う。
- 失敗カードだけ fallback にし、他カードへ波及させない。
- エラー表示、retry CTA、spinner、progress bar は出さない。
- fallback でも同じ reveal timing を守る。
- ユーザーには「失敗した」感を出さない。

## image compress rules

- 選択画像は送信前にブラウザ側で JPEG 圧縮する。
- 長辺は最大 1280px。
- JPEG quality は `0.72` から始める。
- 1MB を超える場合は `0.66`、さらに必要なら `0.6` へ下げる。
- 圧縮後のファイル名は元名ベースの `.jpg` にする。
- 画像本文や base64 全体をログに出さない。
- サーバー側は最大 8MB を上限にする。

## generation flow

- staged generation を使う。
- 7枚を受け取ったらまず fallback journey を準備する。
- before words gate を描画してから生成を始める。
- `/api/poem` へカードごとに individual fetch する。
- 各 fetch は個別に成功・失敗を扱う。
- failed card isolation を守る。
- 1枚の失敗で全体を失敗にしない。
- 生成中は scroll lock する。
- lane はカード生成完了後に表示し、先頭へ `scrollTo({ top: 0 })` する。

## timing

- before words gate は7枚選択後、約260ms 後に preparing へ入る。
- before words paint は `requestAnimationFrame` 後、約420ms 待つ。
- journey star は最後のカード到達後、約2100ms 後に一度だけ出す。
- shooting star 自体は約2400ms 以内に消す。
- water memory は shooting star の約1450ms 後に出す。
- water memory は animation end または約4400ms 後に消す。
- water memory 後に take one action を約1400ms 後へ送る。

## 技術仕様

- Cloudflare Pages Functions を使う。
- poem endpoint は `/api/poem`。
- `functions/api/poem.js` が単体 poem 生成を担当する。
- `functions/api/journey.js` は journey 用の補助 endpoint として扱う。
- `OPENAI_API_KEY` は Cloudflare Secret に置く。
- frontend に API key を書かない。
- frontend は OpenAI を直接呼ばない。
- OpenAI 呼び出しは Pages Functions 経由にする。
- API response は JSON のみ。
- `mood_tags` は内部の流れ調整用で、UI には出さない。

## 保守方針

- 演出を増やしすぎない。
- ローディングを騒がしくしない。
- reorder 演出は禁止。
- UX安定を優先する。
- モバイルファーストで確認する。
- 余白、縦書き、静けさを壊さない。
- AI品質より、体験の安定と静かさを優先する。
- 仕様変更時は README とこのファイルを更新する。


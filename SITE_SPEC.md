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
- 圧縮後のローカルファイル名は元名ベースの `.jpg`。API送信時は `moment.jpg` に置き換える。
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

## Quiet Reliability v2.26

- 初期7枚目で1800ms留まると「あなたの七つ、ことばの前へ」。自分の巡り開始前・受理0枚・gate非表示時のみ。離れるとtimer解除。見本では星・水面・保存は出さない。
- gateの「戻る」/ Escapeは0枚・途中選択・preparingのすべてで有効。reloadせず選択を破棄し入口へfocusを戻す。写真の扱いリンクと戻るのクリックはpickerを開かない。
- ブラウザの画像decodeを逐次確認。HEIC等も読める場合だけ受理。読めない写真は数えず、有効な選択だけ保持。「別の一枚を。 / Choose another moment.」をpolite statusで3000ms表示。
- decode/encode各処理にも12000msの上限を設ける。JPEG最適化は原則一度、API・表示・保存canvasに同じFileを再利用。encodeだけ失敗した場合は元画像で表示し、APIには送らずfallbackにする。
- 7件は1500ms間隔。各試行16000ms timeout。network / timeout / 429 / 5xxのみ最大1回、800ms後にretry。入力不正・schema・取消・deadline・古いrequestIdはretryしない。retry後の残り時間3000ms以上が条件。
- 生成開始から30000msがhard deadline。完了済みは維持し、未完了だけfallback。全件settledしてからheat -> calmを確定し、カードを表示。表示後は変更しない。
- fallbackは `public/main.js` の7候補を選択indexで決定。日本語3行・英語1〜2行、moodTagsはneutralな `fallback`。写真の具体描写はしない。APIも整形後の正確な3行・各行最大8文字・Latin混入なし等を検証する。
- reduced motionでは星/水面を300msのopacity、還りを200msのopacityへ短縮。移動・blurなし。animationendが来なくてもtimerで遷移。保存成功後15000msの「還す」は維持し、自動resetしない。
- 主要操作はsemantic button/linkとfocus-visible。gate表示中はlaneをinertにしTabをgate内へ保つ。fixed操作はsafe-area-inset-bottomを考慮。
- gateから `/colophon/#photo-handling` へ別タブ導線。OpenAI送信・学習既定なし・通常最大30日の監視保持と例外を説明。store:falseはZDRを意味しない。
- 取消/reset/還り/beforeunloadでrequestIdを更新、controllerをabort、stage/retry/deadline/status/bridge/演出timerを解除。Object URLは表示終了時にrevoke。保存成功だけでは表示写真を破棄しない。resize/picker cancelは選択を失わず現在状態を維持。
- 見本写真は5ファイルを維持。完全固有化に必要な追加2枚はユーザー提供待ち。
- 保存canvasの構図・座標・フォント・背景および日英About/SEO/prompt方針は変更しない。

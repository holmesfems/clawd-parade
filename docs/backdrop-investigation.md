# 背景のおへやが、デスクトップのアプリで動かない件・調査メモ

状態：原因が分かり、直した（2026-11-14）。下の「いまの状態」より後ろは、調査の途中のメモ（そのまま残してある）。

## 結論

- **原因**：おへやを入れる入れ子の `<svg>` に付けていた `shape-rendering="crispEdges"`。これがあると、アプリの背景では、その SVG の CSS アニメーションがひとつも当たらなくなる（root に置いた別の要素のものも含めて）
- **直し方**：`hooks/room.ts` の `frameSvg` の入れ子の svg から、この属性を外した。アプリでおへやが動くことを確かめた
- **なぜ止まるかは分かっていない**。同じ SVG は、ブラウザではアプリと同じ形の iframe（DOMPurify 通過後・sandbox・CSP・srcdoc）に入れても動く。アプリの中の描画の問題だと見ているが、推測

### 二分探索の結果（`/parade theme test6`〜`test21`。どれも 1 回だけ出す・glass なし）

| テスト | 中身 | 動いた？ |
| --- | --- | --- |
| test6 | おへやそのまま | 止まる |
| test7 | test2 + glass あり | 動く |
| test8 | おへやの絵で、おへやの `<style>` だけ外す | 止まる |
| test11 | test2 + 見えない rect を 300 個（大きさだけ） | 動く |
| test12 | root の `<defs>`（pattern）と、かべ・床だけ | 動く |
| test13 | 入れ子のおへやの絵だけ | 止まる |
| test14 | test13 から clipPath・ランプのあかりを外す | 止まる |
| test15 | 入れ子の枠だけ（中は四角 1 つ） | 止まる |
| test16 | 絵の path を半分に | 止まる |
| test17 | test15 から `shape-rendering` を外す | **動く** |
| test18 | test15 から内側の `overflow` を外す | 止まる |
| test19 | test15 から `preserveAspectRatio` を外す | 止まる |
| test20 | 外側の枠なし（左に置くときの形） | 止まる |
| test21 | 外側の枠だけ（中は viewBox なしの四角） | **動く** |

止まっているときは、黄色の札「animation が止められている」が出た（CSS は効いているが、アニメーションだけ当たっていない）。オレンジの札「アプリが『止める style』を差しこんでいる」は、どれにも出なかった。

### 原因ではなかったもの

- `shouldAnimate`：アプリの設定 `appearance:backgroundAnimation`（enabled・disabled・system）と `prefers-reduced-motion` だけで決まり、場面は見ない（asar の 54445708 あたり）。この PC は「動きを減らす」になっていない
- アプリの「止める」処理（`Qn`）：通ればテストの背景も同じように止まる。オレンジの札が出なかったので、通っていない
- DOMPurify：おへや・目盛りを同じ設定で通しても、`<style>` も属性も消えない
- 描き直し：中身が同じ iframe は残す作り（`gm`・`hm`、`isEqualNode`）
- glass、`refreshRoom`、SVG の大きさ・要素の数、pattern・clipPath・gradient、`@media (prefers-reduced-motion)`

## いまの状態

- ブランチ `claude/room-backdrop`、PR [holmesfems/clawd-parade#48](https://github.com/holmesfems/clawd-parade/pull/48)（1.12.0。まだマージしていない）
  - `hooks/room.ts`：おへやの場面（しごと・場面の名前・SVG）。仕様は `docs/backdrop-spec.md`
  - `hooks/register.tsx`：`/parade theme`（left・right）、`refreshRoom`、Backdrop のフック
  - 調査用のコマンドは、`/parade theme ruler`（目盛り）だけ残した。`/parade theme test1`〜`test23` と、目盛りの中の動きのテスト A〜F は外した（コードは、このブランチの履歴にある）
- PR #46（行進の背景の試作）は下書きのまま。#48 で置きかわるので閉じてよい
- PR #47（帯をほかのプラグインと分け合う、1.11.0）はマージ済み
- 試すときの仕組み（元にもどすのを忘れない）
  - いま開いているセッションの mod のフォルダ `~/.claude/dev-mods/<セッション id>/clawd-parade/` に、このブランチの `hooks/` と `types/` をコピーして読み込ませている（hot reload）。新しいセッションでは、そのセッション用の mod のフォルダにコピーし直すか、`--plugin-dir` で読み込む
  - 入れてある clawd-parade（マーケットプレイス版）は `claude plugin disable clawd-parade@clawd-parade` で切ってある。終わったら `claude plugin enable clawd-parade@clawd-parade`
  - 公式の例 `theme-examples@claude-plugins-official` を入れてある（比べるため）
- PATH の `claude` は古い（2.1.316。テーマの API が無い）。validate・test はアプリに入っている版で流す：
  `C:\Users\holmesfems\AppData\Local\Claude-Data\claude_pzs8sxrjxfjjc\claude-code\2.1.325\<hash>\claude.exe plugin validate .` / `plugin test .`
- テストは 198 pass・6 fail。落ちる 6 つは main でも同じ（PC のタイムゾーンによるもの。CI の UTC では通る）

## 症状

- おへやの絵は、アプリで正しい位置・大きさに出る（`/parade theme` で確認ずみ）
- でも、おへやの CSS アニメーションがひとつも動かない（仲間がはねる、まばたき、コードの行、雲など全部）
- 同じ SVG をブラウザで開くと動く（`document.getAnimations()` で 13 個が running）

## 分かったこと

### 背景の枠の大きさ（`/parade theme ruler` で測った）

- 背景の枠は、左のサイドバーと右のパネルの下まで入った、アプリの窓まるごと（およそ 1,900×1,050 CSS px）
- 左のサイドバーはおよそ 215px、右のパネルはおよそ 315px を覆う
- なので、おへやは割合ではなく固定の px で置いた：右はしから 330px 内側の、幅 360px・高さが窓の 40% の枠（`room.ts` の `ROOM_INSET`・`ROOM_BOX`・`ROOM_HEIGHT`）。これで、会話の列と右のパネルのあいだにちょうど収まった

### アプリで動いたもの・動かなかったもの

| 背景 | 動いた？ | 中身 |
| --- | --- | --- |
| 公式の snow-pines | 動く | root の svg に viewBox、CSS アニメーション |
| test1 | 動く | 公式と同じ作り（viewBox あり）＋ CSS |
| test2 | 動く | viewBox なし＋ CSS |
| test3 | （結果を聞いていない） | viewBox あり＋ SMIL（`<animate>`） |
| test4 | 動く | test2 ＋ `<svg x="100%" overflow="visible">` の入れ子 |
| test5 | 動く | test2 ＋ viewBox つきのふつうの入れ子 |
| おへや（`roomSvg`） | 動かない | 入れ子の svg、`<defs>`（pattern・radialGradient・clipPath）、`clip-path`、`<style>` 1 つ（`@media (prefers-reduced-motion: reduce)` 入り） |
| 目盛り（`rulerSvg`） | 動かない | `<style>` が 2 つ（1 つめの `@media (min-width)` は効いた。動きのテスト A〜F は 2 つめの `<style>` に入れていた）。F のバーは、はじめから伸びきった形（アニメーションが当たっていない） |

→ viewBox の有無、入れ子の svg、`x="100%"`・`overflow="visible"` は原因ではない。

### アプリのコード（`ion-dist.asar`）で見つけたこと

場所：`C:\Program Files\WindowsApps\Claude_5.11492.5.0_x64__pzs8sxrjxfjjc\app\resources\ion-dist.asar`（版が上がるとフォルダ名が変わる。動いているプロセスの場所から探す）。`grep -a -o -E` で文字列として読める。

1. **背景を描くコンポーネント**（`"data-plugin-drawn":"Backdrop"` の近く、minify 名 `sr`）
   - `{shouldAnimate:i}=fe(r)`、`a = !rr(n) && i`
   - `rr` は `<html>` に `data-software-compositing` 属性があるか（GPU なしで描いているか）
   - `a` が false のときは `ar = { surfaceCss: Ln, shapeTree: er }` で描く。`er` は Svg の source を `Qn` に通す
   - `Qn`：root の `<svg ...>` の直後に `<style>*{animation:none!important;transition:none!important}</style>` を差し込み（`Kn`）、`animation`・`transition` の `!important` を消し（`qn`）、SMIL のタグ（animate・animateTransform・animateMotion・set）を取りのぞく（`Zn`）→ **止まった絵になる**
   - `a` が true のときは `ir = { surfaceCss: Ln }` で、source はそのまま
   - test1 が動いたので、そのときは `a` は true だった。**おへやのときに `a` が false になる条件があるのかを調べる**（`fe` の中身：`shouldAnimate` を決める関数。`matchMedia` を受け取っているので prefers-reduced-motion を見ているはず。ほかに、場面ごと・大きさ・時間・回数などで止める条件がないか）
2. **ふつうの Svg（パネル・帯）を描く関数**（minify 名 `Qp`）：`isInteractive` が無ければ `<img>`、あれば `Rp`（`Fp` で scrub → CSP つきの srcdoc）で `<iframe sandbox>`
   - `Fp`：DOMPurify、`USE_PROFILES: { svg: true, svgFilters: true }`、`ADD_TAGS: animate・set・use`、`FORBID_TAGS: script・foreignObject・image・a・iframe`、`on*` 属性と `#` 以外の href を消す。131,072 文字を超えると null
   - CSP：`default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src data:; script-src 'none'; form-action 'none'`
   - 背景が同じ `Rp`／`Fp` を通っているかは、まだ確かめていない
3. `shouldAnimate` を探す grep（`grep -a -o -E ".{0,1500}shouldAnimate:.{0,600}"`）は重くて途中で止めた

## 疑っていること（上から順に）

1. **`fe`（shouldAnimate）が、おへやのときだけ false になる**。test は動くのにおへやは動かないので、何かの条件で切りかわっている。おへやは 1 秒ごとに `refreshRoom` が走り、場面が変わると `$.theme.set` を呼ぶ（test は 1 回だけ）。`theme.set` の呼び方（`overrideColorScheme: 'dark'`・glass あり）や、描き直しの回数で止まる仕組みがないか
2. **おへやの SVG のどこかが、DOMPurify か CSS の読みこみで壊れて、`<style>` ごと効いていない**。目盛りは「2 つめの `<style>` が効いていない」ように見えた。おへやの `<style>` にある何か（`transform-box`、`steps(1,end)`、`@media (prefers-reduced-motion)`、セレクタの書き方）か、`<defs>` の中身（pattern・radialGradient・clipPath）が影響していないか
3. **おへやの SVG が、アニメーションを止める側に当たっている**：たとえば `prefers-reduced-motion` の `@media` を自分で入れているのはおへやだけ（test には無い。ただし公式の snow-pines も同じ規則を入れていて、動いている）

## 次にやること

1. `fe` の中身を読む（`shouldAnimate` の定義）。`ion-dist.asar` は 200MB あるので、まず `shouldAnimate` の出てくる位置（バイトのオフセット）を `grep -a -b -o "shouldAnimate"` で取ってから、その前後だけを `dd` などで切り出すと速い
2. 背景の source が `Rp`／`Fp`（DOMPurify）を通るかを確かめる（`at(t,wn,...)` の `leaves`・`drawn` のあたり）
3. おへやの SVG を少しずつ削った test を作って、どこから止まるかを二分探索する。たとえば：
   - test6：おへやの SVG から `@media (prefers-reduced-motion)` の行だけ消す
   - test7：おへやの `<defs>`（pattern・gradient・clipPath）と `clip-path` を消す
   - test8：おへやの `<style>` を test2 の `<style>` に入れかえる
   - test9：おへやのまま、`refreshRoom` を止める（場面を 1 回だけ set して、そのあと set しない）
4. 直ったら：調査用のコマンド（ruler・test1〜）を外すか残すかを決め、CHANGELOG を更新して #48 をマージ。マーケットプレイスとプラグインを更新して入れ直し、`claude plugin enable clawd-parade@clawd-parade`、試し用の mod を消し、#46 を閉じる

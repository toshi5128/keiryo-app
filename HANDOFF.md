# 計量 KEIRYO — 運用バイブル

このリポジトリを触るときは必ずここを最初に読む。
仕様の正 = `KEIRYO-SPEC-v3.md` / `KEIRYO-HANDOFF.md`（下田さんの Downloads）。
v1 / v2 と食い違ったら **v3 が正**。

---

## 守ること

- **数式は `src/core/` の外に書かない。** 係数（1.75 / 2.4 / 0.72 / 0.7 / 550）を
  画面側に書き写さない。画面は core の戻り値をそのまま表示する。
- **仕様書の数値を勝手に変えない。** 変える必要があると判断したら、実装前に理由とともに提案する。
- **集計は必ず `log_date`。** `eaten_at`（実時刻）は表示専用。
  境界は 4:00。00:00〜03:59 の記録は前日に付く。
- **除外食材（`is_excluded`）を絶対に提案しない。** 嫌いなものを勧めると信頼が一撃で落ちる。
- **1日オーバーで赤警告を出さない。** 週予算を超えた時だけ知らせる。UI 文言に「オーバー」を使わない。
- **ATLAS（`C:\Users\st106\gym-app`）のコードには一切触らない。** 別リポジトリ・別デプロイ。
- `npm test` が通らないコードを push しない。

## 【絶対】制約（ソルバー）

```
P は日次で目標必達。他を犠牲にしてでも P を優先
F は 下限（体重 × 0.7 = 58g）を割らない
is_excluded / in_stock=false の食材を提案に含めない
1食の P が 80g を超えない
各食材の max_amount を超えない
```

上3つが両立しない日（起床が20時など）は、**無理に押し込まず `shortfall` として返す**。
そのとき画面には「今日は下振れで終わらせてよい。明日きっちり取れば問題ない」と出す。焦らせない。

---

## 構成

```
src/core/          数式だけ。画面もDBも知らない。テストはここに集中
  calc.ts          目標PFC（LBM→BMR→TDEE→P/F/C）・週次レビュー・移動平均
  solver.ts        ★心臓部。PFC目標を満たす食材の組み合わせを解く
  dateBoundary.ts  4:00境界・週（月曜始まり）
  weekBudget.ts    週予算の配分と進捗
  types.ts
src/data/
  seedFoods.ts     初期シード36品
tests/             core と1:1
supabase/migrations/0001_init.sql
```

## 開発

```
npm test          # vitest（131件）
npm run build     # tsc --noEmit + vite build
npm run dev
node tools/shots.mjs   # 実機幅390pxで全タブ撮影（端末のChromeを使う）
```

Node は `C:\Users\st106\AppData\Local\Programs\nodejs\node.exe`（bash の PATH 外）。

**UI を変えたら `tools/shots.mjs` で実機幅を目視してから「完了」と言う。** DOM 確認だけで判断しない。

## 配信（GitHub Pages）

- repo: `toshi5128/keiryo-app` ／ URL: https://toshi5128.github.io/keiryo-app/
- `main` に push すると `.github/workflows/pages.yml` が走る。**このファイルを消さないこと。**
  ワークフローは `npm test` → `tsc --noEmit` → `vite build` の順。**テストが落ちたら配信されない。**
- `vite.config.ts` の `base` は GitHub Actions のときだけ `/keiryo-app/`。ローカルは `/`。
- Pages の設定は「Source = GitHub Actions」。ブランチからの自動ビルド(legacy)は使わない。
- run が `waiting` のまま固まったら、それを cancel しないと後続が永久に `pending`（ATLAS で実績あり）。

## 保存先

Phase 1 は **localStorage**（キー `keiryo.v1`）。ログイン不要で即使えることを優先した。
設定タブから JSON で書き出し・読み込みができる。Supabase 同期は Phase 2。

---

## Supabase

- ATLAS と**同じプロジェクト**（`hnjrgbcgtfohvmxymmau` / kintore-toshi）を共有する。
  同じログインで両アプリが使え、将来 ATLAS の体重・ベンチプレスを読める。
- **テーブル名はすべて `keiryo_` で始める。** ATLAS が `public.profiles` を
  使っているため、`profiles` のような一般名は使わない。
- `supabase/migrations/0001_init.sql` をダッシュボードの SQL Editor に貼って実行する。
  （このプロジェクトは Claude 側の MCP からは操作できない。別アカウントのため）
- RLS は全テーブルで有効。update ポリシーには `using` と `with check` の両方を必ず付ける。

## 食事記録の設計メモ

`keiryo_meals` は food_id を参照しつつ、**その時点の栄養価を行に写して持つ**。
あとから食材マスタを直したときに過去の記録まで書き換わるのを防ぐため。

---

## モック（`keiryo-mock.html`）との差分

モックの `solve()` を参照実装としつつ、以下3点は**意図的に直している**（2026-08-18・下田さん承認済み）。

| # | モックの挙動 | 直した内容 |
|---|---|---|
| ① | 羊羹を足しても米が減らず 145kcal 上乗せされる | 甘いもの・外食を「米で埋める」より前に確定する |
| ② | 鶏もも切れの場面で脂質 50.5g（下限58g割れ） | 下限を満たすまで脂質源を足し続ける |
| ③ | 主菜候補が `['momo','sobo','sake']` の直書き | `category='protein'` から動的に選ぶ |

併せて、1食の P 80g 上限（モックに実装が無かった）を追加し、野菜を各食150g（§4-4）にした。

なお **仕様書・モックは 2026-08-17 を「日曜」と書いているが、実際は月曜**。
曜日は Date から引くので、資料の誤記には合わせない。

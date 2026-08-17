# 計量 KEIRYO

PFC の目標から、食材の組み合わせを解く減量記録アプリ。

公開URL: https://toshi5128.github.io/keiryo-app/

## このアプリが解く問題

減量中に毎日やっている作業は、実は1つだけ。

> 食材マスタから、PFC 目標を満たす組み合わせを解く

「鶏ももが切れた」「羊羹を食べたい」「外食した」「起床が20時になった」は、
すべてこの1つの計算の言い換え。それを自動化する。

## 開発

```
npm install
npm test        # vitest（131件）
npm run dev
npm run build   # tsc --noEmit + vite build
```

作業を始める前に **HANDOFF.md** を読むこと。守るルールと【絶対】制約が書いてある。

## 構成

| | |
|---|---|
| `src/core/` | 数式だけ。画面もDBも知らない。テストはここに集中 |
| `src/core/solver.ts` | ★心臓部 |
| `src/screens/` | 画面。core の戻り値を表示するだけ |
| `supabase/migrations/` | DB スキーマと RLS |
| `tools/shots.mjs` | 実機幅(390px)で全タブを撮る |

データは Phase 1 では端末の localStorage に保存する（設定タブから書き出し・読み込み可）。

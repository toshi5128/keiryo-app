-- ===========================================================================
-- 計量 KEIRYO — 初期スキーマ
--
-- ★ATLAS（筋トレアプリ）と同じ Supabase プロジェクトを共有する。
--   ATLAS の public.gym_state / public.profiles には一切触れない。
--   衝突を避けるため、このアプリのテーブルはすべて keiryo_ で始める。
--   （profiles は ATLAS が既に使っているので keiryo_profile とする）
--
-- 全テーブルで RLS を有効化し、user_id = auth.uid() のみ許可する。
-- update に with check を付けないと「他人の user_id へ書き換える」穴が開くので
-- using と with check の両方を必ず書く。
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- プロフィールと設定
-- ---------------------------------------------------------------------------
create table if not exists public.keiryo_profile (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  height_cm            numeric,
  weight_kg            numeric not null,
  body_fat_pct         numeric,
  skeletal_muscle_kg   numeric,
  -- 目標体重は持たない。目標体脂肪率から毎回逆算する
  target_body_fat_pct  numeric not null default 8,
  activity             numeric not null default 1.45,
  deficit_kcal         numeric not null default 550,
  override_kcal        numeric,
  -- 1日の境界（既定4:00）。00:00〜03:59 の記録は前日に付ける
  boundary_hour        smallint not null default 4 check (boundary_hour between 0 and 12),
  -- 曜日固定の外食日（0=日 〜 6=土）と、その日の想定カロリー
  eat_out_dow          smallint check (eat_out_dow between 0 and 6),
  eat_out_kcal         numeric not null default 3000,
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 食材マスタ（アプリの価値は登録数に比例する）
-- ---------------------------------------------------------------------------
create table if not exists public.keiryo_foods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  -- 栄養価の基準量。例: 100 / 'g'、1 / '個'
  base_amount   numeric not null check (base_amount > 0),
  base_unit     text not null,
  kcal          numeric not null check (kcal >= 0),
  protein_g     numeric not null check (protein_g >= 0),
  fat_g         numeric not null check (fat_g >= 0),
  carb_g        numeric not null check (carb_g >= 0),
  salt_g        numeric,
  category      text not null
                check (category in ('protein','carb','veg','fat','sweet','other')),
  is_staple     boolean not null default false,
  -- ★嫌いで食べない。ソルバーは絶対に提案しない
  is_excluded   boolean not null default false,
  -- ★在庫。false なら今日は提案しない
  in_stock      boolean not null default true,
  step_amount   numeric,
  min_amount    numeric,
  -- ★1食の現実的な上限。無いと「鶏もも530g」のような答えが出る
  max_amount    numeric,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ソルバーが毎回引く条件をそのまま索引にする
create index if not exists keiryo_foods_solver_idx
  on public.keiryo_foods (user_id, category)
  where is_excluded = false and in_stock = true;

-- ---------------------------------------------------------------------------
-- 食事の記録
--
-- ★栄養価は food_id の参照ではなく、記録した時点の値をこの行に写して持つ。
--   あとから食材マスタを直したときに、過去の記録まで書き換わってしまうのを防ぐ。
-- ★集計は必ず log_date で行う。eaten_at は表示専用。
-- ---------------------------------------------------------------------------
create table if not exists public.keiryo_meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  food_id     uuid references public.keiryo_foods(id) on delete set null,
  name        text not null,
  amount      numeric not null,
  unit        text not null,
  kcal        numeric not null,
  protein_g   numeric not null,
  fat_g       numeric not null,
  carb_g      numeric not null,
  salt_g      numeric,
  -- 実時刻（表示用）
  eaten_at    timestamptz not null default now(),
  -- ★その記録が属する「1日」。境界4:00で算出して書き込む
  log_date    date not null,
  -- 'meal' 通常 / 'eat_out' 外食 / 'sweet' 甘いもの
  kind        text not null default 'meal' check (kind in ('meal','eat_out','sweet')),
  created_at  timestamptz not null default now()
);

create index if not exists keiryo_meals_day_idx
  on public.keiryo_meals (user_id, log_date);

-- ---------------------------------------------------------------------------
-- 体重の記録
--
-- ★測定条件（起床後・トイレ後・食前・下着のみ）を満たさないものは
--   is_reference = true。7日移動平均から除外する。
-- ---------------------------------------------------------------------------
create table if not exists public.keiryo_weights (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  log_date            date not null,
  measured_at         timestamptz not null default now(),
  weight_kg           numeric not null check (weight_kg > 0),
  body_fat_pct        numeric,
  skeletal_muscle_kg  numeric,
  -- 測定条件を満たさない「参考値」
  is_reference        boolean not null default false,
  note                text,
  created_at          timestamptz not null default now(),
  unique (user_id, log_date)
);

-- ---------------------------------------------------------------------------
-- ベンチプレス（体組成計より確実な筋量の指標。Phase 3 で ATLAS 連携）
-- ---------------------------------------------------------------------------
create table if not exists public.keiryo_bench (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  log_date    date not null,
  weight_kg   numeric not null,
  reps        smallint not null,
  created_at  timestamptz not null default now()
);

-- ===========================================================================
-- RLS — 全テーブルで有効化し、自分の行だけ
-- ===========================================================================

alter table public.keiryo_profile enable row level security;
alter table public.keiryo_foods   enable row level security;
alter table public.keiryo_meals   enable row level security;
alter table public.keiryo_weights enable row level security;
alter table public.keiryo_bench   enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'keiryo_profile','keiryo_foods','keiryo_meals','keiryo_weights','keiryo_bench'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format(
      'create policy %I on public.%I for select using (user_id = auth.uid())',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert with check (user_id = auth.uid())',
      t || '_insert', t);
    -- using だけだと他人の user_id へ書き換えられる。with check も必ず付ける
    execute format(
      'create policy %I on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete using (user_id = auth.uid())',
      t || '_delete', t);
  end loop;
end $$;

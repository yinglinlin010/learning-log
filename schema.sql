-- ====================================================================
-- 高級即時投票系統：資料表、關聯約束與行級門禁（RLS）架構
-- 融合 W10 投票板業務場景與 W11 Supabase 雲端驗證、關聯資料庫與門禁安全
-- 用法：Supabase 左側 SQL Editor → 貼上全文 → 點擊 Run
-- ====================================================================

-- 1. 建立投票主題表 (polls)
create table if not exists public.polls (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users(id) on delete set null,
  title       text not null check (char_length(title) between 2 and 150),
  description text check (char_length(description) <= 500),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- 2. 建立投票選項表 (poll_options)
create table if not exists public.poll_options (
  id            uuid primary key default gen_random_uuid(),
  poll_id       uuid not null references public.polls(id) on delete cascade,
  label         text not null check (char_length(label) between 1 and 100),
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

-- 3. 建立投票紀錄表 (poll_votes)
-- 關鍵設計：unique (poll_id, user_id) 確保資料庫層級強制「一人一票」，防範重複投票
create table if not exists public.poll_votes (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.polls(id) on delete cascade,
  option_id  uuid not null references public.poll_options(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint unique_vote_per_user_per_poll unique (poll_id, user_id)
);

-- 4. 啟用 Row Level Security (RLS) 門禁
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

-- 5. 清理舊規則，確保重跑時原則乾淨重建
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in ('polls', 'poll_options', 'poll_votes') loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 6. 設定 RLS 存取原則

-- (A) polls 存取規則：
-- 任何人（包含未登入訪客）均可檢視進行中的投票
create policy "公開讀取投票主題" on public.polls
  for select to public
  using (true);

-- 登入使用者可發起新投票
create policy "登入使用者可發起投票" on public.polls
  for insert to authenticated
  with check ((select auth.uid()) = created_by or created_by is null);

-- 發起者可管理/刪除自己的投票
create policy "發起者可刪除自己的投票" on public.polls
  for delete to authenticated
  using ((select auth.uid()) = created_by);

-- (B) poll_options 存取規則：
-- 任何人均可檢視選項
create policy "公開讀取投票選項" on public.poll_options
  for select to public
  using (true);

-- 登入使用者可為自己建立的投票加入選項
create policy "登入使用者可新增投票選項" on public.poll_options
  for insert to authenticated
  with check (true);

-- (C) poll_votes 存取規則：
-- 任何人可檢視投票統計分佈（計算票數與百分比）
create policy "公開檢視投票票數" on public.poll_votes
  for select to public
  using (true);

-- 登入使用者僅能以自己的身分投下一票
create policy "本人只能投自己的票" on public.poll_votes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- 登入使用者可收回/重新投自己的票
create policy "本人可撤回或更改自己的票" on public.poll_votes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 7. 權限指派
grant select on table public.polls, public.poll_options, public.poll_votes to anon, authenticated;
grant insert, delete on table public.polls, public.poll_options, public.poll_votes to authenticated;

-- 8. 自動注入預設投票種子資料（W10 經典主題，若尚未存在時新增）
do $$
declare
  w10_poll_id uuid;
  ai_poll_id uuid;
begin
  if not exists (select 1 from public.polls where title = '下一段想看老師重做哪一關？') then
    insert into public.polls (title, description)
    values ('下一段想看老師重做哪一關？', 'W10 經典課堂投票：調查大家在部署與試算表串接中最容易卡關的環節')
    returning id into w10_poll_id;

    insert into public.poll_options (poll_id, label, display_order) values
      (w10_poll_id, '找不到部署按鈕', 1),
      (w10_poll_id, '送出後試算表沒新增一筆', 2),
      (w10_poll_id, '同學的手機打不開', 3);
  end if;

  if not exists (select 1 from public.polls where title = '下一階段專案最想打造的功能？') then
    insert into public.polls (title, description)
    values ('下一階段專案最想打造的功能？', '結合 Supabase 即時資料庫與安全門禁，票選後續延伸實作主題')
    returning id into ai_poll_id;

    insert into public.poll_options (poll_id, label, display_order) values
      (ai_poll_id, '即時留言與討論串互動', 1),
      (ai_poll_id, '自訂截止時間與即時排名看板', 2),
      (ai_poll_id, '視覺化數據圖表與匯出報表', 3);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 20260929000100 · 코멘트·등록 메모 → Slack '올리기' + 등록 탭 담당자 소통 (설계서 v2.22.3 §4-25·§8.4·§9 · Phase 6.17, 2026-09-29 —
--   기획자님 2026-09-28 #1 "자동으로 PUSH하기보다 슬랙에 올리기 버튼" · #2 "멘션을 여러명" · #5 "등록탭 안에서도 담당자간 소통 · 슬랙 푸시도")
--
--   · comments.slack_posted_at            — 사람이 'Slack에 올리기'를 눌러 마지막으로 올린 시각(서버 service만 적는다 · 자동 전송 0)
--   · registration_notes                  — 등록 탭 담당자 소통 메모. 담당자(멤버)만 읽고 쓴다(Phase 6.16 등록 데이터 규칙) ·
--                                           update/delete 정책 없음(기록) · 멘션 = 멤버 id 배열(앱·서버가 거른다) · 개인 명단은 싣지 않는다
--   · notify_claim_relay(kind, id, mentions, tag) — service 전용 선점(키 rel:{kind}:{id}:{시각} — 올릴 때마다 새 키 · 사람이 눌렀으니 중복 판정 없음).
--                                           글·작성자 이름·행사 스레드·멘션(이 행사 멤버 + admin만 · 이름·이메일·Slack ID)을 돌려준다.
--                                           금액 열은 읽지 않는다(§19.7). 이메일은 Slack 계정을 찾는 데만(본문에 싣지 않는다 — §9 규칙 그대로)
--   · notify_mark_relayed(kind, id)       — service 전용 · 보낸 뒤 slack_posted_at 기록
--   파괴적 문장 0 — 열 추가(if not exists) · 표 신설(if not exists) · 정책 drop if exists + create · 함수 create or replace

alter table comments add column if not exists slack_posted_at timestamptz;
comment on column comments.slack_posted_at is 'v2.22.3 — 사람이 Slack에 올리기를 눌러 마지막으로 올린 시각(서버가 적는다). 자동 전송 없음';

create table if not exists registration_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  mention_ids uuid[] not null default '{}',
  slack_posted_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table registration_notes is 'v2.22.3 §4-25 — 등록 탭 담당자 소통 메모(담당자만 · 기록 · Slack은 사람이 올린다)';
create index if not exists registration_notes_project on registration_notes (project_id, created_at);
alter table registration_notes enable row level security;
drop policy if exists registration_notes_select on registration_notes;
create policy registration_notes_select on registration_notes for select to authenticated using (app.is_member(project_id));
drop policy if exists registration_notes_insert on registration_notes;
create policy registration_notes_insert on registration_notes for insert to authenticated
  with check (app.is_member(project_id) and author_id = app.current_profile_id());
revoke all on registration_notes from anon;
revoke update, delete on registration_notes from authenticated;
grant select, insert on registration_notes to authenticated;
grant all on registration_notes to service_role;

-- 사람이 올리는 글 한 건 선점 — 코멘트 또는 등록 메모. 없으면 null(서버가 404로 답한다)
create or replace function public.notify_claim_relay(p_kind text, p_id uuid, p_mentions uuid[], p_tag text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_key text := 'rel:' || p_kind || ':' || p_id || ':' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSMS');
  v_project projects;
  v_project_id uuid;
  v_area text;
  v_title text;
  v_deliverable uuid;
  v_body text;
  v_author text;
  v_created timestamptz;
  v_mentions jsonb;
begin
  if p_kind = 'comment' then
    select c.body, c.created_at, d.id, d.title, d.area::text,
           coalesce(p.display_name, case when c.author_token is not null then '발주처' else '담당자' end), pr.id
      into v_body, v_created, v_deliverable, v_title, v_area, v_author, v_project_id
      from comments c
      join deliverables d on d.id = c.deliverable_id
      join projects pr on pr.id = d.project_id
      left join profiles p on p.id = c.author_user_id
     where c.id = p_id;
  elsif p_kind = 'note' then
    select n.body, n.created_at, null::uuid, null::text, 'registration', coalesce(p.display_name, '담당자'), pr.id
      into v_body, v_created, v_deliverable, v_title, v_area, v_author, v_project_id
      from registration_notes n
      join projects pr on pr.id = n.project_id
      left join profiles p on p.id = n.author_id
     where n.id = p_id;
  else
    raise exception 'VALIDATION: 올릴 글의 종류는 comment 또는 note여야 합니다.' using errcode = 'P0422';
  end if;
  if v_project_id is null then return null; end if;
  -- 행 변수는 INTO 목록에 홀로만 올 수 있다(PL/pgSQL) — 행사 행은 따로 읽는다
  select * into v_project from projects where id = v_project_id;

  -- 멘션 = 이 행사 멤버(전역 admin 포함)만 · 이름 순 · 상한 10
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.display_name, 'email', x.email, 'slack_user_id', x.slack_user_id)
                            order by x.display_name, x.id), '[]'::jsonb)
    into v_mentions
    from (
      select p.id, p.display_name, p.email, p.slack_user_id
        from profiles p
       where p.id = any (coalesce(p_mentions, '{}'::uuid[]))
         and (p.app_role = 'admin' or exists (select 1 from project_members m where m.project_id = v_project.id and m.user_id = p.id))
       limit 10
    ) x;

  insert into notification_log (key, project_id, kind) values (v_key, v_project.id, 'relay_' || p_kind);
  return jsonb_build_object(
    'key', v_key, 'kind', 'relay_' || p_kind, 'project_id', v_project.id, 'project_code', v_project.code, 'project_name', v_project.name,
    'webhook', v_project.slack_webhook_url, 'thread', v_project.slack_thread_url, 'design_thread', v_project.design_thread_url,
    'area', v_area, 'deliverable_id', v_deliverable, 'title', v_title, 'author', v_author, 'body', left(v_body, 600),
    'created_at', v_created, 'tag', coalesce(p_tag, ''), 'mentions', v_mentions);
end $$;
revoke execute on function public.notify_claim_relay(text, uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.notify_claim_relay(text, uuid, uuid[], text) to service_role;

-- 보낸 뒤 기록 — 화면의 'Slack에 올림 · 시각' 배지
create or replace function public.notify_mark_relayed(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'comment' then
    update comments set slack_posted_at = now() where id = p_id;
  elsif p_kind = 'note' then
    update registration_notes set slack_posted_at = now() where id = p_id;
  else
    raise exception 'VALIDATION: 올릴 글의 종류는 comment 또는 note여야 합니다.' using errcode = 'P0422';
  end if;
end $$;
revoke execute on function public.notify_mark_relayed(text, uuid) from public, anon, authenticated;
grant execute on function public.notify_mark_relayed(text, uuid) to service_role;

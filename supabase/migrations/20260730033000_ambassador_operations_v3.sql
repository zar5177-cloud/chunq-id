-- Chunq ambassador operations v3
-- Private staff access, review decisions, applicant feedback, communications,
-- fulfillment, case ownership, due dates, and a permanent audit trail.

create table if not exists public.ambassador_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null default 'reviewer'
    check (role in ('owner', 'admin', 'reviewer', 'fulfillment')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.ambassador_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.ambassador_admins
  where user_id = auth.uid()
    and active
  limit 1;
$$;

create or replace function public.ambassador_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.ambassador_staff_role() is not null;
$$;

revoke all on function public.ambassador_staff_role() from public;
revoke all on function public.ambassador_is_staff() from public;
grant execute on function public.ambassador_staff_role() to authenticated;
grant execute on function public.ambassador_is_staff() to authenticated;

alter table public.ambassador_members
  add column if not exists next_action text,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists is_test boolean not null default false;

alter table public.ambassador_submissions
  add column if not exists review_feedback text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.ambassador_rewards
  add column if not exists requires_shipping boolean not null default false,
  add column if not exists requires_size boolean not null default false,
  add column if not exists tracking_required boolean not null default false;

alter table public.ambassador_reward_claims
  add column if not exists contacted_at timestamptz,
  add column if not exists reward_selection text,
  add column if not exists size text,
  add column if not exists shipping_name text,
  add column if not exists shipping_address_line1 text,
  add column if not exists shipping_address_line2 text,
  add column if not exists shipping_city text,
  add column if not exists shipping_region text,
  add column if not exists shipping_postal_code text,
  add column if not exists shipping_country text,
  add column if not exists tracking_carrier text,
  add column if not exists tracking_number text,
  add column if not exists tracking_url text;

update public.ambassador_rewards
set requires_shipping = true,
    requires_size = false,
    tracking_required = false,
    updated_at = now()
where key = 'welcome-stickers';

update public.ambassador_rewards
set requires_shipping = false,
    requires_size = false,
    tracking_required = false,
    updated_at = now()
where key = 'free-shipping';

update public.ambassador_rewards
set requires_shipping = true,
    requires_size = true,
    tracking_required = true,
    updated_at = now()
where key in ('first-item', 'creator-credit', 'elite-reward');

create table if not exists public.ambassador_member_operations (
  member_id uuid primary key references public.ambassador_members(id) on delete cascade,
  status text not null default 'active'
    check (status in (
      'active',
      'waiting_on_ambassador',
      'waiting_on_chunq',
      'paused',
      'graduated',
      'closed'
    )),
  priority text not null default 'standard'
    check (priority in ('standard', 'high', 'urgent')),
  assigned_to uuid references public.ambassador_admins(user_id) on delete set null,
  staff_summary text,
  last_contacted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.ambassador_submission_operations (
  submission_id uuid primary key references public.ambassador_submissions(id) on delete cascade,
  assigned_to uuid references public.ambassador_admins(user_id) on delete set null,
  review_due_at timestamptz,
  private_note text,
  updated_at timestamptz not null default now()
);

create table if not exists public.ambassador_reward_operations (
  reward_claim_id uuid primary key references public.ambassador_reward_claims(id) on delete cascade,
  assigned_to uuid references public.ambassador_admins(user_id) on delete set null,
  due_at timestamptz,
  private_note text,
  updated_at timestamptz not null default now()
);

create table if not exists public.ambassador_staff_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.ambassador_members(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 5000),
  created_by uuid not null references public.ambassador_admins(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.ambassador_communications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.ambassador_members(id) on delete cascade,
  direction text not null check (direction in ('outbound', 'inbound')),
  channel text not null check (channel in ('email', 'in_app', 'instagram', 'tiktok', 'phone', 'other')),
  subject text,
  body text not null check (length(trim(body)) between 1 and 10000),
  status text not null default 'logged'
    check (status in ('draft', 'sent', 'received', 'logged')),
  happened_at timestamptz not null default now(),
  created_by uuid not null references public.ambassador_admins(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.ambassador_staff_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.ambassador_admins(user_id) on delete restrict,
  member_id uuid references public.ambassador_members(id) on delete cascade,
  submission_id uuid references public.ambassador_submissions(id) on delete set null,
  reward_claim_id uuid references public.ambassador_reward_claims(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ambassador_submissions_review_queue_idx
  on public.ambassador_submissions (status, submitted_at);
create index if not exists ambassador_reward_claims_ops_queue_idx
  on public.ambassador_reward_claims (status, claimed_at);
create index if not exists ambassador_members_ops_queue_idx
  on public.ambassador_members (is_test, next_action_due_at);
create index if not exists ambassador_member_operations_queue_idx
  on public.ambassador_member_operations (status, priority, assigned_to, updated_at);
create index if not exists ambassador_submission_operations_queue_idx
  on public.ambassador_submission_operations (review_due_at, assigned_to);
create index if not exists ambassador_reward_operations_queue_idx
  on public.ambassador_reward_operations (due_at, assigned_to);
create index if not exists ambassador_staff_notes_member_idx
  on public.ambassador_staff_notes (member_id, created_at desc);
create index if not exists ambassador_communications_member_idx
  on public.ambassador_communications (member_id, happened_at desc);
create index if not exists ambassador_staff_actions_created_idx
  on public.ambassador_staff_actions (created_at desc);

create or replace function public.ambassador_ops_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ambassador_admins_touch_updated_at on public.ambassador_admins;
create trigger ambassador_admins_touch_updated_at
before update on public.ambassador_admins
for each row execute function public.ambassador_ops_touch_updated_at();

drop trigger if exists ambassador_submissions_touch_updated_at on public.ambassador_submissions;
create trigger ambassador_submissions_touch_updated_at
before update on public.ambassador_submissions
for each row execute function public.ambassador_ops_touch_updated_at();

drop trigger if exists ambassador_reward_claims_touch_updated_at on public.ambassador_reward_claims;
create trigger ambassador_reward_claims_touch_updated_at
before update on public.ambassador_reward_claims
for each row execute function public.ambassador_ops_touch_updated_at();

drop trigger if exists ambassador_member_operations_touch_updated_at on public.ambassador_member_operations;
create trigger ambassador_member_operations_touch_updated_at
before update on public.ambassador_member_operations
for each row execute function public.ambassador_ops_touch_updated_at();

drop trigger if exists ambassador_submission_operations_touch_updated_at on public.ambassador_submission_operations;
create trigger ambassador_submission_operations_touch_updated_at
before update on public.ambassador_submission_operations
for each row execute function public.ambassador_ops_touch_updated_at();

drop trigger if exists ambassador_reward_operations_touch_updated_at on public.ambassador_reward_operations;
create trigger ambassador_reward_operations_touch_updated_at
before update on public.ambassador_reward_operations
for each row execute function public.ambassador_ops_touch_updated_at();

insert into public.ambassador_admins (
  user_id,
  email,
  display_name,
  role,
  active
)
select
  id,
  email,
  'Zachary Relich',
  'owner',
  true
from auth.users
where lower(email) = 'zrelich@gmail.com'
on conflict (user_id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    role = 'owner',
    active = true,
    updated_at = now();

insert into public.ambassador_member_operations (
  member_id,
  assigned_to
)
select
  m.id,
  a.user_id
from public.ambassador_members m
cross join lateral (
  select user_id
  from public.ambassador_admins
  where role = 'owner' and active
  order by created_at
  limit 1
) a
on conflict (member_id) do nothing;

update public.ambassador_members m
set is_test = true,
    updated_at = now()
from public.ambassador_invites i
where i.id = m.invite_id
  and lower(i.email) = 'ambassador-test@chunqwear.com';

insert into public.ambassador_submission_operations (
  submission_id,
  assigned_to,
  review_due_at
)
select
  s.id,
  a.user_id,
  s.submitted_at + interval '2 days'
from public.ambassador_submissions s
cross join lateral (
  select user_id
  from public.ambassador_admins
  where role = 'owner' and active
  order by created_at
  limit 1
) a
where s.status = 'pending'
on conflict (submission_id) do nothing;

insert into public.ambassador_reward_operations (
  reward_claim_id,
  assigned_to,
  due_at
)
select
  c.id,
  a.user_id,
  c.claimed_at + interval '2 days'
from public.ambassador_reward_claims c
cross join lateral (
  select user_id
  from public.ambassador_admins
  where role = 'owner' and active
  order by created_at
  limit 1
) a
where c.status in ('requested', 'contacted')
on conflict (reward_claim_id) do nothing;

create or replace function public.ambassador_ops_seed_member_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner
  from public.ambassador_admins
  where role = 'owner' and active
  order by created_at
  limit 1;

  insert into public.ambassador_member_operations (member_id, assigned_to)
  values (new.id, v_owner)
  on conflict (member_id) do nothing;
  return new;
end;
$$;

create or replace function public.ambassador_ops_seed_submission_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select assigned_to into v_owner
  from public.ambassador_member_operations
  where member_id = new.member_id;

  insert into public.ambassador_submission_operations (
    submission_id,
    assigned_to,
    review_due_at
  )
  values (
    new.id,
    v_owner,
    new.submitted_at + interval '2 days'
  )
  on conflict (submission_id) do nothing;
  return new;
end;
$$;

create or replace function public.ambassador_ops_seed_reward_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select assigned_to into v_owner
  from public.ambassador_member_operations
  where member_id = new.member_id;

  insert into public.ambassador_reward_operations (
    reward_claim_id,
    assigned_to,
    due_at
  )
  values (
    new.id,
    v_owner,
    new.claimed_at + interval '2 days'
  )
  on conflict (reward_claim_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ambassador_ops_seed_member_after_insert on public.ambassador_members;
create trigger ambassador_ops_seed_member_after_insert
after insert on public.ambassador_members
for each row execute function public.ambassador_ops_seed_member_row();

drop trigger if exists ambassador_ops_seed_submission_after_insert on public.ambassador_submissions;
create trigger ambassador_ops_seed_submission_after_insert
after insert on public.ambassador_submissions
for each row execute function public.ambassador_ops_seed_submission_row();

drop trigger if exists ambassador_ops_seed_reward_after_insert on public.ambassador_reward_claims;
create trigger ambassador_ops_seed_reward_after_insert
after insert on public.ambassador_reward_claims
for each row execute function public.ambassador_ops_seed_reward_row();

alter table public.ambassador_admins enable row level security;
alter table public.ambassador_member_operations enable row level security;
alter table public.ambassador_submission_operations enable row level security;
alter table public.ambassador_reward_operations enable row level security;
alter table public.ambassador_staff_notes enable row level security;
alter table public.ambassador_communications enable row level security;
alter table public.ambassador_staff_actions enable row level security;

drop policy if exists "staff read staff access" on public.ambassador_admins;
create policy "staff read staff access"
on public.ambassador_admins
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff manage member operations" on public.ambassador_member_operations;
drop policy if exists "staff read member operations" on public.ambassador_member_operations;
create policy "staff read member operations"
on public.ambassador_member_operations
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff manage submission operations" on public.ambassador_submission_operations;
drop policy if exists "staff read submission operations" on public.ambassador_submission_operations;
create policy "staff read submission operations"
on public.ambassador_submission_operations
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff manage reward operations" on public.ambassador_reward_operations;
drop policy if exists "staff read reward operations" on public.ambassador_reward_operations;
create policy "staff read reward operations"
on public.ambassador_reward_operations
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff manage ambassador invites" on public.ambassador_invites;
drop policy if exists "staff read ambassador invites" on public.ambassador_invites;
create policy "staff read ambassador invites"
on public.ambassador_invites
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff manage ambassador members" on public.ambassador_members;
drop policy if exists "staff read ambassador members" on public.ambassador_members;
create policy "staff read ambassador members"
on public.ambassador_members
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff manage ambassador tasks" on public.ambassador_tasks;
drop policy if exists "staff read ambassador tasks" on public.ambassador_tasks;
create policy "staff read ambassador tasks"
on public.ambassador_tasks
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff manage ambassador submissions" on public.ambassador_submissions;
drop policy if exists "staff read ambassador submissions" on public.ambassador_submissions;
create policy "staff read ambassador submissions"
on public.ambassador_submissions
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff manage ambassador point ledger" on public.ambassador_point_ledger;
drop policy if exists "staff read ambassador point ledger" on public.ambassador_point_ledger;
create policy "staff read ambassador point ledger"
on public.ambassador_point_ledger
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff manage ambassador rewards" on public.ambassador_rewards;
drop policy if exists "staff read ambassador rewards" on public.ambassador_rewards;
create policy "staff read ambassador rewards"
on public.ambassador_rewards
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff manage ambassador reward claims" on public.ambassador_reward_claims;
drop policy if exists "staff read ambassador reward claims" on public.ambassador_reward_claims;
create policy "staff read ambassador reward claims"
on public.ambassador_reward_claims
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff manage ambassador notes" on public.ambassador_staff_notes;
drop policy if exists "staff read ambassador notes" on public.ambassador_staff_notes;
create policy "staff read ambassador notes"
on public.ambassador_staff_notes
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff manage ambassador communications" on public.ambassador_communications;
drop policy if exists "staff read ambassador communications" on public.ambassador_communications;
create policy "staff read ambassador communications"
on public.ambassador_communications
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff read ambassador audit trail" on public.ambassador_staff_actions;
create policy "staff read ambassador audit trail"
on public.ambassador_staff_actions
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff send member messages" on public.messages;

drop policy if exists "staff read ambassador profiles" on public.profiles;
create policy "staff read ambassador profiles"
on public.profiles
for select to authenticated
using (
  public.ambassador_is_staff()
  and exists (
    select 1
    from public.ambassador_members m
    where m.user_id = profiles.user_id
  )
);

drop policy if exists "staff read ambassador proof" on storage.objects;
create policy "staff read ambassador proof"
on storage.objects
for select to authenticated
using (
  bucket_id = 'ambassador-proof'
  and public.ambassador_is_staff()
);

create or replace function public.ambassador_admin_review_submission(
  p_submission_id uuid,
  p_decision text,
  p_feedback text,
  p_private_note text,
  p_next_action text,
  p_due_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := public.ambassador_staff_role();
  v_submission public.ambassador_submissions%rowtype;
  v_task public.ambassador_tasks%rowtype;
  v_member public.ambassador_members%rowtype;
  v_name text;
  v_message_subject text;
  v_message_body text;
  v_status text;
begin
  if coalesce(v_role, '') not in ('owner', 'admin', 'reviewer') then
    raise exception 'Staff review access is required.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Choose approved or rejected.';
  end if;

  if p_decision = 'rejected' and length(trim(coalesce(p_feedback, ''))) < 12 then
    raise exception 'Revision feedback must clearly explain what to fix.';
  end if;

  select * into strict v_submission
  from public.ambassador_submissions
  where id = p_submission_id
  for update;

  if v_submission.status = 'withdrawn' then
    raise exception 'A withdrawn submission cannot be reviewed.';
  end if;

  if v_submission.status = p_decision then
    raise exception 'This submission is already marked %.', p_decision;
  end if;

  if v_submission.status <> 'pending'
     and coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Only an owner or admin can correct a completed review.';
  end if;

  select * into strict v_task
  from public.ambassador_tasks
  where key = v_submission.task_key;

  select * into strict v_member
  from public.ambassador_members
  where id = v_submission.member_id;

  select i.public_name into v_name
  from public.ambassador_invites i
  where i.id = v_member.invite_id;

  update public.ambassador_submissions
  set status = p_decision,
      review_feedback = nullif(trim(p_feedback), ''),
      reviewed_by = v_actor,
      reviewed_at = now()
  where id = p_submission_id;

  insert into public.ambassador_submission_operations (
    submission_id,
    assigned_to,
    review_due_at,
    private_note
  )
  values (
    p_submission_id,
    v_actor,
    null,
    nullif(trim(p_private_note), '')
  )
  on conflict (submission_id) do update
  set assigned_to = excluded.assigned_to,
      review_due_at = excluded.review_due_at,
      private_note = excluded.private_note,
      updated_at = now();

  if p_decision = 'approved' then
    v_message_subject := 'Task approved: ' || v_task.label;
    v_message_body :=
      'We approved your “' || v_task.label || '” submission and added '
      || v_task.points || ' points.'
      || case
           when length(trim(coalesce(p_feedback, ''))) > 0
             then E'\n\nNote from Chunq: ' || trim(p_feedback)
           else ''
         end
      || case
           when length(trim(coalesce(p_next_action, ''))) > 0
             then E'\n\nNext: ' || trim(p_next_action)
           else E'\n\nOpen your ambassador tasks to choose what to do next.'
         end;
    v_status := case
      when length(trim(coalesce(p_next_action, ''))) > 0 then 'waiting_on_ambassador'
      else 'active'
    end;
  else
    v_message_subject := 'Please revise: ' || v_task.label;
    v_message_body :=
      'Your “' || v_task.label || '” submission needs another pass.'
      || E'\n\nWhat to fix: ' || trim(p_feedback)
      || E'\n\nReturn to your ambassador tasks and send a revised version.';
    v_status := 'waiting_on_ambassador';
  end if;

  update public.ambassador_members
  set next_action = case
        when length(trim(coalesce(p_next_action, ''))) > 0 then trim(p_next_action)
        when p_decision = 'rejected' then 'Revise and resubmit: ' || v_task.label
        else null
      end,
      next_action_due_at = case
        when p_due_at is not null then p_due_at
        when p_decision = 'rejected' then now() + interval '7 days'
        else null
      end,
      updated_at = now()
  where id = v_member.id;

  insert into public.ambassador_member_operations (
    member_id,
    status,
    assigned_to,
    last_contacted_at
  )
  values (
    v_member.id,
    v_status,
    v_actor,
    case when v_member.user_id is not null then now() else null end
  )
  on conflict (member_id) do update
  set status = excluded.status,
      assigned_to = excluded.assigned_to,
      last_contacted_at = coalesce(excluded.last_contacted_at, ambassador_member_operations.last_contacted_at),
      updated_at = now();

  if v_member.user_id is not null then
    insert into public.messages (
      user_id,
      sender_name,
      subject,
      body,
      related
    )
    values (
      v_member.user_id,
      'Chunq ambassador team',
      v_message_subject,
      v_message_body,
      jsonb_build_object(
        'kind', 'ambassador_review',
        'submission_id', p_submission_id,
        'decision', p_decision
      )
    );
  end if;

  insert into public.ambassador_communications (
    member_id,
    direction,
    channel,
    subject,
    body,
    status,
    happened_at,
    created_by
  )
  values (
    v_member.id,
    'outbound',
    'in_app',
    v_message_subject,
    v_message_body,
    case when v_member.user_id is not null then 'sent' else 'draft' end,
    now(),
    v_actor
  );

  insert into public.ambassador_staff_actions (
    actor_id,
    member_id,
    submission_id,
    action,
    detail
  )
  values (
    v_actor,
    v_member.id,
    p_submission_id,
    'submission_' || p_decision,
    jsonb_build_object(
      'applicant', v_name,
      'task_key', v_task.key,
      'task', v_task.label,
      'previous_status', v_submission.status,
      'feedback', nullif(trim(p_feedback), ''),
      'private_note', nullif(trim(p_private_note), ''),
      'next_action', nullif(trim(p_next_action), ''),
      'due_at', p_due_at
    )
  );

  return jsonb_build_object(
    'submission_id', p_submission_id,
    'status', p_decision,
    'member_id', v_member.id,
    'message_sent', v_member.user_id is not null
  );
end;
$$;

create or replace function public.ambassador_admin_update_member(
  p_member_id uuid,
  p_status text,
  p_priority text,
  p_assigned_to uuid,
  p_next_action text,
  p_due_at timestamptz,
  p_staff_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := public.ambassador_staff_role();
  v_before public.ambassador_member_operations%rowtype;
begin
  if coalesce(v_role, '') not in ('owner', 'admin', 'reviewer', 'fulfillment') then
    raise exception 'Staff access is required.';
  end if;

  if p_status not in (
    'active',
    'waiting_on_ambassador',
    'waiting_on_chunq',
    'paused',
    'graduated',
    'closed'
  ) then
    raise exception 'Choose a valid member status.';
  end if;

  if p_priority not in ('standard', 'high', 'urgent') then
    raise exception 'Choose a valid priority.';
  end if;

  if p_assigned_to is not null and not exists (
    select 1 from public.ambassador_admins
    where user_id = p_assigned_to and active
  ) then
    raise exception 'Choose an active staff owner.';
  end if;

  select * into strict v_before
  from public.ambassador_member_operations
  where member_id = p_member_id
  for update;

  update public.ambassador_member_operations
  set status = p_status,
      priority = p_priority,
      assigned_to = p_assigned_to,
      staff_summary = nullif(trim(p_staff_summary), '')
  where member_id = p_member_id;

  update public.ambassador_members
  set next_action = nullif(trim(p_next_action), ''),
      next_action_due_at = p_due_at,
      updated_at = now()
  where id = p_member_id;

  insert into public.ambassador_staff_actions (
    actor_id,
    member_id,
    action,
    detail
  )
  values (
    v_actor,
    p_member_id,
    'member_plan_updated',
    jsonb_build_object(
      'previous_status', v_before.status,
      'status', p_status,
      'previous_priority', v_before.priority,
      'priority', p_priority,
      'assigned_to', p_assigned_to,
      'next_action', nullif(trim(p_next_action), ''),
      'due_at', p_due_at
    )
  );

  return jsonb_build_object('member_id', p_member_id, 'updated', true);
end;
$$;

create or replace function public.ambassador_admin_add_note(
  p_member_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := public.ambassador_staff_role();
  v_note_id uuid;
begin
  if v_role is null then
    raise exception 'Staff access is required.';
  end if;

  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Write a note before saving.';
  end if;

  insert into public.ambassador_staff_notes (
    member_id,
    body,
    created_by
  )
  values (
    p_member_id,
    trim(p_body),
    v_actor
  )
  returning id into v_note_id;

  insert into public.ambassador_staff_actions (
    actor_id,
    member_id,
    action,
    detail
  )
  values (
    v_actor,
    p_member_id,
    'staff_note_added',
    jsonb_build_object('note_id', v_note_id)
  );

  return v_note_id;
end;
$$;

create or replace function public.ambassador_admin_log_communication(
  p_member_id uuid,
  p_direction text,
  p_channel text,
  p_subject text,
  p_body text,
  p_happened_at timestamptz,
  p_send_in_app boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := public.ambassador_staff_role();
  v_member public.ambassador_members%rowtype;
  v_communication_id uuid;
begin
  if v_role is null then
    raise exception 'Staff access is required.';
  end if;

  if p_direction not in ('outbound', 'inbound') then
    raise exception 'Choose inbound or outbound.';
  end if;

  if p_channel not in ('email', 'in_app', 'instagram', 'tiktok', 'phone', 'other') then
    raise exception 'Choose a valid communication channel.';
  end if;

  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Write the communication before saving.';
  end if;

  select * into strict v_member
  from public.ambassador_members
  where id = p_member_id
  for update;

  insert into public.ambassador_communications (
    member_id,
    direction,
    channel,
    subject,
    body,
    status,
    happened_at,
    created_by
  )
  values (
    p_member_id,
    p_direction,
    p_channel,
    nullif(trim(p_subject), ''),
    trim(p_body),
    case when p_direction = 'outbound' then 'sent' else 'received' end,
    coalesce(p_happened_at, now()),
    v_actor
  )
  returning id into v_communication_id;

  if p_direction = 'outbound' then
    update public.ambassador_member_operations
    set last_contacted_at = coalesce(p_happened_at, now())
    where member_id = p_member_id;
  end if;

  if p_send_in_app and p_direction = 'outbound' and v_member.user_id is not null then
    insert into public.messages (
      user_id,
      sender_name,
      subject,
      body,
      related
    )
    values (
      v_member.user_id,
      'Chunq ambassador team',
      coalesce(nullif(trim(p_subject), ''), 'Message from Chunq'),
      trim(p_body),
      jsonb_build_object(
        'kind', 'ambassador_message',
        'communication_id', v_communication_id
      )
    );
  end if;

  insert into public.ambassador_staff_actions (
    actor_id,
    member_id,
    action,
    detail
  )
  values (
    v_actor,
    p_member_id,
    'communication_logged',
    jsonb_build_object(
      'communication_id', v_communication_id,
      'direction', p_direction,
      'channel', p_channel,
      'subject', nullif(trim(p_subject), ''),
      'sent_in_app', (
        p_send_in_app
        and p_direction = 'outbound'
        and v_member.user_id is not null
      )
    )
  );

  return v_communication_id;
end;
$$;

create or replace function public.ambassador_admin_update_reward_claim(
  p_claim_id uuid,
  p_status text,
  p_staff_note text,
  p_private_note text,
  p_assigned_to uuid,
  p_due_at timestamptz,
  p_reward_selection text,
  p_size text,
  p_shipping_name text,
  p_shipping_address_line1 text,
  p_shipping_address_line2 text,
  p_shipping_city text,
  p_shipping_region text,
  p_shipping_postal_code text,
  p_shipping_country text,
  p_tracking_carrier text,
  p_tracking_number text,
  p_tracking_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := public.ambassador_staff_role();
  v_claim public.ambassador_reward_claims%rowtype;
  v_reward public.ambassador_rewards%rowtype;
  v_member public.ambassador_members%rowtype;
  v_subject text;
  v_body text;
  v_status_changed boolean;
begin
  if coalesce(v_role, '') not in ('owner', 'admin', 'fulfillment') then
    raise exception 'Fulfillment access is required.';
  end if;

  if p_status not in ('requested', 'contacted', 'fulfilled', 'declined', 'expired') then
    raise exception 'Choose a valid reward status.';
  end if;

  if p_assigned_to is not null and not exists (
    select 1 from public.ambassador_admins
    where user_id = p_assigned_to and active
  ) then
    raise exception 'Choose an active staff owner.';
  end if;

  select * into strict v_claim
  from public.ambassador_reward_claims
  where id = p_claim_id
  for update;

  v_status_changed := p_status is distinct from v_claim.status;

  select * into strict v_reward
  from public.ambassador_rewards
  where key = v_claim.reward_key;

  select * into strict v_member
  from public.ambassador_members
  where id = v_claim.member_id;

  if p_status = 'fulfilled' and v_reward.requires_shipping then
    if length(trim(coalesce(p_shipping_name, ''))) = 0
       or length(trim(coalesce(p_shipping_address_line1, ''))) = 0
       or length(trim(coalesce(p_shipping_city, ''))) = 0
       or length(trim(coalesce(p_shipping_postal_code, ''))) = 0
       or length(trim(coalesce(p_shipping_country, ''))) = 0 then
      raise exception 'Complete the shipping address before fulfillment.';
    end if;
  end if;

  if p_status = 'fulfilled' and v_reward.requires_size
     and length(trim(coalesce(p_size, ''))) = 0 then
    raise exception 'Add the confirmed size before fulfillment.';
  end if;

  if p_status = 'fulfilled' and v_reward.tracking_required
     and length(trim(coalesce(nullif(p_tracking_number, ''), nullif(p_tracking_url, ''), ''))) = 0 then
    raise exception 'Add tracking before marking this reward fulfilled.';
  end if;

  update public.ambassador_reward_claims
  set status = p_status,
      staff_note = nullif(trim(p_staff_note), ''),
      contacted_at = case
        when p_status in ('contacted', 'fulfilled') then coalesce(contacted_at, now())
        else contacted_at
      end,
      fulfilled_at = case
        when p_status = 'fulfilled' then coalesce(fulfilled_at, now())
        when p_status in ('requested', 'contacted') then null
        else fulfilled_at
      end,
      reward_selection = nullif(trim(p_reward_selection), ''),
      size = nullif(trim(p_size), ''),
      shipping_name = nullif(trim(p_shipping_name), ''),
      shipping_address_line1 = nullif(trim(p_shipping_address_line1), ''),
      shipping_address_line2 = nullif(trim(p_shipping_address_line2), ''),
      shipping_city = nullif(trim(p_shipping_city), ''),
      shipping_region = nullif(trim(p_shipping_region), ''),
      shipping_postal_code = nullif(trim(p_shipping_postal_code), ''),
      shipping_country = nullif(trim(p_shipping_country), ''),
      tracking_carrier = nullif(trim(p_tracking_carrier), ''),
      tracking_number = nullif(trim(p_tracking_number), ''),
      tracking_url = nullif(trim(p_tracking_url), '')
  where id = p_claim_id;

  insert into public.ambassador_reward_operations (
    reward_claim_id,
    assigned_to,
    due_at,
    private_note
  )
  values (
    p_claim_id,
    p_assigned_to,
    p_due_at,
    nullif(trim(p_private_note), '')
  )
  on conflict (reward_claim_id) do update
  set assigned_to = excluded.assigned_to,
      due_at = excluded.due_at,
      private_note = excluded.private_note,
      updated_at = now();

  if v_status_changed and p_status = 'contacted' then
    v_subject := 'Reward details needed: ' || v_reward.label;
    v_body :=
      'We are preparing your “' || v_reward.label || '” reward.'
      || E'\n\nPlease reply to the Chunq ambassador team if any requested size or shipping detail needs to be updated.'
      || case
           when length(trim(coalesce(p_staff_note, ''))) > 0
             then E'\n\nNote from Chunq: ' || trim(p_staff_note)
           else ''
         end;
  elsif v_status_changed and p_status = 'fulfilled' then
    v_subject := 'Reward fulfilled: ' || v_reward.label;
    v_body :=
      'Your “' || v_reward.label || '” reward has been fulfilled.'
      || case
           when length(trim(coalesce(p_tracking_url, ''))) > 0
             then E'\n\nTrack it here: ' || trim(p_tracking_url)
           when length(trim(coalesce(p_tracking_number, ''))) > 0
             then E'\n\nTracking number: ' || trim(p_tracking_number)
           else ''
         end
      || case
           when length(trim(coalesce(p_staff_note, ''))) > 0
             then E'\n\nNote from Chunq: ' || trim(p_staff_note)
           else ''
         end;
  elsif v_status_changed and p_status in ('declined', 'expired') then
    v_subject := 'Reward update: ' || v_reward.label;
    v_body :=
      'There is an update to your “' || v_reward.label || '” request.'
      || case
           when length(trim(coalesce(p_staff_note, ''))) > 0
             then E'\n\n' || trim(p_staff_note)
           else E'\n\nEmail the Chunq ambassador team if you have questions.'
         end;
  end if;

  if v_subject is not null and v_member.user_id is not null then
    insert into public.messages (
      user_id,
      sender_name,
      subject,
      body,
      related
    )
    values (
      v_member.user_id,
      'Chunq ambassador team',
      v_subject,
      v_body,
      jsonb_build_object(
        'kind', 'ambassador_reward',
        'reward_claim_id', p_claim_id,
        'status', p_status
      )
    );

    insert into public.ambassador_communications (
      member_id,
      direction,
      channel,
      subject,
      body,
      status,
      happened_at,
      created_by
    )
    values (
      v_member.id,
      'outbound',
      'in_app',
      v_subject,
      v_body,
      'sent',
      now(),
      v_actor
    );
  end if;

  update public.ambassador_members
  set next_action = case
        when p_status = 'contacted' then 'Confirm the details for your ' || v_reward.label
        when p_status = 'fulfilled' and v_reward.requires_shipping then 'Watch for your ' || v_reward.label || ' delivery'
        when p_status = 'fulfilled' then 'Check your messages for your ' || v_reward.label
        else next_action
      end,
      next_action_due_at = case
        when p_status = 'contacted' then coalesce(p_due_at, now() + interval '3 days')
        when p_status = 'fulfilled' then null
        else next_action_due_at
      end,
      updated_at = now()
  where id = v_member.id;

  insert into public.ambassador_member_operations (
    member_id,
    status,
    assigned_to,
    last_contacted_at
  )
  values (
    v_member.id,
    case
      when p_status = 'contacted' then 'waiting_on_ambassador'
      when p_status = 'fulfilled' then 'active'
      else 'active'
    end,
    p_assigned_to,
    case when v_subject is not null then now() else null end
  )
  on conflict (member_id) do update
  set status = case
        when p_status = 'contacted' then 'waiting_on_ambassador'
        when p_status = 'fulfilled' then 'active'
        else ambassador_member_operations.status
      end,
      assigned_to = coalesce(excluded.assigned_to, ambassador_member_operations.assigned_to),
      last_contacted_at = coalesce(excluded.last_contacted_at, ambassador_member_operations.last_contacted_at),
      updated_at = now();

  insert into public.ambassador_staff_actions (
    actor_id,
    member_id,
    reward_claim_id,
    action,
    detail
  )
  values (
    v_actor,
    v_member.id,
    p_claim_id,
    case when v_status_changed then 'reward_' || p_status else 'reward_record_updated' end,
    jsonb_build_object(
      'reward_key', v_reward.key,
      'reward', v_reward.label,
      'previous_status', v_claim.status,
      'status', p_status,
      'assigned_to', p_assigned_to,
      'due_at', p_due_at,
      'private_note', nullif(trim(p_private_note), ''),
      'reward_selection', nullif(trim(p_reward_selection), ''),
      'size', nullif(trim(p_size), ''),
      'tracking_carrier', nullif(trim(p_tracking_carrier), ''),
      'tracking_number', nullif(trim(p_tracking_number), ''),
      'tracking_url', nullif(trim(p_tracking_url), '')
    )
  );

  return jsonb_build_object(
    'claim_id', p_claim_id,
    'status', p_status,
    'message_sent', v_subject is not null and v_member.user_id is not null
  );
end;
$$;

create or replace function public.ambassador_admin_adjust_points(
  p_member_id uuid,
  p_delta integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := public.ambassador_staff_role();
  v_ledger_id uuid;
begin
  if coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Admin access is required for point adjustments.';
  end if;

  if p_delta = 0 or abs(p_delta) > 500 then
    raise exception 'Point adjustment must be between -500 and 500 and cannot be zero.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'Add a clear reason for this point adjustment.';
  end if;

  insert into public.ambassador_point_ledger (
    member_id,
    submission_id,
    delta,
    reason
  )
  values (
    p_member_id,
    null,
    p_delta,
    trim(p_reason)
  )
  returning id into v_ledger_id;

  insert into public.ambassador_staff_actions (
    actor_id,
    member_id,
    action,
    detail
  )
  values (
    v_actor,
    p_member_id,
    'points_adjusted',
    jsonb_build_object(
      'ledger_id', v_ledger_id,
      'delta', p_delta,
      'reason', trim(p_reason)
    )
  );

  return jsonb_build_object('ledger_id', v_ledger_id, 'delta', p_delta);
end;
$$;

create or replace function public.ambassador_admin_add_staff(
  p_email text,
  p_display_name text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_role text := public.ambassador_staff_role();
  v_user auth.users%rowtype;
begin
  if coalesce(v_actor_role, '') <> 'owner' then
    raise exception 'Owner access is required.';
  end if;

  if p_role not in ('admin', 'reviewer', 'fulfillment') then
    raise exception 'Choose admin, reviewer, or fulfillment.';
  end if;

  select * into strict v_user
  from auth.users
  where lower(email) = lower(trim(p_email));

  insert into public.ambassador_admins (
    user_id,
    email,
    display_name,
    role,
    active
  )
  values (
    v_user.id,
    v_user.email,
    coalesce(nullif(trim(p_display_name), ''), split_part(v_user.email, '@', 1)),
    p_role,
    true
  )
  on conflict (user_id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      role = excluded.role,
      active = true,
      updated_at = now();

  return jsonb_build_object(
    'user_id', v_user.id,
    'email', v_user.email,
    'role', p_role
  );
exception
  when no_data_found then
    raise exception 'That email must create a Chunq ID account before staff access can be added.';
end;
$$;

create or replace function public.ambassador_admin_set_staff_access(
  p_user_id uuid,
  p_role text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text := public.ambassador_staff_role();
  v_target public.ambassador_admins%rowtype;
begin
  if coalesce(v_actor_role, '') <> 'owner' then
    raise exception 'Owner access is required.';
  end if;

  if p_user_id = v_actor and not p_active then
    raise exception 'You cannot remove your own owner access.';
  end if;

  if p_role not in ('owner', 'admin', 'reviewer', 'fulfillment') then
    raise exception 'Choose a valid staff role.';
  end if;

  select * into strict v_target
  from public.ambassador_admins
  where user_id = p_user_id
  for update;

  if v_target.role = 'owner'
     and (not p_active or p_role <> 'owner')
     and (select count(*) from public.ambassador_admins where role = 'owner' and active) <= 1 then
    raise exception 'At least one active owner is required.';
  end if;

  update public.ambassador_admins
  set role = p_role,
      active = p_active,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.ambassador_staff_actions (
    actor_id,
    action,
    detail
  )
  values (
    v_actor,
    'staff_access_updated',
    jsonb_build_object(
      'target_user_id', p_user_id,
      'previous_role', v_target.role,
      'role', p_role,
      'previous_active', v_target.active,
      'active', p_active
    )
  );

  return jsonb_build_object('user_id', p_user_id, 'role', p_role, 'active', p_active);
end;
$$;

revoke all on function public.ambassador_admin_review_submission(uuid, text, text, text, text, timestamptz) from public;
revoke all on function public.ambassador_admin_update_member(uuid, text, text, uuid, text, timestamptz, text) from public;
revoke all on function public.ambassador_admin_add_note(uuid, text) from public;
revoke all on function public.ambassador_admin_log_communication(uuid, text, text, text, text, timestamptz, boolean) from public;
revoke all on function public.ambassador_admin_update_reward_claim(uuid, text, text, text, uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.ambassador_admin_adjust_points(uuid, integer, text) from public;
revoke all on function public.ambassador_admin_add_staff(text, text, text) from public;
revoke all on function public.ambassador_admin_set_staff_access(uuid, text, boolean) from public;

grant execute on function public.ambassador_admin_review_submission(uuid, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.ambassador_admin_update_member(uuid, text, text, uuid, text, timestamptz, text) to authenticated;
grant execute on function public.ambassador_admin_add_note(uuid, text) to authenticated;
grant execute on function public.ambassador_admin_log_communication(uuid, text, text, text, text, timestamptz, boolean) to authenticated;
grant execute on function public.ambassador_admin_update_reward_claim(uuid, text, text, text, uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.ambassador_admin_adjust_points(uuid, integer, text) to authenticated;
grant execute on function public.ambassador_admin_add_staff(text, text, text) to authenticated;
grant execute on function public.ambassador_admin_set_staff_access(uuid, text, boolean) to authenticated;

comment on table public.ambassador_admins is
  'Private staff access for the Chunq ambassador operations dashboard.';
comment on table public.ambassador_member_operations is
  'Private staff-only ownership, priority, contact, and relationship status for each ambassador.';
comment on table public.ambassador_submission_operations is
  'Private staff-only assignment, SLA, and notes for each ambassador submission.';
comment on table public.ambassador_reward_operations is
  'Private staff-only assignment, due date, and notes for each reward request.';
comment on table public.ambassador_staff_notes is
  'Internal-only chronological notes about an ambassador relationship.';
comment on table public.ambassador_communications is
  'Every logged ambassador communication across email, in-app, social, phone, and other channels.';
comment on table public.ambassador_staff_actions is
  'Immutable audit trail for reviews, fulfillment, point changes, communications, and staff access.';

-- Chunq ambassador integration spine v1
-- Stages every application without losing source evidence, blocks ambiguous
-- identities from outreach, creates a controlled email outbox, and exposes
-- external integration health to the private operations dashboard.

create table if not exists public.ambassador_applications (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'google_form',
  source_sheet_id text not null,
  source_tab text not null,
  source_row integer not null check (source_row > 1),
  source_response_key text not null unique,
  submitted_at timestamptz not null,
  person_key text not null,
  collector_email text,
  stated_email text,
  canonical_email text,
  email_conflict boolean not null default false,
  legal_name text not null,
  public_name text not null,
  phone text,
  city text,
  region text,
  country text,
  age_text text,
  primary_platform text,
  instagram_handle text,
  instagram_followers_claimed text,
  instagram_followers_observed integer,
  instagram_url text,
  tiktok_handle text,
  tiktok_followers_claimed text,
  tiktok_followers_observed integer,
  tiktok_url text,
  youtube_url text,
  youtube_subscribers_claimed text,
  youtube_subscribers_observed integer,
  other_platform text,
  average_performance_claimed text,
  best_content_url text,
  second_content_url text,
  portfolio_url text,
  photo_urls text[] not null default '{}',
  style_words text,
  motivation text,
  fair_deal text,
  recommended_tier text
    check (recommended_tier is null or recommended_tier in ('signature', 'core', 'creator', 'community')),
  final_tier text
    check (final_tier is null or final_tier in ('signature', 'core', 'creator', 'community')),
  review_score integer check (review_score is null or review_score between 0 and 100),
  strengths text,
  risks text,
  decision_note text,
  first_mission text,
  review_summary jsonb not null default '{}'::jsonb,
  raw_response jsonb not null,
  duplicate_of uuid references public.ambassador_applications(id) on delete set null,
  data_quality_status text not null default 'needs_review'
    check (data_quality_status in ('ready', 'email_conflict', 'duplicate', 'invalid_email', 'needs_review')),
  decision_status text not null default 'pending'
    check (decision_status in ('pending', 'accepted', 'more_info', 'declined', 'duplicate')),
  invite_id uuid references public.ambassador_invites(id) on delete set null,
  reviewed_by uuid references public.ambassador_admins(user_id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_sheet_id, source_tab, source_row)
);

create table if not exists public.ambassador_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.ambassador_applications(id) on delete cascade,
  actor_id uuid references public.ambassador_admins(user_id) on delete set null,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ambassador_email_outbox (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.ambassador_applications(id) on delete set null,
  member_id uuid references public.ambassador_members(id) on delete set null,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'sent', 'failed', 'bounced', 'cancelled')),
  idempotency_key text not null unique,
  provider text,
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_by uuid references public.ambassador_admins(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ambassador_integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  integration_key text not null,
  status text not null check (status in ('running', 'succeeded', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  conflict_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_message text,
  detail jsonb not null default '{}'::jsonb,
  created_by uuid references public.ambassador_admins(user_id) on delete set null
);

create table if not exists public.ambassador_integration_health (
  integration_key text primary key,
  label text not null,
  status text not null check (status in ('healthy', 'attention', 'blocked', 'manual', 'not_configured')),
  summary text not null,
  last_checked_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists ambassador_applications_queue_idx
  on public.ambassador_applications (decision_status, data_quality_status, submitted_at desc);
create index if not exists ambassador_applications_person_idx
  on public.ambassador_applications (person_key, source_row);
create index if not exists ambassador_applications_email_idx
  on public.ambassador_applications (lower(canonical_email));
create index if not exists ambassador_application_events_idx
  on public.ambassador_application_events (application_id, created_at desc);
create index if not exists ambassador_email_outbox_queue_idx
  on public.ambassador_email_outbox (status, next_attempt_at, created_at);
create index if not exists ambassador_sync_runs_idx
  on public.ambassador_integration_sync_runs (integration_key, started_at desc);

drop trigger if exists ambassador_applications_touch_updated_at on public.ambassador_applications;
create trigger ambassador_applications_touch_updated_at
before update on public.ambassador_applications
for each row execute function public.ambassador_ops_touch_updated_at();

drop trigger if exists ambassador_email_outbox_touch_updated_at on public.ambassador_email_outbox;
create trigger ambassador_email_outbox_touch_updated_at
before update on public.ambassador_email_outbox
for each row execute function public.ambassador_ops_touch_updated_at();

drop trigger if exists ambassador_integration_health_touch_updated_at on public.ambassador_integration_health;
create trigger ambassador_integration_health_touch_updated_at
before update on public.ambassador_integration_health
for each row execute function public.ambassador_ops_touch_updated_at();

alter table public.ambassador_applications enable row level security;
alter table public.ambassador_application_events enable row level security;
alter table public.ambassador_email_outbox enable row level security;
alter table public.ambassador_integration_sync_runs enable row level security;
alter table public.ambassador_integration_health enable row level security;

drop policy if exists "staff read ambassador applications" on public.ambassador_applications;
create policy "staff read ambassador applications"
on public.ambassador_applications
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff read application events" on public.ambassador_application_events;
create policy "staff read application events"
on public.ambassador_application_events
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff read email outbox" on public.ambassador_email_outbox;
create policy "staff read email outbox"
on public.ambassador_email_outbox
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff read integration sync runs" on public.ambassador_integration_sync_runs;
create policy "staff read integration sync runs"
on public.ambassador_integration_sync_runs
for select to authenticated
using (public.ambassador_is_staff());

drop policy if exists "staff read integration health" on public.ambassador_integration_health;
create policy "staff read integration health"
on public.ambassador_integration_health
for select to authenticated
using (public.ambassador_is_staff());

revoke all on table public.ambassador_applications from anon, authenticated;
revoke all on table public.ambassador_application_events from anon, authenticated;
revoke all on table public.ambassador_email_outbox from anon, authenticated;
revoke all on table public.ambassador_integration_sync_runs from anon, authenticated;
revoke all on table public.ambassador_integration_health from anon, authenticated;
grant select on table public.ambassador_applications to authenticated;
grant select on table public.ambassador_application_events to authenticated;
grant select on table public.ambassador_email_outbox to authenticated;
grant select on table public.ambassador_integration_sync_runs to authenticated;
grant select on table public.ambassador_integration_health to authenticated;

-- A member may remove a failed upload before a submission references it.
-- Once the proof URL is stored, only staff retention processes can remove it.
drop policy if exists "ambassadors delete own unreviewed proof" on storage.objects;
drop policy if exists "ambassadors delete own unsubmitted proof" on storage.objects;
create policy "ambassadors delete own unsubmitted proof"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'ambassador-proof'
  and (storage.foldername(name))[1] = auth.uid()::text
  and not exists (
    select 1
    from public.ambassador_submissions s
    where s.proof_url = 'storage://ambassador-proof/' || storage.objects.name
  )
);

create or replace function public.ambassador_admin_resolve_application_email(
  p_application_id uuid,
  p_canonical_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.ambassador_staff_role();
  v_application public.ambassador_applications%rowtype;
  v_email text := lower(trim(p_canonical_email));
begin
  if coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Only an owner or admin can resolve an applicant email.';
  end if;

  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Choose a valid applicant email.';
  end if;

  select * into v_application
  from public.ambassador_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Application not found.';
  end if;

  if v_email not in (
    lower(trim(coalesce(v_application.collector_email, ''))),
    lower(trim(coalesce(v_application.stated_email, '')))
  ) then
    raise exception 'Choose one of the two submitted email addresses.';
  end if;

  update public.ambassador_applications
  set canonical_email = v_email,
      email_conflict = false,
      data_quality_status = case
        when duplicate_of is not null then 'duplicate'
        else 'ready'
      end
  where id = p_application_id;

  insert into public.ambassador_application_events(application_id, actor_id, event_type, detail)
  values (
    p_application_id,
    auth.uid(),
    'email_resolved',
    jsonb_build_object('canonical_email', v_email)
  );

  return p_application_id;
end;
$$;

create or replace function public.ambassador_admin_decide_application(
  p_application_id uuid,
  p_decision text,
  p_tier text,
  p_score integer,
  p_strengths text,
  p_decision_note text,
  p_first_mission text,
  p_email_subject text default null,
  p_email_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.ambassador_staff_role();
  v_application public.ambassador_applications%rowtype;
  v_invite public.ambassador_invites%rowtype;
  v_invite_id uuid;
  v_code text;
  v_prefix text;
  v_slug text;
  v_subject text;
  v_body text;
  v_rows integer[];
begin
  if coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Only an owner or admin can make a final application decision.';
  end if;

  if p_decision not in ('accepted', 'more_info', 'declined') then
    raise exception 'Choose accepted, more info, or declined.';
  end if;

  if p_score is not null and (p_score < 0 or p_score > 100) then
    raise exception 'Score must be from 0 to 100.';
  end if;

  select * into v_application
  from public.ambassador_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Application not found.';
  end if;

  if v_application.duplicate_of is not null or v_application.data_quality_status = 'duplicate' then
    raise exception 'Make the decision on the primary application, not its duplicate.';
  end if;

  if v_application.email_conflict or v_application.data_quality_status in ('email_conflict', 'invalid_email') then
    raise exception 'Resolve the applicant email before making a decision.';
  end if;

  if p_decision = 'accepted' then
    if p_tier not in ('signature', 'core', 'creator', 'community') then
      raise exception 'Choose a valid starting tier.';
    end if;

    if coalesce(trim(v_application.canonical_email), '') = '' then
      raise exception 'A verified email is required before acceptance.';
    end if;

    select * into v_invite
    from public.ambassador_invites
    where lower(email) = lower(v_application.canonical_email)
    limit 1;

    if found then
      v_invite_id := v_invite.id;
      update public.ambassador_invites
      set legal_name = v_application.legal_name,
          public_name = v_application.public_name,
          initial_class = p_tier,
          review_score = coalesce(p_score, v_application.review_score, review_score),
          strengths = coalesce(nullif(trim(p_strengths), ''), strengths),
          starting_note = coalesce(nullif(trim(p_first_mission), ''), starting_note),
          updated_at = now()
      where id = v_invite_id;
    else
      v_prefix := case p_tier
        when 'signature' then 'A0'
        when 'core' then 'A1'
        when 'creator' then 'A2'
        else 'A3'
      end;
      v_slug := upper(substr(regexp_replace(v_application.public_name, '[^a-zA-Z0-9]+', '', 'g'), 1, 10));
      if v_slug = '' then v_slug := 'CREATOR'; end if;

      loop
        v_code := 'CHQ-' || v_prefix || '-' || v_slug || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
        exit when not exists (
          select 1 from public.ambassador_invites where invite_code = v_code
        );
      end loop;

      select array_agg(source_row order by source_row)
      into v_rows
      from public.ambassador_applications
      where person_key = v_application.person_key;

      insert into public.ambassador_invites (
        email,
        legal_name,
        public_name,
        initial_class,
        review_score,
        source_rows,
        invite_code,
        strengths,
        starting_note
      )
      values (
        lower(v_application.canonical_email),
        v_application.legal_name,
        v_application.public_name,
        p_tier,
        coalesce(p_score, v_application.review_score, 0),
        coalesce(v_rows, array[v_application.source_row]),
        v_code,
        coalesce(nullif(trim(p_strengths), ''), 'Selected for the Chunq ambassador program.'),
        coalesce(nullif(trim(p_first_mission), ''), 'Sign in, read the starter tasks, and complete the first task that fits your strengths.')
      )
      returning id into v_invite_id;
    end if;
  else
    v_invite_id := v_application.invite_id;
  end if;

  update public.ambassador_applications
  set decision_status = p_decision,
      final_tier = case when p_decision = 'accepted' then p_tier else null end,
      review_score = coalesce(p_score, review_score),
      strengths = coalesce(nullif(trim(p_strengths), ''), strengths),
      decision_note = coalesce(nullif(trim(p_decision_note), ''), decision_note),
      first_mission = coalesce(nullif(trim(p_first_mission), ''), first_mission),
      invite_id = v_invite_id,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_application_id;

  v_subject := coalesce(
    nullif(trim(p_email_subject), ''),
    case p_decision
      when 'accepted' then 'You are in — your Chunq ambassador account'
      when 'more_info' then 'One next step for your Chunq application'
      else 'Your Chunq ambassador application'
    end
  );

  v_body := coalesce(
    nullif(trim(p_email_body), ''),
    case p_decision
      when 'accepted' then
        'Hi ' || v_application.public_name || E',\n\n'
        || coalesce(nullif(trim(p_strengths), ''), 'We see a strong fit with what you are building.') || E'\n\n'
        || 'Your starting tier is ' || initcap(p_tier) || E'.\n\n'
        || 'Start here: create or sign in to your Chunq account with this exact email at https://id.chunqwear.com/auth, then open https://id.chunqwear.com/ambassador.html.' || E'\n\n'
        || 'Your first move: ' || coalesce(nullif(trim(p_first_mission), ''), 'complete the starter tasks shown in your dashboard.') || E'\n\n'
        || 'Every approved task adds points. Rewards unlock as your points grow, and the dashboard always shows what to do next.' || E'\n\n'
        || '— Chunq'
      when 'more_info' then
        'Hi ' || v_application.public_name || E',\n\n'
        || 'We reviewed your application and want one more piece before making a final decision.' || E'\n\n'
        || coalesce(nullif(trim(p_first_mission), ''), nullif(trim(p_decision_note), ''), 'Reply with a current public example of your work and recent account analytics.') || E'\n\n'
        || '— Chunq'
      else
        'Hi ' || v_application.public_name || E',\n\n'
        || 'Thank you for taking the time to apply to the Chunq ambassador program. We are not opening an account for this application, but we appreciate the work you shared.' || E'\n\n'
        || coalesce(nullif(trim(p_decision_note), '') || E'\n\n', '')
        || '— Chunq'
    end
  );

  insert into public.ambassador_email_outbox (
    application_id,
    to_email,
    subject,
    body,
    status,
    idempotency_key,
    created_by
  )
  values (
    p_application_id,
    lower(v_application.canonical_email),
    v_subject,
    v_body,
    'draft',
    'application:' || p_application_id::text || ':decision:' || p_decision || ':v1',
    auth.uid()
  )
  on conflict (idempotency_key) do update
  set to_email = excluded.to_email,
      subject = excluded.subject,
      body = excluded.body,
      status = case
        when ambassador_email_outbox.status in ('sent', 'bounced') then ambassador_email_outbox.status
        else 'draft'
      end,
      updated_at = now();

  insert into public.ambassador_application_events(application_id, actor_id, event_type, detail)
  values (
    p_application_id,
    auth.uid(),
    'decision_recorded',
    jsonb_build_object(
      'decision', p_decision,
      'tier', case when p_decision = 'accepted' then p_tier else null end,
      'invite_id', v_invite_id,
      'email_draft_created', true
    )
  );

  return p_application_id;
end;
$$;

revoke all on function public.ambassador_admin_resolve_application_email(uuid, text) from public;
revoke all on function public.ambassador_admin_decide_application(uuid, text, text, integer, text, text, text, text, text) from public;
revoke all on function public.ambassador_admin_resolve_application_email(uuid, text) from anon, authenticated;
revoke all on function public.ambassador_admin_decide_application(uuid, text, text, integer, text, text, text, text, text) from anon, authenticated;
grant execute on function public.ambassador_admin_resolve_application_email(uuid, text) to authenticated;
grant execute on function public.ambassador_admin_decide_application(uuid, text, text, integer, text, text, text, text, text) to authenticated;

insert into public.ambassador_integration_health (
  integration_key,
  label,
  status,
  summary,
  last_checked_at,
  details
)
values
  (
    'google_forms',
    'Applications form',
    'attention',
    'The staging tables are ready; the first verified import has not completed yet.',
    now(),
    '{"owner":"ambassador operations","direction":"Google Form to staging"}'::jsonb
  ),
  (
    'supabase_auth_email',
    'Account email',
    'healthy',
    'Chunq account email is routed through the company IONOS SMTP service.',
    now(),
    '{"provider":"IONOS SMTP","boundary":"Supabase Auth"}'::jsonb
  ),
  (
    'company_mailbox',
    'Company mailbox',
    'manual',
    'Replies and outbound messages still require mailbox review; no provider event sync is verified.',
    now(),
    '{"provider":"IONOS","risk":"sent and bounced status are not automatically reconciled"}'::jsonb
  ),
  (
    'shopify_rewards',
    'Shopify rewards',
    'blocked',
    'Reward claims are not yet connected to Shopify products, inventory, orders, fulfillment, or tracking.',
    now(),
    '{"next_step":"map reward SKUs and create a controlled fulfillment handoff"}'::jsonb
  ),
  (
    'database_safety',
    'Database safety',
    'attention',
    'Operational backups, SSL enforcement, and network restrictions still require a production hardening pass.',
    now(),
    '{"next_step":"enable recoverability and restrict direct database access"}'::jsonb
  )
on conflict (integration_key) do update
set label = excluded.label,
    status = excluded.status,
    summary = excluded.summary,
    last_checked_at = excluded.last_checked_at,
    details = excluded.details,
    updated_at = now();

comment on table public.ambassador_applications is
  'Private lossless staging and decision record for every ambassador form response.';
comment on table public.ambassador_email_outbox is
  'Private draft-first communication queue. No row in this table is sent automatically.';
comment on table public.ambassador_integration_health is
  'Staff-visible truth about external boundaries; statuses must not imply unverified automation.';

import crypto from "node:crypto";
import fs from "node:fs/promises";

const DEFAULT_PROJECT_REF = "dtauxotoxxrlduaagovo";
const DEFAULT_SHEET_ID = "1_Jf4x31Mm0Q-F0hxdtTXYypHKCnXJG8DpWArqNJXLeQ";
const DEFAULT_TAB = "Form Responses 1";

function argumentsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`Invalid argument near ${argv[index] || "end of command"}.`);
    result[key] = value;
  }
  return result;
}

function required(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function normalize(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return normalize(value).toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function integer(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function sql(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlInteger(value) {
  return Number.isInteger(value) ? String(value) : "null";
}

function sqlBoolean(value) {
  return value ? "true" : "false";
}

function sqlJson(value) {
  return `${sql(JSON.stringify(value))}::jsonb`;
}

function sqlTextArray(values) {
  const clean = values.map(normalize).filter(Boolean);
  return clean.length ? `array[${clean.map(sql).join(",")}]::text[]` : "'{}'::text[]";
}

function personKeyFor(name, email) {
  return crypto
    .createHash("sha256")
    .update(`${normalize(name).toLowerCase()}|${normalizeEmail(email)}`)
    .digest("hex");
}

function timeZoneOffsetMilliseconds(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const zone = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = zone.match(/GMT(?:(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?)?/);
  if (!match?.groups?.sign) return 0;
  const amount = (Number(match.groups.hours) * 60 + Number(match.groups.minutes || 0)) * 60_000;
  return match.groups.sign === "-" ? -amount : amount;
}

function spreadsheetDateToIso(value, timeZone) {
  if (typeof value === "string" && value.includes("/")) {
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    if (match) {
      const [, month, day, year, hour, minute, second] = match;
      const provisional = new Date(Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ));
      return new Date(provisional.getTime() - timeZoneOffsetMilliseconds(provisional, timeZone)).toISOString();
    }
  }

  const serial = Number(value);
  if (!Number.isFinite(serial)) throw new Error(`Unsupported form timestamp: ${value}`);
  const provisional = new Date((serial - 25569) * 86_400_000);
  return new Date(provisional.getTime() - timeZoneOffsetMilliseconds(provisional, timeZone)).toISOString();
}

function rowObject(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [normalize(header), row[index] ?? null]));
}

function indexBy(headers) {
  return new Map(headers.map((header, index) => [normalize(header), index]));
}

function valueAt(row, indexes, header) {
  return row[indexes.get(header)] ?? null;
}

function profileUrl(platform, handle) {
  const clean = normalize(handle).replace(/^@/, "");
  if (!clean) return null;
  if (platform === "instagram") return `https://www.instagram.com/${clean}/`;
  if (platform === "tiktok") return `https://www.tiktok.com/@${clean}`;
  return null;
}

const args = argumentsFrom(process.argv.slice(2));
const sourcePath = required(args.source, "--source");
const reviewPath = required(args.review, "--review");
const accessToken = required(process.env.SUPABASE_ACCESS_TOKEN, "SUPABASE_ACCESS_TOKEN");
const projectRef = args["project-ref"] || DEFAULT_PROJECT_REF;
const sheetId = args["sheet-id"] || DEFAULT_SHEET_ID;
const sourceTab = args.tab || DEFAULT_TAB;
const sourceTimeZone = args.timezone || "America/New_York";

const sourceData = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const reviewData = JSON.parse(await fs.readFile(reviewPath, "utf8"));
const sourceRows = sourceData.currentValues;
const sourceHeaders = sourceRows[0].map(normalize);
const applications = sourceRows.slice(1).filter((row) => row.some((value) => normalize(value)));

if (sourceHeaders.length !== 46) {
  throw new Error(`Expected 46 form fields, found ${sourceHeaders.length}. Refusing a lossy import.`);
}

const allApplicantRows = reviewData["All Applicants"];
const allApplicantHeaders = allApplicantRows[2].map(normalize);
const allApplicantIndex = indexBy(allApplicantHeaders);
const reviewByName = new Map(
  allApplicantRows
    .slice(3)
    .map((row) => [normalize(valueAt(row, allApplicantIndex, "applicant")), row]),
);

const reconciliationRows = reviewData["Response Reconciliation"];
const reconciliationHeaders = reconciliationRows[2].map(normalize);
const reconciliationIndex = indexBy(reconciliationHeaders);
const reconciliationBySourceRow = new Map(
  reconciliationRows.slice(3).map((row) => [
    integer(valueAt(row, reconciliationIndex, "source row")),
    row,
  ]),
);

const prepared = applications.map((row, offset) => {
  const sourceRow = offset + 2;
  const raw = rowObject(sourceHeaders, row);
  const reconciliation = reconciliationBySourceRow.get(sourceRow);
  if (!reconciliation) throw new Error(`Source row ${sourceRow} has no reconciliation record.`);

  const canonicalName = normalize(valueAt(reconciliation, reconciliationIndex, "canonical applicant"));
  const review = reviewByName.get(canonicalName);
  if (!review) throw new Error(`No deep review record was found for source row ${sourceRow}.`);

  const collectorEmail = normalizeEmail(raw["Email Address"]);
  const statedEmail = normalizeEmail(raw.email);
  const emailConflict = Boolean(collectorEmail && statedEmail && collectorEmail !== statedEmail);
  const canonicalEmail = emailConflict ? null : (statedEmail || collectorEmail || null);
  const reconciledEmail = normalizeEmail(valueAt(reconciliation, reconciliationIndex, "email"));
  const personKey = personKeyFor(canonicalName, reconciledEmail || statedEmail || collectorEmail);
  const reviewDecision = normalize(valueAt(review, allApplicantIndex, "decision")).toLowerCase();
  const requiresMoreInfo = /(hold|reapply|more info|decline)/.test(reviewDecision);
  const instagramHandle = normalize(raw["instagram handle (include @)"]);
  const tiktokHandle = normalize(raw["tiktok handle"]);

  return {
    sourceRow,
    submittedAt: spreadsheetDateToIso(raw.Timestamp, sourceTimeZone),
    sourceResponseKey: crypto
      .createHash("sha256")
      .update([sheetId, sourceTab, sourceRow, raw.Timestamp, collectorEmail, statedEmail].join("|"))
      .digest("hex"),
    personKey,
    collectorEmail: collectorEmail || null,
    statedEmail: statedEmail || null,
    canonicalEmail,
    emailConflict,
    legalName: normalize(raw["legal name"]) || canonicalName,
    publicName: canonicalName,
    phone: normalize(raw["phone (sms for offers)"]) || null,
    city: normalize(raw.city) || null,
    region: normalize(raw["state / region"]) || null,
    country: normalize(raw.country) || null,
    ageText: normalize(raw.age) || null,
    primaryPlatform: normalize(raw["primary platform"]) || null,
    instagramHandle: instagramHandle || null,
    instagramFollowersClaimed: normalize(raw["instagram followers (approximate)"]) || null,
    instagramFollowersObserved: integer(valueAt(review, allApplicantIndex, "IG followers observed")),
    instagramUrl: normalize(valueAt(review, allApplicantIndex, "IG profile"))
      || profileUrl("instagram", instagramHandle),
    tiktokHandle: tiktokHandle || null,
    tiktokFollowersClaimed: normalize(raw["tiktok followers (approximate)"]) || null,
    tiktokFollowersObserved: integer(valueAt(review, allApplicantIndex, "TikTok followers observed")),
    tiktokUrl: normalize(valueAt(review, allApplicantIndex, "TikTok profile"))
      || profileUrl("tiktok", tiktokHandle),
    youtubeUrl: normalize(valueAt(review, allApplicantIndex, "YouTube profile"))
      || normalize(raw["youtube channel url"])
      || null,
    youtubeSubscribersClaimed: normalize(raw["youtube subscribers (approximate)"]) || null,
    youtubeSubscribersObserved: integer(valueAt(review, allApplicantIndex, "YouTube subscribers observed")),
    otherPlatform: normalize(raw["other platform + handle"]) || null,
    averagePerformanceClaimed: normalize(raw["average likes/views on a typical post (last 30 days, best guess)"]) || null,
    bestContentUrl: normalize(raw["link to your best piece of content (post, reel, or video that shows your style)"]) || null,
    secondContentUrl: normalize(raw["link to second example (optional)"]) || null,
    portfolioUrl: normalize(raw["mood board or portfolio link"]) || null,
    photoUrls: [
      raw["photo link 1 (full body + face, recent)"],
      raw["photo link 2 (optional)"],
      raw["photo link 3 (optional)"],
    ],
    styleWords: normalize(raw["describe your style in 3 words"]) || null,
    motivation: normalize(raw["why do you want to join chunq?"]) || null,
    fairDeal: normalize(raw["what would a fair deal look like to you?"]) || null,
    reviewScore: integer(valueAt(review, allApplicantIndex, "total score")),
    strengths: normalize(valueAt(review, allApplicantIndex, "evidence / strengths")) || null,
    risks: normalize(valueAt(review, allApplicantIndex, "risks / contradictions")) || null,
    decisionNote: normalize(valueAt(review, allApplicantIndex, "assessment")) || null,
    firstMission: normalize(valueAt(review, allApplicantIndex, "required next step")) || null,
    reviewSummary: rowObject(allApplicantHeaders, review),
    rawResponse: raw,
    requiresMoreInfo,
  };
});

const grouped = new Map();
for (const application of prepared) {
  const group = grouped.get(application.personKey) || [];
  group.push(application);
  grouped.set(application.personKey, group);
}
for (const group of grouped.values()) {
  group.sort((left, right) => left.sourceRow - right.sourceRow);
  group.forEach((application, index) => {
    application.isDuplicate = index > 0;
    application.primarySourceRow = group[0].sourceRow;
  });
}

const conflicts = prepared.filter((application) => application.emailConflict).length;
const duplicates = prepared.filter((application) => application.isDuplicate).length;
const uniquePeople = new Set(prepared.map((application) => application.personKey)).size;
const startedAt = new Date().toISOString();

const values = prepared.map((application) => {
  const quality = application.isDuplicate
    ? "duplicate"
    : application.emailConflict
      ? "email_conflict"
      : !validEmail(application.canonicalEmail || "")
        ? "invalid_email"
        : "ready";
  const decision = application.isDuplicate
    ? "duplicate"
    : application.emailConflict
      ? "pending"
      : application.requiresMoreInfo
        ? "more_info"
        : "pending";

  return `(
    'google_form',
    ${sql(sheetId)},
    ${sql(sourceTab)},
    ${application.sourceRow},
    ${sql(application.sourceResponseKey)},
    ${sql(application.submittedAt)}::timestamptz,
    ${sql(application.personKey)},
    ${sql(application.collectorEmail)},
    ${sql(application.statedEmail)},
    ${sql(application.canonicalEmail)},
    ${sqlBoolean(application.emailConflict)},
    ${sql(application.legalName)},
    ${sql(application.publicName)},
    ${sql(application.phone)},
    ${sql(application.city)},
    ${sql(application.region)},
    ${sql(application.country)},
    ${sql(application.ageText)},
    ${sql(application.primaryPlatform)},
    ${sql(application.instagramHandle)},
    ${sql(application.instagramFollowersClaimed)},
    ${sqlInteger(application.instagramFollowersObserved)},
    ${sql(application.instagramUrl)},
    ${sql(application.tiktokHandle)},
    ${sql(application.tiktokFollowersClaimed)},
    ${sqlInteger(application.tiktokFollowersObserved)},
    ${sql(application.tiktokUrl)},
    ${sql(application.youtubeUrl)},
    ${sql(application.youtubeSubscribersClaimed)},
    ${sqlInteger(application.youtubeSubscribersObserved)},
    ${sql(application.otherPlatform)},
    ${sql(application.averagePerformanceClaimed)},
    ${sql(application.bestContentUrl)},
    ${sql(application.secondContentUrl)},
    ${sql(application.portfolioUrl)},
    ${sqlTextArray(application.photoUrls)},
    ${sql(application.styleWords)},
    ${sql(application.motivation)},
    ${sql(application.fairDeal)},
    ${sqlInteger(application.reviewScore)},
    ${sql(application.strengths)},
    ${sql(application.risks)},
    ${sql(application.decisionNote)},
    ${sql(application.firstMission)},
    ${sqlJson(application.reviewSummary)},
    ${sqlJson(application.rawResponse)},
    ${sql(quality)},
    ${sql(decision)}
  )`;
}).join(",\n");

const importSql = `
begin;

insert into public.ambassador_integration_sync_runs (
  integration_key, status, started_at, source_count, conflict_count, duplicate_count, detail
)
values (
  'google_forms',
  'running',
  ${sql(startedAt)}::timestamptz,
  ${prepared.length},
  ${conflicts},
  ${duplicates},
  ${sqlJson({ sheet_id: sheetId, tab: sourceTab, unique_people: uniquePeople })}
);

insert into public.ambassador_applications (
  source_system, source_sheet_id, source_tab, source_row, source_response_key,
  submitted_at, person_key, collector_email, stated_email, canonical_email,
  email_conflict, legal_name, public_name, phone, city, region, country, age_text,
  primary_platform, instagram_handle, instagram_followers_claimed,
  instagram_followers_observed, instagram_url, tiktok_handle,
  tiktok_followers_claimed, tiktok_followers_observed, tiktok_url, youtube_url,
  youtube_subscribers_claimed, youtube_subscribers_observed, other_platform,
  average_performance_claimed, best_content_url, second_content_url, portfolio_url,
  photo_urls, style_words, motivation, fair_deal, review_score, strengths, risks,
  decision_note, first_mission, review_summary, raw_response, data_quality_status,
  decision_status
)
values
${values}
on conflict (source_sheet_id, source_tab, source_row) do update
set source_response_key = excluded.source_response_key,
    submitted_at = excluded.submitted_at,
    person_key = excluded.person_key,
    collector_email = excluded.collector_email,
    stated_email = excluded.stated_email,
    legal_name = excluded.legal_name,
    public_name = excluded.public_name,
    phone = excluded.phone,
    city = excluded.city,
    region = excluded.region,
    country = excluded.country,
    age_text = excluded.age_text,
    primary_platform = excluded.primary_platform,
    instagram_handle = excluded.instagram_handle,
    instagram_followers_claimed = excluded.instagram_followers_claimed,
    instagram_followers_observed = excluded.instagram_followers_observed,
    instagram_url = excluded.instagram_url,
    tiktok_handle = excluded.tiktok_handle,
    tiktok_followers_claimed = excluded.tiktok_followers_claimed,
    tiktok_followers_observed = excluded.tiktok_followers_observed,
    tiktok_url = excluded.tiktok_url,
    youtube_url = excluded.youtube_url,
    youtube_subscribers_claimed = excluded.youtube_subscribers_claimed,
    youtube_subscribers_observed = excluded.youtube_subscribers_observed,
    other_platform = excluded.other_platform,
    average_performance_claimed = excluded.average_performance_claimed,
    best_content_url = excluded.best_content_url,
    second_content_url = excluded.second_content_url,
    portfolio_url = excluded.portfolio_url,
    photo_urls = excluded.photo_urls,
    style_words = excluded.style_words,
    motivation = excluded.motivation,
    fair_deal = excluded.fair_deal,
    review_score = case
      when ambassador_applications.reviewed_by is null then excluded.review_score
      else ambassador_applications.review_score
    end,
    strengths = case
      when ambassador_applications.reviewed_by is null then excluded.strengths
      else ambassador_applications.strengths
    end,
    risks = excluded.risks,
    decision_note = case
      when ambassador_applications.reviewed_by is null then excluded.decision_note
      else ambassador_applications.decision_note
    end,
    first_mission = case
      when ambassador_applications.reviewed_by is null then excluded.first_mission
      else ambassador_applications.first_mission
    end,
    review_summary = excluded.review_summary,
    raw_response = excluded.raw_response,
    updated_at = now();

update public.ambassador_applications as duplicate
set duplicate_of = primary_application.id,
    data_quality_status = 'duplicate',
    decision_status = 'duplicate'
from public.ambassador_applications as primary_application
where duplicate.source_sheet_id = ${sql(sheetId)}
  and duplicate.source_tab = ${sql(sourceTab)}
  and primary_application.source_sheet_id = duplicate.source_sheet_id
  and primary_application.source_tab = duplicate.source_tab
  and primary_application.person_key = duplicate.person_key
  and primary_application.source_row = (
    select min(candidate.source_row)
    from public.ambassador_applications candidate
    where candidate.source_sheet_id = duplicate.source_sheet_id
      and candidate.source_tab = duplicate.source_tab
      and candidate.person_key = duplicate.person_key
  )
  and duplicate.source_row > primary_application.source_row;

with application_invite_matches as (
  select
    application.id as application_id,
    min(invite.id::text)::uuid as invite_id,
    min(invite.initial_class) as initial_class
  from public.ambassador_applications application
  join public.ambassador_invites invite
    on lower(invite.email) in (
      lower(coalesce(application.canonical_email, '')),
      lower(coalesce(application.collector_email, '')),
      lower(coalesce(application.stated_email, ''))
    )
  where application.source_sheet_id = ${sql(sheetId)}
    and application.source_tab = ${sql(sourceTab)}
  group by application.id
  having count(distinct invite.id) = 1
)
update public.ambassador_applications application
set invite_id = match.invite_id,
    recommended_tier = match.initial_class,
    final_tier = case
      when application.email_conflict or application.duplicate_of is not null then application.final_tier
      else match.initial_class
    end,
    decision_status = case
      when application.email_conflict or application.duplicate_of is not null then application.decision_status
      when application.reviewed_by is not null then application.decision_status
      else 'accepted'
    end
from application_invite_matches match
where application.id = match.application_id;

update public.ambassador_applications
set decision_status = 'more_info'
where source_sheet_id = ${sql(sheetId)}
  and source_tab = ${sql(sourceTab)}
  and duplicate_of is null
  and email_conflict = false
  and invite_id is null
  and decision_status = 'pending'
  and reviewed_by is null;

update public.ambassador_integration_sync_runs
set status = 'succeeded',
    completed_at = now(),
    inserted_count = (
      select count(*)
      from public.ambassador_applications
      where source_sheet_id = ${sql(sheetId)} and source_tab = ${sql(sourceTab)}
    )
where integration_key = 'google_forms'
  and started_at = ${sql(startedAt)}::timestamptz;

insert into public.ambassador_integration_health (
  integration_key, label, status, summary, last_checked_at, last_success_at, details
)
values (
  'google_forms',
  'Applications form',
  'manual',
  'Every current form response is staged, but new rows still require an operator-run sync.',
  now(),
  now(),
  ${sqlJson({
    sheet_id: sheetId,
    tab: sourceTab,
    responses: prepared.length,
    unique_people: uniquePeople,
    email_conflicts: conflicts,
    duplicate_submissions: duplicates,
    last_source_response_at: prepared.at(-1)?.submittedAt || null,
    sync_mode: "operator-run",
  })}
)
on conflict (integration_key) do update
set status = excluded.status,
    summary = excluded.summary,
    last_checked_at = excluded.last_checked_at,
    last_success_at = excluded.last_success_at,
    details = excluded.details,
    updated_at = now();

commit;
`;

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: importSql }),
});
const responseText = await response.text();
if (!response.ok) {
  throw new Error(`Supabase import failed (${response.status}): ${responseText.slice(0, 1200)}`);
}

console.log(JSON.stringify({
  status: "succeeded",
  responses: prepared.length,
  uniquePeople,
  emailConflicts: conflicts,
  duplicateSubmissions: duplicates,
  lastSourceResponseAt: prepared.at(-1)?.submittedAt || null,
}));

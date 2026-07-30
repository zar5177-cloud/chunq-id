import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dtauxotoxxrlduaagovo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0YXV4b3RveHhybGR1YWFnb3ZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNDMzOTEsImV4cCI6MjA5OTgxOTM5MX0.1EihEeXxKkWvslIxuyR66RU1TPiKGW0JPKBhCm-HVUs";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const root = document.querySelector("#admin-app");

const state = {
  session: null,
  staff: null,
  staffList: [],
  members: [],
  memberOps: [],
  submissions: [],
  submissionOps: [],
  claims: [],
  rewardOps: [],
  notes: [],
  communications: [],
  actions: [],
  profiles: [],
  applications: [],
  applicationEvents: [],
  emailOutbox: [],
  integrationHealth: [],
  syncRuns: [],
  activeTab: "review",
  selectedSubmissionId: null,
  selectedClaimId: null,
  selectedApplicationId: null,
  reviewStatus: "pending",
  applicationStatus: "action",
  applicationSearch: "",
  peopleStatus: "all",
  search: "",
  includeTest: false,
  loading: false,
};

const esc = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const nl2br = (value = "") => esc(value).replaceAll("\n", "<br>");

const formatDate = (value, withTime = false) => {
  if (!value) return "—";
  const options = withTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" };
  return new Intl.DateTimeFormat("en-US", options).format(new Date(value));
};

const toLocalInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const toIsoOrNull = (value) => (value ? new Date(value).toISOString() : null);

const ageLabel = (value) => {
  if (!value) return "unknown";
  const hours = Math.max(0, (Date.now() - new Date(value).getTime()) / 36e5);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
};

const isOverdue = (value) => Boolean(value && new Date(value).getTime() < Date.now());

const friendlyError = (error, fallback = "Something went wrong. Refresh and try again.") => {
  const raw = String(error?.message || error || "").toLowerCase();
  if (raw.includes("invalid login")) return "That email and password do not match.";
  if (raw.includes("staff") || raw.includes("permission") || raw.includes("row-level")) {
    return "This account does not have the staff access required for that action.";
  }
  if (raw.includes("feedback")) return "Write specific, useful feedback before requesting a revision.";
  if (raw.includes("shipping address")) return "Complete the shipping address before marking this fulfilled.";
  if (raw.includes("tracking")) return "Add the tracking number or tracking link before fulfillment.";
  if (raw.includes("size")) return "Add the confirmed size before fulfillment.";
  if (raw.includes("network") || raw.includes("fetch")) return "The connection dropped. Check your internet and try again.";
  return error?.message || fallback;
};

const levelLabel = (level) =>
  ["New", "Active", "First item unlocked", "Advanced", "Top tier"][level] || `Level ${level}`;

const memberFor = (memberId) => state.members.find((member) => member.id === memberId);
const memberOpsFor = (memberId) => state.memberOps.find((item) => item.member_id === memberId) || {};
const submissionOpsFor = (submissionId) =>
  state.submissionOps.find((item) => item.submission_id === submissionId) || {};
const rewardOpsFor = (claimId) =>
  state.rewardOps.find((item) => item.reward_claim_id === claimId) || {};
const staffFor = (userId) => state.staffList.find((staff) => staff.user_id === userId);
const profileFor = (userId) => state.profiles.find((profile) => profile.user_id === userId);
const outboxFor = (applicationId) =>
  state.emailOutbox.find((message) => message.application_id === applicationId);

const safeUrl = (value) => {
  try {
    const parsed = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
};

const linkButton = (label, value) => {
  const href = safeUrl(value);
  return href
    ? `<a class="proof-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`
    : "";
};

function toast(message, type = "success") {
  let region = document.querySelector(".toast-region");
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  region.appendChild(item);
  setTimeout(() => item.remove(), 4200);
}

function confirmAction({ title, body, confirmLabel, danger = false }) {
  const dialog = root.querySelector("[data-confirm-dialog]");
  if (!dialog) return Promise.resolve(false);
  dialog.querySelector("[data-confirm-title]").textContent = title;
  dialog.querySelector("[data-confirm-body]").textContent = body;
  const accept = dialog.querySelector("[data-confirm-accept]");
  const cancel = dialog.querySelector("[data-confirm-cancel]");
  accept.textContent = confirmLabel;
  accept.className = danger ? "button-danger" : "button-primary";

  return new Promise((resolve) => {
    const finish = (confirmed) => {
      dialog.removeEventListener("cancel", onCancel);
      accept.onclick = null;
      cancel.onclick = null;
      if (dialog.open) dialog.close();
      resolve(confirmed);
    };
    const onCancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    accept.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
    dialog.addEventListener("cancel", onCancel, { once: true });
    dialog.showModal();
    accept.focus();
  });
}

function renderLogin(message = "") {
  root.innerHTML = `
    <main class="admin-gate">
      <p class="eyebrow">PRIVATE STAFF ACCESS</p>
      <div class="gate-mark">chunq</div>
      <h1>Ambassador operations.</h1>
      <p>Review work, send useful feedback, manage every next action, and fulfill rewards without searching through database tables.</p>
      <form class="gate-form" data-login-form>
        <label>
          <span>Staff email</span>
          <input type="email" name="email" autocomplete="username" required>
        </label>
        <label>
          <span>Password</span>
          <input type="password" name="password" autocomplete="current-password" required>
        </label>
        <button type="submit">sign in to operations →</button>
        <p class="gate-error" data-login-message>${esc(message)}</p>
      </form>
      <p><a href="/auth">Need to create or reset your Chunq ID account?</a></p>
    </main>
  `;

  root.querySelector("[data-login-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector("button");
    const messageNode = form.querySelector("[data-login-message]");
    submit.disabled = true;
    submit.textContent = "signing in...";
    messageNode.textContent = "";
    const { error } = await supabase.auth.signInWithPassword({
      email: form.elements.email.value.trim(),
      password: form.elements.password.value,
    });
    if (error) {
      messageNode.textContent = friendlyError(error);
      submit.disabled = false;
      submit.textContent = "sign in to operations →";
      return;
    }
    await boot();
  });
}

function renderDenied(email) {
  root.innerHTML = `
    <main class="admin-gate">
      <p class="eyebrow">STAFF ACCESS REQUIRED</p>
      <div class="gate-mark">chunq</div>
      <h1>This account is signed in, but it is not on the staff list.</h1>
      <p>Signed in as <strong>${esc(email)}</strong>. An owner must add this exact email under Staff access.</p>
      <button class="button-primary" type="button" data-denied-signout>sign out →</button>
    </main>
  `;
  root.querySelector("[data-denied-signout]").addEventListener("click", async () => {
    await supabase.auth.signOut();
    renderLogin();
  });
}

async function loadData() {
  state.loading = true;
  const [
    adminsResult,
    membersResult,
    memberOpsResult,
    submissionsResult,
    submissionOpsResult,
    claimsResult,
    rewardOpsResult,
    notesResult,
    communicationsResult,
    actionsResult,
    applicationsResult,
    applicationEventsResult,
    outboxResult,
    integrationHealthResult,
    syncRunsResult,
  ] = await Promise.all([
    supabase.from("ambassador_admins").select("*").order("created_at"),
    supabase
      .from("ambassador_members")
      .select(`
        id,invite_id,user_id,points,level,product_eligible_at,joined_at,updated_at,
        next_action,next_action_due_at,is_test,
        invite:ambassador_invites(id,email,legal_name,public_name,initial_class,review_score,strengths,starting_note,status,contacted_at,claimed_at)
      `)
      .order("joined_at"),
    supabase.from("ambassador_member_operations").select("*"),
    supabase
      .from("ambassador_submissions")
      .select(`
        id,member_id,task_key,proof_url,note,status,review_feedback,reviewed_by,reviewed_at,submitted_at,updated_at,
        task:ambassador_tasks(key,label,description,points,proof_required,proof_mode,category,min_level)
      `)
      .order("submitted_at", { ascending: false }),
    supabase.from("ambassador_submission_operations").select("*"),
    supabase
      .from("ambassador_reward_claims")
      .select(`
        id,member_id,reward_key,status,member_note,staff_note,claimed_at,contacted_at,fulfilled_at,updated_at,
        reward_selection,size,shipping_name,shipping_address_line1,shipping_address_line2,shipping_city,
        shipping_region,shipping_postal_code,shipping_country,tracking_carrier,tracking_number,tracking_url,
        reward:ambassador_rewards(key,label,description,points_required,requires_shipping,requires_size,tracking_required)
      `)
      .order("claimed_at", { ascending: false }),
    supabase.from("ambassador_reward_operations").select("*"),
    supabase.from("ambassador_staff_notes").select("*").order("created_at", { ascending: false }).limit(1000),
    supabase
      .from("ambassador_communications")
      .select("*")
      .order("happened_at", { ascending: false })
      .limit(1000),
    supabase
      .from("ambassador_staff_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("ambassador_applications")
      .select(`
        *,
        invite:ambassador_invites(id,email,initial_class,invite_code,status,contacted_at,claimed_at)
      `)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("ambassador_application_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("ambassador_email_outbox")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("ambassador_integration_health")
      .select("*")
      .order("label"),
    supabase
      .from("ambassador_integration_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100),
  ]);

  const results = [
    adminsResult,
    membersResult,
    memberOpsResult,
    submissionsResult,
    submissionOpsResult,
    claimsResult,
    rewardOpsResult,
    notesResult,
    communicationsResult,
    actionsResult,
    applicationsResult,
    applicationEventsResult,
    outboxResult,
    integrationHealthResult,
    syncRunsResult,
  ];
  const failed = results.find((result) => result.error);
  if (failed) throw failed.error;

  state.staffList = adminsResult.data || [];
  state.members = membersResult.data || [];
  state.memberOps = memberOpsResult.data || [];
  state.submissions = submissionsResult.data || [];
  state.submissionOps = submissionOpsResult.data || [];
  state.claims = claimsResult.data || [];
  state.rewardOps = rewardOpsResult.data || [];
  state.notes = notesResult.data || [];
  state.communications = communicationsResult.data || [];
  state.actions = actionsResult.data || [];
  state.applications = applicationsResult.data || [];
  state.applicationEvents = applicationEventsResult.data || [];
  state.emailOutbox = outboxResult.data || [];
  state.integrationHealth = integrationHealthResult.data || [];
  state.syncRuns = syncRunsResult.data || [];

  const userIds = state.members.map((member) => member.user_id).filter(Boolean);
  if (userIds.length) {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id,username,display_name,region,last_seen_at")
      .in("user_id", userIds);
    if (error) throw error;
    state.profiles = data || [];
  } else {
    state.profiles = [];
  }

  await Promise.all(
    state.submissions.map(async (submission) => {
      if (!submission.proof_url?.startsWith("storage://ambassador-proof/")) return;
      const objectPath = submission.proof_url.replace("storage://ambassador-proof/", "");
      const { data } = await supabase.storage.from("ambassador-proof").createSignedUrl(objectPath, 3600);
      submission.display_url = data?.signedUrl || "";
    }),
  );

  state.loading = false;
}

function operationalMembers() {
  return state.members.filter((member) => state.includeTest || !member.is_test);
}

function metrics() {
  const members = state.members.filter((member) => !member.is_test);
  const pending = state.submissions.filter((item) => item.status === "pending" && !memberFor(item.member_id)?.is_test);
  const rewards = state.claims.filter(
    (item) => ["requested", "contacted"].includes(item.status) && !memberFor(item.member_id)?.is_test,
  );
  const overdueReviews = pending.filter((item) => isOverdue(submissionOpsFor(item.id).review_due_at));
  const overdueRewards = rewards.filter((item) => isOverdue(rewardOpsFor(item.id).due_at));
  const waitingOnChunq = members.filter((member) => memberOpsFor(member.id).status === "waiting_on_chunq");
  const urgent = members.filter((member) => memberOpsFor(member.id).priority === "urgent");
  const applicationAction = state.applications.filter((application) =>
    !application.duplicate_of
    && (
      ["pending", "more_info"].includes(application.decision_status)
      || ["email_conflict", "invalid_email"].includes(application.data_quality_status)
      || (application.decision_status === "accepted" && !application.invite_id)
    )
  );
  return {
    members: members.length,
    pending: pending.length,
    rewards: rewards.length,
    overdue: overdueReviews.length + overdueRewards.length,
    needsAttention: new Set([...waitingOnChunq, ...urgent].map((member) => member.id)).size,
    applicationAction: applicationAction.length,
  };
}

function shell() {
  const counts = metrics();
  root.innerHTML = `
    <div class="app-shell">
      <header class="admin-topbar">
        <a class="admin-wordmark" href="/ambassador-admin.html">chunq</a>
        <span class="admin-top-title">ambassador operations · private</span>
        <div class="staff-chip">
          <span>${esc(state.staff.display_name)}</span>
          <strong>${esc(state.staff.role)}</strong>
          <button type="button" data-signout>sign out</button>
        </div>
      </header>

      <main class="admin-body">
        <section class="ops-head">
          <div>
            <p class="eyebrow">LIVE PROGRAM CONTROL</p>
            <h1>Nothing waits.</h1>
            <p>Every review, reward, conversation, owner, deadline, and next action in one private workspace.</p>
          </div>
          <button class="refresh-button" type="button" data-refresh>refresh live data ↻</button>
        </section>

        <section class="metrics" aria-label="Program status">
          <article class="metric ${counts.applicationAction ? "urgent" : ""}">
            <span>Applications to handle</span>
            <strong>${counts.applicationAction}</strong>
            <small>Decisions, conflicts, or missing accounts</small>
          </article>
          <article class="metric">
            <span>Real ambassadors</span>
            <strong>${counts.members}</strong>
            <small>QA accounts excluded</small>
          </article>
          <article class="metric ${counts.pending ? "urgent" : ""}">
            <span>Needs review</span>
            <strong>${counts.pending}</strong>
            <small>Pending submissions</small>
          </article>
          <article class="metric ${counts.rewards ? "urgent" : ""}">
            <span>Rewards in progress</span>
            <strong>${counts.rewards}</strong>
            <small>Requested or contacted</small>
          </article>
          <article class="metric ${counts.overdue ? "danger" : ""}">
            <span>Overdue</span>
            <strong>${counts.overdue}</strong>
            <small>Past the staff due date</small>
          </article>
          <article class="metric ${counts.needsAttention ? "urgent" : ""}">
            <span>Needs attention</span>
            <strong>${counts.needsAttention}</strong>
            <small>Waiting on Chunq or urgent</small>
          </article>
        </section>

        <nav class="ops-tabs" aria-label="Operations">
          ${tabButton("applications", "Applications", counts.applicationAction)}
          ${tabButton("review", "Review", counts.pending)}
          ${tabButton("rewards", "Rewards", counts.rewards)}
          ${tabButton("people", "People", counts.members)}
          ${tabButton("activity", "Activity", "")}
          ${tabButton("integrations", "Integrations", "")}
          ${tabButton("guide", "Playbook", "")}
          ${tabButton("settings", "Staff access", "")}
        </nav>

        <div data-panel></div>
      </main>
      <dialog class="confirm-dialog" data-confirm-dialog aria-labelledby="ops-confirm-title">
        <div class="confirm-dialog-shell">
          <p class="eyebrow">CONFIRM ACTION</p>
          <h2 id="ops-confirm-title" data-confirm-title>Confirm this action</h2>
          <p data-confirm-body></p>
          <div class="form-split">
            <button class="button-quiet" type="button" data-confirm-cancel>go back</button>
            <button class="button-primary" type="button" data-confirm-accept>confirm</button>
          </div>
        </div>
      </dialog>
    </div>
  `;

  root.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      renderPanel();
      root.querySelectorAll("[data-tab]").forEach((item) =>
        item.setAttribute("aria-selected", String(item.dataset.tab === state.activeTab))
      );
    });
  });

  root.querySelector("[data-refresh]").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "refreshing...";
    try {
      await loadData();
      shell();
      toast("Live operations data refreshed.");
    } catch (error) {
      toast(friendlyError(error), "error");
      button.disabled = false;
      button.textContent = "refresh live data ↻";
    }
  });

  root.querySelector("[data-signout]").addEventListener("click", async () => {
    await supabase.auth.signOut();
    renderLogin();
  });

  renderPanel();
}

function tabButton(key, label, count) {
  return `
    <button type="button" data-tab="${key}" aria-selected="${state.activeTab === key}">
      ${esc(label)}${count !== "" ? `<b>${count}</b>` : ""}
    </button>
  `;
}

function renderPanel() {
  const panel = root.querySelector("[data-panel]");
  if (!panel) return;
  if (state.activeTab === "applications") renderApplications(panel);
  if (state.activeTab === "review") renderReview(panel);
  if (state.activeTab === "rewards") renderRewards(panel);
  if (state.activeTab === "people") renderPeople(panel);
  if (state.activeTab === "activity") renderActivity(panel);
  if (state.activeTab === "integrations") renderIntegrations(panel);
  if (state.activeTab === "guide") renderGuide(panel);
  if (state.activeTab === "settings") renderSettings(panel);
}

function applicationItems() {
  const search = state.applicationSearch.toLowerCase();
  return state.applications
    .filter((application) => {
      const matchesStatus = {
        action:
          !application.duplicate_of
          && (
            ["pending", "more_info"].includes(application.decision_status)
            || ["email_conflict", "invalid_email"].includes(application.data_quality_status)
            || (application.decision_status === "accepted" && !application.invite_id)
          ),
        all: true,
        conflicts: ["email_conflict", "invalid_email"].includes(application.data_quality_status),
        duplicates: Boolean(application.duplicate_of),
        accepted: application.decision_status === "accepted" && !application.duplicate_of,
        more_info: application.decision_status === "more_info" && !application.duplicate_of,
        declined: application.decision_status === "declined" && !application.duplicate_of,
      }[state.applicationStatus];
      if (!matchesStatus) return false;
      if (!search) return true;
      return [
        application.public_name,
        application.legal_name,
        application.collector_email,
        application.stated_email,
        application.instagram_handle,
        application.tiktok_handle,
        application.city,
        application.country,
      ].some((value) => String(value || "").toLowerCase().includes(search));
    })
    .sort((left, right) => {
      const priority = (application) => {
        if (application.data_quality_status === "email_conflict") return 0;
        if (application.data_quality_status === "invalid_email") return 1;
        if (application.decision_status === "pending") return 2;
        if (application.decision_status === "more_info") return 3;
        if (application.decision_status === "accepted" && !application.invite_id) return 4;
        if (application.decision_status === "accepted") return 5;
        if (application.decision_status === "declined") return 6;
        return 7;
      };
      return priority(left) - priority(right)
        || Number(right.review_score || 0) - Number(left.review_score || 0)
        || new Date(right.submitted_at) - new Date(left.submitted_at);
    });
}

function renderApplications(panel) {
  const items = applicationItems();
  if (!items.some((item) => item.id === state.selectedApplicationId)) {
    state.selectedApplicationId = items[0]?.id || null;
  }
  const selected = items.find((item) => item.id === state.selectedApplicationId);
  const responses = state.applications.length;
  const uniquePeople = new Set(
    state.applications.filter((application) => !application.duplicate_of).map((application) => application.person_key),
  ).size;
  const conflicts = state.applications.filter((application) =>
    !application.duplicate_of && ["email_conflict", "invalid_email"].includes(application.data_quality_status)
  ).length;
  const duplicates = state.applications.filter((application) => application.duplicate_of).length;

  panel.innerHTML = `
    <section class="panel" aria-labelledby="applications-title">
      <div class="panel-head">
        <div>
          <p class="eyebrow">INTAKE → DECISION → ACCOUNT → MESSAGE</p>
          <h2 id="applications-title">Applications</h2>
          <p>${responses} source responses are preserved as ${uniquePeople} people. Nothing is silently merged: ${duplicates} repeat submissions and ${conflicts} unresolved email problems remain visible.</p>
        </div>
        <div class="filter-bar">
          <input type="search" data-application-search placeholder="search applicant or account" value="${esc(state.applicationSearch)}" aria-label="Search applications">
          <select data-application-status aria-label="Filter applications">
            ${option("action", "Needs action", state.applicationStatus)}
            ${option("all", "All source responses", state.applicationStatus)}
            ${option("conflicts", "Email problems", state.applicationStatus)}
            ${option("accepted", "Accepted", state.applicationStatus)}
            ${option("more_info", "More info", state.applicationStatus)}
            ${option("declined", "Declined", state.applicationStatus)}
            ${option("duplicates", "Repeat submissions", state.applicationStatus)}
          </select>
        </div>
      </div>

      <div class="queue-layout application-layout">
        <div class="queue-list" aria-label="Application queue">
          ${items.length
            ? items.map(applicationQueueItem).join("")
            : emptyQueue("No applications match this view.", "Change the filter or refresh the live data.")}
        </div>
        ${selected
          ? applicationDetail(selected)
          : emptyQueue("Nothing selected.", "Choose an application from the queue.")}
      </div>
    </section>
  `;

  panel.querySelector("[data-application-search]").addEventListener("input", (event) => {
    state.applicationSearch = event.target.value;
    renderApplications(panel);
  });
  panel.querySelector("[data-application-status]").addEventListener("change", (event) => {
    state.applicationStatus = event.target.value;
    renderApplications(panel);
  });
  panel.querySelectorAll("[data-application-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedApplicationId = button.dataset.applicationId;
      renderApplications(panel);
    });
  });
  panel.querySelector("[data-primary-application]")?.addEventListener("click", (event) => {
    state.applicationStatus = "all";
    state.selectedApplicationId = event.currentTarget.dataset.primaryApplication;
    renderApplications(panel);
  });
  attachApplicationActions(panel, selected);
}

function applicationQueueItem(application) {
  const score = application.review_score ?? "—";
  const quality = application.data_quality_status.replaceAll("_", " ");
  const observed = Math.max(
    Number(application.instagram_followers_observed || 0),
    Number(application.tiktok_followers_observed || 0),
    Number(application.youtube_subscribers_observed || 0),
  );
  return `
    <button class="queue-item" type="button" data-application-id="${application.id}" aria-current="${state.selectedApplicationId === application.id}">
      <span>
        <span class="queue-kicker">${esc(application.decision_status)} · ${esc(quality)}</span>
        <h3>${esc(application.public_name)}</h3>
        <p>${esc(application.primary_platform || "platform not stated")} · ${observed ? `${observed.toLocaleString("en-US")} observed followers` : "audience not publicly verified"}</p>
        <p>source row ${application.source_row} · ${application.invite_id ? "existing invite linked" : "no linked invite"}</p>
      </span>
      <span class="queue-score">${esc(score)}</span>
    </button>
  `;
}

function applicationDetail(application) {
  const duplicate = application.duplicate_of
    ? state.applications.find((item) => item.id === application.duplicate_of)
    : null;
  const messages = state.emailOutbox.filter((message) => message.application_id === application.id);
  const events = state.applicationEvents.filter((event) => event.application_id === application.id);
  const canDecide = ["owner", "admin"].includes(state.staff.role) && !application.duplicate_of;
  const rawAnswers = Object.entries(application.raw_response || {})
    .filter(([, value]) => String(value ?? "").trim())
    .map(([question, answer]) => `
      <div class="answer-row">
        <dt>${esc(question)}</dt>
        <dd>${nl2br(String(answer))}</dd>
      </div>
    `)
    .join("");
  const links = [
    ["Instagram", application.instagram_url],
    ["TikTok", application.tiktok_url],
    ["YouTube", application.youtube_url],
    ["Best content", application.best_content_url],
    ["Second example", application.second_content_url],
    ["Portfolio / moodboard", application.portfolio_url],
    ...(application.photo_urls || []).map((value, index) => [`Photo ${index + 1}`, value]),
  ].map(([label, value]) => linkButton(label, value)).filter(Boolean).join("");
  const qualityText = application.data_quality_status.replaceAll("_", " ");
  const decision = ["accepted", "more_info", "declined"].includes(application.decision_status)
    ? application.decision_status
    : "accepted";
  const tier = application.final_tier || application.recommended_tier || "community";

  return `
    <article class="detail-card application-detail">
      <header class="detail-top">
        <div>
          <p class="eyebrow">SOURCE ROW ${application.source_row} · ${esc(qualityText)}</p>
          <h2>${esc(application.public_name)}</h2>
          <p>${esc([application.city, application.region, application.country].filter(Boolean).join(", ") || "Location not stated")} · submitted ${formatDate(application.submitted_at, true)}</p>
        </div>
        <div class="points-block">
          <strong>${application.review_score ?? "—"}</strong>
          <span>review score / 100</span>
        </div>
      </header>

      ${duplicate ? `
        <section class="application-hold duplicate-hold">
          <strong>Repeat submission — do not contact this row separately.</strong>
          <span>The complete response is retained, but the decision belongs to the primary record.</span>
          <button class="button-secondary" type="button" data-primary-application="${duplicate.id}">open primary application →</button>
        </section>
      ` : ""}

      ${application.email_conflict ? `
        <section class="application-hold conflict-hold">
          <strong>Outreach is blocked until the correct email is selected.</strong>
          <span>The account-collector email and the applicant-typed email do not match. Neither is silently preferred.</span>
          ${canDecide ? `
            <form class="email-resolution-form" data-email-resolution-form>
              <label class="field">
                <span>Correct email</span>
                <select name="canonical_email" required>
                  <option value="${esc(application.collector_email)}">${esc(application.collector_email)} · Google account</option>
                  <option value="${esc(application.stated_email)}">${esc(application.stated_email)} · typed in form</option>
                </select>
              </label>
              <button class="button-primary" type="submit">use this email and unblock →</button>
              <p class="form-message" data-resolution-message></p>
            </form>
          ` : ""}
        </section>
      ` : ""}

      <div class="detail-grid">
        <div class="detail-main">
          <section class="detail-section">
            <h3>Identity and audience</h3>
            <dl class="application-facts">
              <div><dt>Contact email</dt><dd>${esc(application.canonical_email || "Unresolved")}</dd></div>
              <div><dt>Google account email</dt><dd>${esc(application.collector_email || "—")}</dd></div>
              <div><dt>Typed email</dt><dd>${esc(application.stated_email || "—")}</dd></div>
              <div><dt>Phone</dt><dd>${esc(application.phone || "—")}</dd></div>
              <div><dt>Instagram</dt><dd>${application.instagram_followers_observed?.toLocaleString("en-US") || "0"} observed · ${esc(application.instagram_followers_claimed || "not claimed")} claimed</dd></div>
              <div><dt>TikTok</dt><dd>${application.tiktok_followers_observed?.toLocaleString("en-US") || "0"} observed · ${esc(application.tiktok_followers_claimed || "not claimed")} claimed</dd></div>
              <div><dt>YouTube</dt><dd>${application.youtube_subscribers_observed?.toLocaleString("en-US") || "0"} observed · ${esc(application.youtube_subscribers_claimed || "not claimed")} claimed</dd></div>
              <div><dt>Typical performance claim</dt><dd>${esc(application.average_performance_claimed || "—")}</dd></div>
            </dl>
            ${links ? `<div class="application-links">${links}</div>` : "<p>No usable public links were submitted.</p>"}
          </section>

          <section class="detail-section">
            <h3>Critical review</h3>
            <p><strong>Strengths:</strong> ${esc(application.strengths || "Not yet written.")}</p>
            <p><strong>Risks and contradictions:</strong> ${esc(application.risks || "None recorded.")}</p>
            <p><strong>Assessment:</strong> ${esc(application.decision_note || "Not yet written.")}</p>
            <p><strong>Required next move:</strong> ${esc(application.first_mission || "Not yet assigned.")}</p>
          </section>

          <details class="answer-book">
            <summary>Read every form answer (${Object.keys(application.raw_response || {}).length} fields)</summary>
            <dl>${rawAnswers}</dl>
          </details>

          <section class="detail-section">
            <h3>Communication record</h3>
            ${messages.length ? messages.map(outboxMessage).join("") : `
              <p>No database-tracked draft exists for this source record. Older IONOS messages remain outside this tracker and are not being guessed as sent.</p>
            `}
          </section>
        </div>

        <aside class="detail-side">
          <dl class="meta-list">
            <div><dt>Decision</dt><dd><span class="pill ${esc(application.decision_status)}">${esc(application.decision_status.replaceAll("_", " "))}</span></dd></div>
            <div><dt>Data quality</dt><dd><span class="pill ${esc(application.data_quality_status)}">${esc(qualityText)}</span></dd></div>
            <div><dt>Recommended tier</dt><dd>${esc(application.recommended_tier || "—")}</dd></div>
            <div><dt>Final tier</dt><dd>${esc(application.final_tier || "—")}</dd></div>
            <div><dt>Invite</dt><dd>${application.invite ? `${esc(application.invite.invite_code)} · ${esc(application.invite.status)}` : "Not linked"}</dd></div>
            <div><dt>Review events</dt><dd>${events.length}</dd></div>
          </dl>

          ${canDecide && !application.email_conflict ? `
            <section class="detail-section">
              <h3>Decision and personal response</h3>
              <form class="application-decision-form ops-form" data-application-decision-form>
                <label class="field"><span>Decision</span><select name="decision">
                  ${option("accepted", "Accept and open account", decision)}
                  ${option("more_info", "Ask for more information", decision)}
                  ${option("declined", "Decline", decision)}
                </select></label>
                <div class="form-split">
                  <label class="field"><span>Starting tier</span><select name="tier">
                    ${option("signature", "Signature", tier)}
                    ${option("core", "Core", tier)}
                    ${option("creator", "Creator", tier)}
                    ${option("community", "Community", tier)}
                  </select></label>
                  <label class="field"><span>Score / 100</span><input name="score" type="number" min="0" max="100" value="${esc(application.review_score ?? "")}"></label>
                </div>
                <label class="field"><span>Why they stand out</span><textarea name="strengths" required>${esc(application.strengths || "")}</textarea></label>
                <label class="field"><span>Decision note</span><textarea name="decision_note">${esc(application.decision_note || "")}</textarea></label>
                <label class="field"><span>First task / missing proof</span><textarea name="first_mission" required>${esc(application.first_mission || "")}</textarea></label>
                <label class="field"><span>Email subject (optional)</span><input name="email_subject" placeholder="A clear default is generated"></label>
                <label class="field"><span>Personal email body (optional)</span><textarea name="email_body" placeholder="Leave blank to generate a straightforward response from the fields above."></textarea></label>
                <div class="decision-help">This saves the decision and creates or refreshes a private email draft. It does not send anything automatically.</div>
                <button class="button-primary" type="submit">save decision + prepare draft →</button>
                <p class="form-message" data-application-message></p>
              </form>
            </section>
          ` : ""}
        </aside>
      </div>
    </article>
  `;
}

function outboxMessage(message) {
  const mailto = `mailto:${encodeURIComponent(message.to_email)}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;
  return `
    <article class="outbox-message">
      <header>
        <span class="pill ${esc(message.status)}">${esc(message.status)}</span>
        <time>${formatDate(message.created_at, true)}</time>
      </header>
      <h4>${esc(message.subject)}</h4>
      <p>${nl2br(message.body)}</p>
      ${message.status === "draft"
        ? `<a class="button-secondary outbox-open" href="${esc(mailto)}">open in company email app →</a>`
        : ""}
      ${message.last_error ? `<p class="due-overdue">${esc(message.last_error)}</p>` : ""}
    </article>
  `;
}

function attachApplicationActions(panel, application) {
  if (!application) return;
  panel.querySelector("[data-email-resolution-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector("[data-resolution-message]");
    const button = form.querySelector("button");
    button.disabled = true;
    message.textContent = "saving...";
    try {
      const { error } = await supabase.rpc("ambassador_admin_resolve_application_email", {
        p_application_id: application.id,
        p_canonical_email: form.elements.canonical_email.value,
      });
      if (error) throw error;
      await loadData();
      shell();
      state.activeTab = "applications";
      toast("Correct email saved. The application is unblocked.");
    } catch (error) {
      message.textContent = friendlyError(error);
      message.className = "form-message error";
      button.disabled = false;
    }
  });

  panel.querySelector("[data-application-decision-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const decision = form.elements.decision.value;
    const message = form.querySelector("[data-application-message]");
    const button = form.querySelector("button[type='submit']");
    const confirmed = await confirmAction({
      title: `${decision === "accepted" ? "Accept" : decision === "more_info" ? "Request more from" : "Decline"} ${application.public_name}?`,
      body: "This records the decision and prepares a private email draft. It will not send an email.",
      confirmLabel: "save decision",
      danger: decision === "declined",
    });
    if (!confirmed) return;
    button.disabled = true;
    message.textContent = "saving decision...";
    try {
      const scoreValue = form.elements.score.value.trim();
      const { error } = await supabase.rpc("ambassador_admin_decide_application", {
        p_application_id: application.id,
        p_decision: decision,
        p_tier: form.elements.tier.value,
        p_score: scoreValue ? Number(scoreValue) : null,
        p_strengths: form.elements.strengths.value.trim(),
        p_decision_note: form.elements.decision_note.value.trim(),
        p_first_mission: form.elements.first_mission.value.trim(),
        p_email_subject: form.elements.email_subject.value.trim() || null,
        p_email_body: form.elements.email_body.value.trim() || null,
      });
      if (error) throw error;
      await loadData();
      shell();
      state.activeTab = "applications";
      toast("Decision saved and a private email draft is ready.");
    } catch (error) {
      message.textContent = friendlyError(error);
      message.className = "form-message error";
      button.disabled = false;
    }
  });
}

function renderIntegrations(panel) {
  const primaryApplications = state.applications.filter((application) => !application.duplicate_of);
  const linkedInvites = new Set(primaryApplications.map((application) => application.invite_id).filter(Boolean));
  const conflicts = primaryApplications.filter((application) =>
    ["email_conflict", "invalid_email"].includes(application.data_quality_status)
  ).length;
  const drafts = state.emailOutbox.filter((message) => message.status === "draft").length;
  const failed = state.emailOutbox.filter((message) => ["failed", "bounced"].includes(message.status)).length;

  panel.innerHTML = `
    <section class="panel" aria-labelledby="integrations-title">
      <div class="panel-head">
        <div>
          <p class="eyebrow">SYSTEM BOUNDARIES</p>
          <h2 id="integrations-title">Integrations</h2>
          <p>This page says what is connected, what is manual, and what is missing. A green label means verified operation—not a plan or assumption.</p>
        </div>
      </div>

      <section class="integration-summary" aria-label="Integration coverage">
        <article><strong>${state.applications.length}</strong><span>form responses staged</span></article>
        <article><strong>${primaryApplications.length}</strong><span>unique people</span></article>
        <article><strong>${linkedInvites.size}</strong><span>linked approved accounts</span></article>
        <article class="${conflicts ? "attention" : ""}"><strong>${conflicts}</strong><span>identity holds</span></article>
        <article class="${drafts ? "attention" : ""}"><strong>${drafts}</strong><span>email drafts waiting</span></article>
        <article class="${failed ? "danger" : ""}"><strong>${failed}</strong><span>failed or bounced</span></article>
      </section>

      <div class="integration-grid">
        ${state.integrationHealth.map(integrationCard).join("")}
      </div>

      <section class="detail-section integration-runs">
        <h3>Recent sync evidence</h3>
        ${state.syncRuns.length ? `
          <div class="timeline">
            ${state.syncRuns.map((run) => `
              <article class="timeline-item">
                <time>${formatDate(run.started_at, true)}</time>
                <strong>${esc(run.integration_key)} · ${esc(run.status)}</strong>
                <span>${run.source_count} source · ${run.conflict_count} conflicts · ${run.duplicate_count} repeats${run.error_message ? ` · ${esc(run.error_message)}` : ""}</span>
              </article>
            `).join("")}
          </div>
        ` : emptyQueue("No sync has been recorded.", "The form staging import has not run yet.")}
      </section>

      <section class="boundary-guide">
        <article>
          <span>CURRENT + MANUAL REFRESH</span>
          <h3>Form → review staging</h3>
          <p>All current form fields are retained, but the next Google Form row will not appear here until the operator sync runs. That remaining automation gap is intentionally visible.</p>
        </article>
        <article>
          <span>CONNECTED + MANUAL SEND</span>
          <h3>Decision → account → email draft</h3>
          <p>Staff resolves identity problems, records a decision, and links or creates the approved account in one transaction. The system prepares a personal draft; IONOS send, delivery, replies, and bounces still need mailbox review.</p>
        </article>
        <article>
          <span>NOT CONNECTED</span>
          <h3>Reward → Shopify fulfillment</h3>
          <p>Do not promise inventory or tracking from the ambassador dashboard yet. Product mapping, order creation, fulfillment, and tracking callbacks still need a controlled Shopify handoff.</p>
        </article>
      </section>
    </section>
  `;
}

function integrationCard(integration) {
  const details = Object.entries(integration.details || {})
    .map(([key, value]) => `<div><dt>${esc(key.replaceAll("_", " "))}</dt><dd>${esc(typeof value === "object" ? JSON.stringify(value) : value)}</dd></div>`)
    .join("");
  const sourceSheetLink = integration.integration_key === "google_forms" && integration.details?.sheet_id
    ? linkButton(
      "open live response sheet",
      `https://docs.google.com/spreadsheets/d/${integration.details.sheet_id}/edit`,
    )
    : "";
  return `
    <article class="integration-card ${esc(integration.status)}">
      <header>
        <span class="pill ${esc(integration.status)}">${esc(integration.status.replaceAll("_", " "))}</span>
        <time>checked ${formatDate(integration.last_checked_at, true)}</time>
      </header>
      <h3>${esc(integration.label)}</h3>
      <p>${esc(integration.summary)}</p>
      ${details ? `<dl>${details}</dl>` : ""}
      ${sourceSheetLink}
    </article>
  `;
}

function reviewItems() {
  return state.submissions
    .filter((submission) => {
      const member = memberFor(submission.member_id);
      if (!state.includeTest && member?.is_test) return false;
      if (state.reviewStatus !== "all" && submission.status !== state.reviewStatus) return false;
      const search = state.search.toLowerCase();
      if (!search) return true;
      return [
        member?.invite?.public_name,
        member?.invite?.email,
        submission.task?.label,
        submission.note,
      ].some((value) => String(value || "").toLowerCase().includes(search));
    })
    .sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return new Date(a.submitted_at) - new Date(b.submitted_at);
    });
}

function renderReview(panel) {
  const items = reviewItems();
  if (!items.some((item) => item.id === state.selectedSubmissionId)) {
    state.selectedSubmissionId = items[0]?.id || null;
  }
  const selected = items.find((item) => item.id === state.selectedSubmissionId);

  panel.innerHTML = `
    <section class="panel" aria-labelledby="review-title">
      <div class="panel-head">
        <div>
          <p class="eyebrow">QUALITY CONTROL</p>
          <h2 id="review-title">Submission review</h2>
          <p>Open the actual work, make a clear decision, explain revisions, assign the next move, and notify the ambassador in one action.</p>
        </div>
        <div class="filter-bar">
          <input type="search" data-review-search placeholder="search name, email, task" value="${esc(state.search)}" aria-label="Search submissions">
          <select data-review-status aria-label="Filter submission status">
            ${option("pending", "Pending", state.reviewStatus)}
            ${option("all", "All decisions", state.reviewStatus)}
            ${option("approved", "Approved", state.reviewStatus)}
            ${option("rejected", "Needs revision", state.reviewStatus)}
          </select>
          <label><input type="checkbox" data-include-test ${state.includeTest ? "checked" : ""}> include QA</label>
        </div>
      </div>

      <div class="queue-layout">
        <div class="queue-list" aria-label="Submission queue">
          ${items.length ? items.map(reviewQueueItem).join("") : emptyQueue("No submissions match this view.", "Change the filter or wait for new work.")}
        </div>
        ${selected ? reviewDetail(selected) : emptyQueue("Nothing selected.", "Choose a submission from the queue.")}
      </div>
    </section>
  `;

  panel.querySelector("[data-review-search]").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderReview(panel);
  });
  panel.querySelector("[data-review-status]").addEventListener("change", (event) => {
    state.reviewStatus = event.target.value;
    renderReview(panel);
  });
  panel.querySelector("[data-include-test]").addEventListener("change", (event) => {
    state.includeTest = event.target.checked;
    renderReview(panel);
  });
  panel.querySelectorAll("[data-submission-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSubmissionId = button.dataset.submissionId;
      renderReview(panel);
    });
  });
  attachReviewForm(panel, selected);
}

function reviewQueueItem(submission) {
  const member = memberFor(submission.member_id);
  const ops = submissionOpsFor(submission.id);
  const overdue = submission.status === "pending" && isOverdue(ops.review_due_at);
  return `
    <button class="queue-item" type="button" data-submission-id="${submission.id}" aria-current="${state.selectedSubmissionId === submission.id}">
      <span>
        <span class="queue-kicker">${member?.is_test ? "QA · " : ""}${esc(submission.status)}</span>
        <h3>${esc(member?.invite?.public_name || "Unknown")} · ${esc(submission.task?.label || submission.task_key)}</h3>
        <p>${esc(member?.invite?.email || "")}</p>
        <p>${overdue ? "OVERDUE · " : ""}due ${formatDate(ops.review_due_at, true)}</p>
      </span>
      <time datetime="${esc(submission.submitted_at)}">${ageLabel(submission.submitted_at)}</time>
    </button>
  `;
}

function reviewDetail(submission) {
  const member = memberFor(submission.member_id);
  const ops = submissionOpsFor(submission.id);
  const profile = profileFor(member?.user_id);
  const proofUrl = submission.display_url ||
    (submission.proof_url?.startsWith("http") ? submission.proof_url : "");
  const previous = state.submissions.filter(
    (item) => item.member_id === submission.member_id && item.id !== submission.id
  );
  const recommendedNext = defaultNextAction(submission.task_key);
  const canReview = submission.status !== "withdrawn" &&
    ["owner", "admin", "reviewer"].includes(state.staff.role);

  return `
    <article class="detail-card">
      <header class="detail-top">
        <div>
          <p class="eyebrow">${member?.is_test ? "QA ACCOUNT · " : ""}${esc(submission.status)}</p>
          <h2>${esc(member?.invite?.public_name || "Unknown")}</h2>
          <p>${esc(member?.invite?.email || "")}${profile?.username ? ` · @${esc(profile.username)}` : ""}</p>
        </div>
        <div class="points-block">
          <strong>${member?.points ?? 0}</strong>
          <span>${esc(levelLabel(member?.level || 0))}</span>
        </div>
      </header>
      <div class="detail-grid">
        <div class="detail-main">
          <section class="detail-section">
            <h3>Task</h3>
            <p><strong>${esc(submission.task?.label || submission.task_key)} · +${submission.task?.points || 0} points</strong></p>
            <p>${esc(submission.task?.description || "")}</p>
            <p><strong>Required:</strong> ${esc(submission.task?.proof_required || "")}</p>
          </section>

          <section class="detail-section">
            <h3>Ambassador submission</h3>
            ${submission.note ? `<p>${nl2br(submission.note)}</p>` : "<p>No written note.</p>"}
            ${proofPreview(submission, proofUrl)}
          </section>

          ${submission.review_feedback ? `
            <section class="detail-section">
              <h3>Latest feedback sent</h3>
              <p>${nl2br(submission.review_feedback)}</p>
            </section>
          ` : ""}

          <section class="detail-section">
            <h3>Applicant context</h3>
            <p><strong>Selected for:</strong> ${esc(member?.invite?.strengths || "—")}</p>
            <p><strong>Starting direction:</strong> ${esc(member?.invite?.starting_note || "—")}</p>
            <p><strong>Previous submissions:</strong> ${previous.length} · ${previous.filter((item) => item.status === "approved").length} approved</p>
          </section>
        </div>

        <aside class="detail-side">
          <dl class="meta-list">
            <div><dt>Submitted</dt><dd>${formatDate(submission.submitted_at, true)} · ${ageLabel(submission.submitted_at)} ago</dd></div>
            <div><dt>Staff due</dt><dd class="${isOverdue(ops.review_due_at) && submission.status === "pending" ? "due-overdue" : ""}">${formatDate(ops.review_due_at, true)}</dd></div>
            <div><dt>Owner</dt><dd>${esc(staffFor(ops.assigned_to)?.display_name || "Unassigned")}</dd></div>
            <div><dt>Status</dt><dd><span class="pill ${esc(submission.status)}">${esc(submission.status)}</span></dd></div>
          </dl>

          <section class="detail-section">
            <h3>Decision and next move</h3>
            ${canReview ? `
              <form class="review-form" data-review-form data-id="${submission.id}">
                <label class="field">
                  <span>Feedback the ambassador will receive</span>
                  <textarea name="feedback" placeholder="Be precise: what worked, or exactly what must change.">${esc(submission.review_feedback || "")}</textarea>
                </label>
                <label class="field">
                  <span>Next action for the ambassador</span>
                  <textarea name="next_action" placeholder="Leave blank only if they should freely choose another task.">${esc(member?.next_action || recommendedNext)}</textarea>
                </label>
                <label class="field">
                  <span>Next-action due date</span>
                  <input type="datetime-local" name="due_at" value="${esc(toLocalInput(member?.next_action_due_at || defaultDueDate(7)))}">
                </label>
                <label class="field">
                  <span>Private staff note</span>
                  <textarea name="private_note" placeholder="Internal only. Never shown to the ambassador.">${esc(ops.private_note || "")}</textarea>
                </label>
                <div class="decision-help">Approving adds points automatically. Requesting a revision adds no points, sends the exact feedback above, and reopens the task for resubmission.</div>
                <div class="decision-actions">
                  <button class="button-secondary" type="button" data-decision="approved">approve + award →</button>
                  <button class="button-danger" type="button" data-decision="rejected">request revision →</button>
                </div>
                <p class="form-message" data-review-message></p>
              </form>
            ` : "<p>Your staff role can view this submission but cannot make review decisions.</p>"}
          </section>
        </aside>
      </div>
    </article>
  `;
}

function proofPreview(submission, proofUrl) {
  if (submission.proof_url?.startsWith("note://")) return "";
  if (!proofUrl) return `<p class="due-overdue">The file could not be opened. Check Storage or ask for a new upload.</p>`;
  const lower = proofUrl.toLowerCase().split("?")[0];
  const isImage = /\.(png|jpe?g|webp|gif)$/.test(lower) ||
    /\.(png|jpe?g|webp|gif)(\?|$)/.test(submission.proof_url?.toLowerCase() || "");
  const isPdf = /\.pdf$/.test(lower) || /\.pdf(\?|$)/.test(submission.proof_url?.toLowerCase() || "");
  return `
    ${isImage ? `<div class="proof-frame"><img src="${esc(proofUrl)}" alt="Submitted proof"></div>` : ""}
    ${isPdf ? `<div class="proof-frame"><iframe src="${esc(proofUrl)}" title="Submitted PDF"></iframe></div>` : ""}
    <a class="proof-link" href="${esc(proofUrl)}" target="_blank" rel="noopener">open original submission ↗</a>
  `;
}

function attachReviewForm(panel, submission) {
  const form = panel.querySelector("[data-review-form]");
  if (!form || !submission) return;
  form.querySelectorAll("[data-decision]").forEach((button) => {
    button.addEventListener("click", async () => {
      const decision = button.dataset.decision;
      const feedback = form.elements.feedback.value.trim();
      const message = form.querySelector("[data-review-message]");
      message.className = "form-message";
      if (decision === "rejected" && feedback.length < 12) {
        message.textContent = "Explain specifically what must change before requesting a revision.";
        message.classList.add("error");
        form.elements.feedback.focus();
        return;
      }
      const applicant = memberFor(submission.member_id)?.invite?.public_name || "this ambassador";
      const confirmation = decision === "approved"
        ? `Approve ${applicant}'s work and award ${submission.task?.points || 0} points?`
        : `Send this revision request to ${applicant}?`;
      if (!await confirmAction({
        title: decision === "approved" ? "Approve this work?" : "Request a revision?",
        body: confirmation,
        confirmLabel: decision === "approved" ? "approve + award points" : "send revision request",
        danger: decision === "rejected",
      })) return;
      form.querySelectorAll("button").forEach((item) => { item.disabled = true; });
      message.textContent = decision === "approved" ? "Approving and notifying..." : "Sending revision feedback...";
      const { error } = await supabase.rpc("ambassador_admin_review_submission", {
        p_submission_id: submission.id,
        p_decision: decision,
        p_feedback: feedback,
        p_private_note: form.elements.private_note.value.trim() || null,
        p_next_action: form.elements.next_action.value.trim() || null,
        p_due_at: toIsoOrNull(form.elements.due_at.value),
      });
      if (error) {
        message.textContent = friendlyError(error);
        message.classList.add("error");
        form.querySelectorAll("button").forEach((item) => { item.disabled = false; });
        return;
      }
      toast(decision === "approved"
        ? "Approved, points added, next action assigned, and ambassador notified."
        : "Revision feedback sent and task reopened.");
      await loadData();
      shell();
    });
  });
}

function defaultNextAction(taskKey) {
  const actions = {
    "profile-setup": "Complete “choose your main content focus.”",
    "path-setup": "Choose one available creative task and send your first piece of work.",
    "creative-feedback": "Create the three-outfit moodboard or share a Chunq post with your own caption.",
    moodboard: "Share a Chunq post with your own caption or create one original outfit photo.",
    "story-reshare": "Create one original outfit photo or video using clothes you already own.",
    "owned-styling-post": "Create one original outfit video and send the link plus its 7-day insights.",
    "owned-short-video": "Choose another open task while we plan your next campaign opportunity.",
    "event-assist": "Check your messages for the next event or shoot brief.",
    "gifted-product-post": "Keep the post live and send its 7-day performance insights.",
  };
  return actions[taskKey] || "Choose another available ambassador task.";
}

function defaultDueDate(days) {
  return new Date(Date.now() + days * 864e5).toISOString();
}

function renderRewards(panel) {
  const claims = state.claims.filter((claim) => {
    const member = memberFor(claim.member_id);
    if (!state.includeTest && member?.is_test) return false;
    return true;
  });
  const activeClaims = claims.filter((claim) => ["requested", "contacted"].includes(claim.status));
  if (!claims.some((claim) => claim.id === state.selectedClaimId)) {
    state.selectedClaimId = activeClaims[0]?.id || claims[0]?.id || null;
  }
  const selected = claims.find((claim) => claim.id === state.selectedClaimId);

  panel.innerHTML = `
    <section class="panel" aria-labelledby="rewards-title">
      <div class="panel-head">
        <div>
          <p class="eyebrow">FULFILLMENT CONTROL</p>
          <h2 id="rewards-title">Rewards</h2>
          <p>Every address, size, selection, staff owner, deadline, shipment, and tracking update remains attached to the request.</p>
        </div>
        <div class="filter-bar">
          <label><input type="checkbox" data-reward-include-test ${state.includeTest ? "checked" : ""}> include QA</label>
        </div>
      </div>

      <div class="queue-layout">
        <div class="queue-list" aria-label="Reward queue">
          ${claims.length ? claims.map(rewardQueueItem).join("") : emptyQueue("No reward requests yet.", "New requests will appear here automatically with a two-day staff due date.")}
        </div>
        ${selected ? rewardDetail(selected) : emptyQueue("Nothing selected.", "Choose a reward request from the queue.")}
      </div>
    </section>
  `;

  panel.querySelector("[data-reward-include-test]").addEventListener("change", (event) => {
    state.includeTest = event.target.checked;
    renderRewards(panel);
  });
  panel.querySelectorAll("[data-claim-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedClaimId = button.dataset.claimId;
      renderRewards(panel);
    });
  });
  attachRewardForm(panel, selected);
}

function rewardQueueItem(claim) {
  const member = memberFor(claim.member_id);
  const ops = rewardOpsFor(claim.id);
  const overdue = ["requested", "contacted"].includes(claim.status) && isOverdue(ops.due_at);
  return `
    <button class="queue-item" type="button" data-claim-id="${claim.id}" aria-current="${state.selectedClaimId === claim.id}">
      <span>
        <span class="queue-kicker">${member?.is_test ? "QA · " : ""}${esc(claim.status)}</span>
        <h3>${esc(member?.invite?.public_name || "Unknown")} · ${esc(claim.reward?.label || claim.reward_key)}</h3>
        <p>${esc(member?.invite?.email || "")}</p>
        <p>${overdue ? "OVERDUE · " : ""}staff due ${formatDate(ops.due_at, true)}</p>
      </span>
      <time datetime="${esc(claim.claimed_at)}">${ageLabel(claim.claimed_at)}</time>
    </button>
  `;
}

function rewardDetail(claim) {
  const member = memberFor(claim.member_id);
  const ops = rewardOpsFor(claim.id);
  const reward = claim.reward || {};
  const canFulfill = ["owner", "admin", "fulfillment"].includes(state.staff.role);
  return `
    <article class="detail-card">
      <header class="detail-top">
        <div>
          <p class="eyebrow">${member?.is_test ? "QA ACCOUNT · " : ""}${esc(claim.status)}</p>
          <h2>${esc(reward.label || claim.reward_key)}</h2>
          <p>${esc(member?.invite?.public_name || "")} · ${esc(member?.invite?.email || "")}</p>
        </div>
        <div class="points-block">
          <strong>${member?.points ?? 0}</strong>
          <span>${esc(levelLabel(member?.level || 0))}</span>
        </div>
      </header>
      <div class="detail-grid">
        <div class="detail-main">
          <section class="detail-section">
            <h3>Reward</h3>
            <p><strong>${esc(reward.label || claim.reward_key)} · ${reward.points_required || 0} points required</strong></p>
            <p>${esc(reward.description || "")}</p>
          </section>
          <section class="detail-section">
            <h3>Recipient and requested details</h3>
            <p><strong>Selection:</strong> ${esc(claim.reward_selection || "Not confirmed")}</p>
            <p><strong>Size:</strong> ${esc(claim.size || "Not confirmed")}</p>
            ${reward.requires_shipping ? `<div class="address-block">${shippingAddress(claim)}</div>` : "<p>No shipping address is required.</p>"}
          </section>
          <section class="detail-section">
            <h3>Tracking</h3>
            <p>${claim.tracking_carrier ? `${esc(claim.tracking_carrier)} · ` : ""}${esc(claim.tracking_number || "No tracking added")}</p>
            ${claim.tracking_url ? `<a class="proof-link" href="${esc(claim.tracking_url)}" target="_blank" rel="noopener">open tracking ↗</a>` : ""}
          </section>
          <section class="detail-section">
            <h3>Applicant note</h3>
            <p>${nl2br(claim.member_note || "No note.")}</p>
          </section>
        </div>
        <aside class="detail-side">
          <dl class="meta-list">
            <div><dt>Requested</dt><dd>${formatDate(claim.claimed_at, true)}</dd></div>
            <div><dt>Staff due</dt><dd class="${isOverdue(ops.due_at) && ["requested", "contacted"].includes(claim.status) ? "due-overdue" : ""}">${formatDate(ops.due_at, true)}</dd></div>
            <div><dt>Owner</dt><dd>${esc(staffFor(ops.assigned_to)?.display_name || "Unassigned")}</dd></div>
            <div><dt>Status</dt><dd><span class="pill ${esc(claim.status)}">${esc(claim.status)}</span></dd></div>
          </dl>
          <section class="detail-section">
            <h3>Fulfillment record</h3>
            ${canFulfill ? rewardForm(claim, ops) : "<p>Your staff role can view but cannot fulfill rewards.</p>"}
          </section>
        </aside>
      </div>
    </article>
  `;
}

function rewardForm(claim, ops) {
  const reward = claim.reward || {};
  return `
    <form class="ops-form" data-reward-form data-id="${claim.id}">
      <label class="field">
        <span>Staff owner</span>
        <select name="assigned_to">${staffOptions(ops.assigned_to)}</select>
      </label>
      <label class="field">
        <span>Staff due date</span>
        <input type="datetime-local" name="due_at" value="${esc(toLocalInput(ops.due_at || defaultDueDate(2)))}">
      </label>
      <label class="field">
        <span>Item, code, or product selection</span>
        <input name="reward_selection" value="${esc(claim.reward_selection || "")}" placeholder="Exact SKU, color, item, or code">
      </label>
      ${reward.requires_size ? `
        <label class="field">
          <span>Confirmed size</span>
          <input name="size" value="${esc(claim.size || "")}" placeholder="M, 30, one size, etc.">
        </label>
      ` : `<input type="hidden" name="size" value="${esc(claim.size || "")}">`}
      ${reward.requires_shipping ? shippingFields(claim) : shippingHiddenFields(claim)}
      <div class="form-split">
        <label class="field">
          <span>Tracking carrier</span>
          <input name="tracking_carrier" value="${esc(claim.tracking_carrier || "")}" placeholder="UPS, USPS, FedEx">
        </label>
        <label class="field">
          <span>Tracking number</span>
          <input name="tracking_number" value="${esc(claim.tracking_number || "")}">
        </label>
      </div>
      <label class="field">
        <span>Tracking link</span>
        <input type="url" name="tracking_url" value="${esc(claim.tracking_url || "")}" placeholder="https://">
      </label>
      <label class="field">
        <span>Message the ambassador will receive</span>
        <textarea name="staff_note" placeholder="Share only useful recipient-facing information.">${esc(claim.staff_note || "")}</textarea>
      </label>
      <label class="field">
        <span>Private fulfillment note</span>
        <textarea name="private_note" placeholder="Internal only.">${esc(ops.private_note || "")}</textarea>
      </label>
      <div class="decision-actions">
        <button class="button-quiet" type="button" data-reward-status="${esc(claim.status)}">save record only →</button>
        <button class="button-secondary" type="button" data-reward-status="contacted">mark contacted →</button>
        <button class="button-primary" type="button" data-reward-status="fulfilled">mark fulfilled →</button>
      </div>
      <button class="button-danger" type="button" data-reward-status="declined">decline request →</button>
      <p class="form-message" data-reward-message></p>
    </form>
  `;
}

function shippingFields(claim) {
  return `
    <label class="field"><span>Recipient name</span><input name="shipping_name" value="${esc(claim.shipping_name || "")}"></label>
    <label class="field"><span>Address line 1</span><input name="shipping_address_line1" value="${esc(claim.shipping_address_line1 || "")}"></label>
    <label class="field"><span>Address line 2</span><input name="shipping_address_line2" value="${esc(claim.shipping_address_line2 || "")}"></label>
    <div class="form-split">
      <label class="field"><span>City</span><input name="shipping_city" value="${esc(claim.shipping_city || "")}"></label>
      <label class="field"><span>State / region</span><input name="shipping_region" value="${esc(claim.shipping_region || "")}"></label>
    </div>
    <div class="form-split">
      <label class="field"><span>Postal code</span><input name="shipping_postal_code" value="${esc(claim.shipping_postal_code || "")}"></label>
      <label class="field"><span>Country</span><input name="shipping_country" value="${esc(claim.shipping_country || "")}"></label>
    </div>
  `;
}

function shippingHiddenFields(claim) {
  return ["shipping_name", "shipping_address_line1", "shipping_address_line2", "shipping_city", "shipping_region", "shipping_postal_code", "shipping_country"]
    .map((name) => `<input type="hidden" name="${name}" value="${esc(claim[name] || "")}">`)
    .join("");
}

function shippingAddress(claim) {
  return [
    claim.shipping_name,
    claim.shipping_address_line1,
    claim.shipping_address_line2,
    [claim.shipping_city, claim.shipping_region, claim.shipping_postal_code].filter(Boolean).join(", "),
    claim.shipping_country,
  ].filter(Boolean).map(esc).join("\n") || "Shipping address not yet complete.";
}

function attachRewardForm(panel, claim) {
  const form = panel.querySelector("[data-reward-form]");
  if (!form || !claim) return;
  form.querySelectorAll("[data-reward-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const newStatus = button.dataset.rewardStatus;
      const message = form.querySelector("[data-reward-message]");
      const applicant = memberFor(claim.member_id)?.invite?.public_name || "this ambassador";
      const isRecordOnly = newStatus === claim.status;
      const actionLabel = isRecordOnly
        ? "Save this record without sending a new message for"
        : newStatus === "fulfilled"
        ? "Fulfill"
        : newStatus === "contacted"
        ? "Mark contacted for"
        : "Decline";
      if (!await confirmAction({
        title: isRecordOnly ? "Save fulfillment record?" : `${newStatus === "fulfilled" ? "Fulfill" : "Update"} this reward?`,
        body: `${actionLabel} ${applicant}'s ${claim.reward?.label || "reward"}?`,
        confirmLabel: isRecordOnly ? "save record only" : `${newStatus === "fulfilled" ? "mark fulfilled" : newStatus}`,
        danger: newStatus === "declined",
      })) return;
      form.querySelectorAll("button").forEach((item) => { item.disabled = true; });
      message.textContent = "Saving fulfillment record and notifying...";
      const fields = new FormData(form);
      const { error } = await supabase.rpc("ambassador_admin_update_reward_claim", {
        p_claim_id: claim.id,
        p_status: newStatus,
        p_staff_note: String(fields.get("staff_note") || "").trim() || null,
        p_private_note: String(fields.get("private_note") || "").trim() || null,
        p_assigned_to: fields.get("assigned_to") || null,
        p_due_at: toIsoOrNull(fields.get("due_at")),
        p_reward_selection: String(fields.get("reward_selection") || "").trim() || null,
        p_size: String(fields.get("size") || "").trim() || null,
        p_shipping_name: String(fields.get("shipping_name") || "").trim() || null,
        p_shipping_address_line1: String(fields.get("shipping_address_line1") || "").trim() || null,
        p_shipping_address_line2: String(fields.get("shipping_address_line2") || "").trim() || null,
        p_shipping_city: String(fields.get("shipping_city") || "").trim() || null,
        p_shipping_region: String(fields.get("shipping_region") || "").trim() || null,
        p_shipping_postal_code: String(fields.get("shipping_postal_code") || "").trim() || null,
        p_shipping_country: String(fields.get("shipping_country") || "").trim() || null,
        p_tracking_carrier: String(fields.get("tracking_carrier") || "").trim() || null,
        p_tracking_number: String(fields.get("tracking_number") || "").trim() || null,
        p_tracking_url: String(fields.get("tracking_url") || "").trim() || null,
      });
      if (error) {
        message.textContent = friendlyError(error);
        message.className = "form-message error";
        form.querySelectorAll("button").forEach((item) => { item.disabled = false; });
        return;
      }
      toast(isRecordOnly
        ? "Fulfillment record saved without sending a duplicate message."
        : `Reward marked ${newStatus}; record and ambassador message updated.`);
      await loadData();
      shell();
    });
  });
}

function renderPeople(panel) {
  const search = state.search.toLowerCase();
  const members = operationalMembers()
    .filter((member) => {
      const ops = memberOpsFor(member.id);
      if (state.peopleStatus !== "all" && ops.status !== state.peopleStatus) return false;
      if (!search) return true;
      const profile = profileFor(member.user_id);
      return [
        member.invite?.public_name,
        member.invite?.legal_name,
        member.invite?.email,
        profile?.username,
        member.next_action,
        ops.staff_summary,
      ].some((value) => String(value || "").toLowerCase().includes(search));
    })
    .sort((a, b) => {
      const priorities = { urgent: 0, high: 1, standard: 2 };
      return (priorities[memberOpsFor(a.id).priority] ?? 2) - (priorities[memberOpsFor(b.id).priority] ?? 2)
        || (b.points - a.points);
    });

  panel.innerHTML = `
    <section class="panel" aria-labelledby="people-title">
      <div class="panel-head">
        <div>
          <p class="eyebrow">RELATIONSHIP MANAGEMENT</p>
          <h2 id="people-title">People</h2>
          <p>Each ambassador has one owner, one current status, one explicit next action, one due date, and a complete communication history.</p>
        </div>
        <div class="filter-bar">
          <input type="search" data-people-search placeholder="search people" value="${esc(state.search)}" aria-label="Search people">
          <select data-people-status aria-label="Filter people status">
            ${option("all", "All statuses", state.peopleStatus)}
            ${option("active", "Active", state.peopleStatus)}
            ${option("waiting_on_ambassador", "Waiting on ambassador", state.peopleStatus)}
            ${option("waiting_on_chunq", "Waiting on Chunq", state.peopleStatus)}
            ${option("paused", "Paused", state.peopleStatus)}
            ${option("graduated", "Graduated", state.peopleStatus)}
          </select>
          <label><input type="checkbox" data-people-include-test ${state.includeTest ? "checked" : ""}> include QA</label>
        </div>
      </div>
      <div class="person-grid">
        ${members.length ? members.map(personCard).join("") : emptyQueue("No ambassadors match this view.", "Change the search or status filter.")}
      </div>
      ${personDialog()}
    </section>
  `;

  panel.querySelector("[data-people-search]").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderPeople(panel);
  });
  panel.querySelector("[data-people-status]").addEventListener("change", (event) => {
    state.peopleStatus = event.target.value;
    renderPeople(panel);
  });
  panel.querySelector("[data-people-include-test]").addEventListener("change", (event) => {
    state.includeTest = event.target.checked;
    renderPeople(panel);
  });
  panel.querySelectorAll("[data-open-person]").forEach((button) => {
    button.addEventListener("click", () => openPersonDialog(button.dataset.openPerson));
  });
}

function personCard(member) {
  const ops = memberOpsFor(member.id);
  const pending = state.submissions.filter((item) => item.member_id === member.id && item.status === "pending").length;
  const rewards = state.claims.filter((item) => item.member_id === member.id && ["requested", "contacted"].includes(item.status)).length;
  const overdue = isOverdue(member.next_action_due_at) && ops.status === "waiting_on_ambassador";
  return `
    <article class="person-card ${member.is_test ? "test-card" : ""}">
      <div>
        <span class="pill ${esc(member.is_test ? "test" : ops.priority || "standard")}">${member.is_test ? "QA" : esc(ops.priority || "standard")}</span>
        <span class="pill ${esc(ops.status || "active")}">${esc((ops.status || "active").replaceAll("_", " "))}</span>
      </div>
      <h3>${esc(member.invite?.public_name || "Unknown")}</h3>
      <div class="email">${esc(member.invite?.email || "")}</div>
      <div class="person-stat-row">
        <div class="person-stat"><strong>${member.points}</strong><span>points</span></div>
        <div class="person-stat"><strong>${pending}</strong><span>reviews</span></div>
        <div class="person-stat"><strong>${rewards}</strong><span>rewards</span></div>
      </div>
      <div class="person-next ${overdue ? "due-overdue" : ""}">
        <strong>Next:</strong> ${esc(member.next_action || "No assigned next action")}<br>
        <span>${member.next_action_due_at ? `due ${formatDate(member.next_action_due_at, true)}` : "no due date"} · owner ${esc(staffFor(ops.assigned_to)?.display_name || "unassigned")}</span>
      </div>
      <button class="button-quiet" type="button" data-open-person="${member.id}">open full relationship →</button>
    </article>
  `;
}

function personDialog() {
  return `
    <dialog data-person-dialog aria-labelledby="person-dialog-title">
      <div data-person-dialog-content></div>
    </dialog>
  `;
}

function openPersonDialog(memberId) {
  const member = memberFor(memberId);
  const dialog = root.querySelector("[data-person-dialog]");
  const content = dialog.querySelector("[data-person-dialog-content]");
  const ops = memberOpsFor(memberId);
  const profile = profileFor(member.user_id);
  const notes = state.notes.filter((item) => item.member_id === memberId);
  const communications = state.communications.filter((item) => item.member_id === memberId);
  const submissions = state.submissions.filter((item) => item.member_id === memberId);
  const claims = state.claims.filter((item) => item.member_id === memberId);
  const canAdjust = ["owner", "admin"].includes(state.staff.role);

  content.innerHTML = `
    <header class="dialog-head">
      <div>
        <p class="eyebrow">AMBASSADOR RELATIONSHIP</p>
        <h2 id="person-dialog-title">${esc(member.invite?.public_name || "Unknown")}</h2>
      </div>
      <button class="dialog-close" type="button" data-close-person aria-label="Close">×</button>
    </header>
    <div class="dialog-body">
      <section class="dialog-section">
        <h3>Identity and performance</h3>
        <dl class="meta-list">
          <div><dt>Email</dt><dd><a href="mailto:${esc(member.invite?.email || "")}">${esc(member.invite?.email || "")}</a></dd></div>
          <div><dt>Chunq username</dt><dd>${profile?.username ? `@${esc(profile.username)}` : "Not available"}</dd></div>
          <div><dt>Points and level</dt><dd>${member.points} points · ${esc(levelLabel(member.level))}</dd></div>
          <div><dt>Selected for</dt><dd>${esc(member.invite?.strengths || "—")}</dd></div>
          <div><dt>Program record</dt><dd>${submissions.length} submissions · ${submissions.filter((item) => item.status === "approved").length} approved · ${claims.length} reward requests</dd></div>
        </dl>
      </section>

      <section class="dialog-section">
        <h3>Current operating plan</h3>
        <form class="ops-form" data-member-plan-form data-id="${member.id}">
          <div class="form-split">
            <label class="field"><span>Status</span><select name="status">${memberStatusOptions(ops.status || "active")}</select></label>
            <label class="field"><span>Priority</span><select name="priority">${priorityOptions(ops.priority || "standard")}</select></label>
          </div>
          <label class="field"><span>Staff owner</span><select name="assigned_to">${staffOptions(ops.assigned_to)}</select></label>
          <label class="field"><span>Next action the ambassador will see</span><textarea name="next_action">${esc(member.next_action || "")}</textarea></label>
          <label class="field"><span>Due date</span><input type="datetime-local" name="due_at" value="${esc(toLocalInput(member.next_action_due_at))}"></label>
          <label class="field"><span>Private relationship summary</span><textarea name="staff_summary" placeholder="Key context another staff member needs to understand immediately.">${esc(ops.staff_summary || "")}</textarea></label>
          <button class="button-primary" type="submit">save operating plan →</button>
          <p class="form-message" data-member-plan-message></p>
        </form>
      </section>

      <section class="dialog-section">
        <h3>Private staff notes</h3>
        <form class="ops-form" data-note-form>
          <label class="field"><span>Add note</span><textarea name="body" placeholder="Context, decision rationale, sizing concern, relationship detail, or follow-up."></textarea></label>
          <button class="button-quiet" type="submit">add private note →</button>
          <p class="form-message" data-note-message></p>
        </form>
        <div class="note-list">
          ${notes.length ? notes.map(noteItem).join("") : '<div class="note-item">No private notes yet.</div>'}
        </div>
      </section>

      <section class="dialog-section">
        <h3>Communication log</h3>
        <form class="ops-form" data-communication-form>
          <div class="form-split">
            <label class="field"><span>Direction</span><select name="direction"><option value="outbound">Outbound</option><option value="inbound">Inbound</option></select></label>
            <label class="field"><span>Channel</span><select name="channel"><option value="email">Email</option><option value="in_app">In-app message</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="phone">Phone</option><option value="other">Other</option></select></label>
          </div>
          <label class="field"><span>Subject</span><input name="subject"></label>
          <label class="field"><span>Message or summary</span><textarea name="body"></textarea></label>
          <label><input type="checkbox" name="send_in_app" checked> also deliver this outbound message inside their Chunq ID account</label>
          <div class="form-split">
            <button class="button-secondary" type="submit">log communication →</button>
            <a class="button-quiet" href="mailto:${esc(member.invite?.email || "")}">open email draft →</a>
          </div>
          <p class="form-message" data-communication-message></p>
        </form>
        <div class="communication-list">
          ${communications.length ? communications.slice(0, 20).map(communicationItem).join("") : '<div class="communication-item">No communications logged yet.</div>'}
        </div>
      </section>

      ${canAdjust ? `
        <section class="dialog-section">
          <h3>Manual point adjustment</h3>
          <form class="ops-form" data-points-form>
            <div class="form-split">
              <label class="field"><span>Points, positive or negative</span><input type="number" name="delta" min="-500" max="500" required></label>
              <label class="field"><span>Reason</span><input name="reason" minlength="8" required></label>
            </div>
            <button class="button-danger" type="submit">record point adjustment →</button>
            <p class="form-message" data-points-message></p>
          </form>
        </section>
      ` : ""}
    </div>
    <div class="dialog-actions-sticky">
      <a class="button-secondary" href="mailto:${esc(member.invite?.email || "")}">email ${esc(member.invite?.public_name || "ambassador")} →</a>
      <button class="button-quiet" type="button" data-close-person>close</button>
    </div>
  `;

  content.querySelectorAll("[data-close-person]").forEach((button) => {
    button.addEventListener("click", () => dialog.close());
  });
  const communicationForm = content.querySelector("[data-communication-form]");
  const communicationDirection = communicationForm.elements.direction;
  const sendInApp = communicationForm.elements.send_in_app;
  const syncDeliveryOption = () => {
    const outbound = communicationDirection.value === "outbound";
    sendInApp.disabled = !outbound;
    if (!outbound) sendInApp.checked = false;
  };
  communicationDirection.addEventListener("change", syncDeliveryOption);
  syncDeliveryOption();
  attachMemberPlan(content, member);
  attachNoteForm(content, member);
  attachCommunicationForm(content, member);
  attachPointsForm(content, member);
  dialog.showModal();
}

function noteItem(note) {
  return `
    <article class="note-item">
      <header><span>${esc(staffFor(note.created_by)?.display_name || "Staff")}</span><time>${formatDate(note.created_at, true)}</time></header>
      <div>${nl2br(note.body)}</div>
    </article>
  `;
}

function communicationItem(item) {
  return `
    <article class="communication-item">
      <header><span>${esc(item.direction)} · ${esc(item.channel)} · ${esc(staffFor(item.created_by)?.display_name || "Staff")}</span><time>${formatDate(item.happened_at, true)}</time></header>
      ${item.subject ? `<strong>${esc(item.subject)}</strong>` : ""}
      <div>${nl2br(item.body)}</div>
    </article>
  `;
}

function attachMemberPlan(content, member) {
  const form = content.querySelector("[data-member-plan-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = form.querySelector("[data-member-plan-message]");
    const submit = form.querySelector("button");
    submit.disabled = true;
    message.textContent = "Saving plan...";
    const { error } = await supabase.rpc("ambassador_admin_update_member", {
      p_member_id: member.id,
      p_status: form.elements.status.value,
      p_priority: form.elements.priority.value,
      p_assigned_to: form.elements.assigned_to.value || null,
      p_next_action: form.elements.next_action.value.trim() || null,
      p_due_at: toIsoOrNull(form.elements.due_at.value),
      p_staff_summary: form.elements.staff_summary.value.trim() || null,
    });
    if (error) {
      message.textContent = friendlyError(error);
      message.className = "form-message error";
      submit.disabled = false;
      return;
    }
    toast("Operating plan saved.");
    await loadData();
    renderPanel();
    root.querySelector(`[data-open-person="${member.id}"]`)?.click();
  });
}

function attachNoteForm(content, member) {
  const form = content.querySelector("[data-note-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = form.querySelector("[data-note-message]");
    const submit = form.querySelector("button");
    submit.disabled = true;
    const { error } = await supabase.rpc("ambassador_admin_add_note", {
      p_member_id: member.id,
      p_body: form.elements.body.value.trim(),
    });
    if (error) {
      message.textContent = friendlyError(error);
      message.className = "form-message error";
      submit.disabled = false;
      return;
    }
    toast("Private note added.");
    await loadData();
    renderPanel();
    root.querySelector(`[data-open-person="${member.id}"]`)?.click();
  });
}

function attachCommunicationForm(content, member) {
  const form = content.querySelector("[data-communication-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = form.querySelector("[data-communication-message]");
    const submit = form.querySelector("button");
    const deliverInApp = form.elements.direction.value === "outbound" && form.elements.send_in_app.checked;
    submit.disabled = true;
    const { error } = await supabase.rpc("ambassador_admin_log_communication", {
      p_member_id: member.id,
      p_direction: form.elements.direction.value,
      p_channel: form.elements.channel.value,
      p_subject: form.elements.subject.value.trim() || null,
      p_body: form.elements.body.value.trim(),
      p_happened_at: new Date().toISOString(),
      p_send_in_app: deliverInApp,
    });
    if (error) {
      message.textContent = friendlyError(error);
      message.className = "form-message error";
      submit.disabled = false;
      return;
    }
    toast("Communication logged" + (deliverInApp ? " and delivered in-app." : "."));
    await loadData();
    renderPanel();
    root.querySelector(`[data-open-person="${member.id}"]`)?.click();
  });
}

function attachPointsForm(content, member) {
  const form = content.querySelector("[data-points-form]");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const delta = Number(form.elements.delta.value);
    const reason = form.elements.reason.value.trim();
    if (!await confirmAction({
      title: "Record point adjustment?",
      body: `Record a ${delta > 0 ? "+" : ""}${delta} point adjustment for ${member.invite?.public_name}? This stays in the permanent ledger.`,
      confirmLabel: "record adjustment",
      danger: delta < 0,
    })) return;
    const message = form.querySelector("[data-points-message]");
    const submit = form.querySelector("button");
    submit.disabled = true;
    const { error } = await supabase.rpc("ambassador_admin_adjust_points", {
      p_member_id: member.id,
      p_delta: delta,
      p_reason: reason,
    });
    if (error) {
      message.textContent = friendlyError(error);
      message.className = "form-message error";
      submit.disabled = false;
      return;
    }
    toast("Point adjustment recorded in the permanent ledger.");
    await loadData();
    renderPanel();
    root.querySelector(`[data-open-person="${member.id}"]`)?.click();
  });
}

function renderActivity(panel) {
  const actions = state.actions.filter((action) => {
    const member = memberFor(action.member_id);
    return state.includeTest || !member?.is_test;
  });
  panel.innerHTML = `
    <section class="panel" aria-labelledby="activity-title">
      <div class="panel-head">
        <div>
          <p class="eyebrow">PERMANENT RECORD</p>
          <h2 id="activity-title">Activity</h2>
          <p>Every decision, point adjustment, communication, fulfillment change, note, and staff-access change is preserved.</p>
        </div>
        <div class="filter-bar"><label><input type="checkbox" data-activity-include-test ${state.includeTest ? "checked" : ""}> include QA</label></div>
      </div>
      <div class="timeline">
        ${actions.length ? actions.map(actionItem).join("") : '<div class="queue-empty">No staff activity yet.</div>'}
      </div>
    </section>
  `;
  panel.querySelector("[data-activity-include-test]").addEventListener("change", (event) => {
    state.includeTest = event.target.checked;
    renderActivity(panel);
  });
}

function actionItem(action) {
  const member = memberFor(action.member_id);
  const actor = staffFor(action.actor_id);
  return `
    <article class="timeline-item">
      <time>${formatDate(action.created_at, true)}</time>
      <strong>${esc(action.action.replaceAll("_", " "))}</strong>
      <pre>${esc(actor?.display_name || "Staff")}${member ? ` · ${member.invite?.public_name || "ambassador"}` : ""}\n${esc(actionSummary(action))}</pre>
    </article>
  `;
}

function actionSummary(action) {
  const detail = action.detail || {};
  if (action.action.startsWith("submission_")) return `${detail.task || "Submission"} · ${detail.feedback || "decision saved"}`;
  if (action.action.startsWith("reward_")) return `${detail.reward || "Reward"} · ${detail.status || "updated"}`;
  if (action.action === "member_plan_updated") return `Status ${detail.status} · priority ${detail.priority} · next ${detail.next_action || "none"}`;
  if (action.action === "points_adjusted") return `${detail.delta > 0 ? "+" : ""}${detail.delta} · ${detail.reason}`;
  if (action.action === "communication_logged") return `${detail.direction} ${detail.channel} · ${detail.subject || "no subject"}`;
  if (action.action === "staff_note_added") return "Private relationship note added";
  if (action.action === "staff_access_updated") return `Role ${detail.role} · ${detail.active ? "active" : "inactive"}`;
  return JSON.stringify(detail);
}

function renderGuide(panel) {
  panel.innerHTML = `
    <section class="panel" aria-labelledby="guide-title">
      <div class="panel-head">
        <div>
          <p class="eyebrow">OPERATING STANDARD</p>
          <h2 id="guide-title">Staff playbook</h2>
          <p>A simple order of operations so every ambassador gets a fast decision, a clear next move, and no dead time.</p>
        </div>
      </div>
      <div class="playbook-grid">
        <article class="playbook-card playbook-lead">
          <span>01 · every workday</span>
          <h3>Clear work in this order.</h3>
          <ol>
            <li>Anything marked overdue.</li>
            <li>Pending submissions, oldest first.</li>
            <li>Requested or contacted rewards.</li>
            <li>People waiting on Chunq.</li>
            <li>Urgent relationships and unanswered inbound messages.</li>
          </ol>
        </article>
        <article class="playbook-card">
          <span>02 · review standard</span>
          <h3>Approve quality. Explain revisions.</h3>
          <ul>
            <li>Open the actual proof; never decide from the caption alone.</li>
            <li>Confirm the requested deliverable and required disclosure are present.</li>
            <li>Approve only original, clear, usable work.</li>
            <li>When revising, name the exact missing or weak element.</li>
            <li>Always leave one visible next action and a realistic due date.</li>
          </ul>
        </article>
        <article class="playbook-card">
          <span>03 · relationship control</span>
          <h3>One owner. One status. One next move.</h3>
          <ul>
            <li><strong>Active:</strong> free to choose available work.</li>
            <li><strong>Waiting on ambassador:</strong> they have a specific action.</li>
            <li><strong>Waiting on Chunq:</strong> staff owes the next move.</li>
            <li><strong>Paused:</strong> no work expected until the record is reopened.</li>
            <li>Log meaningful email, DM, phone, and in-app contact in the relationship record.</li>
          </ul>
        </article>
        <article class="playbook-card">
          <span>04 · fulfillment standard</span>
          <h3>Never fulfill an incomplete record.</h3>
          <ol>
            <li>Confirm the reward and points eligibility.</li>
            <li>Confirm recipient, address, size, selection, and stock where required.</li>
            <li>Mark contacted when staff is waiting for missing details.</li>
            <li>Add tracking before fulfilling any reward that requires it.</li>
            <li>Use “save record only” for internal corrections that should not notify twice.</li>
          </ol>
        </article>
        <article class="playbook-card">
          <span>05 · communication</span>
          <h3>Be direct, warm, and specific.</h3>
          <ul>
            <li>Lead with the decision or next step.</li>
            <li>Use plain language and concrete dates.</li>
            <li>Never promise stock, delivery timing, paid work, or campaign selection before it is confirmed.</li>
            <li>In-app delivery is instant. External email remains manual until a secure company-mail integration is connected.</li>
          </ul>
        </article>
        <article class="playbook-card">
          <span>06 · access and safety</span>
          <h3>Use the smallest staff role.</h3>
          <ul>
            <li>Reviewers decide submissions; fulfillment handles rewards.</li>
            <li>Admins can adjust points; owners control staff access.</li>
            <li>Private notes and addresses never appear in the public ambassador experience.</li>
            <li>Use the marked QA account for rough testing—never a real ambassador record.</li>
          </ul>
        </article>
      </div>
    </section>
  `;
}

function renderSettings(panel) {
  const isOwner = state.staff.role === "owner";
  panel.innerHTML = `
    <section class="panel" aria-labelledby="settings-title">
      <div class="panel-head">
        <div>
          <p class="eyebrow">ACCESS CONTROL</p>
          <h2 id="settings-title">Staff access</h2>
          <p>Grant the minimum role needed. Staff must first create a Chunq ID account with the exact email entered here.</p>
        </div>
      </div>
      <div class="settings-grid">
        <article class="settings-card">
          <h3>Current staff</h3>
          <p>Owners control access and points. Reviewers decide submissions. Fulfillment staff handle rewards.</p>
          ${state.staffList.map((staff) => staffRow(staff, isOwner)).join("")}
        </article>
        <article class="settings-card">
          <h3>Add staff</h3>
          <p>${isOwner ? "The account must already exist in Chunq ID." : "Only an owner can add or change staff access."}</p>
          ${isOwner ? `
            <form class="ops-form" data-add-staff-form>
              <label class="field"><span>Exact account email</span><input type="email" name="email" required></label>
              <label class="field"><span>Display name</span><input name="display_name" required></label>
              <label class="field"><span>Role</span><select name="role"><option value="reviewer">Reviewer</option><option value="fulfillment">Fulfillment</option><option value="admin">Admin</option></select></label>
              <button class="button-primary" type="submit">add staff access →</button>
              <p class="form-message" data-add-staff-message></p>
            </form>
          ` : ""}
        </article>
      </div>
    </section>
  `;
  const form = panel.querySelector("[data-add-staff-form]");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = form.querySelector("[data-add-staff-message]");
      const submit = form.querySelector("button");
      submit.disabled = true;
      const { error } = await supabase.rpc("ambassador_admin_add_staff", {
        p_email: form.elements.email.value.trim(),
        p_display_name: form.elements.display_name.value.trim(),
        p_role: form.elements.role.value,
      });
      if (error) {
        message.textContent = friendlyError(error);
        message.className = "form-message error";
        submit.disabled = false;
        return;
      }
      toast("Staff access added.");
      await loadData();
      shell();
      state.activeTab = "settings";
      renderPanel();
    });
  }
  panel.querySelectorAll("[data-staff-access-form]").forEach((accessForm) => {
    accessForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = accessForm.querySelector("button");
      const targetName = accessForm.dataset.staffName;
      const active = accessForm.elements.active.checked;
      if (!await confirmAction({
        title: active ? "Save staff access?" : "Remove staff access?",
        body: `${active ? "Save" : "Remove"} access for ${targetName}?`,
        confirmLabel: active ? "save access" : "remove access",
        danger: !active,
      })) return;
      submit.disabled = true;
      const { error } = await supabase.rpc("ambassador_admin_set_staff_access", {
        p_user_id: accessForm.dataset.staffId,
        p_role: accessForm.elements.role.value,
        p_active: active,
      });
      if (error) {
        toast(friendlyError(error), "error");
        submit.disabled = false;
        return;
      }
      toast(`Staff access updated for ${targetName}.`);
      await loadData();
      shell();
    });
  });
}

function staffRow(staff, isOwner) {
  return `
    <div class="staff-row">
      <span><strong>${esc(staff.display_name)}</strong><br>${esc(staff.email)}</span>
      ${isOwner ? `
        <form class="staff-access-form" data-staff-access-form data-staff-id="${staff.user_id}" data-staff-name="${esc(staff.display_name)}">
          <select name="role" aria-label="Role for ${esc(staff.display_name)}">
            ${option("owner", "Owner", staff.role)}
            ${option("admin", "Admin", staff.role)}
            ${option("reviewer", "Reviewer", staff.role)}
            ${option("fulfillment", "Fulfillment", staff.role)}
          </select>
          <label><input type="checkbox" name="active" ${staff.active ? "checked" : ""}> active</label>
          <button class="button-quiet" type="submit">save</button>
        </form>
      ` : `<span class="pill ${staff.active ? "approved" : "rejected"}">${staff.active ? esc(staff.role) : "inactive"}</span>`}
      <span>updated ${formatDate(staff.updated_at)}</span>
    </div>
  `;
}

function option(value, label, selected) {
  return `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`;
}

function staffOptions(selected) {
  return `<option value="">Unassigned</option>` + state.staffList
    .filter((staff) => staff.active)
    .map((staff) => `<option value="${staff.user_id}" ${staff.user_id === selected ? "selected" : ""}>${esc(staff.display_name)} · ${esc(staff.role)}</option>`)
    .join("");
}

function memberStatusOptions(selected) {
  return [
    ["active", "Active"],
    ["waiting_on_ambassador", "Waiting on ambassador"],
    ["waiting_on_chunq", "Waiting on Chunq"],
    ["paused", "Paused"],
    ["graduated", "Graduated"],
    ["closed", "Closed"],
  ].map(([value, label]) => option(value, label, selected)).join("");
}

function priorityOptions(selected) {
  return [
    ["standard", "Standard"],
    ["high", "High"],
    ["urgent", "Urgent"],
  ].map(([value, label]) => option(value, label, selected)).join("");
}

function emptyQueue(title, body) {
  return `<div class="queue-empty"><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;
}

async function boot() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      renderLogin();
      return;
    }
    state.session = data.session;
    const { data: staff, error: staffError } = await supabase
      .from("ambassador_admins")
      .select("*")
      .eq("user_id", data.session.user.id)
      .eq("active", true)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff) {
      renderDenied(data.session.user.email);
      return;
    }
    state.staff = staff;
    await loadData();
    shell();
  } catch (error) {
    root.innerHTML = `
      <main class="admin-gate">
        <p class="eyebrow">OPERATIONS HELP</p>
        <h1>We could not load the staff workspace.</h1>
        <p>${esc(friendlyError(error))}</p>
        <button class="button-primary" type="button" onclick="location.reload()">try again →</button>
      </main>
    `;
  }
}

boot();

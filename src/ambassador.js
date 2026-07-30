import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dtauxotoxxrlduaagovo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0YXV4b3RveHhybGR1YWFnb3ZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNDMzOTEsImV4cCI6MjA5OTgxOTM5MX0.1EihEeXxKkWvslIxuyR66RU1TPiKGW0JPKBhCm-HVUs";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const root = document.querySelector("#ambassador-app");

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const levels = [
  { level: 0, label: "New", min: 0 },
  { level: 1, label: "Active", min: 25 },
  { level: 2, label: "First item unlocked", min: 75 },
  { level: 3, label: "Advanced", min: 150 },
  { level: 4, label: "Top tier", min: 300 },
];

const esc = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const date = (value) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "—";

const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";

const currentLevel = (points) =>
  [...levels].reverse().find((item) => points >= item.min) || levels[0];

const pointsForLevel = (level) =>
  levels.find((item) => item.level === level)?.min || 0;

function friendlyError(error, fallback = "Something went wrong. Please try again.") {
  const raw = String(error?.message || error || "").toLowerCase();
  if (raw.includes("rate limit")) {
    return "Too many requests were made too quickly. Wait one minute, then try once.";
  }
  if (raw.includes("row-level security") || raw.includes("permission denied")) {
    return "Your account does not have permission to do that yet. Email zach.relich@chunqwear.com and include your username.";
  }
  if (raw.includes("duplicate") || raw.includes("unique")) {
    return "This was already submitted or requested. Refresh the page to see its current status.";
  }
  if (raw.includes("weekly") || raw.includes("seven-day")) {
    return "You already used this task for the current seven-day period. Choose another task for now.";
  }
  if (raw.includes("lifetime") || raw.includes("one-time")) {
    return "You already completed this one-time task. Refresh the page to see your status.";
  }
  if (raw.includes("higher ambassador level")) {
    return "This task is still locked. Earn more points with an available task first.";
  }
  if (raw.includes("storage") || raw.includes("upload")) {
    return "The file could not be uploaded. Use a JPG, PNG, WebP, or PDF under 10 MB and try again.";
  }
  if (raw.includes("network") || raw.includes("fetch")) {
    return "The connection dropped. Check your internet connection and try again.";
  }
  return fallback;
}

function shell(content, member) {
  root.innerHTML = `
    <a class="skip-link" href="#overview">skip to dashboard</a>
    <div class="noise" aria-hidden="true"></div>
    <header class="topbar">
      <a class="wordmark" href="/">chunq</a>
      <span class="top-title">ambassador dashboard</span>
      <nav aria-label="Ambassador dashboard">
        ${member === "unlinked" ? `
          <a href="https://chunq.xyz">shop</a>
          <button type="button" data-signout>sign out</button>
        ` : member ? `
          <a href="#overview">home</a>
          <a href="#tasks">tasks</a>
          <a href="#rewards">rewards</a>
          <a href="#activity">activity</a>
          <button type="button" data-signout>sign out</button>
        ` : `
          <a href="/auth">sign in</a>
          <a href="https://chunq.xyz">shop</a>
        `}
      </nav>
    </header>
    ${content}
  `;

  root.querySelector("[data-signout]")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.replace("/auth");
  });
}

function renderAuthRequired() {
  shell(`
    <main class="gate" id="overview">
      <p class="eyebrow">CHUNQ AMBASSADOR PROGRAM</p>
      <h1>Sign in with the email that received your acceptance.</h1>
      <ol class="gate-steps">
        <li>Sign in, or create a Chunq account if you do not have one.</li>
        <li>Use the exact email address where Chunq sent your acceptance.</li>
        <li>After signing in, your tasks and rewards will appear here.</li>
      </ol>
      <a class="primary-link" href="/auth">sign in or create an account →</a>
      <p class="support-note">Need help? Email <a href="mailto:zach.relich@chunqwear.com?subject=Help%20with%20my%20Chunq%20ambassador%20account">zach.relich@chunqwear.com</a>. Never send your password.</p>
    </main>
  `);
}

function renderUnlinked(email) {
  const subject = encodeURIComponent("Help connecting my Chunq ambassador account");
  const body = encodeURIComponent(`I signed in with ${email || "this email"}.\nMy Chunq username is: [add username]\nPlease connect my ambassador account.`);
  shell(`
    <main class="gate" id="overview">
      <p class="eyebrow">ACCOUNT HELP</p>
      <h1>We could not match this email to an ambassador invitation.</h1>
      <p>You are signed in as <strong>${esc(email)}</strong>. This usually means your acceptance was sent to a different email address.</p>
      <a class="primary-link" href="mailto:zach.relich@chunqwear.com?subject=${subject}&body=${body}">ask us to connect it →</a>
      <p class="support-note">Include your Chunq username. Do not send your password.</p>
    </main>
  `, "unlinked");
}

function taskState(task, submissions, member) {
  const history = submissions.filter((item) => item.task_key === task.key);
  const pending = history.find((item) => item.status === "pending");
  const counted = history.filter((item) => ["pending", "approved"].includes(item.status)).length;
  const completed = Boolean(task.lifetime_limit && counted >= task.lifetime_limit);
  const locked = member.level < task.min_level;
  const latest = history[0];
  const limit = task.lifetime_limit
    ? "Do this once"
    : task.weekly_limit === 1
    ? "Up to once every 7 days"
    : task.weekly_limit
    ? `Up to ${task.weekly_limit} times every 7 days`
    : "Can be repeated";

  let key = "ready";
  let label = "Ready";
  if (locked) {
    key = "locked";
    label = `Unlocks at ${pointsForLevel(task.min_level)} points`;
  } else if (pending) {
    key = "pending";
    label = "Waiting for review";
  } else if (completed) {
    key = "complete";
    label = "Done";
  } else if (latest?.status === "rejected") {
    key = "retry";
    label = "Try again";
  } else if (latest?.status === "approved") {
    key = "ready";
    label = "Ready again";
  }

  return {
    task,
    history,
    pending,
    completed,
    locked,
    latest,
    limit,
    key,
    label,
    actionable: !locked && !pending && !completed,
  };
}

function taskButtonLabel(task, retry = false) {
  if (retry) return "try this task again →";
  return task.proof_mode === "note" ? "answer this task →" : "submit your work →";
}

function taskCard(state, index) {
  const { task, latest } = state;
  const publicTask = ["story-reshare", "owned-styling-post", "owned-short-video", "gifted-content"].includes(task.key);
  return `
    <article class="task task-${state.key}" style="--delay:${index * 35}ms">
      <div class="task-top">
        <span class="state-pill state-${state.key}">${esc(state.label)}</span>
        <strong>+${task.points} points</strong>
      </div>
      <h3>${esc(task.label)}</h3>
      <p class="task-description">${esc(task.description)}</p>
      <div class="task-detail">
        <span>What to send</span>
        <p>${esc(task.proof_required)}</p>
      </div>
      <p class="task-limit">${esc(state.limit)}</p>
      ${publicTask ? '<p class="disclosure-note">Public posts must clearly say “Chunq ambassador,” “gifted by Chunq,” or #ad.</p>' : ""}
      ${latest?.status === "rejected"
        ? `<div class="retry-note"><strong>What to fix</strong><p>${esc(latest.review_feedback || "Review the task instructions and send a clearer version of the requested proof.")}</p></div>`
        : ""}
      ${state.actionable
        ? `<button class="task-open" type="button" data-open-task="${esc(task.key)}">${taskButtonLabel(task, state.key === "retry")}</button>`
        : state.pending
        ? '<p class="task-result">We received it. You can work on another task while we review it.</p>'
        : state.completed
        ? '<p class="task-result">This starter task is complete.</p>'
        : `<p class="task-result">Earn ${Math.max(0, pointsForLevel(task.min_level) - state.memberPoints)} more points first.</p>`}
    </article>
  `;
}

function rewardCard(reward, claims, points, index) {
  const claim = claims.find((item) => item.reward_key === reward.key);
  const unlocked = points >= reward.points_required;
  const remaining = Math.max(0, reward.points_required - points);
  const status = claim
    ? {
        requested: "Request received",
        contacted: "Check your messages",
        fulfilled: "Completed",
        declined: "Please contact us",
        expired: "Request expired",
      }[claim.status] || "Request received"
    : unlocked
    ? "Ready to request"
    : `${remaining} points away`;
  const trackingLink = claim?.tracking_url
    ? `<a class="reward-tracking" href="${esc(claim.tracking_url)}" target="_blank" rel="noopener">track your package ↗</a>`
    : claim?.tracking_number
    ? `<p class="reward-tracking">Tracking: ${esc(claim.tracking_carrier ? `${claim.tracking_carrier} · ` : "")}${esc(claim.tracking_number)}</p>`
    : "";

  return `
    <article class="reward ${unlocked ? "reward-ready" : "reward-locked"}" style="--delay:${index * 45}ms">
      <div class="reward-top">
        <span>${reward.points_required} points</span>
        <span>${esc(status)}</span>
      </div>
      <h3>${esc(reward.label)}</h3>
      <p>${esc(reward.description)}</p>
      ${claim
        ? `<div class="reward-claim-detail">
            <p class="reward-result">${esc(status)} · ${date(claim.claimed_at)}</p>
            ${claim.staff_note ? `<p class="reward-note">${esc(claim.staff_note)}</p>` : ""}
            ${trackingLink}
          </div>`
        : unlocked
        ? `<button type="button" class="claim-reward" data-claim-reward="${esc(reward.key)}">request this reward →</button>`
        : `<div class="reward-mini-meter" aria-label="${remaining} points remaining"><span style="width:${Math.min(100, (points / reward.points_required) * 100)}%"></span></div>`}
    </article>
  `;
}

function submissionRow(item, taskMap) {
  const task = taskMap.get(item.task_key);
  const legacyLabels = {
    "follow-save": "Old starter task",
    "specific-comment": "Old starter task",
  };
  const proofLink = item.display_url || item.proof_url;
  const proofCell = item.proof_url?.startsWith("note://")
    ? "Written answer"
    : proofLink
    ? `<a href="${esc(proofLink)}" target="_blank" rel="noopener">open submission ↗</a>`
    : "Uploaded file";
  const statusLabels = {
    pending: "Waiting for review",
    approved: "Approved",
    rejected: "Try again",
    withdrawn: "Withdrawn",
  };
  return `
    <tr>
      <td>${date(item.submitted_at)}</td>
      <td>${esc(task?.label || legacyLabels[item.task_key] || item.task_key)}</td>
      <td><span class="status status-${esc(item.status)}">${esc(statusLabels[item.status] || item.status)}</span></td>
      <td>${proofCell}</td>
    </tr>
  `;
}

function ledgerRow(item) {
  return `
    <tr>
      <td>${date(item.created_at)}</td>
      <td>${esc(item.reason)}</td>
      <td class="${item.delta >= 0 ? "plus" : "minus"}">${item.delta >= 0 ? "+" : ""}${item.delta}</td>
    </tr>
  `;
}

function taskPlaceholder(task) {
  const examples = {
    "profile-setup": "Example: @yourhandle; Brooklyn, NY; top M; bottoms 30; short styling videos.",
    "path-setup": "Example: Short-form video — I want to make fast outfit-change videos with strong locations.",
    "creative-feedback": "Tell us what you want to see next and why.",
  };
  return examples[task.key] || "Add useful context for the reviewer.";
}

function renderDashboard(data) {
  const { member, tasks, submissions, ledger, rewards, claims } = data;
  const level = currentLevel(member.points);
  const taskMap = new Map(tasks.map((task) => [task.key, task]));
  const states = tasks.map((task) => ({ ...taskState(task, submissions, member), memberPoints: member.points }));
  const starterStates = states.filter((state) => state.task.category === "onboarding");
  const openStates = states.filter((state) => state.task.category !== "onboarding" && !state.locked);
  const laterStates = states.filter((state) => state.locked);
  const nextTaskState = [...states]
    .filter((state) => state.actionable)
    .sort((a, b) => {
      const aStarter = a.task.category === "onboarding" ? 0 : 1;
      const bStarter = b.task.category === "onboarding" ? 0 : 1;
      return aStarter - bStarter || a.task.sort_order - b.task.sort_order;
    })[0];
  const assignedNextAction = member.next_action?.trim() || "";
  const nextReward = rewards.find((reward) => reward.points_required > member.points);
  const rewardTarget = nextReward?.points_required || rewards.at(-1)?.points_required || 300;
  const previousReward = [...rewards].reverse().find((reward) => reward.points_required <= member.points);
  const rewardStart = previousReward?.points_required || 0;
  const rewardProgress = nextReward
    ? Math.max(0, Math.min(100, ((member.points - rewardStart) / (rewardTarget - rewardStart)) * 100))
    : 100;
  const starterSent = starterStates.filter((state) =>
    state.history.some((item) => ["pending", "approved"].includes(item.status))
  ).length;
  const starterApproved = starterStates.filter((state) =>
    state.history.some((item) => item.status === "approved")
  ).length;

  shell(`
    <main class="dashboard" id="overview">
      <section class="welcome">
        <div class="welcome-copy">
          <p class="eyebrow">WELCOME, ${esc(member.invite.public_name).toUpperCase()}</p>
          <h1>Here is exactly what to do next.</h1>
          <p>Complete one task at a time. Send what the task asks for. When we approve it, the points are added automatically.</p>
          <details class="why-selected">
            <summary>Why you were selected</summary>
            <p>${esc(member.invite.strengths)}</p>
          </details>
        </div>
        <div class="score-card">
          <span>Your points</span>
          <strong data-points="${member.points}">0</strong>
          <p>${esc(level.label)} ambassador</p>
          <div class="score-progress">
            <div class="meter" aria-label="${rewardProgress}% of the way to the next reward"><span data-meter="${rewardProgress}"></span></div>
            <p>${nextReward ? `${nextReward.points_required - member.points} more points unlock ${esc(nextReward.label)}` : "You unlocked every listed reward."}</p>
          </div>
        </div>
      </section>

      <section class="next-action" aria-labelledby="next-action-title">
        <div>
          <p class="eyebrow">DO THIS NEXT</p>
          <h2 id="next-action-title">${assignedNextAction ? esc(assignedNextAction) : nextTaskState ? esc(nextTaskState.task.label) : "You are caught up"}</h2>
          <p>${assignedNextAction
            ? `This is the priority your Chunq team set for you.${member.next_action_due_at ? ` Please complete it by ${esc(dateTime(member.next_action_due_at))}.` : ""}`
            : nextTaskState
            ? esc(nextTaskState.task.description)
            : "There is no open task that needs your attention right now. Check your activity for anything waiting for review."}</p>
        </div>
        ${nextTaskState ? `
          <div class="next-action-side">
            <strong>${assignedNextAction ? "Fastest available task" : `+${nextTaskState.task.points} points`}</strong>
            <span>${assignedNextAction ? `${nextTaskState.task.points} points available` : "What to send"}</span>
            <p>${esc(nextTaskState.task.proof_required)}</p>
            <button type="button" data-open-task="${esc(nextTaskState.task.key)}">${taskButtonLabel(nextTaskState.task, nextTaskState.key === "retry")}</button>
          </div>
        ` : '<a class="secondary-link" href="#activity">view your activity →</a>'}
      </section>

      <section class="starter-section" aria-labelledby="starter-title">
        <div class="section-head">
          <div>
            <p class="eyebrow">START HERE</p>
            <h2 id="starter-title">Your first two tasks</h2>
          </div>
          <p>${starterSent} of ${starterStates.length} sent · ${starterApproved} approved</p>
        </div>
        <p class="section-intro">Nothing needs to be posted publicly. Once both answers are approved, you earn ${starterStates.reduce((sum, state) => sum + state.task.points, 0)} points—enough to request the welcome sticker pack.</p>
        <div class="task-grid task-grid-starter">
          ${starterStates.map((state, index) => taskCard(state, index)).join("")}
        </div>
      </section>

      <section class="tasks-section" id="tasks" aria-labelledby="tasks-title">
        <div class="section-head">
          <div>
            <p class="eyebrow">AFTER THE STARTER TASKS</p>
            <h2 id="tasks-title">More ways to earn points</h2>
          </div>
          <p>Choose the work that fits you.</p>
        </div>
        <div class="task-grid">
          ${openStates.map((state, index) => taskCard(state, index)).join("")}
        </div>
        ${laterStates.length ? `
          <details class="later-tasks">
            <summary>${laterStates.length} task${laterStates.length === 1 ? "" : "s"} available later</summary>
            <div class="task-grid">
              ${laterStates.map((state, index) => taskCard(state, index)).join("")}
            </div>
          </details>
        ` : ""}
      </section>

      <section class="rewards-section" id="rewards" aria-labelledby="rewards-title">
        <div class="section-head">
          <div>
            <p class="eyebrow">WHAT YOU CAN UNLOCK</p>
            <h2 id="rewards-title">Rewards</h2>
          </div>
          <p>Rewards do not spend your points.</p>
        </div>
        <div class="reward-grid">
          ${rewards.map((reward, index) => rewardCard(reward, claims, member.points, index)).join("")}
        </div>
      </section>

      <details class="program-rules">
        <summary>Program rules and public-post disclosure</summary>
        <ul>
          <li>We review every submission. Only approved work adds points.</li>
          <li>Send original work that follows the task. Copied work, fake analytics, spam, or deleted posts do not earn points.</li>
          <li>Any public post connected to points, free products, a discount, or payment must clearly say “Chunq ambassador,” “gifted by Chunq,” or #ad where people can see it.</li>
          <li>Free products and paid work still depend on size, stock, location, performance, and a written creative agreement.</li>
        </ul>
      </details>

      <details class="activity-details" id="activity">
        <summary>Your submissions and points history</summary>
        <div class="records">
          <div>
            <div class="subsection-head"><h3>Your submissions</h3><p>We review every submission.</p></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Task</th><th>Status</th><th>Submission</th></tr></thead>
                <tbody>${submissions.length ? submissions.map((item) => submissionRow(item, taskMap)).join("") : '<tr><td colspan="4">You have not submitted anything yet.</td></tr>'}</tbody>
              </table>
            </div>
          </div>
          <div>
            <div class="subsection-head"><h3>Points history</h3><p>Every approved point change appears here.</p></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Reason</th><th>Points</th></tr></thead>
                <tbody>${ledger.length ? ledger.map(ledgerRow).join("") : '<tr><td colspan="3">You do not have approved points yet.</td></tr>'}</tbody>
              </table>
            </div>
          </div>
        </div>
      </details>

      <section class="help-strip">
        <div>
          <h2>Stuck or unsure?</h2>
          <p>Email us with your username and a screenshot. Never send your password.</p>
        </div>
        <a href="mailto:zach.relich@chunqwear.com?subject=Help%20with%20my%20Chunq%20ambassador%20dashboard">email Chunq →</a>
      </section>

      <dialog id="proof-dialog" aria-labelledby="proof-dialog-title">
        <form class="dialog-shell" data-proof-form novalidate>
          <button class="dialog-close" type="button" data-close-dialog aria-label="Close">×</button>
          <p class="eyebrow">SEND YOUR COMPLETED TASK</p>
          <h2 id="proof-dialog-title" data-dialog-title>Send your work</h2>
          <input type="hidden" name="task_key">
          <div class="task-requirement">
            <span>What to send</span>
            <p data-task-requirement></p>
          </div>
          <div data-proof-upload>
            <label>
              Upload a screenshot or PDF
              <input name="proof_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf">
              <small>JPG, PNG, WebP, or PDF · maximum 10 MB</small>
            </label>
            <p class="form-or">or</p>
            <label>
              Paste a public link
              <input name="proof_url" type="url" inputmode="url" placeholder="https://">
            </label>
          </div>
          <label>
            <span data-note-label>Optional note for the reviewer</span>
            <textarea name="note" maxlength="700" rows="5"></textarea>
          </label>
          <p class="form-help" data-form-message role="status">Use one method above, then send it for review.</p>
          <button class="submit-proof" type="submit">send for review →</button>
        </form>
      </dialog>

      <dialog id="reward-dialog" aria-labelledby="reward-dialog-title">
        <form class="dialog-shell" data-reward-form>
          <button class="dialog-close" type="button" data-close-reward aria-label="Close">×</button>
          <p class="eyebrow">CONFIRM YOUR REWARD</p>
          <h2 id="reward-dialog-title" data-reward-title>Request reward</h2>
          <input type="hidden" name="reward_key">
          <p data-reward-description></p>
          <label>
            Item or option preference <span class="optional-label">(optional)</span>
            <input name="reward_selection" maxlength="160" placeholder="Example: black tee, if available">
          </label>
          <div data-size-fields hidden>
            <label>
              Your size
              <input name="size" maxlength="40" autocomplete="off" placeholder="Example: M">
            </label>
          </div>
          <fieldset class="shipping-fields" data-shipping-fields hidden>
            <legend>Where should we send it?</legend>
            <label>
              Full name
              <input name="shipping_name" maxlength="120" autocomplete="name">
            </label>
            <label>
              Address
              <input name="shipping_address_line1" maxlength="160" autocomplete="address-line1">
            </label>
            <label>
              Apartment, suite, or unit <span class="optional-label">(optional)</span>
              <input name="shipping_address_line2" maxlength="160" autocomplete="address-line2">
            </label>
            <div class="reward-form-grid">
              <label>
                City
                <input name="shipping_city" maxlength="100" autocomplete="address-level2">
              </label>
              <label>
                State / region
                <input name="shipping_region" maxlength="100" autocomplete="address-level1">
              </label>
              <label>
                Postal code
                <input name="shipping_postal_code" maxlength="40" autocomplete="postal-code">
              </label>
              <label>
                Country
                <input name="shipping_country" maxlength="100" autocomplete="country-name">
              </label>
            </div>
          </fieldset>
          <label>
            Anything the Chunq team should know? <span class="optional-label">(optional)</span>
            <textarea name="member_note" maxlength="700" rows="3" placeholder="Fit notes, delivery notes, or a question"></textarea>
          </label>
          <p class="reward-privacy">Shipping details are used only to prepare and deliver your reward. Check every field before requesting.</p>
          <p class="form-help" data-reward-message role="status">We will confirm your request in your dashboard messages.</p>
          <div class="dialog-actions">
            <button class="secondary-button" type="button" data-close-reward>not yet</button>
            <button class="submit-proof" type="submit">yes, request it →</button>
          </div>
        </form>
      </dialog>
    </main>
  `, member);

  const proofDialog = root.querySelector("#proof-dialog");
  const proofForm = root.querySelector("[data-proof-form]");
  const rewardDialog = root.querySelector("#reward-dialog");
  const rewardForm = root.querySelector("[data-reward-form]");

  root.querySelectorAll("[data-open-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = taskMap.get(button.dataset.openTask);
      proofForm.reset();
      proofForm.elements.task_key.value = task.key;
      proofForm.dataset.proofMode = task.proof_mode;
      root.querySelector("[data-proof-upload]").hidden = task.proof_mode === "note";
      root.querySelector("[data-dialog-title]").textContent = task.label;
      root.querySelector("[data-task-requirement]").textContent = task.proof_required;
      root.querySelector("[data-note-label]").textContent =
        task.proof_mode === "note" ? "Your answer" : "Optional note for the reviewer";
      proofForm.elements.note.placeholder = taskPlaceholder(task);
      root.querySelector("[data-form-message]").textContent =
        task.proof_mode === "note"
          ? "Write the requested answer, then send it for review."
          : "Upload a file or paste a public link.";
      proofDialog.showModal();
      setTimeout(() => {
        const firstField = task.proof_mode === "note"
          ? proofForm.elements.note
          : proofForm.elements.proof_file;
        firstField?.focus();
      }, 0);
    });
  });

  root.querySelector("[data-close-dialog]")?.addEventListener("click", () => proofDialog.close());

  proofForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = proofForm.querySelector(".submit-proof");
    const message = root.querySelector("[data-form-message]");
    const task = taskMap.get(proofForm.elements.task_key.value);
    const proofFile = proofForm.elements.proof_file.files[0];
    const proofUrl = proofForm.elements.proof_url.value.trim();
    const note = proofForm.elements.note.value.trim();

    message.className = "form-help";
    if (proofForm.dataset.proofMode === "note" && !note) {
      message.textContent = "Write your answer before sending it.";
      message.classList.add("form-error");
      proofForm.elements.note.focus();
      return;
    }
    if (proofForm.dataset.proofMode !== "note" && !proofFile && !proofUrl) {
      message.textContent = "Upload a file or paste a public link.";
      message.classList.add("form-error");
      return;
    }
    if (proofFile && !ALLOWED_UPLOAD_TYPES.has(proofFile.type)) {
      message.textContent = "Use a JPG, PNG, WebP, or PDF file.";
      message.classList.add("form-error");
      return;
    }
    if (proofFile && proofFile.size > MAX_UPLOAD_BYTES) {
      message.textContent = "That file is larger than 10 MB. Choose a smaller file.";
      message.classList.add("form-error");
      return;
    }
    if (proofUrl) {
      try {
        const parsed = new URL(proofUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid protocol");
      } catch {
        message.textContent = "Paste a complete public link beginning with http:// or https://.";
        message.classList.add("form-error");
        proofForm.elements.proof_url.focus();
        return;
      }
    }

    submit.disabled = true;
    submit.textContent = proofFile ? "uploading..." : "sending...";
    message.textContent = "Please keep this page open.";

    let uploadedPath = "";
    const payload = {
      member_id: member.id,
      task_key: task.key,
      proof_url: proofUrl,
      note: note || null,
    };

    if (proofForm.dataset.proofMode === "note") {
      payload.proof_url = "note://submitted";
    }

    if (proofFile) {
      const extension = proofFile.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      uploadedPath = `${member.user_id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("ambassador-proof")
        .upload(uploadedPath, proofFile, {
          cacheControl: "3600",
          contentType: proofFile.type,
          upsert: false,
        });
      if (uploadError) {
        message.textContent = friendlyError(uploadError, "The file could not be uploaded. Try a public link instead.");
        message.classList.add("form-error");
        submit.disabled = false;
        submit.textContent = "send for review →";
        return;
      }
      payload.proof_url = `storage://ambassador-proof/${uploadedPath}`;
    }

    const { error } = await supabase.from("ambassador_submissions").insert(payload);
    if (error) {
      if (uploadedPath) {
        await supabase.storage.from("ambassador-proof").remove([uploadedPath]);
      }
      message.textContent = friendlyError(error, "We could not save this submission. Try again or email us for help.");
      message.classList.add("form-error");
      submit.disabled = false;
      submit.textContent = "send for review →";
      return;
    }

    message.textContent = "Received. We will review it and add the points after approval.";
    message.classList.add("form-success");
    submit.textContent = "submission received";
    setTimeout(() => location.reload(), 900);
  });

  root.querySelectorAll("[data-claim-reward]").forEach((button) => {
    button.addEventListener("click", () => {
      const reward = rewards.find((item) => item.key === button.dataset.claimReward);
      rewardForm.reset();
      rewardForm.elements.reward_key.value = reward.key;
      rewardForm.dataset.requiresShipping = String(Boolean(reward.requires_shipping));
      rewardForm.dataset.requiresSize = String(Boolean(reward.requires_size));
      const shippingFields = root.querySelector("[data-shipping-fields]");
      const sizeFields = root.querySelector("[data-size-fields]");
      shippingFields.hidden = !reward.requires_shipping;
      sizeFields.hidden = !reward.requires_size;
      shippingFields.querySelectorAll("input").forEach((input) => {
        input.required = Boolean(reward.requires_shipping) && input.name !== "shipping_address_line2";
      });
      rewardForm.elements.size.required = Boolean(reward.requires_size);
      root.querySelector("[data-reward-title]").textContent = reward.label;
      root.querySelector("[data-reward-description]").textContent = reward.description;
      root.querySelector("[data-reward-message]").textContent =
        reward.requires_shipping
          ? "Complete the shipping details so the team can prepare your reward."
          : "We will confirm your request in your dashboard messages.";
      rewardDialog.showModal();
      setTimeout(() => {
        const firstField = reward.requires_size
          ? rewardForm.elements.size
          : reward.requires_shipping
          ? rewardForm.elements.shipping_name
          : rewardForm.elements.reward_selection;
        firstField?.focus();
      }, 0);
    });
  });

  root.querySelectorAll("[data-close-reward]").forEach((button) => {
    button.addEventListener("click", () => rewardDialog.close());
  });

  rewardForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = rewardForm.querySelector(".submit-proof");
    const message = root.querySelector("[data-reward-message]");
    message.className = "form-help";
    if (!rewardForm.reportValidity()) return;
    submit.disabled = true;
    submit.textContent = "requesting...";
    const fields = new FormData(rewardForm);
    const value = (name) => String(fields.get(name) || "").trim() || null;
    const { error } = await supabase.from("ambassador_reward_claims").insert({
      member_id: member.id,
      reward_key: value("reward_key"),
      reward_selection: value("reward_selection"),
      size: value("size"),
      shipping_name: value("shipping_name"),
      shipping_address_line1: value("shipping_address_line1"),
      shipping_address_line2: value("shipping_address_line2"),
      shipping_city: value("shipping_city"),
      shipping_region: value("shipping_region"),
      shipping_postal_code: value("shipping_postal_code"),
      shipping_country: value("shipping_country"),
      member_note: value("member_note"),
    });
    if (error) {
      message.textContent = friendlyError(error, "We could not save the reward request. Refresh and try again.");
      message.classList.add("form-error");
      submit.disabled = false;
      submit.textContent = "yes, request it →";
      return;
    }
    message.textContent = "Request received. Watch your dashboard messages for the next step.";
    message.classList.add("form-success");
    submit.textContent = "request received";
    setTimeout(() => location.reload(), 900);
  });

  root.querySelector('a[href="#activity"]')?.addEventListener("click", () => {
    root.querySelector("#activity").open = true;
  });

  requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
    root.querySelectorAll("[data-meter]").forEach((meter) => {
      meter.style.width = `${meter.dataset.meter}%`;
    });
    const pointNode = root.querySelector("[data-points]");
    const target = Number(pointNode?.dataset.points || 0);
    const start = performance.now();
    const tick = (now) => {
      const amount = Math.round(target * Math.min(1, (now - start) / 550));
      if (pointNode) pointNode.textContent = amount;
      if (amount < target) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  celebrateNewRewards(member.points, rewards);
}

function celebrateNewRewards(points, rewards) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const storageKey = "chunq-ambassador-last-points";
  const previous = Number(localStorage.getItem(storageKey) || points);
  localStorage.setItem(storageKey, String(points));
  const unlocked = rewards.filter((reward) =>
    previous < reward.points_required && points >= reward.points_required
  );
  if (!unlocked.length) return;

  const burst = document.createElement("div");
  burst.className = "reward-burst";
  burst.innerHTML = Array.from({ length: 22 }, (_, index) =>
    `<i style="--i:${index};--x:${Math.round(Math.random() * 240 - 120)}px;--r:${Math.round(Math.random() * 280 - 140)}deg"></i>`
  ).join("");
  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 1600);
}

async function loadDashboard(user) {
  const { data: member, error: memberError } = await supabase
    .from("ambassador_members")
    .select("id,user_id,invite_id,creative_class,points,level,product_eligible_at,joined_at,next_action,next_action_due_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member) return renderUnlinked(user.email);

  const [inviteResult, taskResult, submissionResult, ledgerResult, rewardResult, claimResult] = await Promise.all([
    supabase
      .from("ambassador_invites")
      .select("public_name,invite_code,strengths,starting_note")
      .eq("id", member.invite_id)
      .single(),
    supabase
      .from("ambassador_tasks")
      .select("key,label,description,points,proof_required,weekly_limit,sort_order,category,proof_mode,lifetime_limit,min_level")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("ambassador_submissions")
      .select("id,task_key,proof_url,note,status,review_feedback,reviewed_at,submitted_at")
      .eq("member_id", member.id)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("ambassador_point_ledger")
      .select("id,delta,reason,created_at")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("ambassador_rewards")
      .select("key,label,description,points_required,sort_order,requires_shipping,requires_size,tracking_required")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("ambassador_reward_claims")
      .select("id,reward_key,status,member_note,staff_note,claimed_at,contacted_at,fulfilled_at,reward_selection,size,shipping_name,shipping_address_line1,shipping_address_line2,shipping_city,shipping_region,shipping_postal_code,shipping_country,tracking_carrier,tracking_number,tracking_url")
      .eq("member_id", member.id)
      .order("claimed_at", { ascending: false }),
  ]);

  const failure = [inviteResult, taskResult, submissionResult, ledgerResult, rewardResult, claimResult].find((result) => result.error);
  if (failure) throw failure.error;

  const submissions = submissionResult.data || [];
  await Promise.all(
    submissions.map(async (submission) => {
      if (!submission.proof_url?.startsWith("storage://ambassador-proof/")) return;
      const objectPath = submission.proof_url.replace("storage://ambassador-proof/", "");
      const { data: signed } = await supabase.storage
        .from("ambassador-proof")
        .createSignedUrl(objectPath, 3600);
      submission.display_url = signed?.signedUrl || "";
    }),
  );

  member.invite = inviteResult.data;
  renderDashboard({
    member,
    tasks: taskResult.data || [],
    submissions,
    ledger: ledgerResult.data || [],
    rewards: rewardResult.data || [],
    claims: claimResult.data || [],
  });
}

async function boot() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) return renderAuthRequired();
    await loadDashboard(data.session.user);
  } catch (error) {
    const localDebug = ["localhost", "127.0.0.1"].includes(location.hostname)
      ? `<pre class="local-debug">${esc(error?.message || String(error))}</pre>`
      : "";
    shell(`
      <main class="gate" id="overview">
        <p class="eyebrow">DASHBOARD HELP</p>
        <h1>We could not load your ambassador dashboard.</h1>
        <p>${esc(friendlyError(error, "Please refresh the page. If it still does not load, email us with your username and a screenshot."))}</p>
        ${localDebug}
        <button class="primary-link as-button" type="button" onclick="location.reload()">try again →</button>
        <p class="support-note">Still stuck? Email <a href="mailto:zach.relich@chunqwear.com?subject=Ambassador%20dashboard%20not%20loading">zach.relich@chunqwear.com</a>.</p>
      </main>
    `);
  }
}

boot();

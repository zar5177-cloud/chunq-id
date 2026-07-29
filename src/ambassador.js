import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dtauxotoxxrlduaagovo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0YXV4b3RveHhybGR1YWFnb3ZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNDMzOTEsImV4cCI6MjA5OTgxOTM5MX0.1EihEeXxKkWvslIxuyR66RU1TPiKGW0JPKBhCm-HVUs";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const root = document.querySelector("#ambassador-app");

const levels = [
  { level: 0, label: "starter", min: 0 },
  { level: 1, label: "active", min: 25 },
  { level: 2, label: "product eligible", min: 75 },
  { level: 3, label: "advanced", min: 150 },
  { level: 4, label: "elite", min: 300 },
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
        day: "2-digit",
        year: "numeric",
      }).format(new Date(value))
    : "—";

const currentLevel = (points) =>
  [...levels].reverse().find((item) => points >= item.min) || levels[0];

const nextLevel = (points) => levels.find((item) => item.min > points);

function shell(content, member) {
  root.innerHTML = `
    <div class="noise"></div>
    <header class="topbar">
      <a class="wordmark" href="/">chunq</a>
      <div class="topmeta">
        <span>AMBASSADOR PROGRAM</span>
        <span>${member ? `MEMBER ${esc(member.invite?.invite_code || "UNLINKED")}` : "SIGN IN REQUIRED"}</span>
      </div>
      <nav>
        <a href="/">world</a>
        ${member ? '<button type="button" data-signout>sign out</button>' : ""}
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
    <main class="gate">
      <p class="eyebrow">AMBASSADOR SIGN IN</p>
      <h1>your tasks and<br>rewards are waiting.</h1>
      <p>Sign in or create your chunq ID using the same email that received your acceptance. Your ambassador account will connect automatically.</p>
      <a class="primary-link" href="/auth">sign in or register →</a>
      <p class="micro">Already registered with a different email? Reply to your acceptance email and we will connect it for you.</p>
    </main>
  `);
}

function renderUnlinked(email) {
  shell(`
    <main class="gate">
      <p class="eyebrow">ACCOUNT NOT CONNECTED</p>
      <h1>you are signed in.<br>let’s connect your account.</h1>
      <p>Signed in as <span class="mono">${esc(email)}</span>. Your ambassador account connects to the exact email that received your acceptance.</p>
      <a class="primary-link" href="mailto:zach.relich@chunqwear.com?subject=ambassador%20account%20connection">get help connecting it →</a>
      <p class="micro">Include your chosen username. Do not send a password.</p>
    </main>
  `);
}

function taskCard(task, submissions, member, index) {
  const history = submissions.filter((item) => item.task_key === task.key);
  const pending = history.find((item) => item.status === "pending");
  const completed = task.lifetime_limit &&
    history.filter((item) => ["pending", "approved"].includes(item.status)).length >= task.lifetime_limit;
  const locked = member.level < task.min_level;
  const latest = history[0];
  const limit = task.lifetime_limit
    ? "one time"
    : task.weekly_limit
    ? `${task.weekly_limit} approved / week maximum`
    : "no weekly maximum";

  return `
    <article class="task ${pending ? "is-pending" : ""} ${locked ? "is-locked" : ""} ${completed ? "is-complete" : ""}" data-task="${esc(task.key)}" style="--delay:${index * 45}ms">
      <div class="task-head">
        <div>
          <span class="task-index">${String(task.sort_order).padStart(3, "0")}</span>
          <h3>${esc(task.label)}</h3>
        </div>
        <strong>+${task.points}</strong>
      </div>
      <p class="task-category">${esc(task.category)} task</p>
      <p>${esc(task.description)}</p>
      <dl>
        <div><dt>proof</dt><dd>${esc(task.proof_required)}</dd></div>
        <div><dt>frequency</dt><dd>${esc(limit)}</dd></div>
        <div><dt>latest</dt><dd>${latest ? `${esc(latest.status)} / ${date(latest.submitted_at)}` : "not submitted yet"}</dd></div>
      </dl>
      ${locked
        ? `<p class="locked-note">UNLOCKS AT LEVEL ${task.min_level}</p>`
        : completed && !pending
        ? '<p class="complete-note">COMPLETED / POINTS ADDED AFTER APPROVAL</p>'
        : pending
        ? '<p class="pending-note">PROOF IS WAITING FOR HUMAN REVIEW.</p>'
        : `<button class="task-open" type="button" data-open-task="${esc(task.key)}">submit proof →</button>`}
    </article>
  `;
}

function rewardCard(reward, claims, points, index) {
  const claim = claims.find((item) => item.reward_key === reward.key);
  const unlocked = points >= reward.points_required;
  const remaining = Math.max(0, reward.points_required - points);
  return `
    <article class="reward ${unlocked ? "is-unlocked" : "is-locked"}" style="--delay:${index * 70}ms">
      <div class="reward-top">
        <span>${reward.points_required} POINTS</span>
        <span>${claim ? esc(claim.status) : unlocked ? "UNLOCKED" : `${remaining} TO GO`}</span>
      </div>
      <h3>${esc(reward.label)}</h3>
      <p>${esc(reward.description)}</p>
      ${claim
        ? `<p class="reward-status">REQUEST ${esc(claim.status.toUpperCase())} / ${date(claim.claimed_at)}</p>`
        : unlocked
        ? `<button type="button" class="claim-reward" data-claim-reward="${esc(reward.key)}">request this reward →</button>`
        : `<div class="reward-mini-meter"><span style="width:${Math.min(100, (points / reward.points_required) * 100)}%"></span></div>`}
    </article>
  `;
}

function submissionRow(item, taskMap) {
  const task = taskMap.get(item.task_key);
  const legacyLabels = {
    "follow-save": "legacy launch task (retired)",
    "specific-comment": "legacy launch task (retired)",
  };
  const proofLink = item.display_url || item.proof_url;
  const proofCell = item.proof_url?.startsWith("note://")
    ? "private answer"
    : proofLink
    ? `<a href="${esc(proofLink)}" target="_blank" rel="noopener">view proof ↗</a>`
    : "uploaded";
  return `
    <tr>
      <td>${date(item.submitted_at)}</td>
      <td>${esc(task?.label || legacyLabels[item.task_key] || item.task_key)}</td>
      <td><span class="status status-${esc(item.status)}">${esc(item.status)}</span></td>
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

function renderDashboard(data) {
  const { member, tasks, submissions, ledger, rewards, claims } = data;
  const level = currentLevel(member.points);
  const next = nextLevel(member.points);
  const rangeStart = level.min;
  const rangeEnd = next?.min || 300;
  const progress = next
    ? Math.max(0, Math.min(100, ((member.points - rangeStart) / (rangeEnd - rangeStart)) * 100))
    : 100;
  const taskMap = new Map(tasks.map((task) => [task.key, task]));
  const availableTasks = tasks.filter((task) => member.level >= task.min_level);
  const nextTask = availableTasks
    .filter((task) => !submissions.some((item) =>
      item.task_key === task.key && ["pending", "approved"].includes(item.status) && task.lifetime_limit
    ))
    .sort((a, b) => a.points - b.points)[0];
  const nextReward = rewards.find((reward) => reward.points_required > member.points);

  shell(`
    <main class="dashboard">
      <section class="identity">
        <div>
          <p class="eyebrow">YOUR AMBASSADOR DASHBOARD</p>
          <h1>${esc(member.invite.public_name)}</h1>
          <p class="strength">${esc(member.invite.strengths)}</p>
        </div>
        <dl class="file-stats">
          <div><dt>creative class</dt><dd>${esc(member.creative_class)}</dd></div>
          <div><dt>current level</dt><dd>${member.level} / ${esc(level.label)}</dd></div>
          <div><dt>approved points</dt><dd data-points="${member.points}">0</dd></div>
          <div><dt>joined</dt><dd>${date(member.joined_at)}</dd></div>
        </dl>
      </section>

      <section class="progress-section">
        <div class="progress-copy">
          <p>${next ? `${next.min - member.points} points to unlock ${esc(next.label)}` : "highest ambassador level reached"}</p>
          <p>${member.product_eligible_at ? "FIRST FREE ITEM UNLOCKED — WE WILL CONFIRM SIZE, STOCK, AND YOUR CREATIVE BRIEF" : "REACH 75 APPROVED POINTS TO UNLOCK YOUR FIRST FREE ITEM"}</p>
        </div>
        <div class="meter"><span data-meter="${progress}"></span></div>
        <div class="level-track">
          ${levels.map((item) => `<span class="${member.points >= item.min ? "passed" : ""}">${item.min}<small>${esc(item.label)}</small></span>`).join("")}
        </div>
      </section>

      <section class="next-move">
        <div>
          <p class="eyebrow">YOUR NEXT MOVE</p>
          <h2>${nextTask ? esc(nextTask.label) : "choose any open task"}</h2>
        </div>
        <div>
          <strong>${nextTask ? `+${nextTask.points}` : "—"}</strong>
          <p>${nextReward ? `${nextReward.points_required - member.points} points until ${esc(nextReward.label)}` : "all listed rewards unlocked"}</p>
        </div>
      </section>

      <section class="rewards-section">
        <div class="section-head">
          <h2>rewards</h2>
          <p>points never disappear when you claim</p>
        </div>
        <div class="reward-grid">
          ${rewards.map((reward, index) => rewardCard(reward, claims, member.points, index)).join("")}
        </div>
      </section>

      <section class="rules">
        <p>HOW IT WORKS</p>
        <ul>
          <li>Complete a task and submit the requested proof.</li>
          <li>We review it personally. Approved work adds points to your account.</li>
          <li>Original, thoughtful work earns credit. Spam, recycled work, and deleted posts do not.</li>
          <li>Any public post connected to free products, discounts, points, or payment must clearly say “chunq ambassador,” “gifted by chunq,” or #ad where people can see it.</li>
          <li>Product and paid opportunities depend on fit, stock, location, performance, and an agreed brief.</li>
        </ul>
      </section>

      <section class="tasks-section">
        <div class="section-head">
          <h2>open tasks</h2>
          <p>${tasks.length} ways to earn points</p>
        </div>
        <div class="task-grid">
          ${tasks.map((task, index) => taskCard(task, submissions, member, index)).join("")}
        </div>
      </section>

      <section class="records">
        <div>
          <div class="section-head"><h2>proof history</h2><p>manual queue</p></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>date</th><th>task</th><th>status</th><th>proof</th></tr></thead>
              <tbody>${submissions.length ? submissions.map((item) => submissionRow(item, taskMap)).join("") : '<tr><td colspan="4">no proof submitted yet</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div>
          <div class="section-head"><h2>point ledger</h2><p>cannot be self-edited</p></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>date</th><th>reason</th><th>change</th></tr></thead>
              <tbody>${ledger.length ? ledger.map(ledgerRow).join("") : '<tr><td colspan="3">no approved points yet</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </section>

      <dialog id="proof-dialog">
        <form method="dialog" class="dialog-shell" data-proof-form>
          <button class="dialog-close" value="cancel" aria-label="Close">×</button>
          <p class="eyebrow">SUBMIT COMPLETED TASK</p>
          <h2 data-dialog-title>submit proof</h2>
          <input type="hidden" name="task_key">
          <div data-proof-upload>
          <label>
            upload screenshot or PDF
            <input name="proof_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf">
          </label>
          <p class="form-or">— or —</p>
          <label>
            public proof link
            <input name="proof_url" type="url" placeholder="https://">
          </label>
          </div>
          <label>
            note / context
            <textarea name="note" maxlength="700" rows="5" placeholder="handle, post context, anything the reviewer should know"></textarea>
          </label>
          <p class="form-help" data-form-message>The link must remain accessible while the proof is reviewed.</p>
          <button class="submit-proof" type="submit">submit for review →</button>
        </form>
      </dialog>
    </main>
  `, member);

  const dialog = root.querySelector("#proof-dialog");
  const form = root.querySelector("[data-proof-form]");
  root.querySelectorAll("[data-open-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = taskMap.get(button.dataset.openTask);
      form.reset();
      form.elements.task_key.value = task.key;
      form.dataset.proofMode = task.proof_mode;
      root.querySelector("[data-proof-upload]").hidden = task.proof_mode === "note";
      root.querySelector("[data-dialog-title]").textContent = `${task.label} / +${task.points}`;
      root.querySelector("[data-form-message]").textContent = `Required: ${task.proof_required}.`;
      dialog.showModal();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector(".submit-proof");
    const message = root.querySelector("[data-form-message]");
    submit.disabled = true;
    submit.textContent = "filing...";
    const payload = {
      member_id: member.id,
      task_key: form.elements.task_key.value,
      proof_url: form.elements.proof_url.value.trim(),
      note: form.elements.note.value.trim() || null,
    };

    const proofFile = form.elements.proof_file.files[0];
    if (form.dataset.proofMode === "note") {
      if (!payload.note) {
        message.textContent = "Write your answer in the note before submitting.";
        submit.disabled = false;
        submit.textContent = "submit for review →";
        return;
      }
      payload.proof_url = "note://submitted";
    } else if (!proofFile && !payload.proof_url) {
      message.textContent = "Attach a screenshot/file or paste a public proof link.";
      submit.disabled = false;
      submit.textContent = "submit for review →";
      return;
    }

    if (proofFile) {
      const extension = proofFile.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const objectPath = `${member.user_id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("ambassador-proof")
        .upload(objectPath, proofFile, {
          cacheControl: "3600",
          contentType: proofFile.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) {
        message.textContent = `Upload failed: ${uploadError.message}`;
        submit.disabled = false;
        submit.textContent = "submit for review →";
        return;
      }
      payload.proof_url = `storage://ambassador-proof/${objectPath}`;
    }

    const { error } = await supabase.from("ambassador_submissions").insert(payload);
    if (error) {
      message.textContent = error.message;
      submit.disabled = false;
      submit.textContent = "submit for review →";
      return;
    }
    message.textContent = "SUBMITTED. WE WILL REVIEW IT AND ADD YOUR POINTS WHEN APPROVED.";
    submit.textContent = "proof received";
    setTimeout(() => location.reload(), 700);
  });

  root.querySelectorAll("[data-claim-reward]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "requesting...";
      const { error } = await supabase.from("ambassador_reward_claims").insert({
        member_id: member.id,
        reward_key: button.dataset.claimReward,
      });
      if (error) {
        button.textContent = error.message;
        return;
      }
      button.textContent = "reward requested";
      setTimeout(() => location.reload(), 700);
    });
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
      const amount = Math.round(target * Math.min(1, (now - start) / 650));
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
    .select("id,user_id,invite_id,creative_class,points,level,product_eligible_at,joined_at")
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
      .select("id,task_key,proof_url,note,status,reviewed_at,submitted_at")
      .eq("member_id", member.id)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("ambassador_point_ledger")
      .select("id,delta,reason,created_at")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("ambassador_rewards")
      .select("key,label,description,points_required,sort_order")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("ambassador_reward_claims")
      .select("id,reward_key,status,claimed_at,fulfilled_at")
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
    shell(`
      <main class="gate">
        <p class="eyebrow">CONNECTION ERROR</p>
        <h1>we could not load<br>your dashboard.</h1>
        <p class="mono">${esc(error.message)}</p>
        <button class="primary-link as-button" onclick="location.reload()">retry connection →</button>
      </main>
    `);
  }
}

boot();

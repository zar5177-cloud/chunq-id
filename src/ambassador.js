import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dtauxotoxxrlduaagovo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0YXV4b3RveHhybGR1YWFnb3ZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNDMzOTEsImV4cCI6MjA5OTgxOTM5MX0.1EihEeXxKkWvslIxuyR66RU1TPiKGW0JPKBhCm-HVUs";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const root = document.querySelector("#ambassador-app");

const levels = [
  { level: 0, label: "starter", min: 0 },
  { level: 1, label: "active", min: 25 },
  { level: 2, label: "product eligible", min: 60 },
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
        <span>AMBASSADOR NETWORK</span>
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

function taskCard(task, submissions) {
  const history = submissions.filter((item) => item.task_key === task.key);
  const pending = history.find((item) => item.status === "pending");
  const latest = history[0];
  const limit = task.weekly_limit
    ? `${task.weekly_limit} approved / week maximum`
    : "no weekly maximum";

  return `
    <article class="task ${pending ? "is-pending" : ""}" data-task="${esc(task.key)}">
      <div class="task-head">
        <div>
          <span class="task-index">${String(task.sort_order).padStart(3, "0")}</span>
          <h3>${esc(task.label)}</h3>
        </div>
        <strong>+${task.points}</strong>
      </div>
      <p>${esc(task.description)}</p>
      <dl>
        <div><dt>proof</dt><dd>${esc(task.proof_required)}</dd></div>
        <div><dt>frequency</dt><dd>${esc(limit)}</dd></div>
        <div><dt>latest</dt><dd>${latest ? `${esc(latest.status)} / ${date(latest.submitted_at)}` : "not submitted yet"}</dd></div>
      </dl>
      ${pending
        ? '<p class="pending-note">PROOF IS WAITING FOR HUMAN REVIEW.</p>'
        : `<button class="task-open" type="button" data-open-task="${esc(task.key)}">submit proof →</button>`}
    </article>
  `;
}

function submissionRow(item, taskMap) {
  const task = taskMap.get(item.task_key);
  const proofLink = item.display_url || item.proof_url;
  return `
    <tr>
      <td>${date(item.submitted_at)}</td>
      <td>${esc(task?.label || item.task_key)}</td>
      <td><span class="status status-${esc(item.status)}">${esc(item.status)}</span></td>
      <td>${proofLink ? `<a href="${esc(proofLink)}" target="_blank" rel="noopener">view proof ↗</a>` : "uploaded"}</td>
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
  const { member, tasks, submissions, ledger } = data;
  const level = currentLevel(member.points);
  const next = nextLevel(member.points);
  const rangeStart = level.min;
  const rangeEnd = next?.min || 300;
  const progress = next
    ? Math.max(0, Math.min(100, ((member.points - rangeStart) / (rangeEnd - rangeStart)) * 100))
    : 100;
  const taskMap = new Map(tasks.map((task) => [task.key, task]));

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
          <div><dt>approved points</dt><dd>${member.points}</dd></div>
          <div><dt>joined</dt><dd>${date(member.joined_at)}</dd></div>
        </dl>
      </section>

      <section class="progress-section">
        <div class="progress-copy">
          <p>${next ? `${next.min - member.points} points to unlock ${esc(next.label)}` : "highest ambassador level reached"}</p>
          <p>${member.product_eligible_at ? "FREE PRODUCT ELIGIBILITY UNLOCKED — WE WILL CONFIRM SIZE, STOCK, AND YOUR CREATIVE BRIEF" : "REACH 60 APPROVED POINTS TO UNLOCK FREE PRODUCT ELIGIBILITY"}</p>
        </div>
        <div class="meter"><span style="width:${progress}%"></span></div>
        <div class="level-track">
          ${levels.map((item) => `<span class="${member.points >= item.min ? "passed" : ""}">${item.min}<small>${esc(item.label)}</small></span>`).join("")}
        </div>
      </section>

      <section class="reward-ladder">
        <p>WHAT YOU CAN UNLOCK</p>
        <ol>
          <li><strong>25 points</strong><span>active ambassador status</span></li>
          <li><strong>60 points</strong><span>eligibility for your first free product</span></li>
          <li><strong>150 points</strong><span>advanced opportunities and priority campaign consideration</span></li>
          <li><strong>300 points</strong><span>elite status, limited-release access, and first consideration for paid work</span></li>
        </ol>
      </section>

      <section class="rules">
        <p>HOW IT WORKS</p>
        <ul>
          <li>Complete a task and submit the requested proof.</li>
          <li>We review it personally. Approved work adds points to your account.</li>
          <li>Original, thoughtful work earns credit. Spam, recycled work, and deleted posts do not.</li>
          <li>Reward access grows with your level. Product and paid opportunities depend on fit, stock, location, and an agreed brief.</li>
        </ul>
      </section>

      <section class="tasks-section">
        <div class="section-head">
          <h2>open tasks</h2>
          <p>${tasks.length} ways to earn points</p>
        </div>
        <div class="task-grid">
          ${tasks.map((task) => taskCard(task, submissions)).join("")}
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
          <label>
            upload screenshot or PDF
            <input name="proof_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf">
          </label>
          <p class="form-or">— or —</p>
          <label>
            public proof link
            <input name="proof_url" type="url" placeholder="https://">
          </label>
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
    if (!proofFile && !payload.proof_url) {
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
}

async function loadDashboard(user) {
  const { data: member, error: memberError } = await supabase
    .from("ambassador_members")
    .select("id,user_id,invite_id,creative_class,points,level,product_eligible_at,joined_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member) return renderUnlinked(user.email);

  const [inviteResult, taskResult, submissionResult, ledgerResult] = await Promise.all([
    supabase
      .from("ambassador_invites")
      .select("public_name,invite_code,strengths,starting_note")
      .eq("id", member.invite_id)
      .single(),
    supabase
      .from("ambassador_tasks")
      .select("key,label,description,points,proof_required,weekly_limit,sort_order")
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
  ]);

  const failure = [inviteResult, taskResult, submissionResult, ledgerResult].find((result) => result.error);
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

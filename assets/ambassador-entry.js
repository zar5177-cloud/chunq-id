(() => {
  const LINK_ID = "chunq-ambassador-entry";
  const HELP_ID = "chunq-ambassador-auth-help";
  const replacements = new Map([
    ["access", "sign in"],
    ["register", "create account"],
    ["enter", "sign in"],
    ["resend verification", "send confirmation email again"],
    ["access the world.", "sign in to your chunq account."],
    ["error: email rate limit exceeded", "Too many confirmation emails were requested. Wait one minute, then try once."],
    ["error: invalid login credentials", "That email and password do not match. Check both and try again."],
    ["error: email not confirmed", "Confirm your email first, then come back and sign in."],
    ["error: user already registered", "An account already exists for that email. Choose sign in instead."],
    ["error: password should be at least 6 characters", "Use a password with at least 6 characters."],
  ]);

  function replaceJargon() {
    if (location.pathname !== "/auth") return;
    document.querySelectorAll("button, p, span, div").forEach((node) => {
      if (node.children.length) return;
      const text = node.textContent.trim().toLowerCase();
      if (!replacements.has(text)) return;
      node.textContent = replacements.get(text);
    });
  }

  function addAuthHelp() {
    if (location.pathname !== "/auth" || document.getElementById(HELP_ID)) return;
    const panel = document.createElement("aside");
    panel.id = HELP_ID;
    panel.setAttribute("aria-label", "Ambassador sign-in help");
    panel.innerHTML = `
      <strong>accepted ambassador?</strong>
      <span>Use the exact email that received your acceptance. After signing in, open your ambassador tasks and rewards.</span>
    `;
    Object.assign(panel.style, {
      position: "fixed",
      left: "12px",
      bottom: window.innerWidth < 700 ? "58px" : "12px",
      zIndex: "2147482999",
      width: "min(350px, calc(100vw - 24px))",
      padding: "10px 12px",
      border: "1px solid #111",
      background: "#efeadf",
      color: "#111",
      font: "10px/1.4 'Courier New', monospace",
      boxShadow: "3px 3px 0 #111",
      display: "grid",
      gap: "4px",
    });
    document.body.appendChild(panel);
  }

  function addDashboardLink() {
    if (document.getElementById(LINK_ID)) return;
    const link = document.createElement("a");
    link.id = LINK_ID;
    link.href = "/ambassador.html";
    link.textContent = "AMBASSADOR TASKS + REWARDS →";
    link.setAttribute("aria-label", "Open ambassador tasks and rewards");
    Object.assign(link.style, {
      position: "fixed",
      right: "12px",
      bottom: "12px",
      zIndex: "2147483000",
      padding: "10px 12px",
      border: "1px solid #111",
      background: "#e8ff00",
      color: "#111",
      font: "10px/1.1 'Courier New', monospace",
      textDecoration: "none",
      boxShadow: "3px 3px 0 #111",
    });
    document.body.appendChild(link);
  }

  function update() {
    addDashboardLink();
    if (location.pathname === "/auth") {
      addAuthHelp();
      replaceJargon();
    } else {
      document.getElementById(HELP_ID)?.remove();
    }
  }

  update();
  new MutationObserver(update).observe(document.documentElement, { childList: true, subtree: true });
})();

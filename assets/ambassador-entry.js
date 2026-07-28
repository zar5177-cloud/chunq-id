(() => {
  const LINK_ID = "chunq-ambassador-entry";
  const add = () => {
    if (document.getElementById(LINK_ID)) return;
    const link = document.createElement("a");
    link.id = LINK_ID;
    link.href = "/ambassador.html";
    link.textContent = "AMBASSADOR FILE";
    link.setAttribute("aria-label", "Open ambassador file");
    Object.assign(link.style, {
      position: "fixed",
      right: "12px",
      bottom: "12px",
      zIndex: "2147483000",
      padding: "9px 11px",
      border: "1px solid #111",
      background: "#e8ff00",
      color: "#111",
      font: "10px/1.1 'Courier New', monospace",
      textDecoration: "none",
      boxShadow: "3px 3px 0 #111",
    });
    document.body.appendChild(link);
  };
  add();
  new MutationObserver(add).observe(document.documentElement, { childList: true, subtree: true });
})();

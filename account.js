(() => {
  const C = window.YUV || {}, $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s), TK = "yuv_tok";
  const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const post = b => fetch(C.API_URL, { method: "POST", body: JSON.stringify(b) }).then(r => r.json());
  const box = h => { $("#box").innerHTML = h; };
  const msg = m => { const e = $("#err"); if (e) e.textContent = m || ""; };
  const fix = x => !x.message || x.message === "Failed to fetch" ? "Could not connect. Please check your internet or ensure Google Apps Script Web App is deployed with 'Who has access: Anyone'." : x.message;
  let email = "", timer;

  // Sidebar Controls
  const sidebar = $("#sidebar");
  const overlay = $("#sidebar-overlay");
  const menuBtn = $("#menu-btn");
  const closeBtn = $("#sidebar-close");

  function openSidebar() {
    if (sidebar) sidebar.classList.add("active");
    if (overlay) overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove("active");
    if (overlay) overlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  if (menuBtn) menuBtn.onclick = openSidebar;
  if (closeBtn) closeBtn.onclick = closeSidebar;
  if (overlay) overlay.onclick = closeSidebar;

  document.addEventListener("click", e => {
    if (e.target.closest("#sidebar-close") || e.target.closest(".sidebar-close")) {
      closeSidebar();
    }
  });

  $$(".sidebar-link").forEach(link => link.addEventListener("click", closeSidebar));

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeSidebar();
  });

  function login() {
    clearInterval(timer);
    $("#sub").textContent = "Enter the email address you booked with. We will send a 6-digit login code. No password needed.";
    box(`<form id="f"><label>Email address<input id="em" type="email" autocomplete="email" value="${esc(email)}" required></label>
      <p class="err" id="err" role="alert"></p><button class="btn" style="width:100%">Send login code</button></form>`);
    $("#f").onsubmit = async e => {
      e.preventDefault();
      email = $("#em").value.trim().toLowerCase();
      const b = $("#f .btn");
      b.disabled = true;
      b.textContent = "Sending code…";
      try {
        const j = await post({ action: "sendCode", email });
        if (!j.ok) throw new Error(j.error);
        code();
      } catch (x) {
        msg(fix(x));
        b.disabled = false;
        b.textContent = "Send login code";
      }
    };
  }

  function code() {
    $("#sub").textContent = `If ${email} has a registered booking, we've emailed a 6-digit code. Please check your spam folder too.`;
    box(`<form id="f"><label>6-digit code<input id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
      <p class="err" id="err" role="alert"></p><button class="btn" style="width:100%">View my booking</button>
      <p style="margin-top:14px;display:flex;gap:12px;flex-wrap:wrap"><button type="button" class="link" id="rs"></button><button type="button" class="link" id="ch">Use a different email</button></p></form>`);
    $("#cd").focus();
    $("#ch").onclick = login;
    $("#rs").onclick = resend;
    cooldown();
    $("#f").onsubmit = async e => {
      e.preventDefault();
      const b = $("#f .btn");
      b.disabled = true;
      b.textContent = "Checking code…";
      try {
        const j = await post({ action: "verifyCode", email, code: $("#cd").value.trim() });
        if (!j.ok) throw new Error(j.error);
        localStorage.setItem(TK, j.token);
        show();
      } catch (x) {
        msg(fix(x));
        b.disabled = false;
        b.textContent = "View my booking";
      }
    };
  }

  function cooldown() {
    let s = 60;
    const b = $("#rs");
    clearInterval(timer);
    const t = () => {
      if (!b.isConnected) return clearInterval(timer);
      b.disabled = s > 0;
      b.textContent = s > 0 ? `Resend code in ${s}s` : "Resend code";
      if (--s < 0) clearInterval(timer);
    };
    t();
    timer = setInterval(t, 1000);
  }

  async function resend() {
    msg();
    try {
      const j = await post({ action: "sendCode", email });
      if (!j.ok) throw new Error(j.error);
      cooldown();
    } catch (x) {
      msg(fix(x));
    }
  }

  async function show() {
    const t = localStorage.getItem(TK);
    if (!t) return login();
    $("#sub").textContent = "";
    box("<p>Loading your booking details…</p>");
    try {
      const j = await post({ action: "mine", token: t });
      if (!j.ok) {
        localStorage.removeItem(TK);
        return login();
      }
      view(j.list);
    } catch (x) {
      box(`<p class="err">Could not load your booking. Please check your internet connection and refresh.</p>`);
    }
  }

  const card = b => {
    const label = b.status === "Verified" ? "Verified ✓" : b.status === "Pending" ? "Waiting for verification" : b.status;
    return `<article class="bk"><h3>${esc(b.id)} <span class="pill ${b.status === "Verified" ? "ok" : ""}">${esc(label)}</span></h3>
      <dl>
        <dt>Seats</dt><dd>${esc(b.n)} People</dd>
        <dt>Total Amount</dt><dd>₹${Number(b.total).toLocaleString("en-IN")}</dd>
        <dt>Primary Pilgrim</dt><dd>${esc(b.name)}, ${esc(b.age)} yrs</dd>
        <dt>WhatsApp Mobile</dt><dd>${esc(b.mobile)}</dd>
        <dt>Address</dt><dd>${esc(b.addr)}</dd>
        <dt>Contact Info</dt><dd>${esc(b.contact)}</dd>
        <dt>Transaction ID</dt><dd>${esc(b.txn)}</dd>
      </dl>
      ${b.people.length > 1 ? `<h4>Group Members</h4><ul>${b.people.map(p => `<li>${esc(p.name)}, ${esc(p.age)} yrs (${esc(p.role)})</li>`).join("")}</ul>` : ""}
      ${b.q ? `<h4>Your Query</h4><p>${esc(b.q)}</p>` : ""}
      ${b.replies.map(r => `<div class="rep"><b>Reply from Team YUVATMA</b><p>${esc(r.text)}</p></div>`).join("")}</article>`;
  };

  function view(list) {
    $("#sub").textContent = list.length ? "Signed in as " + list[0].email : "";
    const nameEl = $("#sidebar-user-name");
    const statusEl = $("#sidebar-user-status");
    if (nameEl && list.length) nameEl.textContent = list[0].name;
    if (statusEl && list.length) statusEl.textContent = list[0].email;

    box((list.length ? list.map(card).join("") : "<p>We couldn't find a booking for this email address.</p>") +
      `<button class="btn ghost" id="lo" style="width:100%;margin-top:20px;">Log out</button>`);
    $("#lo").onclick = async () => {
      const t = localStorage.getItem(TK);
      localStorage.removeItem(TK);
      email = "";
      try { await post({ action: "logout", token: t }); } catch (e) {}
      login();
    };
  }

  // Contact links
  const waGroup = C.WHATSAPP_GROUP || C.WHATSAPP;
  if (waGroup) {
    const waUrl = String(waGroup).startsWith("http") ? waGroup : "https://wa.me/" + waGroup;
    const waFooter = $("#wa");
    if (waFooter) waFooter.href = waUrl;
    const sbWa = $("#sb-wa-link");
    if (sbWa) sbWa.href = waUrl;
  }
  if (C.PHONE) {
    const sbTel = $("#sb-tel-link");
    if (sbTel) sbTel.href = "tel:" + C.PHONE.replace(/\s+/g, "");
  }
  if (C.EMAIL) {
    const sbMail = $("#sb-mail-link");
    if (sbMail) sbMail.href = "mailto:" + C.EMAIL;
  }

  show();
})();

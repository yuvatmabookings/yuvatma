(() => {
  const C = window.YUV || {}, $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s), KEY = "yuv26";
  let S = { i: 0, n: 0, p: {}, m: [{}, {}, {}], pay: {}, q: "" }, file = null;

  try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}

  // Support both BOOKINGS_OPEN and BOOKINGS_OPN, and handle true/TRUE/"true"/1
  const isBookingsOpen = () => {
    const v = C.BOOKINGS_OPEN !== undefined ? C.BOOKINGS_OPEN : C.BOOKINGS_OPN;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v > 0;
    if (typeof v === "string") return v.trim().toLowerCase() === "true" || v.trim() === "1";
    return false;
  };

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");
  const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const get = k => k.split(".").reduce((o, x) => o && o[x], S) ?? "";
  const set = (k, v) => { const a = k.split("."), l = a.pop(); a.reduce((o, x) => o[x], S)[l] = v; };
  const total = () => (S.n || 1) * (C.PRICE || 1785);
  const steps = () => S.n > 1 ? ["g", "y", "m", "p"] : ["g", "y", "p"];
  const NAMES = { g: "Group", y: "You", m: "Members", p: "Payment" };
  const NUM = 'inputmode="numeric" maxlength="10"';

  const fld = (k, label, type = "text", extra = "", hint = "") =>
    `<label>${label}<input data-k="${k}" type="${type}" value="${esc(get(k))}" ${extra}></label>${hint ? `<p class="hint">${hint}</p>` : ""}`;

  const contact = () => {
    const a = +S.p.age;
    if (!a) return `<p class="hint">Enter your age and we will show which contact we need.</p>`;
    return a < 25
      ? fld("p.parent", "Parent's / guardian's mobile number", "tel", NUM)
      : fld("p.ecName", "Emergency contact person's name") +
        fld("p.ecNum", "Emergency contact's mobile number", "tel", NUM, "A family member or friend, not another number of yours.");
  };

  // Step Views for Live Booking
  const V = {
    // Step 1: Clean group size selection
    g: () => `<h3>How many people are coming?</h3>
      <p class="hint">Select group size to continue (one booking covers up to 4 members, age 18–35).</p>
      <div class="sizes">
        ${[1, 2, 3, 4].map(n => `
          <button type="button" class="size ${S.n == n ? "on" : ""}" data-n="${n}">
            <span class="size-badge">${n == 1 ? "👤 Solo" : n == 2 ? "👥 Duo" : n == 3 ? "👨‍👩‍👦 Trio" : "👨‍👩‍👧‍👦 Squad"}</span>
            <b>${n == 1 ? "Just me" : n + " people"}</b>
            <span class="size-sub">${n == 1 ? "1 Seat" : n + " Seats"}</span>
          </button>
        `).join("")}
      </div>`,

    // Step 2: Personal details
    y: () => `<h3>Your details</h3>
      ${fld("p.name", "Full name", "text", 'autocomplete="name"')}
      ${fld("p.age", "Age (Must be between 18 and 35)", "number", `min="${C.AGE_MIN || 18}" max="${C.AGE_MAX || 35}" inputmode="numeric"`)}
      ${fld("p.mobile", "Mobile number (linked with WhatsApp)", "tel", NUM)}
      ${fld("p.email", "Email address", "email", 'autocomplete="email"')}
      <label>Home address<textarea data-k="p.addr" rows="2">${esc(get("p.addr"))}</textarea></label>
      ${fld("p.gotra", "Gotra")}
      <div id="ct">${contact()}</div>`,

    // Step 3: Additional members
    m: () => `<h3>Who's coming with you?</h3>${[...Array(S.n - 1)].map((_, i) =>
      `<fieldset><legend>Person ${i + 2}</legend>${fld(`m.${i}.name`, "Full name")}${fld(`m.${i}.age`, "Age (18–35)", "number", `min="${C.AGE_MIN || 18}" max="${C.AGE_MAX || 35}" inputmode="numeric"`)}${fld(`m.${i}.mobile`, "Mobile number (optional)", "tel", NUM)}</fieldset>`).join("")}`,

    // Step 4: Payment with "Show QR" button beside "Open UPI app"
    p: () => {
      const up = `upi://pay?pa=${C.UPI_ID}&pn=${encodeURIComponent(C.UPI_NAME || "YUVATMA")}&am=${total()}&cu=INR`;
      return `<h3>Pay ${inr(total())}</h3>
      <div class="pay">
        <div class="pay-info-row">
          <span class="upi-tag">UPI ID: <b>${esc(C.UPI_ID)}</b></span>
          <span class="upi-tag">Payee: <b>${esc(C.UPI_NAME || "YUVATMA")}</b></span>
        </div>
        <div class="pay-actions">
          <a class="btn ghost" href="${up}" id="open-upi-link">Open UPI app</a>
          <button type="button" class="btn" id="show-qr-trigger">📷 Show QR</button>
        </div>
        <p class="hint">Booking on a laptop? Click <b>Show QR</b> to scan and pay easily from your phone!</p>
      </div>
      ${fld("pay.txn", "Transaction ID / UTR (from your payment app)")}
      <label>Payment screenshot<input type="file" id="shot" accept="image/*"></label>
      <p class="hint" id="shotn"></p>
      <label>Anything you'd like to ask us? (optional)<textarea data-k="q" rows="2">${esc(S.q)}</textarea></label>`;
    }
  };

  const err = m => { const el = $("#err"); if (el) el.textContent = m || ""; };

  // ---------- Dynamic UI Controller for Booking Open vs Prebooking ----------
  function updateBookingStatus() {
    const open = isBookingsOpen();

    // 1. Top Announcement Bar
    const topBar = $("#top-announcement");
    if (topBar) {
      if (open) {
        topBar.innerHTML = `<span>🎉 <b>Bookings are now LIVE!</b> Limited to 35 Volvo Bus Seats.</span> <a href="#book">Book Your Spot &rarr;</a>`;
      } else {
        topBar.innerHTML = `<span>📢 <b>YUVATMA GoSeva - 3.0</b> • Bookings Open ${esc(C.BOOKING_OPEN_DATE_STR || "7th Nov")} • Limited to 35 Seats</span> <button type="button" id="bar-interested-btn">✋ Interested</button>`;
        const barIntBtn = $("#bar-interested-btn");
        if (barIntBtn) barIntBtn.onclick = openInterestedModal;
      }
    }

    // 2. Top Nav Action Button
    const topContainer = $("#top-action-container");
    if (topContainer) {
      if (open) {
        topContainer.innerHTML = `<a class="btn sm" href="#book" id="top-book-btn">Book now</a>`;
      } else {
        topContainer.innerHTML = `<button type="button" class="btn sm" id="top-interested-btn">✋ Interested</button>`;
        const topIntBtn = $("#top-interested-btn");
        if (topIntBtn) topIntBtn.onclick = openInterestedModal;
      }
    }

    // 3. Hero Launch Badge
    const heroBadge = $(".launch-badge");
    if (heroBadge) {
      heroBadge.textContent = open
        ? "🎉 Bookings are LIVE • Age Limit: 18–35 yrs"
        : `🗓️ Bookings Open ${esc(C.BOOKING_OPEN_DATE_STR || "7th Nov")} • Age Limit: 18–35 yrs`;
    }

    // 4. Hero Action Buttons
    const heroContainer = $("#hero-actions-container");
    if (heroContainer) {
      if (open) {
        heroContainer.innerHTML = `
          <a class="btn" href="#book" id="hero-book-btn">Book your spot</a>
          <button type="button" class="btn ghost" id="hero-interested-btn" style="color:#fff;box-shadow:inset 0 0 0 2px var(--gold)">✋ Join WhatsApp Group</button>
          <a class="btn ghost" href="#schedule" style="color:#fff;box-shadow:inset 0 0 0 2px rgba(255,255,255,0.4)">View Schedule</a>
        `;
      } else {
        heroContainer.innerHTML = `
          <button type="button" class="btn" id="hero-interested-btn">✋ Interested</button>
          <a class="btn ghost" href="#schedule" style="color:#fff;box-shadow:inset 0 0 0 2px var(--gold)">View 2-Day Schedule</a>
        `;
      }
      const heroIntBtn = $("#hero-interested-btn");
      if (heroIntBtn) heroIntBtn.onclick = openInterestedModal;
    }

    // 5. Hero Contribution Fact
    const factPrice = $("#hero-fact-price");
    if (factPrice) {
      factPrice.innerHTML = open
        ? `<b>Contribution</b> ₹${(C.PRICE || 1785).toLocaleString("en-IN")} per person`
        : `<b>Contribution</b> Disclosed on 7th Nov`;
    }

    // 6. Booking Section Controls
    const cardEl = $("#card");
    const bannerEl = $("#prebooking-banner");
    const bookTitle = $("#book-title");

    if (open) {
      if (cardEl) cardEl.style.display = "block";
      if (bannerEl) bannerEl.style.display = "none";
      if (bookTitle) bookTitle.textContent = "Book your spot";
    } else {
      if (cardEl) cardEl.style.display = "none";
      if (bannerEl) bannerEl.style.display = "flex";
      if (bookTitle) bookTitle.textContent = "Registration details";
    }
  }

  function render() {
    updateBookingStatus();

    if (!isBookingsOpen()) return;

    const st = steps();
    if (!S.n || S.i >= st.length) S.i = 0;
    const cur = st[S.i];
    $("#steps").innerHTML = st.map((s, i) => `<li class="${i == S.i ? "on" : i < S.i ? "done" : ""}">${NAMES[s]}</li>`).join("");
    $("#stage").innerHTML = V[cur]();
    $("#total").textContent = S.n && cur != "g" ? `Total Contribution: ${inr(total())} (${S.n} ${S.n > 1 ? "people" : "person"})` : "";
    $("#back").hidden = S.i == 0;
    $("#next").hidden = cur == "g";
    $("#next").textContent = cur == "p" ? "Confirm booking" : "Continue";

    const qrTrigger = $("#show-qr-trigger");
    if (qrTrigger) {
      qrTrigger.onclick = openQrModal;
    }

    updateProfileInfo();
    err();
    save();
  }

  const P = v => /^[6-9]\d{9}$/.test(v || ""), T = v => (v || "").trim().length > 1;
  const A = v => +v >= (C.AGE_MIN || 18) && +v <= (C.AGE_MAX || 35);

  function check(c) {
    const p = S.p;
    if (c == "y") {
      if (!T(p.name)) return "Enter your full name.";
      if (!A(p.age)) return `Age must be between ${C.AGE_MIN || 18} and ${C.AGE_MAX || 35} years.`;
      if (!P(p.mobile)) return "Enter a valid 10-digit mobile number.";
      if (!/^\S+@\S+\.\S+$/.test(p.email || "")) return "Enter a valid email address.";
      if (!T(p.addr)) return "Enter your home address.";
      if (!T(p.gotra)) return "Enter your Gotra.";
      if (+p.age < 25) {
        if (!P(p.parent)) return "Enter your parent's or guardian's 10-digit mobile number.";
      } else {
        if (!T(p.ecName)) return "Enter your emergency contact's name.";
        if (!P(p.ecNum)) return "Enter your emergency contact's 10-digit mobile number.";
        if (p.ecNum == p.mobile) return "Emergency contact must be someone other than you.";
      }
    }
    if (c == "m") {
      for (let i = 0; i < S.n - 1; i++) {
        const m = S.m[i];
        if (!T(m.name) || !A(m.age) || (m.mobile && !P(m.mobile))) {
          return `Complete person ${i + 2}: full name, age (${C.AGE_MIN || 18}–${C.AGE_MAX || 35}), and valid mobile.`;
        }
      }
    }
    if (c == "p") {
      if (!T(S.pay.txn)) return "Enter the transaction ID / UTR from your payment app.";
      if (!file) return "Attach your payment screenshot.";
    }
    return "";
  }

  const shrink = f => new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(f);
    img.onload = () => {
      const r = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = img.width * r; c.height = img.height * r;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u); res(c.toDataURL("image/jpeg", 0.8).split(",")[1]);
    };
    img.onerror = () => rej(new Error("Could not read that image. Please try a different screenshot."));
    img.src = u;
  });

  // ---------- Live Seat Counter ----------
  async function fetchSeats() {
    const totalCap = C.TOTAL_SEATS || 35;
    const seatsLeftEl = $("#seats-left-num");
    const seatsBookedEl = $("#seats-booked-num");
    const progressBar = $("#seat-progress-bar");
    const noteEl = $("#seat-status-note");

    if (seatsLeftEl) seatsLeftEl.textContent = totalCap;
    if (seatsBookedEl) seatsBookedEl.textContent = "0";

    if (!C.API_URL || C.API_URL.includes("PASTE_YOUR_APPS_SCRIPT")) return;

    try {
      let res;
      try {
        res = await fetch(`${C.API_URL}?action=seats`);
      } catch (e) {
        res = await fetch(C.API_URL, {
          method: "POST",
          body: JSON.stringify({ action: "seats" })
        });
      }
      const data = await res.json();
      if (data && data.ok) {
        const booked = Number(data.bookedSeats || 0);
        const left = typeof data.seatsLeft !== "undefined" ? Number(data.seatsLeft) : Math.max(0, totalCap - booked);
        const pct = Math.min(100, Math.round((booked / totalCap) * 100));

        if (seatsLeftEl) seatsLeftEl.textContent = left;
        if (seatsBookedEl) seatsBookedEl.textContent = booked;
        if (progressBar) {
          progressBar.style.width = pct + "%";
          if (left <= 5) progressBar.style.background = "#b00020";
        }
        if (noteEl) {
          if (left <= 0) {
            noteEl.innerHTML = "⛔ <b>Bus is full!</b> Join our WhatsApp group for the waiting list.";
            noteEl.style.color = "#b00020";
          } else if (left <= 5) {
            noteEl.innerHTML = `⚡ <b>Hurry!</b> Only ${left} seats remaining before closure.`;
            noteEl.style.color = "#b00020";
          } else {
            noteEl.innerHTML = isBookingsOpen()
              ? `🟢 <b>${left} seats available!</b> Book your spot now.`
              : `🟢 <b>${left} seats will open on ${esc(C.BOOKING_OPEN_DATE_STR || "7th Nov")}!</b>`;
          }
        }
      }
    } catch (err) {
      console.warn("Seat count sync notice:", err.message);
    }
  }

  // ---------- Sidebar Drawer Controller (Always visible and closeable) ----------
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

  // Delegated close listener ensures close button ALWAYS works
  document.addEventListener("click", e => {
    if (e.target.closest("#sidebar-close") || e.target.closest(".sidebar-close")) {
      closeSidebar();
    }
  });

  $$(".sidebar-link").forEach(link => {
    link.addEventListener("click", closeSidebar);
  });

  // ---------- Profile Information in Sidebar ----------
  function updateProfileInfo() {
    const nameEl = $("#sidebar-user-name");
    const statusEl = $("#sidebar-user-status");
    if (!nameEl || !statusEl) return;

    if (S.p && S.p.name) {
      nameEl.textContent = S.p.name;
      statusEl.textContent = S.p.email || "GoSeva - 3.0";
    } else {
      const tok = localStorage.getItem("yuv_tok");
      if (tok) {
        nameEl.textContent = "Registered Pilgrim";
        statusEl.textContent = "Signed in • Click 'My Bookings'";
      } else {
        nameEl.textContent = "Welcome, Pilgrim";
        statusEl.textContent = "GoSeva - 3.0";
      }
    }
  }

  // ---------- QR Code Modal Controller ----------
  const qrModal = $("#qr-modal");
  const qrImage = $("#qr-image");
  const qrAmountText = $("#qr-amount-text");
  const copyUpiBtn = $("#copy-upi-btn");
  const qrCloseBtn = $("#qr-modal-close");
  const qrDoneBtn = $("#qr-done-btn");

  function openQrModal() {
    const amt = total();
    const upiUrl = `upi://pay?pa=${C.UPI_ID}&pn=${encodeURIComponent(C.UPI_NAME || "YUVATMA")}&am=${amt}&cu=INR`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(upiUrl)}`;

    if (qrAmountText) qrAmountText.textContent = inr(amt);
    if (qrImage) {
      qrImage.src = qrSrc;
      qrImage.alt = `UPI QR for ₹${amt}`;
    }
    const modalUpi = $("#modal-upi-id");
    if (modalUpi) modalUpi.textContent = C.UPI_ID;

    if (qrModal) qrModal.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeQrModal() {
    if (qrModal) qrModal.classList.remove("active");
    document.body.style.overflow = "";
  }

  if (qrCloseBtn) qrCloseBtn.onclick = closeQrModal;
  if (qrDoneBtn) {
    qrDoneBtn.onclick = () => {
      closeQrModal();
      const txnInput = document.querySelector('input[data-k="pay.txn"]');
      if (txnInput) txnInput.focus();
    };
  }
  if (qrModal) {
    qrModal.onclick = e => {
      if (e.target === qrModal) closeQrModal();
    };
  }

  if (copyUpiBtn) {
    copyUpiBtn.onclick = () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(C.UPI_ID).then(() => {
          copyUpiBtn.innerHTML = `✓ Copied <b>${esc(C.UPI_ID)}</b>!`;
          setTimeout(() => {
            copyUpiBtn.innerHTML = `📋 Copy UPI ID: <b>${esc(C.UPI_ID)}</b>`;
          }, 2500);
        });
      }
    };
  }

  // ---------- Interested Modal & Form Controller ----------
  const interestedModal = $("#interested-modal");
  const intCloseBtn = $("#int-modal-close");
  const intForm = $("#interested-form");
  const intErr = $("#int-err");
  const intSubmitBtn = $("#int-submit-btn");

  const WHATSAPP_GROUP_URL = C.WHATSAPP_GROUP || C.WHATSAPP || "https://chat.whatsapp.com/E0sBKM5HKgl7DMPtVPsWwL?s=cl&p=a&iam=2";

  function openInterestedModal() {
    if (interestedModal) {
      interestedModal.classList.add("active");
      document.body.style.overflow = "hidden";
      const nameInput = $("#int-name");
      if (nameInput) nameInput.focus();
    }
  }

  function closeInterestedModal() {
    if (interestedModal) {
      interestedModal.classList.remove("active");
      document.body.style.overflow = "";
      if (intErr) intErr.textContent = "";
    }
  }

  if (intCloseBtn) intCloseBtn.onclick = closeInterestedModal;
  if (interestedModal) {
    interestedModal.onclick = e => {
      if (e.target === interestedModal) closeInterestedModal();
    };
  }

  // Prebooking interested trigger
  const prebookIntBtn = $("#prebook-interested-btn");
  if (prebookIntBtn) prebookIntBtn.onclick = openInterestedModal;

  const sbIntLink = $("#sb-interested-link");
  if (sbIntLink) {
    sbIntLink.onclick = () => {
      closeSidebar();
      openInterestedModal();
    };
  }

  // Handle Interested Form Submit -> ONLY redirects if Name, Age, Ph no, Gotra are filled!
  if (intForm) {
    intForm.onsubmit = async e => {
      e.preventDefault();
      if (intErr) intErr.textContent = "";

      const name = ($("#int-name").value || "").trim();
      const ageStr = ($("#int-age").value || "").trim();
      const age = Number(ageStr);
      const phone = ($("#int-phone").value || "").replace(/\D/g, "");
      const gotra = ($("#int-gotra").value || "").trim();

      // Strict validation for required fields
      if (!name || name.length < 2) {
        intErr.textContent = "Please enter your full name.";
        $("#int-name").focus();
        return;
      }
      if (!ageStr || isNaN(age) || age < (C.AGE_MIN || 18) || age > (C.AGE_MAX || 35)) {
        intErr.textContent = `Age must be between ${C.AGE_MIN || 18} and ${C.AGE_MAX || 35} years.`;
        $("#int-age").focus();
        return;
      }
      if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
        intErr.textContent = "Please enter a valid 10-digit mobile number.";
        $("#int-phone").focus();
        return;
      }
      if (!gotra || gotra.length < 2) {
        intErr.textContent = "Please enter your Gotra.";
        $("#int-gotra").focus();
        return;
      }

      // All fields valid!
      intSubmitBtn.disabled = true;
      intSubmitBtn.textContent = "Joining WhatsApp Group…";

      // Save locally
      try {
        localStorage.setItem("yuv_interested", JSON.stringify({ name, age, phone, gotra, time: Date.now() }));
      } catch (err) {}

      // Send to Google Apps Script backend to record count and details
      if (C.API_URL && !C.API_URL.includes("PASTE_YOUR_APPS_SCRIPT")) {
        try {
          fetch(C.API_URL, {
            method: "POST",
            body: JSON.stringify({
              action: "interested",
              name: name,
              age: age,
              phone: phone,
              gotra: gotra
            })
          }).catch(err => console.warn("Interested log note:", err));
        } catch (err) {}
      }

      // Redirect to WhatsApp Group URL
      setTimeout(() => {
        window.location.href = WHATSAPP_GROUP_URL;
      }, 350);
    };
  }

  // Keyboard shortcut: Escape closes modals & drawer
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeSidebar();
      closeQrModal();
      closeInterestedModal();
    }
  });

  // Event Listeners for booking inputs
  document.addEventListener("input", e => {
    const k = e.target.dataset.k;
    if (!k) return;
    if (e.target.type == "tel") e.target.value = e.target.value.replace(/\D/g, "");
    set(k, e.target.value);
    save();
    if (k == "p.age") $("#ct").innerHTML = contact();
  });

  document.addEventListener("change", e => {
    if (e.target.id != "shot") return;
    file = e.target.files[0] || null;
    $("#shotn").textContent = file ? "Attached: " + file.name : "";
  });

  document.addEventListener("click", e => {
    const b = e.target.closest(".size");
    if (!b) return;

    if (!isBookingsOpen()) {
      openInterestedModal();
      return;
    }

    S.n = +b.dataset.n;
    S.i = 1;
    render();
    jump();
  });

  const backBtn = $("#back");
  if (backBtn) {
    backBtn.onclick = () => {
      S.i--;
      render();
      jump();
    };
  }

  const jump = () => {
    const bookEl = $("#book");
    if (bookEl) bookEl.scrollIntoView({ behavior: "smooth" });
  };

  const formEl = $("#f");
  if (formEl) {
    formEl.addEventListener("submit", async e => {
      e.preventDefault();
      const cur = steps()[S.i];
      if (cur == "g") return;

      const m = check(cur);
      if (m) return err(m);

      if (cur != "p") {
        S.i++;
        render();
        return jump();
      }

      if (!isBookingsOpen()) {
        return openInterestedModal();
      }

      const btn = $("#next");
      btn.disabled = true;
      btn.textContent = "Sending…";
      err();

      try {
        const body = {
          action: "book",
          hp: $("#hp").value,
          n: S.n,
          p: S.p,
          members: S.m.slice(0, S.n - 1),
          txn: S.pay.txn.trim(),
          q: S.q,
          shot: await shrink(file)
        };

        const j = await (await fetch(C.API_URL, {
          method: "POST",
          body: JSON.stringify(body)
        })).json();

        if (!j.ok) throw new Error(j.error);
        done(j.id);
        fetchSeats();
      } catch (x) {
        err(x.message && x.message != "Failed to fetch"
          ? x.message
          : "Could not send booking. Check connection or Apps Script permissions.");
        btn.disabled = false;
        btn.textContent = "Confirm booking";
      }
    });
  }

  function done(id) {
    const mail = esc(S.p.email);
    try { localStorage.removeItem(KEY); } catch (e) {}
    $("#card").innerHTML = `
      <div class="ok">
        <span style="font-size:3rem">🎉</span>
        <h3>Booking Received!</h3>
        <p class="bid">${esc(id)}</p>
        <p>A confirmation email has been dispatched to <b>${mail}</b>.</p>
        <p>Please keep this Booking ID for reference. Our team will verify your payment and send Volvo bus boarding coordinates on WhatsApp.</p>
        <div style="margin-top:20px;">
          <a class="btn" href="my-booking.html">View in 'My Booking'</a>
        </div>
      </div>`;
    jump();
  }

  // Populate dynamic contact links
  const waGroup = C.WHATSAPP_GROUP || C.WHATSAPP;
  if (waGroup) {
    const waFooter = $("#wa");
    if (waFooter) waFooter.href = waGroup;
    const sbWa = $("#sb-wa-link");
    if (sbWa) sbWa.href = waGroup;
  }
  if (C.PHONE) {
    const sbTel = $("#sb-tel-link");
    if (sbTel) sbTel.href = "tel:" + C.PHONE.replace(/\s+/g, "");
  }
  if (C.EMAIL) {
    const sbMail = $("#sb-mail-link");
    if (sbMail) sbMail.href = "mailto:" + C.EMAIL;
  }

  // Initialize
  render();
  fetchSeats();
})();

(() => {
  const C = window.YUV || {}, $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s), KEY = "yuv26";
  let S = { i: 0, n: 0, p: {}, m: [{}, {}, {}], pay: {}, q: "" };
  const uploadedFiles = {};

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
  const total = () => (S.n || 1) * (C.PRICE || 1750);
  const steps = () => S.n > 1 ? ["g", "y", "m", "v"] : ["g", "y", "v"];
  const NAMES = { g: "Group", y: "You", m: "Members", v: "ID Verification" };
  const NUM = 'inputmode="numeric" maxlength="10"';

  const fld = (k, label, type = "text", extra = "", hint = "") =>
    `<label>${label} <span style="color:var(--red)">*</span><input data-k="${k}" type="${type}" value="${esc(get(k))}" ${extra} required></label>${hint ? `<p class="hint">${hint}</p>` : ""}`;

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
    g: () => `<h3>How many Madhwa youths are coming?</h3>
      <p class="hint">Select group size to continue (one booking covers up to 4 members, Madhwa youth age 18–30).</p>
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
      ${fld("p.age", "Age (Madhwa youth of age 18–30)", "number", `min="${C.AGE_MIN || 18}" max="${C.AGE_MAX || 30}" inputmode="numeric"`)}
      <label>Gender <span style="color:var(--red)">*</span>
        <select data-k="p.gender" class="select-input">
          <option value="" ${!get("p.gender") ? "selected" : ""}>Select Gender</option>
          <option value="Male" ${get("p.gender") === "Male" ? "selected" : ""}>Male (Boys Accommodation)</option>
          <option value="Female" ${get("p.gender") === "Female" ? "selected" : ""}>Female (Girls Accommodation)</option>
        </select>
      </label>
      ${fld("p.mobile", "Mobile number (linked with WhatsApp)", "tel", NUM)}
      ${fld("p.email", "Email address", "email", 'autocomplete="email"')}
      ${fld("p.area", "Area / Locality", "text", 'placeholder="e.g. Jayanagar 4th Block, Malleshwaram" autocomplete="address-line1"')}
      ${fld("p.city", "City", "text", 'placeholder="e.g. Bengaluru, Hubballi, Mysuru" autocomplete="address-level2"')}
      ${fld("p.gotra", "Gotra", "text", 'placeholder="e.g. Kashyapa / Vishwamitra / Bharadwaja"')}
      ${fld("p.matha", "Matha (e.g. Uttaradimath, Rayara Math, Vyasaraja Math, Udupi Matha, Sripadaraja Math)", "text", 'placeholder="e.g. Uttaradimath / Rayara Math / Vyasaraja Math / Udupi Matha / Sripadaraja Math"')}
      <div id="ct">${contact()}</div>`,

    // Step 3: Additional members
    m: () => `<h3>Who's coming with you?</h3>${[...Array(S.n - 1)].map((_, i) =>
      `<fieldset style="margin-bottom:18px; border:1px solid var(--line); border-radius:10px; padding:16px;">
        <legend style="font-weight:700; color:var(--red); padding:0 8px;">Person ${i + 2} (Madhwa Youth)</legend>
        ${fld(`m.${i}.name`, "Full name")}
        ${fld(`m.${i}.age`, "Age (18–30)", "number", `min="${C.AGE_MIN || 18}" max="${C.AGE_MAX || 30}" inputmode="numeric"`)}
        <label>Gender <span style="color:var(--red)">*</span>
          <select data-k="m.${i}.gender" class="select-input" required>
            <option value="" ${!get(`m.${i}.gender`) ? "selected" : ""}>Select Gender</option>
            <option value="Male" ${get(`m.${i}.gender`) === "Male" ? "selected" : ""}>Male (Boys Accommodation)</option>
            <option value="Female" ${get(`m.${i}.gender`) === "Female" ? "selected" : ""}>Female (Girls Accommodation)</option>
          </select>
        </label>
        ${fld(`m.${i}.mobile`, "Mobile number (linked with WhatsApp)", "tel", NUM)}
        ${fld(`m.${i}.gotra`, "Gotra", "text", 'placeholder="e.g. Kashyapa / Vishwamitra / Bharadwaja"')}
        ${fld(`m.${i}.matha`, "Matha (e.g. Uttaradimath, Rayara Math, Vyasaraja Math, Udupi Matha, Sripadaraja Math)", "text", 'placeholder="e.g. Uttaradimath / Rayara Math / Vyasaraja Math / Udupi Matha / Sripadaraja Math"')}
        ${fld(`m.${i}.parent`, "Parent's / Emergency mobile number", "tel", NUM)}
      </fieldset>`).join("")}`,

    // Step 4: Valid ID Verification (Zero upfront payment, payment link sent after verification)
    v: () => `<h3>Valid Identification Proof (${S.n > 1 ? "All " + S.n + " Members" : "Required"})</h3>
      <div class="id-info-banner">
        <span class="id-info-icon">🛡️</span>
        <div>
          <b>No payment needed now!</b>
          <p>We only collect details and ID proofs first. Our team will manually verify ${S.n > 1 ? "each member's" : "your"} Valid ID proof (Aadhaar / Driving License / Voter ID) before sending the official payment link.</p>
        </div>
      </div>

      <!-- Person 1 (Primary Pilgrim) ID Proof -->
      <fieldset style="margin-bottom:18px; border:1px solid var(--line); border-radius:10px; padding:16px;">
        <legend style="font-weight:700; color:var(--red); padding:0 8px;">
          Person 1: ${esc(get("p.name") || "Primary Pilgrim")}
        </legend>

        <label>Valid identification proof type <span style="color:var(--red)">*</span>
          <select data-k="p.idType" class="select-input">
            <option value="Aadhaar" ${get("p.idType") === "Aadhaar" || !get("p.idType") ? "selected" : ""}>Aadhaar Card</option>
            <option value="Driving License" ${get("p.idType") === "Driving License" ? "selected" : ""}>Driving License</option>
            <option value="Voter ID" ${get("p.idType") === "Voter ID" ? "selected" : ""}>Voter ID</option>
          </select>
        </label>

        ${fld("p.idNumber", "ID Proof Number (Aadhaar / DL / Voter ID Number)", "text", 'placeholder="e.g. 12-digit Aadhaar / DL No / Voter ID No"', "Enter the exact ID number as printed on government photo ID card.")}

        <label>Upload Valid ID Proof document / photo <span style="color:var(--red)">*</span>
          <input type="file" id="idproof_primary" data-file-key="primary" accept="image/*,.pdf">
        </label>
        <p class="hint" id="idproofn_primary">${uploadedFiles.primary ? "Attached: " + esc(uploadedFiles.primary.name) : "Attach a clear front photo of Person 1's government ID card."}</p>
      </fieldset>

      <!-- Group Members ID Proofs (if S.n > 1) -->
      ${S.n > 1 ? [...Array(S.n - 1)].map((_, i) => `
        <fieldset style="margin-bottom:18px; border:1px solid var(--line); border-radius:10px; padding:16px;">
          <legend style="font-weight:700; color:var(--red); padding:0 8px;">
            Person ${i + 2}: ${esc(get(`m.${i}.name`) || "Member " + (i + 2))}
          </legend>

          <label>Valid identification proof type <span style="color:var(--red)">*</span>
            <select data-k="m.${i}.idType" class="select-input">
              <option value="Aadhaar" ${get(`m.${i}.idType`) === "Aadhaar" || !get(`m.${i}.idType`) ? "selected" : ""}>Aadhaar Card</option>
              <option value="Driving License" ${get(`m.${i}.idType`) === "Driving License" ? "selected" : ""}>Driving License</option>
              <option value="Voter ID" ${get(`m.${i}.idType`) === "Voter ID" ? "selected" : ""}>Voter ID</option>
            </select>
          </label>

          ${fld(`m.${i}.idNumber`, `Person ${i + 2} ID Proof Number`, "text", 'placeholder="e.g. 12-digit Aadhaar / DL No / Voter ID No"')}

          <label>Upload Valid ID Proof document / photo <span style="color:var(--red)">*</span>
            <input type="file" id="idproof_m_${i}" data-file-key="m${i}" accept="image/*,.pdf">
          </label>
          <p class="hint" id="idproofn_m_${i}">${uploadedFiles["m" + i] ? "Attached: " + esc(uploadedFiles["m" + i].name) : `Attach a clear front photo of Person ${i + 2}'s government ID card.`}</p>
        </fieldset>
      `).join("") : ""}

      <label>Anything you'd like to ask us? (optional)
        <textarea data-k="q" rows="2" placeholder="Any queries regarding boarding, seva, diet, etc.">${esc(S.q)}</textarea>
      </label>`
  };

  const err = m => { const el = $("#err"); if (el) el.textContent = m || ""; };

  // ---------- Dynamic UI Controller for Booking Open vs Prebooking ----------
  function updateBookingStatus() {
    const open = isBookingsOpen();

    // 1. Top Announcement Bar
    const topBar = $("#top-announcement");
    if (topBar) {
      if (open) {
        topBar.innerHTML = `<span>🎉 <b>Registrations are LIVE!</b> Exclusively for Madhwa Youths (Age 18–30) • 35 Seats.</span> <a href="#book">Register Your Spot &rarr;</a>`;
      } else {
        topBar.innerHTML = `<span>📢 <b>YUVATMA GoSeva - 3.0</b> • Exclusively for Madhwa Youths (Age 18–30) • Registrations Open ${esc(C.BOOKING_OPEN_DATE_STR || "7th Nov")} • Limited to 35 Seats</span> <button type="button" id="bar-interested-btn">✋ Interested</button>`;
        const barIntBtn = $("#bar-interested-btn");
        if (barIntBtn) barIntBtn.onclick = openInterestedModal;
      }
    }

    // 2. Top Nav Action Button
    const topContainer = $("#top-action-container");
    if (topContainer) {
      if (open) {
        topContainer.innerHTML = `<a class="btn sm" href="#book" id="top-book-btn">Register now</a>`;
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
        ? "🎉 Registrations LIVE • Madhwa youth of age 18–30"
        : `🗓️ Registrations Open ${esc(C.BOOKING_OPEN_DATE_STR || "7th Nov")} • Madhwa youth of age 18–30`;
    }

    // 4. Hero Action Buttons
    const heroContainer = $("#hero-actions-container");
    if (heroContainer) {
      if (open) {
        heroContainer.innerHTML = `
          <a class="btn" href="#book" id="hero-book-btn">Register your spot</a>
          <button type="button" class="btn ghost" id="hero-interested-btn" style="color:#fff;box-shadow:inset 0 0 0 2px var(--gold)">✋ Join WhatsApp Group</button>
        `;
      } else {
        heroContainer.innerHTML = `
          <button type="button" class="btn" id="hero-interested-btn">✋ Interested</button>
        `;
      }
      const heroIntBtn = $("#hero-interested-btn");
      if (heroIntBtn) heroIntBtn.onclick = openInterestedModal;
    }

    // 5. Hero Contribution Fact
    const factPrice = $("#hero-fact-price");
    if (factPrice) {
      const note = typeof C.PRICE_NOTE !== "undefined" ? C.PRICE_NOTE : "(Food + Accommodation + Transport • Payment after ID verification)";
      factPrice.innerHTML = `<b>Contribution</b> ₹${(C.PRICE || 1750).toLocaleString("en-IN")} per person ${note}`.trim();
    }

    // 6. Booking Section Controls
    const cardEl = $("#card");
    const bannerEl = $("#prebooking-banner");
    const bookTitle = $("#book-title");

    if (open) {
      if (cardEl) cardEl.style.display = "block";
      if (bannerEl) bannerEl.style.display = "none";
      if (bookTitle) bookTitle.textContent = "Register your spot";
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
    $("#total").textContent = S.n && cur != "g" ? `Total Contribution: ${inr(total())} (${S.n} ${S.n > 1 ? "people" : "person"}) • Payment link sent after ID verification` : "";
    $("#back").hidden = S.i == 0;
    $("#next").hidden = cur == "g";
    $("#next").textContent = cur == "v" ? "Submit Registration for Verification →" : "Continue";

    updateProfileInfo();
    err();
    save();
  }

  const P = v => /^[6-9]\d{9}$/.test(v || ""), T = v => (v || "").trim().length > 1;
  const A = v => +v >= (C.AGE_MIN || 18) && +v <= (C.AGE_MAX || 30);

  function check(c) {
    const p = S.p;
    if (c == "y") {
      if (!T(p.name)) return "Enter your full name.";
      if (!A(p.age)) return `Age must be between ${C.AGE_MIN || 18} and ${C.AGE_MAX || 30} years (Madhwa youth).`;
      if (!T(p.gender)) return "Select your gender (Male / Female for accommodation arrangements).";
      if (!P(p.mobile)) return "Enter a valid 10-digit mobile number.";
      if (!/^\S+@\S+\.\S+$/.test(p.email || "")) return "Enter a valid email address.";
      if (!T(p.area)) return "Enter your area / locality.";
      if (!T(p.city)) return "Enter your city.";
      p.addr = (p.area ? p.area.trim() : "") + ", " + (p.city ? p.city.trim() : "");
      if (!T(p.gotra)) return "Enter your Gotra.";
      if (!T(p.matha)) return "Enter your Matha (e.g. Uttaradimath, Rayara Math, etc.).";
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
        const mName = m.name ? m.name.trim() : `Person ${i + 2}`;
        if (!T(m.name)) return `Enter full name for Person ${i + 2}.`;
        if (!A(m.age)) return `Age for ${mName} must be between ${C.AGE_MIN || 18} and ${C.AGE_MAX || 30} years (Madhwa youth).`;
        if (!T(m.gender)) return `Select gender for ${mName} (Male / Female for accommodation).`;
        if (!P(m.mobile)) return `Enter a valid 10-digit mobile number for ${mName}.`;
        if (!T(m.gotra)) return `Enter Gotra for ${mName}.`;
        if (!T(m.matha)) return `Enter Matha for ${mName} (e.g. Uttaradimath, Rayara Math, Udupi Matha, Sripadaraja Math).`;
        if (!P(m.parent)) return `Enter parent's / emergency 10-digit mobile number for ${mName}.`;
      }
    }
    if (c == "v") {
      if (!T(p.idType)) p.idType = "Aadhaar";
      if (!T(p.idNumber) || p.idNumber.trim().length < 3) return "Enter valid ID proof number for Person 1 (" + (p.name || "Primary Pilgrim") + ").";
      if (!uploadedFiles.primary) return "Please attach valid ID proof photo for Person 1 (" + (p.name || "Primary Pilgrim") + ").";

      if (S.n > 1) {
        for (let i = 0; i < S.n - 1; i++) {
          const m = S.m[i];
          const mName = m.name || `Person ${i + 2}`;
          if (!T(m.idType)) m.idType = "Aadhaar";
          if (!T(m.idNumber) || m.idNumber.trim().length < 3) return `Enter valid ID proof number for ${mName}.`;
          if (!uploadedFiles["m" + i]) return `Please attach valid ID proof photo for ${mName}.`;
        }
      }
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

  // ---------- Submission Success Modal Controller ----------
  const succModal = $("#submission-success-modal");
  const succCloseBtn = $("#sub-success-close");
  const succOkBtn = $("#sub-success-ok-btn");

  function closeSuccModal() {
    if (succModal) succModal.classList.remove("active");
    document.body.style.overflow = "";
  }

  if (succCloseBtn) succCloseBtn.onclick = closeSuccModal;
  if (succOkBtn) succOkBtn.onclick = closeSuccModal;
  if (succModal) {
    succModal.onclick = e => {
      if (e.target === succModal) closeSuccModal();
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

  // Sidebar WhatsApp link also asks for details before joining
  const sbWaLink = $("#sb-wa-link");
  if (sbWaLink) {
    sbWaLink.onclick = e => {
      e.preventDefault();
      closeSidebar();
      openInterestedModal();
    };
  }

  // Footer WhatsApp link also asks for details before joining
  const waFooter = $("#wa");
  if (waFooter) {
    waFooter.onclick = e => {
      e.preventDefault();
      openInterestedModal();
    };
  }

  // If navigated with hash to join group, automatically open interested modal
  if (window.location.hash === "#interested" || window.location.hash === "#join-group") {
    setTimeout(openInterestedModal, 300);
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
      const mathaEl = $("#int-matha");
      const matha = (mathaEl ? mathaEl.value : "").trim();

      // Strict validation for required fields
      if (!name || name.length < 2) {
        intErr.textContent = "Please enter your full name.";
        $("#int-name").focus();
        return;
      }
      if (!ageStr || isNaN(age) || age < (C.AGE_MIN || 18) || age > (C.AGE_MAX || 30)) {
        intErr.textContent = `Age must be between ${C.AGE_MIN || 18} and ${C.AGE_MAX || 30} years.`;
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
      if (!matha || matha.length < 2) {
        intErr.textContent = "Please enter your Matha (e.g. Uttaradimath, Rayara Math).";
        if (mathaEl) mathaEl.focus();
        return;
      }

      // All fields valid!
      intSubmitBtn.disabled = true;
      intSubmitBtn.textContent = "Joining WhatsApp Group…";

      // Save locally
      try {
        localStorage.setItem("yuv_interested", JSON.stringify({ name, age, phone, gotra, matha, time: Date.now() }));
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
              gotra: gotra,
              matha: matha
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
      closeSuccModal();
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
    const fileKey = e.target.dataset.fileKey;
    if (fileKey) {
      const f = e.target.files[0] || null;
      uploadedFiles[fileKey] = f;
      const lbl = $(`#idproofn_${fileKey}`);
      if (lbl) lbl.textContent = f ? "Attached: " + f.name : "";
      return;
    }
    if (e.target.id == "idproof" || e.target.id == "shot") {
      const f = e.target.files[0] || null;
      uploadedFiles.primary = f;
      const lbl = $("#idproofn") || $("#shotn");
      if (lbl) lbl.textContent = f ? "Attached: " + f.name : "";
    }
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

      if (cur != "v") {
        S.i++;
        render();
        return jump();
      }

      if (!isBookingsOpen()) {
        return openInterestedModal();
      }

      const btn = $("#next");
      btn.disabled = true;
      btn.textContent = "Submitting Registration…";
      err();

      try {
        const p = S.p;
        p.addr = (p.area ? p.area.trim() : "") + ", " + (p.city ? p.city.trim() : "");

        const primaryProofBase64 = uploadedFiles.primary ? await shrink(uploadedFiles.primary) : "";

        const membersPayload = [];
        for (let i = 0; i < S.n - 1; i++) {
          const mem = Object.assign({}, S.m[i]);
          const mFile = uploadedFiles["m" + i];
          mem.idProof = mFile ? await shrink(mFile) : "";
          mem.idFileName = mFile ? mFile.name : "";
          membersPayload.push(mem);
        }

        const body = {
          action: "book",
          hp: $("#hp").value,
          n: S.n,
          price: C.PRICE || 1750,
          total: S.n * (C.PRICE || 1750),
          p: p,
          members: membersPayload,
          matha: (p.matha || "").trim(),
          idType: p.idType || "Aadhaar",
          idNumber: (p.idNumber || "").trim(),
          idProof: primaryProofBase64,
          idFileName: uploadedFiles.primary ? uploadedFiles.primary.name : "",
          q: S.q
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
          : "Could not send registration. Check connection or Apps Script permissions.");
        btn.disabled = false;
        btn.textContent = "Submit Registration for Verification →";
      }
    });
  }

  function done(id) {
    const mail = esc(S.p.email);
    const pName = esc(S.p.name);
    const idType = esc(S.p.idType || "Aadhaar");
    const idNum = esc(S.p.idNumber || "");
    try { localStorage.removeItem(KEY); } catch (e) {}

    // 1. Update Card display
    $("#card").innerHTML = `
      <div class="ok">
        <span style="font-size:3.2rem">🎉</span>
        <h3 style="color:var(--leaf); margin-top:8px;">Registration Received!</h3>
        <p class="bid">${esc(id)}</p>
        <div style="background:var(--gold-light);border:1px solid var(--line);border-radius:10px;padding:14px;margin:16px 0;text-align:left;">
          <p style="margin:0 0 6px 0;font-weight:700;color:var(--ink);">🛡️ Valid ID Verification in Progress</p>
          <p style="margin:0;font-size:14px;color:var(--ink-light);line-height:1.5;">
            Thank you, <b>${pName}</b>! We have recorded your registration, Matha (<b>${esc(S.p.matha || "")}</b>), and valid ID proof (<b>${idType}: ${idNum}</b>).
            A confirmation email has been dispatched to <b>${mail}</b>.
          </p>
        </div>

        <!-- Spam Folder Alert Box -->
        <div style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 14px;margin:14px 0;text-align:left;font-size:13.5px;color:#92400e;line-height:1.5;">
          📬 <b>Important: Check your Spam / Promotions folder!</b><br>
          Automated emails to first-time recipients may occasionally land in your <b>Spam or Promotions</b> tab. If found there, please click <b>"Report not spam"</b> or move it to your <b>Primary inbox</b> so our payment link reaches you immediately.
        </div>

        <div style="background:#fff;border:1px dashed var(--line);border-radius:10px;padding:14px;margin:14px 0;text-align:left;font-size:14px;">
          <b style="color:var(--ink)">What happens next?</b>
          <ol style="margin:8px 0 0 18px;padding:0;line-height:1.6;">
            <li>Team YUVATMA will manually verify your submitted Valid ID proof.</li>
            <li>Once verified, we will send your <b>Official Payment Link</b> to your Email &amp; WhatsApp.</li>
            <li>Open the payment page to pay via PhonePe / any UPI app and send screenshot to our WhatsApp.</li>
            <li>Team verifies payment &amp; marks your booking Confirmed &amp; Verified!</li>
          </ol>
        </div>
        <div style="margin-top:20px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <a class="btn" href="my-booking.html">View in 'My Booking'</a>
          <a class="btn ghost" href="${esc(WHATSAPP_GROUP_URL)}" target="_blank">Join WhatsApp Group</a>
        </div>
      </div>`;

    // 2. Open Submission Success Popup Modal
    const succModal = $("#submission-success-modal");
    if (succModal) {
      const idEl = $("#sub-success-id");
      const mailEl = $("#sub-success-email");
      if (idEl) idEl.textContent = id;
      if (mailEl) mailEl.textContent = S.p.email || "your registered email";
      succModal.classList.add("active");
      document.body.style.overflow = "hidden";
    }
    jump();
  }

  // Populate dynamic contact links
  if (C.PHONE) {
    const sbTel = $("#sb-tel-link");
    if (sbTel) sbTel.href = "tel:" + C.PHONE.replace(/\s+/g, "");
  }
  if (C.PHONE2) {
    const sbTel2 = $("#sb-tel-link2");
    if (sbTel2) sbTel2.href = "tel:" + C.PHONE2.replace(/\s+/g, "");
  }
  if (C.EMAIL) {
    const sbMail = $("#sb-mail-link");
    if (sbMail) sbMail.href = "mailto:" + C.EMAIL;
  }

  // Initialize
  render();
  fetchSeats();
})();

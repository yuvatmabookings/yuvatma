(() => {
  const C = window.YUV || {};
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");

  const SESSION_KEY = "yuv_admin_key";
  const ADMIN_TOKEN_KEY = "yuv_admin_token";
  const ADMIN_PROFILE_KEY = "yuv_admin_profile";

  let adminKey = sessionStorage.getItem(SESSION_KEY) || "";
  let adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
  let currentAdmin = null;
  try {
    currentAdmin = JSON.parse(sessionStorage.getItem(ADMIN_PROFILE_KEY) || "null");
  } catch (e) {
    currentAdmin = null;
  }

  let allBookings = [];
  let allInterested = [];
  let allAdmins = [];
  let currentFilter = "all";
  let searchQuery = "";

  // Elements
  const loginView = $("#login-view");
  const dashView = $("#dashboard-view");
  const navActions = $("#nav-actions");
  const loginForm = $("#admin-login-form");
  const adminEmailInput = $("#admin-email");
  const adminPassInput = $("#admin-password");
  const loginErr = $("#login-err");
  const loginSubmitBtn = $("#login-submit-btn");

  const adminUserPill = $("#admin-user-pill");
  const adminUserName = $("#admin-user-name");
  const adminUserRole = $("#admin-user-role");
  const manageAdminsBtn = $("#manage-admins-btn");
  const changePassBtn = $("#change-pass-btn");
  const readOnlyBanner = $("#read-only-banner");
  const menuToggle = $("#admin-menu-toggle");

  const refreshBtn = $("#refresh-btn");
  const exportBtn = $("#export-csv-btn");
  const logoutBtn = $("#logout-btn");
  const searchInput = $("#search-input");
  const searchClearBtn = $("#search-clear-btn");
  const actionModal = $("#action-modal");
  const modalCloseBtn = $("#modal-close-btn");
  const modalBody = $("#modal-body-content");
  const toast = $("#toast-msg");
  const toastText = $("#toast-text");
  const toastIcon = $("#toast-icon");

  function showToast(message, isSuccess = true) {
    if (!toast) return;
    toastText.textContent = message;
    toastIcon.textContent = isSuccess ? "✓" : "⚠️";
    toast.style.background = isSuccess ? "#166534" : "#991b1b";
    toast.classList.add("active");
    setTimeout(() => {
      toast.classList.remove("active");
    }, 4500);
  }

  // Helper to format date
  function formatDate(d) {
    if (!d) return "-";
    try {
      return new Date(d).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (e) {
      return String(d);
    }
  }

  // Update Top Nav Admin Badge and Permissions UI
  function updateUserBadge() {
    if (!adminUserPill || !adminUserName || !adminUserRole) return;
    if (currentAdmin) {
      adminUserName.textContent = currentAdmin.name || "Admin";
      if (currentAdmin.isSuperAdmin) {
        adminUserRole.className = "role-badge owner";
        adminUserRole.textContent = "Owner";
      } else if (currentAdmin.access === "write") {
        adminUserRole.className = "role-badge write";
        adminUserRole.textContent = "Write";
      } else {
        adminUserRole.className = "role-badge read";
        adminUserRole.textContent = "Read-Only";
      }
      adminUserPill.style.display = "inline-flex";

      if (manageAdminsBtn) {
        manageAdminsBtn.style.display = (currentAdmin.isSuperAdmin || currentAdmin.access === "write") ? "inline-block" : "none";
      }
      if (readOnlyBanner) {
        readOnlyBanner.style.display = currentAdmin.access === "read" ? "block" : "none";
      }
    } else {
      adminUserName.textContent = "Main Admin";
      adminUserRole.className = "role-badge owner";
      adminUserRole.textContent = "Owner";
      if (manageAdminsBtn) manageAdminsBtn.style.display = "inline-block";
      if (readOnlyBanner) readOnlyBanner.style.display = "none";
    }
  }

  // Authentication Check
  function checkAuth() {
    if (adminKey || adminToken) {
      if (loginView) loginView.style.display = "none";
      if (dashView) dashView.style.display = "block";
      if (navActions) navActions.style.display = "flex";
      if (menuToggle) menuToggle.style.display = "inline-flex";
      updateUserBadge();
      loadAdminData();
    } else {
      if (loginView) loginView.style.display = "block";
      if (dashView) dashView.style.display = "none";
      if (navActions) {
        navActions.style.display = "none";
        navActions.classList.remove("mobile-open");
      }
      if (menuToggle) {
        menuToggle.style.display = "none";
        menuToggle.classList.remove("active");
      }
      if (adminEmailInput) adminEmailInput.focus();
    }
  }

  // Mobile Menu Toggle handler
  if (menuToggle) {
    menuToggle.onclick = () => {
      if (!navActions) return;
      navActions.classList.toggle("mobile-open");
      menuToggle.classList.toggle("active");
    };
  }

  if (navActions) {
    navActions.addEventListener("click", e => {
      if (e.target.closest("button, a") && window.innerWidth <= 860) {
        navActions.classList.remove("mobile-open");
        if (menuToggle) menuToggle.classList.remove("active");
      }
    });
  }

  // Login form submission
  if (loginForm) {
    loginForm.onsubmit = async e => {
      e.preventDefault();
      loginErr.textContent = "";
      const emailOrKey = (adminEmailInput ? adminEmailInput.value || "" : "").trim();
      const pass = (adminPassInput ? adminPassInput.value || "" : "").trim();

      if (!emailOrKey && !pass) {
        loginErr.textContent = "Please enter your Admin Email or Passcode.";
        return;
      }

      if (loginSubmitBtn) {
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.textContent = "Verifying credentials…";
      }

      try {
        if (!C.API_URL || C.API_URL.includes("PASTE_YOUR_APPS_SCRIPT")) {
          throw new Error("API URL is not configured in config.js. Please deploy Code.gs in Google Sheets.");
        }

        const res = await fetch(C.API_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "adminLogin",
            email: emailOrKey,
            password: pass,
            passcode: pass || emailOrKey
          })
        });
        const data = await res.json();
        if (!data.ok) {
          throw new Error(data.error || "Authentication failed. Please check credentials.");
        }

        currentAdmin = data.admin || {
          name: "Admin",
          email: emailOrKey,
          access: "write",
          isSuperAdmin: false
        };
        adminToken = data.token || "";
        adminKey = pass || emailOrKey;
        sessionStorage.setItem(SESSION_KEY, adminKey);
        sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
        sessionStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(currentAdmin));
        checkAuth();
      } catch (err) {
        loginErr.textContent = err.message;
      } finally {
        if (loginSubmitBtn) {
          loginSubmitBtn.disabled = false;
          loginSubmitBtn.textContent = "Unlock Admin Dashboard →";
        }
      }
    };
  }

  // Logout
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      sessionStorage.removeItem(ADMIN_PROFILE_KEY);
      adminKey = "";
      adminToken = "";
      currentAdmin = null;
      checkAuth();
    };
  }

  // Fetch Data from Google Apps Script
  async function loadAdminData() {
    const tbody = $("#bookings-tbody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#666;">⏳ Fetching real-time registry from Google Sheets…</td></tr>`;
    }

    if (!C.API_URL || C.API_URL.includes("PASTE_YOUR_APPS_SCRIPT")) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:36px; color:#991b1b;">
          <b>API URL is not configured in config.js.</b>
        </td></tr>`;
      }
      return;
    }

    try {
      const res = await fetch(C.API_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "adminList",
          passcode: adminKey,
          token: adminToken
        })
      });
      const data = await res.json();

      if (!data.ok) {
        if (data.error && (data.error.includes("Invalid") || data.error.includes("Unauthorized"))) {
          sessionStorage.removeItem(SESSION_KEY);
          sessionStorage.removeItem(ADMIN_TOKEN_KEY);
          sessionStorage.removeItem(ADMIN_PROFILE_KEY);
          adminKey = "";
          adminToken = "";
          currentAdmin = null;
          checkAuth();
          showToast("Session expired. Please log in again.", false);
          return;
        }
        throw new Error(data.error || "Could not load admin data from Google Apps Script.");
      }

      if (data.currentAdmin) {
        currentAdmin = data.currentAdmin;
        sessionStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(currentAdmin));
        updateUserBadge();
      }

      allBookings = data.bookings || [];
      allInterested = data.interested || [];
      allAdmins = data.admins || [];
      updateKpis(data.stats);
      renderTable();
      renderInterestedTable();
      showToast("Data synced live from Google Sheets!");
    } catch (err) {
      console.warn("API notice:", err.message);
      allBookings = [];
      allInterested = [];
      updateKpis();

      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align:center; padding:36px 16px; color:#991b1b;">
              <div style="font-size:2.5rem; margin-bottom:8px;">⚠️</div>
              <b style="font-size:16px;">Could not connect to Google Apps Script (${esc(err.message)})</b>
              <div style="background:#fff; border:1px dashed #d9c9ae; border-radius:10px; padding:16px; max-width:620px; margin:16px auto; text-align:left; font-size:13.5px; color:#2b120c; line-height:1.6;">
                <b style="color:var(--red);">If you haven't deployed the updated Code.gs yet:</b>
                <ol style="margin:8px 0 0 18px; padding:0;">
                  <li>Open your Google Sheet &rarr; <b>Extensions</b> &rarr; <b>Apps Script</b>.</li>
                  <li>Replace all code with the updated <b>Code.gs</b> and click <b>Save</b> (💾).</li>
                  <li>Click <b>Deploy</b> &rarr; <b>Manage deployments</b> &rarr; Click <b>Edit</b> (pencil icon) &rarr; Select <b>Version: New version</b> &rarr; Click <b>Deploy</b>.</li>
                  <li>Click <b>'🔄 Refresh Data'</b> above.</li>
                </ol>
              </div>
            </td>
          </tr>
        `;
      }
      showToast(err.message, false);
    }
  }

  // Update KPI counters
  function updateKpis(stats) {
    const totalCap = C.TOTAL_SEATS || 35;
    let confirmedSeats = 0;
    let idPendingCount = 0;
    let payPendingCount = 0;
    let confirmedCount = 0;

    allBookings.forEach(b => {
      const st = String(b.status || "");
      const seats = Number(b.people) || 1;
      if (st === "Confirmed & Verified" || st === "Verified") {
        confirmedSeats += seats;
        confirmedCount++;
      } else if (st.indexOf("ID Verification Pending") > -1) {
        idPendingCount += seats;
      } else if (st.indexOf("Payment Pending") > -1) {
        payPendingCount += seats;
      }
    });

    const totalBookedSeats = confirmedSeats + idPendingCount + payPendingCount;
    const seatsLeft = Math.max(0, totalCap - totalBookedSeats);

    $("#kpi-total-seats").textContent = totalCap;
    $("#kpi-confirmed-seats").textContent = confirmedSeats;
    $("#kpi-confirmed-sub").textContent = `${confirmedCount} Bookings confirmed`;
    $("#kpi-id-pending").textContent = idPendingCount;
    $("#kpi-pay-pending").textContent = payPendingCount;
    $("#kpi-seats-left").textContent = seatsLeft;
    $("#kpi-interested-count").textContent = allInterested.length;

    // Badges on tabs
    $("#badge-all").textContent = allBookings.length;
    $("#badge-id-pending").textContent = allBookings.filter(b => (b.status || "").indexOf("ID Verification Pending") > -1).length;
    $("#badge-pay-pending").textContent = allBookings.filter(b => (b.status || "").indexOf("Payment Pending") > -1).length;
    $("#badge-confirmed").textContent = allBookings.filter(b => (b.status === "Confirmed & Verified" || b.status === "Verified")).length;
    $("#badge-interested").textContent = allInterested.length;
  }

  // Filter and Search logic
  function getFilteredBookings() {
    return allBookings.filter(b => {
      // 1. Status Filter
      const st = String(b.status || "");
      if (currentFilter === "id-pending" && st.indexOf("ID Verification Pending") === -1) return false;
      if (currentFilter === "pay-pending" && st.indexOf("Payment Pending") === -1) return false;
      if (currentFilter === "confirmed" && st !== "Confirmed & Verified" && st !== "Verified") return false;

      // 2. Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;

        const cleanQ = q.replace(/\D/g, "");

        let matches = (
          String(b.id || "").toLowerCase().includes(q) ||
          String(b.name || "").toLowerCase().includes(q) ||
          String(b.email || "").toLowerCase().includes(q) ||
          String(b.mobile || "").toLowerCase().includes(q) ||
          (cleanQ.length >= 3 && String(b.mobile || "").replace(/\D/g, "").includes(cleanQ)) ||
          String(b.gotra || "").toLowerCase().includes(q) ||
          String(b.matha || "").toLowerCase().includes(q) ||
          String(b.area || "").toLowerCase().includes(q) ||
          String(b.city || "").toLowerCase().includes(q) ||
          String(b.addr || "").toLowerCase().includes(q) ||
          String(b.gender || "").toLowerCase().includes(q) ||
          String(b.age || "").includes(q) ||
          String(b.idType || "").toLowerCase().includes(q) ||
          String(b.idNumber || "").toLowerCase().includes(q) ||
          (cleanQ.length >= 3 && String(b.idNumber || "").replace(/\D/g, "").includes(cleanQ)) ||
          String(b.contact || "").toLowerCase().includes(q) ||
          (cleanQ.length >= 3 && String(b.contact || "").replace(/\D/g, "").includes(cleanQ)) ||
          String(b.coordinatorName || "").toLowerCase().includes(q) ||
          String(b.coordinatorPhone || "").toLowerCase().includes(q) ||
          (cleanQ.length >= 3 && String(b.coordinatorPhone || "").replace(/\D/g, "").includes(cleanQ)) ||
          String(b.verifiedBy || "").toLowerCase().includes(q) ||
          String(b.txn || "").toLowerCase().includes(q) ||
          String(b.notes || "").toLowerCase().includes(q) ||
          String(b.q || "").toLowerCase().includes(q)
        );

        if (!matches && Array.isArray(b.members) && b.members.length > 0) {
          matches = b.members.some(m => {
            if (!m) return false;
            return (
              String(m.name || "").toLowerCase().includes(q) ||
              String(m.mobile || "").toLowerCase().includes(q) ||
              (cleanQ.length >= 3 && String(m.mobile || "").replace(/\D/g, "").includes(cleanQ)) ||
              String(m.gotra || "").toLowerCase().includes(q) ||
              String(m.matha || "").toLowerCase().includes(q) ||
              String(m.parent || "").toLowerCase().includes(q) ||
              (cleanQ.length >= 3 && String(m.parent || "").replace(/\D/g, "").includes(cleanQ)) ||
              String(m.idType || "").toLowerCase().includes(q) ||
              String(m.idNumber || "").toLowerCase().includes(q) ||
              (cleanQ.length >= 3 && String(m.idNumber || "").replace(/\D/g, "").includes(cleanQ)) ||
              String(m.gender || "").toLowerCase().includes(q) ||
              String(m.age || "").includes(q)
            );
          });
        }

        if (!matches) return false;
      }
      return true;
    });
  }

  function getFilteredInterested() {
    return allInterested.filter(it => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const cleanQ = q.replace(/\D/g, "");

      return (
        String(it.name || "").toLowerCase().includes(q) ||
        String(it.phone || "").toLowerCase().includes(q) ||
        (cleanQ.length >= 3 && String(it.phone || "").replace(/\D/g, "").includes(cleanQ)) ||
        String(it.gotra || "").toLowerCase().includes(q) ||
        String(it.matha || "").toLowerCase().includes(q) ||
        String(it.age || "").includes(q)
      );
    });
  }

  // Render Bookings Table
  function renderTable() {
    const list = getFilteredBookings();
    const tbody = $("#bookings-tbody");
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:36px; color:#888;">
        No bookings found matching current filter or search query.
      </td></tr>`;
      return;
    }

    const canWrite = currentAdmin ? (currentAdmin.access === "write" || currentAdmin.isSuperAdmin) : true;

    tbody.innerHTML = list.map(b => {
      const isIdPending = (b.status || "").indexOf("ID Verification Pending") > -1;
      const isPayPending = (b.status || "").indexOf("Payment Pending") > -1;
      const isConfirmed = b.status === "Confirmed & Verified" || b.status === "Verified";

      let statusBadge = "";
      if (isConfirmed) {
        statusBadge = `<span class="status-pill confirmed">✓ Confirmed</span>`;
      } else if (isPayPending) {
        statusBadge = `<span class="status-pill pay-pending">💳 Payment Pending</span>`;
      } else {
        statusBadge = `<span class="status-pill id-pending">🛡️ ID Pending</span>`;
      }

      const cleanMobile = String(b.mobile || "").replace(/\D/g, "");
      const dateFormatted = formatDate(b.timestamp);

      return `
        <tr>
          <!-- 1. ID & Date -->
          <td data-label="ID &amp; Date">
            <b style="font-size:15px; color:var(--red); font-family:monospace;">${esc(b.id)}</b>
            <div style="font-size:12px; color:#777; margin-top:2px;">${esc(dateFormatted)}</div>
          </td>

          <!-- 2. Pilgrim Details -->
          <td data-label="Pilgrim Details">
            <div style="font-weight:700; color:var(--ink); font-size:15px;">
              ${esc(b.name)}
              <span style="font-weight:normal;font-size:12.5px;color:#666;">(${esc(b.age)} yrs &bull; ${esc(b.gender || "Youth")})</span>
            </div>
            <div style="margin-top:4px;">
              <a href="tel:${esc(cleanMobile)}" style="font-size:13px; color:#1e3a8a; text-decoration:none;">📞 ${esc(b.mobile)}</a>
              &bull;
              <a href="https://wa.me/91${esc(cleanMobile)}?text=Namaskara%20${encodeURIComponent(b.name)}%20from%20Team%20YUVATMA" target="_blank" style="font-size:12px; color:#15803d; font-weight:700; text-decoration:none;">💬 WhatsApp</a>
            </div>
            <div style="font-size:12px; color:#666; margin-top:2px;">✉️ ${esc(b.email)}</div>
            ${(b.area || b.city || b.addr) ? `<div style="font-size:12px; color:#777; margin-top:2px;" title="${esc((b.area ? b.area + ', ' : '') + (b.city || b.addr || ''))}">📍 ${esc((b.area ? b.area + ', ' : '') + (b.city || b.addr || ''))}</div>` : ""}
          </td>

          <!-- 3. Matha & Gotra -->
          <td data-label="Matha &amp; Gotra">
            <div style="font-weight:700; color:var(--ink); font-size:14px;">${esc(b.matha || "Not specified")}</div>
            <div style="font-size:13px; color:#666; margin-top:2px;">Gotra: <b>${esc(b.gotra || "-")}</b></div>
            ${b.contact ? `<div style="font-size:12px; color:#888; margin-top:2px;">${esc(b.contact)}</div>` : ""}
          </td>

          <!-- 4. Seats & Contribution -->
          <td data-label="Seats &amp; Contribution">
            <b style="font-size:15px; color:var(--ink);">${b.people} ${b.people > 1 ? "Seats" : "Seat"}</b>
            <div style="font-size:14px; font-weight:700; color:var(--red); margin-top:2px;">${inr(b.total)}</div>
            ${b.members && b.members.length ? `<div style="font-size:11.5px; color:#15803d; margin-top:2px;">+${b.members.length} group member(s)</div>` : ""}
          </td>

          <!-- 5. Valid ID Proof -->
          <td data-label="Valid ID Proof">
            <div style="font-weight:700; font-size:13.5px; color:var(--ink);">${esc(b.idType)}</div>
            <div style="font-size:12px; font-family:monospace; color:#555;">${esc(b.idNumber || "None")}</div>
            ${b.idDocUrl ? `
              <a href="${esc(b.idDocUrl)}" target="_blank" rel="noopener" class="btn-action view-doc" style="margin-top:6px; font-size:11px; padding:4px 8px;">
                👁️ View ID Document &rarr;
              </a>
            ` : `<span style="font-size:11px; color:#999; display:block; margin-top:4px;">(No file uploaded)</span>`}
          </td>

          <!-- 6. Status & Verifier Tag -->
          <td data-label="Status &amp; Verifier">
            ${statusBadge}
            ${b.coordinatorName ? `
              <div style="font-size:11px; color:#1e40af; font-weight:600; margin-top:5px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:3px 6px;">
                Coordinator:<br><b>${esc(b.coordinatorName)}</b>
                ${b.coordinatorPhone ? `<br><a href="https://wa.me/91${esc(b.coordinatorPhone)}" target="_blank" style="color:#15803d; text-decoration:none;">📱 +91 ${esc(b.coordinatorPhone)}</a>` : ""}
              </div>
            ` : ""}
            ${b.verifiedBy ? `
              <div style="font-size:11px; color:#166534; font-weight:600; margin-top:5px; line-height:1.35; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:4px 7px;">
                ✓ Verified by:<br><b>${esc(b.verifiedBy)}</b>
                ${b.verifiedAt ? `<div style="font-size:10px; color:#6b7280; margin-top:2px;">${formatDate(b.verifiedAt)}</div>` : ""}
              </div>
            ` : `<div style="font-size:11px; color:#9ca3af; margin-top:4px;">Not yet verified</div>`}
            ${b.txn ? `<div style="font-size:11.5px; color:#1e1b4b; margin-top:4px; font-family:monospace;">UTR: ${esc(b.txn)}</div>` : ""}
          </td>

          <!-- 7. Admin Action Cluster -->
          <td data-label="Actions">
            <div class="action-cluster">
              ${canWrite ? `
                ${isIdPending ? `
                  <button type="button" class="btn-action approve-id" data-action="approve-id" data-id="${esc(b.id)}">
                    🛡️ Approve ID &amp; Send Pay Link
                  </button>
                ` : ""}

                ${isPayPending ? `
                  <button type="button" class="btn-action confirm-pay" data-action="confirm-pay" data-id="${esc(b.id)}">
                    ✅ Confirm Payment &amp; Verify
                  </button>
                  <button type="button" class="btn-action view-doc" data-action="copy-link" data-link="${esc(b.payLink || ((C.SITE_URL || '') + 'pay.html?id=' + b.id))}">
                    🔗 Copy Payment Link
                  </button>
                ` : ""}

                ${isConfirmed ? `
                  <button type="button" class="btn-action confirm-pay" style="background:#f0fdf4; color:#15803d !important; border:1px solid #86efac;" data-action="confirm-pay" data-id="${esc(b.id)}" data-resend="true">
                    📧 Re-send Confirmation Email
                  </button>
                ` : ""}
              ` : `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 8px; font-size:11px; color:#64748b; text-align:center;">
                  🔒 Read-Only
                </div>
              `}

              <button type="button" class="btn-action view-doc" data-action="view-details" data-id="${esc(b.id)}">
                👁️ Full Details
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Render Interested Inquiries Table
  function renderInterestedTable() {
    const tbody = $("#interested-tbody");
    if (!tbody) return;

    const list = getFilteredInterested();

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#888;">
        ${allInterested.length === 0 ? "No inquiries recorded yet." : "No inquiries match the current search query."}
      </td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(it => {
      const cleanPhone = String(it.phone || "").replace(/\D/g, "");
      const dateFormatted = formatDate(it.timestamp);
      return `
        <tr>
          <td data-label="Date">${esc(dateFormatted)}</td>
          <td data-label="Full Name"><b>${esc(it.name)}</b></td>
          <td data-label="Age">${esc(it.age)} yrs</td>
          <td data-label="WhatsApp Phone">
            <a href="https://wa.me/91${esc(cleanPhone)}" target="_blank" style="color:#15803d; font-weight:bold; text-decoration:none;">
              💬 ${esc(it.phone)}
            </a>
          </td>
          <td data-label="Gotra">${esc(it.gotra || "-")}</td>
          <td data-label="Matha">${esc(it.matha || "-")}</td>
          <td data-label="Action">
            <a href="https://wa.me/91${esc(cleanPhone)}?text=Namaskara%20${encodeURIComponent(it.name)}%2C%20Team%20YUVATMA%20welcomes%20you!" target="_blank" class="btn-action wa-chat" style="padding:8px 12px; font-size:12.5px; width:100%; box-sizing:border-box;">
              💬 WhatsApp
            </a>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Tab Switching
  $$(".tab-btn").forEach(btn => {
    btn.onclick = () => {
      $$(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;

      const bookingsCard = $("#bookings-card");
      const interestedCard = $("#interested-card");

      if (currentFilter === "interested") {
        if (bookingsCard) bookingsCard.style.display = "none";
        if (interestedCard) interestedCard.style.display = "block";
        renderInterestedTable();
      } else {
        if (bookingsCard) bookingsCard.style.display = "block";
        if (interestedCard) interestedCard.style.display = "none";
        renderTable();
      }
    };
  });

  // Search Input Handler
  function handleSearchInput() {
    if (!searchInput) return;
    searchQuery = (searchInput.value || "").trim();
    if (searchClearBtn) {
      searchClearBtn.style.display = searchQuery ? "flex" : "none";
    }
    if (currentFilter === "interested") {
      renderInterestedTable();
    } else {
      renderTable();
    }
  }

  // Search Input Listeners
  if (searchInput) {
    searchInput.oninput = handleSearchInput;
    searchInput.onkeydown = e => {
      if (e.key === "Escape") {
        searchInput.value = "";
        handleSearchInput();
        searchInput.blur();
      }
    };
  }

  if (searchClearBtn) {
    searchClearBtn.onclick = () => {
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }
      handleSearchInput();
    };
  }

  // Delegated Table Action Handler
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const link = btn.dataset.link;
    const isResend = btn.dataset.resend === "true";

    if (action === "approve-id") {
      openApproveIdModal(id);
    } else if (action === "confirm-pay") {
      openConfirmPaymentModal(id, isResend);
    } else if (action === "copy-link") {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(() => {
          showToast("Payment link copied to clipboard!");
        });
      }
    } else if (action === "view-details") {
      openDetailsModal(id);
    }
  });

  // Modal Open/Close
  function openModal(html, isWide = false) {
    if (!actionModal || !modalBody) return;
    const dialog = actionModal.querySelector(".modal-dialog");
    if (dialog) {
      if (isWide) dialog.classList.add("wide-modal");
      else dialog.classList.remove("wide-modal");
    }
    modalBody.innerHTML = html;
    actionModal.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (!actionModal) return;
    actionModal.classList.remove("active");
    document.body.style.overflow = "";
  }

  if (modalCloseBtn) modalCloseBtn.onclick = closeModal;
  if (actionModal) {
    actionModal.onclick = e => {
      if (e.target === actionModal) closeModal();
    };
  }

  // 1. Modal: Approve ID & Send Payment Link
  function openApproveIdModal(id) {
    const b = allBookings.find(x => x.id === id);
    if (!b) return;

    const verifierAdminName = currentAdmin ? currentAdmin.name : "Admin";
    const verifierAdminPhone = currentAdmin && currentAdmin.phone ? currentAdmin.phone : (C.WHATSAPP_SCREENSHOT_PHONE || C.PHONE || "9739755771");

    openModal(`
      <div style="text-align:center;">
        <span style="font-size:2.8rem">🛡️</span>
        <h2 style="color:var(--ink); margin:6px 0;">Approve ID &amp; Send Payment Link</h2>
        <p style="font-size:14px; color:#666;">This will mark the ID proof verified and dispatch the official payment email.</p>
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">Booking ID</div>
          <div class="detail-value" style="color:var(--red); font-family:monospace;">${esc(b.id)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Pilgrim Name</div>
          <div class="detail-value">${esc(b.name)} (${esc(b.age)} yrs &bull; ${esc(b.gender || "Youth")})</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Matha &amp; Gotra</div>
          <div class="detail-value">${esc(b.matha || "-")} / ${esc(b.gotra || "-")}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Seats &amp; Total</div>
          <div class="detail-value">${esc(b.people)} Seat(s) &bull; ${inr(b.total)}</div>
        </div>
        <div class="detail-item" style="grid-column: span 2;">
          <div class="detail-label">Submitted ID Proof</div>
          <div class="detail-value">
            <b>${esc(b.idType)}:</b> ${esc(b.idNumber)}
            ${b.idDocUrl ? ` &bull; <a href="${esc(b.idDocUrl)}" target="_blank" style="color:#2563eb; font-weight:bold;">👁️ View ID Document &rarr;</a>` : ""}
          </div>
        </div>
        <div class="detail-item" style="grid-column: span 2;">
          <div class="detail-label">Email to Receive Payment Link</div>
          <div class="detail-value" style="color:#1e3a8a;">${esc(b.email)}</div>
        </div>
        <div class="detail-item" style="grid-column: span 2;">
          <div class="detail-label">Assigned Coordinator (Receives Payment Screenshot)</div>
          <div class="detail-value" style="color:#15803d; font-weight:700;">
            👤 ${esc(verifierAdminName)} &bull; 📱 +91 ${esc(verifierAdminPhone)} (${esc(currentAdmin ? currentAdmin.email : "admin@yuvatma.com")})
          </div>
        </div>
      </div>

      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px; margin:16px 0; font-size:13.5px; color:#1e40af;">
        ℹ️ The email and payment page will instruct the pilgrim to send their payment screenshot directly to <b>${esc(verifierAdminName)} (+91 ${esc(verifierAdminPhone)})</b>.
      </div>

      <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
        <button type="button" class="btn ghost" onclick="document.querySelector('#action-modal').classList.remove('active')">Cancel</button>
        <button type="button" class="btn" id="confirm-approve-id-btn" style="background:#2563eb;">
          Approve ID &amp; Send Email &rarr;
        </button>
      </div>
    `);

    $("#confirm-approve-id-btn").onclick = async () => {
      const btn = $("#confirm-approve-id-btn");
      btn.disabled = true;
      btn.textContent = "Dispatched payment email…";

      const adminNameTag = currentAdmin ? currentAdmin.name : "Admin";
      const adminEmailTag = currentAdmin ? currentAdmin.email : "admin@yuvatma.com";
      const adminPhoneTag = verifierAdminPhone;

      try {
        const res = await fetch(C.API_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "adminApproveId",
            id: b.id,
            passcode: adminKey,
            token: adminToken,
            adminName: adminNameTag,
            adminEmail: adminEmailTag,
            adminPhone: adminPhoneTag
          })
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);

        // Update local object
        b.status = "Payment Pending (ID Verified)";
        b.coordinatorName = adminNameTag;
        b.coordinatorPhone = adminPhoneTag;
        b.verifiedBy = `${adminNameTag} (${adminEmailTag})`;
        b.verifiedAt = new Date().toISOString();

        closeModal();
        updateKpis();
        renderTable();
        showToast(`Payment link email sent to ${b.email} for ${b.id}! Assigned Coordinator: ${adminNameTag}`);
      } catch (err) {
        alert("Error approving ID: " + err.message);
        btn.disabled = false;
        btn.textContent = "Approve ID & Send Email →";
      }
    };
  }

  // 2. Modal: Confirm Payment & Mark Verified
  function openConfirmPaymentModal(id, isResend = false) {
    const b = allBookings.find(x => x.id === id);
    if (!b) return;

    const verifierAdminName = currentAdmin ? currentAdmin.name : "Admin";

    openModal(`
      <div style="text-align:center;">
        <span style="font-size:2.8rem">✅</span>
        <h2 style="color:var(--leaf); margin:6px 0;">${isResend ? "Re-send Booking Confirmation" : "Confirm Payment & Mark Verified"}</h2>
        <p style="font-size:14px; color:#666;">
          ${isResend ? "Re-dispatch confirmation email to the pilgrim." : "Confirm that payment screenshot was received on WhatsApp, and verify this booking."}
        </p>
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">Booking ID</div>
          <div class="detail-value" style="color:var(--red); font-family:monospace;">${esc(b.id)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Pilgrim</div>
          <div class="detail-value">${esc(b.name)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Seats</div>
          <div class="detail-value">${esc(b.people)} Seat(s)</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Total Contribution</div>
          <div class="detail-value" style="color:var(--leaf); font-weight:800;">${inr(b.total)}</div>
        </div>
        <div class="detail-item" style="grid-column: span 2;">
          <div class="detail-label">Pilgrim Email</div>
          <div class="detail-value" style="color:#1e3a8a;">${esc(b.email)}</div>
        </div>
        <div class="detail-item" style="grid-column: span 2;">
          <div class="detail-label">Verifying Admin</div>
          <div class="detail-value" style="color:#15803d; font-weight:700;">👤 ${esc(verifierAdminName)} (${esc(currentAdmin ? currentAdmin.email : "admin@yuvatma.com")})</div>
        </div>
      </div>

      <div style="margin:16px 0;">
        <label style="font-size:13px; font-weight:700; display:block; margin-bottom:4px;">
          Transaction ID / UTR (optional, from WhatsApp screenshot):
        </label>
        <input type="text" id="modal-txn-input" value="${esc(b.txn || "")}" placeholder="e.g. 331828192842" style="width:100%; padding:10px 14px; border:1px solid var(--line); border-radius:8px; font-size:14px; box-sizing:border-box;">
      </div>

      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px; margin:16px 0; font-size:13px; color:#14532d;">
        ✉️ Clicking confirm will update the Google Sheet status to <b>'Confirmed &amp; Verified'</b> and automatically email the official confirmation pass to <b>${esc(b.email)}</b>.
      </div>

      <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
        <button type="button" class="btn ghost" onclick="document.querySelector('#action-modal').classList.remove('active')">Cancel</button>
        <button type="button" class="btn" id="confirm-payment-btn" style="background:#16a34a;">
          ✓ Confirm &amp; Dispatch Email
        </button>
      </div>
    `);

    $("#confirm-payment-btn").onclick = async () => {
      const btn = $("#confirm-payment-btn");
      const txnVal = ($("#modal-txn-input").value || "").trim();
      btn.disabled = true;
      btn.textContent = "Dispatching confirmation email…";

      const adminNameTag = currentAdmin ? currentAdmin.name : "Admin";
      const adminEmailTag = currentAdmin ? currentAdmin.email : "admin@yuvatma.com";

      try {
        const res = await fetch(C.API_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "adminConfirmPayment",
            id: b.id,
            txnId: txnVal,
            passcode: adminKey,
            token: adminToken,
            adminName: adminNameTag,
            adminEmail: adminEmailTag
          })
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);

        // Update local object
        b.status = "Confirmed & Verified";
        b.txn = txnVal;
        b.verifiedBy = `${adminNameTag} (${adminEmailTag})`;
        b.verifiedAt = new Date().toISOString();

        closeModal();
        updateKpis();
        renderTable();
        showToast(`Booking ${b.id} marked Confirmed & Verified! Email sent to ${b.email}`);
      } catch (err) {
        alert("Error confirming payment: " + err.message);
        btn.disabled = false;
        btn.textContent = "✓ Confirm & Dispatch Email";
      }
    };
  }

  // 3. Modal: View Full Details
  function openDetailsModal(id) {
    const b = allBookings.find(x => x.id === id);
    if (!b) return;

    openModal(`
      <h2 style="color:var(--red); margin:0 0 16px; border-bottom:1px solid var(--line); padding-bottom:10px;">
        Booking Details: ${esc(b.id)}
      </h2>

      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">Status</div>
          <div class="detail-value"><b>${esc(b.status)}</b></div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Submission Date</div>
          <div class="detail-value">${b.timestamp ? formatDate(b.timestamp) : "-"}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Pilgrim Name</div>
          <div class="detail-value">${esc(b.name)} (${esc(b.age)} yrs &bull; ${esc(b.gender || "Youth")})</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">WhatsApp Mobile</div>
          <div class="detail-value"><a href="tel:${esc(b.mobile)}" style="color:#1e3a8a;">${esc(b.mobile)}</a></div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Email Address</div>
          <div class="detail-value">${esc(b.email)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Gotra</div>
          <div class="detail-value">${esc(b.gotra || "-")}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Matha</div>
          <div class="detail-value" style="color:var(--red); font-weight:700;">${esc(b.matha || "Not specified")}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Parent / Emergency Contact</div>
          <div class="detail-value">${esc(b.contact || "-")}</div>
        </div>
        <div class="detail-item" style="grid-column: span 2;">
          <div class="detail-label">Area &amp; City</div>
          <div class="detail-value">${esc((b.area ? b.area + ", " : "") + (b.city || b.addr || "-"))}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Total Seats &amp; Amount</div>
          <div class="detail-value">${esc(b.people)} Seat(s) &bull; ${inr(b.total)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Assigned Coordinator</div>
          <div class="detail-value" style="color:#1e40af; font-weight:600;">
            ${b.coordinatorName ? `${esc(b.coordinatorName)} (${esc(b.coordinatorPhone || "")})` : "Not assigned yet"}
          </div>
        </div>
        <div class="detail-item" style="grid-column: span 2;">
          <div class="detail-label">Transaction ID / UTR</div>
          <div class="detail-value" style="font-family:monospace;">${esc(b.txn || "(Not yet paid)")}</div>
        </div>
        <div class="detail-item" style="grid-column: span 2;">
          <div class="detail-label">Verified By Admin</div>
          <div class="detail-value" style="color:#15803d; font-weight:600;">
            ${b.verifiedBy ? `${esc(b.verifiedBy)} ${b.verifiedAt ? `(${formatDate(b.verifiedAt)})` : ""}` : "Not yet verified"}
          </div>
        </div>
        <div class="detail-item" style="grid-column: span 2;">
          <div class="detail-label">Primary Pilgrim ID Proof</div>
          <div class="detail-value">
            ${esc(b.idType)}: <b>${esc(b.idNumber)}</b>
            ${b.idDocUrl ? ` &bull; <a href="${esc(b.idDocUrl)}" target="_blank" rel="noopener" style="color:#2563eb; font-weight:bold;">Open File in Google Drive &rarr;</a>` : `<span style="color:#888;"> (No document uploaded)</span>`}
          </div>
        </div>
        ${b.q ? `
          <div class="detail-item" style="grid-column: span 2;">
            <div class="detail-label">Pilgrim Query</div>
            <div class="detail-value" style="font-style:italic;">"${esc(b.q)}"</div>
          </div>
        ` : ""}
      </div>

      ${b.members && b.members.length ? `
        <h4 style="margin:16px 0 8px; color:var(--ink);">Additional Group Members &amp; ID Proofs (${b.members.length}):</h4>
        <div style="background:#fff; border:1px solid var(--line); border-radius:8px; padding:12px; margin-bottom:12px;">
          ${b.members.map((m, idx) => `
            <div style="border-bottom:${idx === b.members.length - 1 ? 'none' : '1px solid #f2ece1'}; padding:8px 0;">
              <div style="font-weight:700; color:var(--ink);">${idx + 2}. ${esc(m.name)} <span style="font-weight:normal; font-size:13px; color:#666;">(${esc(m.age)} yrs &bull; ${esc(m.gender || "")} &bull; ${esc(m.role || "Member")})</span></div>
              ${m.mobile ? `<div style="font-size:12.5px; color:#555; margin-top:2px;">📞 ${esc(m.mobile)}</div>` : ""}
              ${(m.matha || m.gotra) ? `<div style="font-size:12.5px; color:#666; margin-top:2px;">Matha: <b>${esc(m.matha || "-")}</b> &bull; Gotra: <b>${esc(m.gotra || "-")}</b></div>` : ""}
              ${m.parent ? `<div style="font-size:12.5px; color:#555; margin-top:2px;">👨‍👩‍👧 Parent/Emergency: <b>${esc(m.parent)}</b></div>` : ""}
              <div style="font-size:12.5px; color:#444; margin-top:3px;">
                <b>ID:</b> ${esc(m.idType || "Aadhaar")} &bull; <code>${esc(m.idNumber || "Not entered")}</code>
                ${m.idDocUrl ? ` &bull; <a href="${esc(m.idDocUrl)}" target="_blank" rel="noopener" style="color:#2563eb; font-weight:700;">👁️ View Member ID Doc &rarr;</a>` : `<span style="color:#999; font-size:11.5px;"> (No document uploaded)</span>`}
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:24px; border-top:1px solid var(--line); padding-top:16px;">
        <a href="https://wa.me/91${String(b.mobile || '').replace(/\D/g, '')}?text=Namaskara%20${encodeURIComponent(b.name)}%20from%20Team%20YUVATMA" target="_blank" class="btn ghost" style="color:#15803d; border-color:#bbf7d0;">
          💬 Chat on WhatsApp
        </a>
        <button type="button" class="btn" onclick="document.querySelector('#action-modal').classList.remove('active')">
          Close
        </button>
      </div>
    `);
  }

  // 4. Modal: Manage Admin Team Members
  function openAdminsModal() {
    renderAdminsModalContent();
  }

  function renderAdminsModalContent() {
    const isOwnerOrWrite = currentAdmin && (currentAdmin.isSuperAdmin || currentAdmin.access === "write");

    const modalHtml = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid var(--line); padding-bottom:12px; margin-bottom:18px;">
        <div>
          <h2 style="color:var(--ink); margin:0;">👥 Admin Team Management</h2>
          <p style="font-size:13px; color:#666; margin:4px 0 0;">
            Grant access to team coordinators. When an admin approves an ID, they become the assigned coordinator and pilgrims send payment screenshots directly to their WhatsApp number.
          </p>
        </div>
      </div>

      <!-- Add Admin Card -->
      <div class="admin-team-card">
        <h3>+ Add or Update Admin Coordinator</h3>
        <form id="add-admin-form">
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:12px;">
            <div>
              <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px;">Full Name *</label>
              <input type="text" id="new-adm-name" placeholder="e.g. Vivek Jahagirdar" required style="width:100%; padding:9px 12px; border:1px solid var(--line); border-radius:6px; font-size:14px; box-sizing:border-box;">
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px;">Email Address *</label>
              <input type="email" id="new-adm-email" placeholder="e.g. vivek@gmail.com" required style="width:100%; padding:9px 12px; border:1px solid var(--line); border-radius:6px; font-size:14px; box-sizing:border-box;">
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px;">WhatsApp Mobile * (10 digits)</label>
              <input type="tel" id="new-adm-phone" placeholder="e.g. 9739755771" pattern="[6-9][0-9]{9}" required style="width:100%; padding:9px 12px; border:1px solid var(--line); border-radius:6px; font-size:14px; box-sizing:border-box;">
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px;">Password *</label>
              <input type="text" id="new-adm-password" placeholder="e.g. yuvatma2026" required minlength="4" style="width:100%; padding:9px 12px; border:1px solid var(--line); border-radius:6px; font-size:14px; box-sizing:border-box;">
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px;">Access Permission *</label>
              <select id="new-adm-access" style="width:100%; padding:9px 12px; border:1px solid var(--line); border-radius:6px; font-size:14px; box-sizing:border-box; background:#fff;">
                <option value="write">Write (Can Verify ID &amp; Payment)</option>
                <option value="read">Read (View-Only Registry)</option>
              </select>
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span id="add-adm-err" style="font-size:13px; color:var(--red);"></span>
            <button type="submit" class="btn" id="add-adm-btn" style="background:#b45309; padding:8px 18px; font-size:13.5px;">
              + Save Coordinator Access
            </button>
          </div>
        </form>
      </div>

      <!-- Current Admins Table -->
      <div style="margin-top:10px;">
        <h3 style="margin:0 0 10px; font-size:15px; color:var(--ink);">Active Coordinators &amp; Sub-Admins (${allAdmins.length})</h3>
        ${allAdmins.length === 0 ? `
          <div style="background:#fff; border:1px dashed #d9c9ae; padding:20px; border-radius:8px; text-align:center; color:#777; font-size:13.5px;">
            No sub-admins added yet. Add a coordinator above to give them individual login and ID verification access!
          </div>
        ` : `
          <div style="background:#fff; border:1px solid var(--line); border-radius:8px; overflow:hidden;">
            <table style="width:100%; border-collapse:collapse; font-size:13.5px; text-align:left;">
              <thead>
                <tr style="background:#fbf7ef; border-bottom:1px solid var(--line);">
                  <th style="padding:10px 12px;">Coordinator Name</th>
                  <th style="padding:10px 12px;">Email</th>
                  <th style="padding:10px 12px;">WhatsApp Mobile</th>
                  <th style="padding:10px 12px;">Access Level</th>
                  <th style="padding:10px 12px;">Added By</th>
                  <th style="padding:10px 12px; text-align:center;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${allAdmins.map(a => `
                  <tr style="border-bottom:1px solid #f2ece1;">
                    <td style="padding:10px 12px;"><b>${esc(a.name)}</b></td>
                    <td style="padding:10px 12px; color:#555;">${esc(a.email)}</td>
                    <td style="padding:10px 12px;">
                      ${a.phone ? `<a href="https://wa.me/91${esc(a.phone)}" target="_blank" style="color:#15803d; font-weight:600; text-decoration:none;">💬 ${esc(a.phone)}</a>` : `<span style="color:#999;">-</span>`}
                    </td>
                    <td style="padding:10px 12px;">
                      <span class="role-badge ${a.access === 'write' ? 'write' : 'read'}">
                        ${a.access === 'write' ? 'Write' : 'Read-Only'}
                      </span>
                    </td>
                    <td style="padding:10px 12px; color:#777; font-size:12px;">${esc(a.addedBy || "Owner")}</td>
                    <td style="padding:10px 12px; text-align:center; white-space:nowrap;">
                      <button type="button" class="btn-action" style="background:#eff6ff; color:#1e40af !important; border:1px solid #bfdbfe; padding:4px 8px; font-size:11px; margin-right:4px;" data-reset-email="${esc(a.email)}" data-reset-name="${esc(a.name)}">
                        🔑 Reset Pass
                      </button>
                      <button type="button" class="btn-action" style="background:#fee2e2; color:#b91c1c !important; border:1px solid #fca5a5; padding:4px 8px; font-size:11px;" data-revoke-email="${esc(a.email)}" data-revoke-name="${esc(a.name)}">
                        Revoke
                      </button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <div style="display:flex; justify-content:flex-end; margin-top:20px;">
        <button type="button" class="btn ghost" onclick="document.querySelector('#action-modal').classList.remove('active')">
          Done
        </button>
      </div>
    `;

    openModal(modalHtml, true);

    // Form submission inside modal
    const addForm = $("#add-admin-form");
    if (addForm) {
      addForm.onsubmit = async ev => {
        ev.preventDefault();
        const errEl = $("#add-adm-err");
        const btn = $("#add-adm-btn");
        if (errEl) errEl.textContent = "";

        const name = ($("#new-adm-name").value || "").trim();
        const email = ($("#new-adm-email").value || "").trim();
        const phone = ($("#new-adm-phone").value || "").replace(/\D/g, "");
        const password = ($("#new-adm-password").value || "").trim();
        const access = ($("#new-adm-access").value || "write").trim();

        if (!/^[6-9]\d{9}$/.test(phone)) {
          if (errEl) errEl.textContent = "Please enter a valid 10-digit Indian WhatsApp mobile number.";
          return;
        }

        if (btn) {
          btn.disabled = true;
          btn.textContent = "Saving to Google Sheet…";
        }

        try {
          const res = await fetch(C.API_URL, {
            method: "POST",
            body: JSON.stringify({
              action: "adminAddUser",
              name,
              email,
              phone,
              password,
              access,
              token: adminToken,
              passcode: adminKey
            })
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Failed to add admin.");

          showToast(`Admin coordinator access granted for ${name}!`);

          // Update local allAdmins
          const existingIdx = allAdmins.findIndex(x => x.email.toLowerCase() === email.toLowerCase());
          const newEntry = {
            name,
            email,
            phone,
            access,
            addedBy: currentAdmin ? currentAdmin.name : "Owner",
            status: "Active",
            timestamp: new Date().toISOString()
          };
          if (existingIdx > -1) {
            allAdmins[existingIdx] = newEntry;
          } else {
            allAdmins.push(newEntry);
          }

          renderAdminsModalContent();
        } catch (err) {
          if (errEl) errEl.textContent = err.message;
          if (btn) {
            btn.disabled = false;
            btn.textContent = "+ Save Admin Access";
          }
        }
      };
    }

    // Revoke access button listeners
    $$("[data-revoke-email]").forEach(rBtn => {
      rBtn.onclick = async () => {
        const emailToRevoke = rBtn.dataset.revokeEmail;
        const nameToRevoke = rBtn.dataset.revokeName;
        if (!confirm(`Are you sure you want to revoke admin access for ${nameToRevoke} (${emailToRevoke})?`)) return;

        rBtn.disabled = true;
        rBtn.textContent = "Revoking…";

        try {
          const res = await fetch(C.API_URL, {
            method: "POST",
            body: JSON.stringify({
              action: "adminDeleteUser",
              email: emailToRevoke,
              token: adminToken,
              passcode: adminKey
            })
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Failed to revoke access.");

          allAdmins = allAdmins.filter(x => x.email.toLowerCase() !== emailToRevoke.toLowerCase());
          showToast(`Access revoked for ${nameToRevoke}.`);
          renderAdminsModalContent();
        } catch (err) {
          alert("Error revoking access: " + err.message);
          rBtn.disabled = false;
          rBtn.textContent = "Revoke";
        }
      };
    });

    // Reset password button listeners
    $$("[data-reset-email]").forEach(rstBtn => {
      rstBtn.onclick = async () => {
        const email = rstBtn.dataset.resetEmail;
        const name = rstBtn.dataset.resetName;
        const newPass = prompt(`Enter new password for ${name} (${email}) - minimum 4 characters:`);
        if (!newPass || newPass.trim().length < 4) {
          if (newPass !== null) alert("Password must be at least 4 characters.");
          return;
        }

        rstBtn.disabled = true;
        rstBtn.textContent = "Resetting…";

        try {
          const res = await fetch(C.API_URL, {
            method: "POST",
            body: JSON.stringify({
              action: "adminResetUserPassword",
              email: email,
              newPassword: newPass.trim(),
              token: adminToken,
              passcode: adminKey
            })
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Failed to reset password.");
          showToast(`Password for ${name} reset successfully!`);
          renderAdminsModalContent();
        } catch (err) {
          alert("Error resetting password: " + err.message);
          rstBtn.disabled = false;
          rstBtn.textContent = "🔑 Reset Pass";
        }
      };
    });
  }

  if (manageAdminsBtn) {
    manageAdminsBtn.onclick = openAdminsModal;
  }

  // 5. Modal: Change Password (for Main Owner & Sub-Admins)
  function openChangePasswordModal() {
    if (!currentAdmin) return;
    const isOwner = currentAdmin.isSuperAdmin;

    openModal(`
      <div style="text-align:center;">
        <span style="font-size:2.8rem">🔑</span>
        <h2 style="color:var(--ink); margin:6px 0;">Change Admin Passcode</h2>
        <p style="font-size:13.5px; color:#666;">
          ${isOwner ? "Update the Main Owner master passcode. It will be stored privately in Google Script Properties and decoupled from website source code." : `Update password for <b>${esc(currentAdmin.name)}</b> (${esc(currentAdmin.email)})`}
        </p>
      </div>

      <form id="change-pass-form" style="margin-top:16px;">
        <div style="margin-bottom:14px;">
          <label style="font-size:12.5px; font-weight:700; display:block; margin-bottom:4px;">Current Passcode / Password *</label>
          <input type="password" id="change-cur-pass" placeholder="Enter current passcode" required style="width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; font-size:14px; box-sizing:border-box;">
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:12.5px; font-weight:700; display:block; margin-bottom:4px;">New Passcode / Password (min 4 chars) *</label>
          <input type="password" id="change-new-pass" placeholder="Enter new passcode" required minlength="4" style="width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; font-size:14px; box-sizing:border-box;">
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:12.5px; font-weight:700; display:block; margin-bottom:4px;">Confirm New Passcode *</label>
          <input type="password" id="change-conf-pass" placeholder="Re-type new passcode" required minlength="4" style="width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; font-size:14px; box-sizing:border-box;">
        </div>

        <p id="change-pass-err" style="color:var(--red); font-size:13.5px; margin:0 0 14px; min-height:18px;"></p>

        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button type="button" class="btn ghost" onclick="document.querySelector('#action-modal').classList.remove('active')">Cancel</button>
          <button type="submit" class="btn" id="change-pass-submit" style="background:#1e293b;">
            Update Passcode &rarr;
          </button>
        </div>
      </form>
    `);

    const form = $("#change-pass-form");
    if (form) {
      form.onsubmit = async ev => {
        ev.preventDefault();
        const curPass = ($("#change-cur-pass").value || "").trim();
        const newPass = ($("#change-new-pass").value || "").trim();
        const confPass = ($("#change-conf-pass").value || "").trim();
        const errEl = $("#change-pass-err");
        const submitBtn = $("#change-pass-submit");

        errEl.textContent = "";

        if (newPass.length < 4) {
          errEl.textContent = "New password must be at least 4 characters.";
          return;
        }

        if (newPass !== confPass) {
          errEl.textContent = "New passwords do not match. Please verify.";
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Updating passcode…";

        try {
          const res = await fetch(C.API_URL, {
            method: "POST",
            body: JSON.stringify({
              action: "adminChangePassword",
              currentPassword: curPass,
              newPassword: newPass,
              token: adminToken,
              passcode: adminKey
            })
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Failed to update passcode.");

          if (isOwner) {
            adminKey = newPass;
            sessionStorage.setItem(SESSION_KEY, adminKey);
          }

          closeModal();
          showToast(data.message || "Passcode updated successfully!");
        } catch (err) {
          errEl.textContent = err.message;
          submitBtn.disabled = false;
          submitBtn.textContent = "Update Passcode →";
        }
      };
    }
  }

  if (changePassBtn) {
    changePassBtn.onclick = openChangePasswordModal;
  }

  // Export to CSV
  if (exportBtn) {
    exportBtn.onclick = () => {
      if (allBookings.length === 0) {
        alert("No bookings available to export.");
        return;
      }

      const headers = [
        "Booking ID", "Timestamp", "Name", "Age", "Gender", "Mobile", "Email",
        "Area", "City", "Gotra", "Matha", "ID Type", "ID Number", "ID Document URL",
        "Parent / Emergency", "Seats", "Total Contribution", "Coordinator Name", "Coordinator Phone",
        "Transaction ID", "Status", "Verified By", "Verified At", "Queries"
      ];

      const csvRows = [headers.join(",")];
      allBookings.forEach(b => {
        const row = [
          `"${esc(b.id)}"`,
          `"${esc(b.timestamp || '')}"`,
          `"${esc(b.name)}"`,
          b.age || "",
          `"${esc(b.gender || '')}"`,
          `"${esc(b.mobile)}"`,
          `"${esc(b.email)}"`,
          `"${esc((b.area || '').replace(/"/g, '""'))}"`,
          `"${esc((b.city || '').replace(/"/g, '""'))}"`,
          `"${esc(b.gotra || '')}"`,
          `"${esc(b.matha || '')}"`,
          `"${esc(b.idType || '')}"`,
          `"${esc(b.idNumber || '')}"`,
          `"${esc(b.idDocUrl || '')}"`,
          `"${esc(b.contact || '')}"`,
          b.people || 1,
          b.total || (C.PRICE || 1750),
          `"${esc(b.coordinatorName || '')}"`,
          `"${esc(b.coordinatorPhone || '')}"`,
          `"${esc(b.txn || '')}"`,
          `"${esc(b.status || '')}"`,
          `"${esc(b.verifiedBy || '')}"`,
          `"${esc(b.verifiedAt || '')}"`,
          `"${esc((b.q || '').replace(/"/g, '""'))}"`
        ];
        csvRows.push(row.join(","));
      });

      const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `YUVATMA_2026_Bookings_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("CSV export downloaded successfully!");
    };
  }

  if (refreshBtn) {
    refreshBtn.onclick = () => {
      loadAdminData();
    };
  }

  // Initialize
  checkAuth();
})();

// YUVATMA Backend - Google Apps Script
// Paste into: Extensions > Apps Script of your Google Sheet.
// Deploy as: Deploy > Manage deployments > Edit > New version > Deploy. (Execute as: Me, Who has access: Anyone)

const PRICE = 1750;                                              // Confirmed contribution per person (₹)
const TOTAL_SEATS = 35;                                          // Total bus capacity
const SITE_URL = "https://yuvatmabookings.github.io/yuvatma/";  // Where site is hosted (keep trailing slash)
const REPLY_TO = "yuvatma.bookings@gmail.com";                  // Replies land here
const ID_FOLDER_NAME = "YUVATMA ID Proofs";                      // Google Drive folder for ID cards
const ADMIN_PASSCODE = "yuvatma2026admin";                      // Master admin passcode
const SESSION_DAYS = 7, CODE_MINUTES = 10;

const H = {
  B: [
    "Timestamp",
    "Booking ID",
    "People",
    "Total (₹)",
    "Name",
    "Age",
    "Gender",
    "Mobile",
    "Email",
    "Area",
    "City",
    "Gotra",
    "Matha",
    "ID Proof Type",
    "ID Proof Number",
    "ID Proof Document URL",
    "Parent / Emergency contact",
    "Payment Link",
    "Coordinator Name",
    "Coordinator Phone",
    "Transaction ID",
    "Queries",
    "Status",
    "Verified By",
    "Verified At",
    "Notes"
  ],
  A: ["Booking ID", "Role", "Name", "Age", "Gender", "Mobile", "Gotra", "Matha", "Parent / Contact", "ID Proof Type", "ID Proof Number", "ID Proof Document URL"],
  R: ["Time", "Booking ID", "Reply", "By"],
  S: ["Token hash", "Email", "Expires"],
  I: ["Timestamp", "Name", "Age", "Phone", "Gotra", "Matha"],     // Interested inquiries
  M: ["Timestamp", "Name", "Email", "Phone", "Password Hash", "Access Type", "Added By", "Status"] // Admin Team Members
};

// Handle GET requests
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action ? e.parameter.action : "seats";
    if (action === "seats" || action === "stats") {
      return getStats();
    }
    if (action === "payInfo") {
      return getPayInfo(e.parameter.id);
    }
    if (action === "adminList") {
      return adminList({
        passcode: e.parameter.passcode || e.parameter.key,
        token: e.parameter.token
      });
    }
    if (action === "interestedCount") {
      const I = tab("Interested", H.I);
      return out({ ok: true, count: Math.max(0, I.getLastRow() - 1) });
    }
    return out({ ok: true, message: "YUVATMA API is active.", stats: computeSeatStats() });
  } catch (err) {
    return out({ ok: false, error: err.toString() });
  }
}

// Handle POST requests
function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (x) {
    return out({ ok: false, error: "Bad request format." });
  }

  try {
    switch (d.action || "book") {
      case "book": return book(d);
      case "payInfo": return getPayInfo(d.id);
      case "interested": return recordInterested(d);
      case "seats":
      case "stats": return getStats();
      case "sendCode": return sendCode(d);
      case "verifyCode": return verifyCode(d);
      case "mine": return mine(d);
      case "logout": return logout(d);
      // Multi-Admin Authentication & Management
      case "adminLogin": return adminLogin(d);
      case "adminList": return adminList(d);
      case "adminAddUser": return adminAddUser(d);
      case "adminDeleteUser": return adminDeleteUser(d);
      case "adminChangePassword": return adminChangePassword(d);
      case "adminResetUserPassword": return adminResetUserPassword(d);
      case "adminApproveId": return adminApproveId(d);
      case "adminConfirmPayment": return adminConfirmPayment(d);
      case "adminUpdateStatus": return adminUpdateStatus(d);
    }
    return out({ ok: false, error: "Unknown action." });
  } catch (x) {
    return out({ ok: false, error: "Something went wrong on our side. Please try again: " + x.message });
  }
}

// ---------- Admin Session & Permission Helpers ----------
function getMasterAdminPasscode() {
  const p = PropertiesService.getScriptProperties().getProperty("admin_passcode");
  return p ? p.trim() : ADMIN_PASSCODE;
}

function checkAdminPass(pass) {
  const expected = getMasterAdminPasscode();
  return String(pass || "").trim() === expected;
}

function getAdminFromSession(token, key) {
  if (key && checkAdminPass(key)) {
    const mainPhone = PropertiesService.getScriptProperties().getProperty("admin_phone") || "9739755771";
    return { name: "Main Admin (Owner)", email: "admin@yuvatma.com", phone: mainPhone, access: "write", isSuperAdmin: true };
  }
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const raw = cache.get("adm:" + token);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) {}
  }
  return null;
}

function saveAdminSession(token, admin) {
  const cache = CacheService.getScriptCache();
  cache.put("adm:" + token, JSON.stringify(admin), 7 * 86400); // 7 days
}

// Admin Login supporting Master Passcode or Individual Admin Email & Password
function adminLogin(d) {
  const pass = String(d.password || d.passcode || "").trim();
  const emailInput = clean(d.email);

  // 1. Check Master Admin Passcode (Owner / Super Admin)
  if (checkAdminPass(pass) || (emailInput === "admin" && checkAdminPass(pass)) || (checkAdminPass(emailInput) && !pass)) {
    const mainPhone = PropertiesService.getScriptProperties().getProperty("admin_phone") || "9739755771";
    const superAdmin = {
      name: "Main Admin (Owner)",
      email: emailInput && emailInput.includes("@") ? emailInput : "admin@yuvatma.com",
      phone: mainPhone,
      access: "write",
      isSuperAdmin: true
    };
    const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
    saveAdminSession(token, superAdmin);
    return out({ ok: true, admin: superAdmin, token: token });
  }

  // 2. Check Sub-Admins in "Admins" sheet
  if (!emailInput || !pass) {
    return out({ ok: false, error: "Please enter your Admin Email and Password." });
  }

  const M = tab("Admins", H.M);
  const lastRow = M.getLastRow();
  if (lastRow > 1) {
    const rows = M.getRange(2, 1, lastRow - 1, H.M.length).getValues();
    const passHash = hash(pass);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      // H.M: ["Timestamp", "Name", "Email", "Phone", "Password Hash", "Access Type", "Added By", "Status"]
      if (clean(r[2]) === emailInput && String(r[7] || "").toLowerCase() !== "disabled") {
        if (r[4] === passHash) {
          const adminObj = {
            name: r[1],
            email: r[2],
            phone: r[3] || "",
            access: String(r[5] || "read").toLowerCase() === "write" ? "write" : "read",
            isSuperAdmin: false
          };
          const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
          saveAdminSession(token, adminObj);
          return out({ ok: true, admin: adminObj, token: token });
        } else {
          return out({ ok: false, error: "Incorrect password for admin account." });
        }
      }
    }
  }

  return out({ ok: false, error: "Admin account not found. Ask the Main Admin to grant you access." });
}

function listAdmins() {
  const M = tab("Admins", H.M);
  const lastRow = M.getLastRow();
  if (lastRow <= 1) return [];
  const rows = M.getRange(2, 1, lastRow - 1, H.M.length).getValues();
  return rows.filter(function(r) { return String(r[7] || "").toLowerCase() !== "disabled"; }).map(function(r) {
    return {
      timestamp: r[0],
      name: r[1],
      email: r[2],
      phone: r[3] || "",
      access: String(r[5] || "read").toLowerCase(),
      addedBy: r[6] || "",
      status: r[7] || "Active"
    };
  });
}

// Main Admin creates/grants access to a new admin
function adminAddUser(d) {
  const currentAdmin = getAdminFromSession(d.token, d.passcode || d.key);
  if (!currentAdmin) return out({ ok: false, error: "Unauthorized. Please log in as Main Admin." });
  if (!currentAdmin.isSuperAdmin && currentAdmin.access !== "write") {
    return out({ ok: false, error: "Permission denied: Only Main Admin can manage admin team members." });
  }

  const name = String(d.name || "").trim();
  const email = clean(d.email);
  const phone = String(d.phone || "").replace(/\D/g, "");
  const password = String(d.password || "").trim();
  const access = (String(d.access || "").toLowerCase() === "write") ? "write" : "read";

  if (!name || name.length < 2) return out({ ok: false, error: "Please enter a valid Admin Name." });
  if (!email || !email.includes("@")) return out({ ok: false, error: "Please enter a valid Admin Email address." });
  if (!phone || phone.length < 10) return out({ ok: false, error: "Please enter a valid 10-digit WhatsApp Phone number for the coordinator." });
  if (!password || password.length < 4) return out({ ok: false, error: "Password must be at least 4 characters long." });

  const M = tab("Admins", H.M);
  const passHash = hash(password);
  const lastRow = M.getLastRow();

  if (lastRow > 1) {
    const rows = M.getRange(2, 1, lastRow - 1, H.M.length).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (clean(rows[i][2]) === email) {
        // Update existing admin row
        const rowIndex = i + 2;
        M.getRange(rowIndex, 2).setValue(name);
        M.getRange(rowIndex, 4).setValue(phone);
        M.getRange(rowIndex, 5).setValue(passHash);
        M.getRange(rowIndex, 6).setValue(access);
        M.getRange(rowIndex, 7).setValue(currentAdmin.name);
        M.getRange(rowIndex, 8).setValue("Active");
        return out({ ok: true, message: "Admin credentials & " + access + " access updated for " + name });
      }
    }
  }

  // Add new admin row
  // H.M: ["Timestamp", "Name", "Email", "Phone", "Password Hash", "Access Type", "Added By", "Status"]
  M.appendRow([new Date(), name, email, phone, passHash, access, currentAdmin.name, "Active"].map(safe));
  return out({ ok: true, message: "Admin " + name + " (" + access + " access, WhatsApp: " + phone + ") added successfully!" });
}

function adminDeleteUser(d) {
  const currentAdmin = getAdminFromSession(d.token, d.passcode || d.key);
  if (!currentAdmin || (!currentAdmin.isSuperAdmin && currentAdmin.access !== "write")) {
    return out({ ok: false, error: "Permission denied: Only Main Admin can revoke admin access." });
  }

  const email = clean(d.email);
  const M = tab("Admins", H.M);
  const lastRow = M.getLastRow();
  if (lastRow > 1) {
    const rows = M.getRange(2, 1, lastRow - 1, H.M.length).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (clean(rows[i][2]) === email) {
        M.getRange(i + 2, 8).setValue("Disabled");
        return out({ ok: true, message: "Admin access revoked for " + email });
      }
    }
  }
  return out({ ok: false, error: "Admin email not found." });
}

// Option to change password for Main Owner and Admin Users
function adminChangePassword(d) {
  const currentAdmin = getAdminFromSession(d.token, d.passcode || d.key);
  if (!currentAdmin) return out({ ok: false, error: "Unauthorized. Please log in first." });

  const currentPass = String(d.currentPassword || "").trim();
  const newPass = String(d.newPassword || "").trim();

  if (!newPass || newPass.length < 4) {
    return out({ ok: false, error: "New password must be at least 4 characters long." });
  }

  // 1. Changing Main Owner password
  if (currentAdmin.isSuperAdmin) {
    const actualMaster = getMasterAdminPasscode();
    if (currentPass && currentPass !== actualMaster) {
      return out({ ok: false, error: "Current master passcode is incorrect." });
    }
    PropertiesService.getScriptProperties().setProperty("admin_passcode", newPass);
    return out({
      ok: true,
      message: "Main Owner passcode updated successfully! It is now stored in private Script Properties and decoupled from source code."
    });
  }

  // 2. Sub-Admin changing their own password
  const M = tab("Admins", H.M);
  const lastRow = M.getLastRow();
  if (lastRow <= 1) return out({ ok: false, error: "Admin account not found in sheet." });

  const rows = M.getRange(2, 1, lastRow - 1, H.M.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (clean(rows[i][2]) === clean(currentAdmin.email)) {
      if (currentPass && hash(currentPass) !== rows[i][4]) {
        return out({ ok: false, error: "Current password is incorrect." });
      }
      M.getRange(i + 2, 5).setValue(hash(newPass));
      return out({ ok: true, message: "Your admin password has been changed successfully!" });
    }
  }
  return out({ ok: false, error: "Admin account not found." });
}

// Main Owner resets any sub-admin's password
function adminResetUserPassword(d) {
  const currentAdmin = getAdminFromSession(d.token, d.passcode || d.key);
  if (!currentAdmin || !currentAdmin.isSuperAdmin) {
    return out({ ok: false, error: "Permission denied: Only Main Owner can reset another admin's password." });
  }

  const targetEmail = clean(d.email);
  const newPass = String(d.newPassword || "").trim();
  if (!newPass || newPass.length < 4) {
    return out({ ok: false, error: "New password must be at least 4 characters long." });
  }

  const M = tab("Admins", H.M);
  const lastRow = M.getLastRow();
  if (lastRow <= 1) return out({ ok: false, error: "Admin not found." });

  const rows = M.getRange(2, 1, lastRow - 1, H.M.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (clean(rows[i][2]) === targetEmail) {
      M.getRange(i + 2, 5).setValue(hash(newPass));
      return out({ ok: true, message: "Password reset successfully for " + rows[i][1] + " (" + targetEmail + ")" });
    }
  }
  return out({ ok: false, error: "Admin email not found in sheet." });
}

// ---------- Record Interested Person (WhatsApp Group Redirect) ----------
function recordInterested(d) {
  if (!d.name || !d.age || !d.phone || !d.gotra) {
    return out({ ok: false, error: "Please fill Name, Age, Phone, and Gotra." });
  }
  const age = Number(d.age);
  if (isNaN(age) || age < 18 || age > 30) {
    return out({ ok: false, error: "Age limit is 18–30 years for Madhwa youths." });
  }
  const cleanPhone = String(d.phone).replace(/\D/g, "");
  if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
    return out({ ok: false, error: "Please enter a valid 10-digit phone number." });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const I = tab("Interested", H.I);
    I.appendRow([new Date(), d.name.trim(), age, cleanPhone, d.gotra.trim(), (d.matha || "").trim()].map(safe));
    const totalInterested = Math.max(0, I.getLastRow() - 1);
    return out({ ok: true, count: totalInterested });
  } finally {
    lock.releaseLock();
  }
}

// ---------- Live Seat Calculations ----------
function computeSeatStats() {
  const B = tab("Bookings", H.B);
  let totalBooked = 0;
  let confirmedBooked = 0;
  let idPendingCount = 0;
  let paymentPendingCount = 0;

  const lastRow = B.getLastRow();
  if (lastRow > 1) {
    const values = B.getRange(2, 1, lastRow - 1, H.B.length).getValues();
    for (let i = 0; i < values.length; i++) {
      const r = values[i];
      const n = Number(r[2]);
      const status = String(r[22] || "");
      if (!isNaN(n) && n > 0 && status !== "Cancelled" && status !== "Rejected") {
        totalBooked += n;
        if (status === "Confirmed & Verified" || status === "Verified") {
          confirmedBooked += n;
        } else if (status.indexOf("ID Verification Pending") > -1) {
          idPendingCount += n;
        } else if (status.indexOf("Payment Pending") > -1) {
          paymentPendingCount += n;
        }
      }
    }
  }
  const seatsLeft = Math.max(0, TOTAL_SEATS - totalBooked);
  return {
    totalSeats: TOTAL_SEATS,
    bookedSeats: totalBooked,
    confirmedSeats: confirmedBooked,
    idPendingSeats: idPendingCount,
    paymentPendingSeats: paymentPendingCount,
    seatsLeft: seatsLeft
  };
}

function getStats() {
  const stats = computeSeatStats();
  return out({
    ok: true,
    totalSeats: stats.totalSeats,
    bookedSeats: stats.bookedSeats,
    confirmedSeats: stats.confirmedSeats,
    idPendingSeats: stats.idPendingSeats,
    paymentPendingSeats: stats.paymentPendingSeats,
    seatsLeft: stats.seatsLeft
  });
}

// ---------- Payment Info Lookup for pay.html ----------
function getPayInfo(id) {
  if (!id) return out({ ok: false, error: "Missing Booking ID." });
  const cleanId = String(id).trim().toUpperCase();
  const B = tab("Bookings", H.B);
  const lastRow = B.getLastRow();
  if (lastRow > 1) {
    const rows = B.getRange(2, 1, lastRow - 1, H.B.length).getValues();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (String(r[1]).trim().toUpperCase() === cleanId) {
        return out({
          ok: true,
          booking: {
            id: r[1],
            people: Number(r[2]) || 1,
            total: Number(r[3]) || PRICE,
            name: r[4] || "Pilgrim",
            age: r[5],
            gender: r[6] || "",
            mobile: r[7],
            email: r[8],
            area: r[9] || "",
            city: r[10] || "",
            addr: (r[9] ? r[9] + ", " : "") + (r[10] || ""),
            gotra: r[11] || "",
            matha: r[12] || "",
            idType: r[13] || "Aadhaar",
            idNumber: r[14] || "",
            idDocUrl: r[15] || "",
            contact: r[16],
            payLink: r[17] || "",
            coordinatorName: r[18] || "",
            coordinatorPhone: r[19] || "",
            txn: r[20] || "",
            status: r[22] || "ID Verification Pending"
          }
        });
      }
    }
  }
  return out({ ok: false, error: "Booking ID " + cleanId + " was not found in registry." });
}

// ---------- 1. Register Booking (Zero upfront payment, Collects Matha & ID proof) ----------
function book(d) {
  if (d.hp) return out({ ok: true, id: "YUV-0000" }); // honeypot
  const bad = validate(d);
  if (bad) return out({ ok: false, error: bad });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Check seat availability
    const stats = computeSeatStats();
    if (stats.seatsLeft <= 0) {
      return out({ ok: false, error: "Sorry, all 35 seats are already booked! Please contact us on WhatsApp (+91 9739755771) to join the waiting list." });
    }
    if (stats.seatsLeft < d.n) {
      return out({ ok: false, error: "Only " + stats.seatsLeft + " seat(s) remaining. Cannot book for " + d.n + " people. Please reduce group size or contact us on WhatsApp." });
    }

    const B = tab("Bookings", H.B), A = tab("Attendees", H.A);
    const props = PropertiesService.getScriptProperties();
    const num = Number(props.getProperty("n") || 0) + 1;
    props.setProperty("n", String(num));
    const id = "YUV-" + String(num).padStart(4, "0");

    const p = d.p;
    const unitPrice = Number(d.price) || (d.total ? Math.round(Number(d.total) / d.n) : null) || PRICE;
    const total = Number(d.total) || (d.n * unitPrice);

    p.email = clean(p.email);
    const matha = (d.matha || p.matha || "").trim();
    const contact = Number(p.age) < 25 ? "Parent: " + (p.parent || "") : "Emergency: " + (p.ecName || "") + " (" + (p.ecNum || "") + ")";

    // Upload Valid ID Proof image for Primary Pilgrim to Google Drive folder
    let idProofUrl = "";
    if (d.idProof) {
      try {
        const idTypeClean = String(d.idType || "ID").replace(/[^a-zA-Z0-9]/g, "");
        const fileName = id + "_Primary_" + idTypeClean + ".jpg";
        const blob = Utilities.newBlob(Utilities.base64Decode(d.idProof), "image/jpeg", fileName);
        const driveFile = idFolder().createFile(blob);
        idProofUrl = driveFile.getUrl();
      } catch (err) {
        Logger.log("Primary ID file upload notice: " + err.message);
      }
    }

    // Direct Payment link generated for pilgrim
    const payLink = SITE_URL + "pay.html?id=" + id;
    const initialStatus = "ID Verification Pending";

    // Row layout matching H.B
    B.appendRow([
      new Date(),                     // 0: Timestamp
      id,                             // 1: Booking ID
      d.n,                            // 2: People
      total,                          // 3: Total (₹)
      p.name,                         // 4: Name
      p.age,                          // 5: Age
      p.gender || "",                 // 6: Gender
      p.mobile,                       // 7: Mobile
      p.email,                        // 8: Email
      p.area || "",                   // 9: Area
      p.city || "",                   // 10: City
      p.gotra || "",                  // 11: Gotra
      matha,                          // 12: Matha
      d.idType || "Aadhaar",          // 13: ID Proof Type
      d.idNumber || "",               // 14: ID Proof Number
      idProofUrl,                     // 15: ID Proof Document URL
      contact,                        // 16: Parent / Emergency contact
      payLink,                        // 17: Payment Link
      "",                             // 18: Coordinator Name (assigned on ID approval)
      "",                             // 19: Coordinator Phone (assigned on ID approval)
      "",                             // 20: Transaction ID
      d.q || "",                      // 21: Queries
      initialStatus,                  // 22: Status
      "",                             // 23: Verified By
      "",                             // 24: Verified At
      ""                              // 25: Notes
    ].map(safe));

    // Primary attendee in Attendees sheet
    // H.A: ["Booking ID", "Role", "Name", "Age", "Gender", "Mobile", "Gotra", "Matha", "Parent / Contact", "ID Proof Type", "ID Proof Number", "ID Proof Document URL"]
    A.appendRow([
      id,
      "Primary",
      p.name,
      p.age,
      p.gender || "",
      p.mobile,
      p.gotra || "",
      matha,
      contact,
      d.idType || "Aadhaar",
      d.idNumber || "",
      idProofUrl
    ].map(safe));

    // Additional members with individual ID uploads
    if (d.members && d.members.length) {
      d.members.forEach(function (m, i) {
        let memberDocUrl = "";
        if (m.idProof) {
          try {
            const mIdTypeClean = String(m.idType || "ID").replace(/[^a-zA-Z0-9]/g, "");
            const mFileName = id + "_Member" + (i + 2) + "_" + mIdTypeClean + ".jpg";
            const mBlob = Utilities.newBlob(Utilities.base64Decode(m.idProof), "image/jpeg", mFileName);
            const mDriveFile = idFolder().createFile(mBlob);
            memberDocUrl = mDriveFile.getUrl();
          } catch (mErr) {
            Logger.log("Member ID upload notice: " + mErr.message);
          }
        }

        A.appendRow([
          id,
          "Member " + (i + 2),
          m.name,
          m.age,
          m.gender || "",
          m.mobile || "",
          m.gotra || "",
          m.matha || "",
          m.parent || "",
          m.idType || "Aadhaar",
          m.idNumber || "",
          memberDocUrl
        ].map(safe));
      });
    }

    // Send immediate confirmation email: Registration Received & ID Verification in Progress
    try {
      confirmRegistrationMail(p, id, d.n, total, d.idType || "Aadhaar", d.idNumber || "", matha);
    } catch (x) {
      Logger.log("Email dispatch notice: " + x.message);
    }

    const updatedStats = computeSeatStats();
    return out({ ok: true, id: id, seatsLeft: updatedStats.seatsLeft });
  } finally {
    lock.releaseLock();
  }
}

function validate(d) {
  if (!d || !(d.n >= 1 && d.n <= 4)) return "Invalid group size.";
  if (!d.p || !d.p.name || !/^\S+@\S+\.\S+$/.test(d.p.email || "")) return "Missing your name or a valid email.";
  const age = Number(d.p.age);
  if (isNaN(age) || age < 18 || age > 30) return "Eligibility: Exclusively for Madhwa youth of age 18–30.";
  if (!d.p.gender) return "Please select gender for accommodation arrangements.";
  if (!d.p.city) return "Please enter your City.";
  if (!d.p.matha && !d.matha) return "Please enter your Matha (e.g. Uttaradimath, Rayara Math, etc.).";
  if (!d.idNumber || String(d.idNumber).trim().length < 3) return "Valid identification proof number (Aadhaar / Driving License / Voter ID) is required.";
  if (d.members && d.members.length !== d.n - 1) return "Group member details don't match group size.";
  if (d.members && d.members.length > 0) {
    for (let i = 0; i < d.members.length; i++) {
      const m = d.members[i];
      if (!m.name || !m.age) return "Please provide details for Person " + (i + 2);
      const mAge = Number(m.age);
      if (isNaN(mAge) || mAge < 18 || mAge > 30) return "Age limit for Person " + (i + 2) + " is 18–30 (Madhwa youth).";
      if (!m.gender) return "Please select gender for Person " + (i + 2);
      if (!m.mobile) return "Please enter mobile number for Person " + (i + 2);
      if (!m.gotra) return "Please enter Gotra for Person " + (i + 2);
      if (!m.matha) return "Please enter Matha for Person " + (i + 2);
      if (!m.parent) return "Please enter parent / emergency contact for Person " + (i + 2);
      if (!m.idNumber || String(m.idNumber).trim().length < 3) return "Valid identification proof number is required for Person " + (i + 2);
    }
  }
  return "";
}

// Initial Email sent upon registration submission
function confirmRegistrationMail(p, id, n, total, idType, idNumber, matha) {
  const subject = "YUVATMA 2026: Registration Received - ID Verification Pending (" + id + ")";
  const location = (p.area ? p.area + ", " : "") + (p.city || "");
  
  const plainBody =
    "Namaskara " + p.name + ",\n\n" +
    "We have successfully received your registration submission for YUVATMA 2026 | Yalagur | GoSeva - 3.0 (November 28–29, 2026).\n\n" +
    "REGISTRATION SUMMARY:\n" +
    "- Booking ID: " + id + "\n" +
    "- Pilgrim: " + p.name + " (" + (p.gender || "") + ")\n" +
    (location ? "- Location: " + location + "\n" : "") +
    "- Matha: " + (matha || "-") + "\n" +
    "- Seats Requested: " + n + " (" + (n > 1 ? n + " People" : "1 Person") + ")\n" +
    "- Total Contribution: ₹" + total + " (Food + Accommodation + Transport)\n" +
    "- Valid ID Proof: " + idType + " (" + idNumber + ")\n" +
    "- Current Status: ID Verification in Progress\n\n" +
    "ZERO UPFRONT PAYMENT:\n" +
    "We collect your registration details and valid ID proof first. Our team is manually verifying your ID proof.\n\n" +
    "WHAT HAPPENS NEXT?\n" +
    "1. Once your ID is verified by our team, an assigned coordinator will send your Official Payment Link to your email and WhatsApp.\n" +
    "2. Open the link to pay via PhonePe / any UPI app and send your payment screenshot directly to that coordinator on WhatsApp.\n" +
    "3. Once verified, your booking will be officially marked Confirmed & Verified!\n\n" +
    "IMPORTANT NOTE REGARDING EMAIL INBOX:\n" +
    "If this email landed in your Spam or Promotions folder, please mark it as 'Not Spam' or move it to your Primary Inbox so our coordinator's payment link reaches you immediately.\n\n" +
    "Key Trip Highlights:\n" +
    "- Accommodation: Separate for boys & girls\n" +
    "- Cow Product Workshop: Hands-on Panchagavya & cow products making\n" +
    "- Transferable: Bookings are transferable with prior notice\n\n" +
    "My Booking Portal: " + SITE_URL + "my-booking.html\n\n" +
    "Warm regards,\n" +
    "Team YUVATMA (Yalagur GoSeva 3.0)\n" +
    "Contact: +91 9739755771, +91 9113693518 | yuvatma.bookings@gmail.com";

  const htmlBody =
    "<div style='font-family:sans-serif;color:#2b120c;max-width:600px;line-height:1.6;margin:0 auto;padding:16px;'>" +
    "<div style='background:#9e1b1f;color:#ffffff;padding:16px 20px;border-radius:10px 10px 0 0;text-align:center;'>" +
    "<h1 style='margin:0;font-size:22px;letter-spacing:1px;'>YUVATMA 2026 | GoSeva - 3.0</h1>" +
    "<p style='margin:4px 0 0;font-size:13px;opacity:0.9;'>Sri Kshetra Yalagur Yatra • Nov 28–29, 2026</p>" +
    "</div>" +
    "<div style='border:1px solid #d9c9ae;border-top:none;border-radius:0 0 10px 10px;padding:24px;background:#ffffff;'>" +
    "<p style='font-size:18px;margin-top:0;'><b>ನಮಸ್ಕಾರ " + esc(p.name) + " 🙏</b></p>" +
    "<p>We have successfully received your registration submission for <b>YUVATMA 2026 | Yalagur | GoSeva - 3.0</b> exclusively for young Madhwa youths of age 18–30.</p>" +
    "<div style='background:#fef4e2;border:1px solid #d9c9ae;border-radius:10px;padding:16px;margin:16px 0;'>" +
    "<table style='width:100%;border-collapse:collapse;font-size:14.5px;'>" +
    "<tr><td style='padding:5px 0;'><b>Booking ID:</b></td><td style='color:#9e1b1f;font-weight:bold;font-size:16px;font-family:monospace;'>" + id + "</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Pilgrim Name:</b></td><td>" + esc(p.name) + " (" + esc(p.gender || "") + ")</td></tr>" +
    (location ? "<tr><td style='padding:5px 0;'><b>Location:</b></td><td>" + esc(location) + "</td></tr>" : "") +
    "<tr><td style='padding:5px 0;'><b>Matha:</b></td><td>" + esc(matha || "-") + "</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Seats Requested:</b></td><td>" + n + " (" + (n > 1 ? n + " People" : "1 Person") + ")</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Total Contribution:</b></td><td style='font-weight:bold;color:#9e1b1f;'>₹" + total + " <span style='font-size:12px;color:#666;'>(Food + Stay + Travel)</span></td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Valid ID Proof:</b></td><td>" + esc(idType) + " (" + esc(idNumber) + ")</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Status:</b></td><td style='color:#b45309;font-weight:bold;'>🛡️ ID Verification in Progress</td></tr>" +
    "</table>" +
    "</div>" +
    "<p><b>Zero Upfront Payment:</b><br>" +
    "We collect your registration details and valid ID proof first. Our team is manually verifying your ID proof to confirm eligibility." +
    "</p>" +
    "<p><b>What happens next?</b><br>" +
    "1. Once your ID is verified by our admin team, an assigned coordinator will send your <b>Official Payment Link</b> to this email and your WhatsApp number.<br>" +
    "2. You will open the link to pay via <b>PhonePe or any UPI app</b>, and send the payment screenshot directly to that coordinator's WhatsApp.<br>" +
    "3. Once the coordinator verifies your screenshot, your booking will be officially marked as <b>Confirmed &amp; Verified</b>!" +
    "</p>" +
    "<div style='background:#fdfaf5;border:1px dashed #d9c9ae;border-radius:10px;padding:12px;margin:16px 0;font-size:13.5px;'>" +
    "<b>Key Trip Highlights:</b>" +
    "<ul style='margin:6px 0 0 16px;padding:0;line-height:1.6;'>" +
    "<li><b>Accommodation:</b> Arranged <b>separately for boys and girls</b>.</li>" +
    "<li><b>Cow Product Making Workshop:</b> Practical hands-on training on crafting sacred Panchagavya and natural cow products.</li>" +
    "<li><b>Transferability:</b> Bookings are transferable to another eligible Madhwa youth (18–30 yrs) with prior notice.</li>" +
    "</ul>" +
    "</div>" +
    "<div style='background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:8px;padding:12px;margin:18px 0;font-size:13px;color:#92400e;line-height:1.5;'>" +
    "📬 <b>Important Notice:</b> If this email arrived in your <b>Spam or Promotions</b> folder, please tap <b>'Report not spam'</b> or move it to your <b>Primary inbox</b> so our coordinator's payment link reaches you immediately." +
    "</div>" +
    "<p>You can check your status anytime on our website: <a href='" + SITE_URL + "my-booking.html' style='color:#9e1b1f;font-weight:bold;'>My Booking Portal</a>.</p>" +
    "<p style='margin-top:24px;border-top:1px solid #f0e6d6;padding-top:16px;'>Warm regards,<br><b>Team YUVATMA ❤️</b><br>Sri Kshetra Yalagur Yatra 2026<br><span style='font-size:12px;color:#888;'>Helpline: +91 9739755771, +91 9113693518</span></p>" +
    "</div>" +
    "</div>";

  MailApp.sendEmail({
    to: p.email,
    replyTo: REPLY_TO,
    name: "Team YUVATMA - Yalagur Yatra",
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody
  });
}

// Dispatches Payment Link Email when ID is approved
function sendPaymentLinkEmail(email, name, id, people, total, idType, payLink, coordName, coordPhone) {
  const coordinatorName = coordName || "Vivek Jahagirdar";
  const coordinatorPhone = String(coordPhone || "9739755771").replace(/\D/g, "") || "9739755771";
  const subject = "YUVATMA 2026: ID Verified! Complete Your Payment for " + id;
  const waLink = "https://wa.me/91" + coordinatorPhone + "?text=" + encodeURIComponent("Namaskara " + coordinatorName + ", I have completed the payment for YUVATMA Booking " + id + ". Attaching payment screenshot.");

  const plainBody =
    "Namaskara " + name + ",\n\n" +
    "Great news! Your valid ID proof (" + idType + ") has been reviewed and verified by Team YUVATMA for Booking ID: " + id + ".\n\n" +
    "PAYMENT DETAILS:\n" +
    "- Booking ID: " + id + "\n" +
    "- Pilgrim: " + name + "\n" +
    "- Seats Reserved: " + people + " (" + (people > 1 ? people + " People" : "1 Person") + ")\n" +
    "- Total Contribution: ₹" + total + " (Food + Accommodation + Transport)\n" +
    "- Assigned Coordinator: " + coordinatorName + " (+91 " + coordinatorPhone + ")\n" +
    "- Payment Portal Link: " + payLink + "\n\n" +
    "HOW TO PAY (2 Simple Steps):\n" +
    "1. Open the payment link on your phone: " + payLink + "\n" +
    "2. Pay via PhonePe or any UPI app, and send the payment screenshot directly on WhatsApp to your coordinator " + coordinatorName + " (+91 " + coordinatorPhone + ").\n\n" +
    "WhatsApp Link: " + waLink + "\n\n" +
    "Once verified, your booking will be officially marked Confirmed & Verified!\n\n" +
    "Note: If this email landed in your Spam/Promotions folder, please mark it as 'Not Spam' to receive your booking confirmation.\n\n" +
    "Team YUVATMA\n" +
    "Sri Kshetra Yalagur Yatra 2026";

  const htmlBody =
    "<div style='font-family:sans-serif;color:#2b120c;max-width:600px;line-height:1.6;margin:0 auto;padding:16px;'>" +
    "<div style='background:#5f259f;color:#ffffff;padding:16px 20px;border-radius:10px 10px 0 0;text-align:center;'>" +
    "<h1 style='margin:0;font-size:22px;letter-spacing:1px;'>YUVATMA 2026 | ID Verified</h1>" +
    "<p style='margin:4px 0 0;font-size:13px;opacity:0.9;'>Payment Portal • Sri Kshetra Yalagur</p>" +
    "</div>" +
    "<div style='border:1px solid #d9c9ae;border-top:none;border-radius:0 0 10px 10px;padding:24px;background:#ffffff;'>" +
    "<p style='font-size:18px;margin-top:0;'><b>ನಮಸ್ಕಾರ " + esc(name) + " 🙏</b></p>" +
    "<p>Great news! Your valid ID proof (<b>" + esc(idType) + "</b>) has been reviewed and <b>verified</b> by Team YUVATMA for Booking ID: <b>" + id + "</b>.</p>" +
    "<div style='background:#fef4e2;border:1px solid #d9c9ae;border-radius:10px;padding:16px;margin:16px 0;'>" +
    "<table style='width:100%;border-collapse:collapse;font-size:14.5px;'>" +
    "<tr><td style='padding:5px 0;'><b>Booking ID:</b></td><td style='color:#9e1b1f;font-weight:bold;font-size:16px;font-family:monospace;'>" + id + "</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Pilgrim:</b></td><td>" + esc(name) + "</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Seats Reserved:</b></td><td>" + people + " (" + (people > 1 ? people + " People" : "1 Person") + ")</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Total Contribution:</b></td><td style='font-size:17px;font-weight:bold;color:#9e1b1f;'>₹" + total + "</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Assigned Coordinator:</b></td><td><b>" + esc(coordinatorName) + "</b> (+91 " + coordinatorPhone + ")</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Status:</b></td><td style='color:#3b49df;font-weight:bold;'>ID Verified • Payment Pending</td></tr>" +
    "</table>" +
    "</div>" +
    "<p style='text-align:center;margin:24px 0;'>" +
    "<a href='" + payLink + "' style='display:inline-block;padding:14px 28px;background:#5f259f;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;border-radius:10px;box-shadow:0 4px 12px rgba(95,37,159,0.3);'>" +
    "🟣 Open Payment Portal (PhonePe / UPI) &rarr;" +
    "</a>" +
    "</p>" +
    "<p style='font-size:13.5px;color:#523b34;text-align:center;'>Or use link: <a href='" + payLink + "'>" + payLink + "</a></p>" +
    "<div style='background:#fdfaf5;border:1px dashed #d9c9ae;border-radius:10px;padding:14px;margin:18px 0;'>" +
    "<b>Simple 2-Step Payment:</b>" +
    "<ol style='margin:8px 0 0 18px;padding:0;line-height:1.6;'>" +
    "<li>Tap the button above on your phone to open <b>PhonePe or any UPI app</b> to pay ₹" + total + ".</li>" +
    "<li>After payment, send your transaction screenshot on WhatsApp directly to your assigned coordinator <b>" + esc(coordinatorName) + " (+91 " + coordinatorPhone + ")</b>.</li>" +
    "</ol>" +
    "<p style='text-align:center;margin:14px 0 6px;'>" +
    "<a href='" + waLink + "' style='display:inline-block;padding:10px 18px;background:#15803d;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;border-radius:8px;'>" +
    "💬 WhatsApp Screenshot to " + esc(coordinatorName) + " &rarr;" +
    "</a>" +
    "</p>" +
    "<p style='margin:8px 0 0;font-size:13px;color:#166534;text-align:center;'>Once " + esc(coordinatorName) + " verifies your screenshot, your booking will be officially marked Confirmed &amp; Verified.</p>" +
    "</div>" +
    "<div style='background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:8px;padding:12px;margin:18px 0;font-size:13px;color:#92400e;line-height:1.5;'>" +
    "📬 <b>Note:</b> If this email arrived in your Spam folder, mark it as 'Not Spam' to receive your confirmed trip pass." +
    "</div>" +
    "<p style='margin-top:24px;border-top:1px solid #f0e6d6;padding-top:16px;'>Warm regards,<br><b>Team YUVATMA ❤️</b><br>Sri Kshetra Yalagur Yatra 2026</p>" +
    "</div>" +
    "</div>";

  MailApp.sendEmail({
    to: email,
    replyTo: REPLY_TO,
    name: "Team YUVATMA - Yalagur Yatra",
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody
  });
}

// Dispatches Confirmed & Verified Email
function sendVerifiedEmail(email, name, id, people, total) {
  const subject = "YUVATMA 2026: Booking Confirmed & Verified! (" + id + ")";
  
  const plainBody =
    "Namaskara " + name + ",\n\n" +
    "Haraye Namaha! Your payment has been received and verified.\n\n" +
    "Your booking is officially CONFIRMED & VERIFIED for YUVATMA 2026 | Yalagur | GoSeva - 3.0!\n\n" +
    "CONFIRMED DETAILS:\n" +
    "- Booking ID: " + id + "\n" +
    "- Pilgrim: " + name + "\n" +
    "- Confirmed Seats: " + people + " (" + (people > 1 ? people + " Seats" : "1 Seat") + ")\n" +
    "- Contribution Paid: ₹" + total + " (Verified ✓)\n" +
    "- Dates: November 28–29, 2026 (Saturday & Sunday)\n" +
    "- Venue: Sri Kshetra Yalagur, Nidagundi, Karnataka\n" +
    "- Status: Confirmed & Verified ✓\n\n" +
    "KEY TRIP HIGHLIGHTS & FACILITIES:\n" +
    "- Accommodation: Clean, comfortable stay arranged separately for boys and girls.\n" +
    "- Cow Product Workshop: Hands-on practical training on creating sacred Panchagavya and natural cow products.\n" +
    "- Go Seva & Campfire: Dedicated feeding & seva at Goshala, night CampFire, and soulful stotra & bhajan sandhya.\n" +
    "- Transferability: Bookings are transferable with prior notice.\n\n" +
    "View your confirmed booking pass: " + SITE_URL + "my-booking.html\n\n" +
    "Jai Bajrangbali,\n" +
    "Team YUVATMA (Yalagur GoSeva 3.0)";

  const htmlBody =
    "<div style='font-family:sans-serif;color:#2b120c;max-width:600px;line-height:1.6;margin:0 auto;padding:16px;'>" +
    "<div style='background:#166534;color:#ffffff;padding:16px 20px;border-radius:10px 10px 0 0;text-align:center;'>" +
    "<h1 style='margin:0;font-size:22px;letter-spacing:1px;'>YUVATMA 2026 | Booking Confirmed</h1>" +
    "<p style='margin:4px 0 0;font-size:13px;opacity:0.9;'>Sri Kshetra Yalagur • Nov 28–29, 2026</p>" +
    "</div>" +
    "<div style='border:1px solid #d9c9ae;border-top:none;border-radius:0 0 10px 10px;padding:24px;background:#ffffff;'>" +
    "<p style='font-size:18px;margin-top:0;'><b>ನಮಸ್ಕಾರ " + esc(name) + " 🙏</b></p>" +
    "<p style='font-size:16px;color:#2f6b3a;'><b>Haraye Namaha! Your payment has been received and verified.</b></p>" +
    "<p>Your booking is now officially <b>CONFIRMED &amp; VERIFIED</b> for <b>YUVATMA 2026 | Yalagur | GoSeva - 3.0</b>!</p>" +
    "<div style='background:#e8f5ec;border:1px solid #2f6b3a;border-radius:10px;padding:16px;margin:16px 0;'>" +
    "<table style='width:100%;border-collapse:collapse;font-size:14.5px;'>" +
    "<tr><td style='padding:5px 0;'><b>Booking ID:</b></td><td style='color:#9e1b1f;font-weight:bold;font-size:17px;font-family:monospace;'>" + id + "</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Pilgrim:</b></td><td>" + esc(name) + "</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Confirmed Seats:</b></td><td>" + people + " (" + (people > 1 ? people + " Seats" : "1 Seat") + ")</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Contribution Paid:</b></td><td>₹" + total + " (Verified ✓)</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Dates:</b></td><td>November 28–29, 2026 (Saturday &amp; Sunday)</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Venue:</b></td><td>Sri Kshetra Yalagur, Nidagundi, Karnataka</td></tr>" +
    "<tr><td style='padding:5px 0;'><b>Status:</b></td><td style='color:#2f6b3a;font-weight:bold;'>✓ Confirmed &amp; Verified</td></tr>" +
    "</table>" +
    "</div>" +
    "<div style='background:#fdfaf5;border:1px dashed #d9c9ae;border-radius:10px;padding:14px;margin:18px 0;'>" +
    "<b>Important Trip Highlights &amp; Facilities:</b>" +
    "<ul style='margin:8px 0 0 18px;padding:0;line-height:1.6;'>" +
    "<li><b>Accommodation:</b> Clean, comfortable stay arranged <b>separately for boys and girls</b>.</li>" +
    "<li><b>Cow Product Making Workshop:</b> Hands-on practical training on creating sacred Panchagavya and natural cow products.</li>" +
    "<li><b>Go Seva &amp; Campfire:</b> Hands-on feeding &amp; seva at Goshala, night CampFire, and soulful stotra &amp; bhajan sandhya.</li>" +
    "<li><b>Transferability:</b> Bookings are transferable! If you are unable to attend, you may transfer your booking to another eligible Madhwa youth (18–30 yrs) with prior notice.</li>" +
    "</ul>" +
    "</div>" +
    "<p>Bus departure timings, Bengaluru pickup coordinates, and packing lists will be posted on our official WhatsApp group.</p>" +
    "<p>View and manage your confirmed booking pass anytime: <a href='" + SITE_URL + "my-booking.html' style='color:#9e1b1f;font-weight:bold;'>My Booking Portal</a></p>" +
    "<p style='margin-top:24px;border-top:1px solid #f0e6d6;padding-top:16px;'>Jai Bajrangbali,<br><b>Team YUVATMA ❤️</b><br>Sri Kshetra Yalagur Yatra 2026</p>" +
    "</div>" +
    "</div>";

  MailApp.sendEmail({
    to: email,
    replyTo: REPLY_TO,
    name: "Team YUVATMA - Yalagur Yatra",
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody
  });
}

// ---------- Email-code login (Passwordless for 'My Booking') ----------
function sendCode(d) {
  const email = clean(d.email), c = CacheService.getScriptCache();
  if (!/^\S+@\S+\.\S+$/.test(email)) return out({ ok: false, error: "Enter a valid email address." });
  if (c.get("cd:" + email)) return out({ ok: false, error: "Please wait a minute before asking for another code." });
  c.put("cd:" + email, "1", 60);

  const n = Number(c.get("rl:" + email) || 0);
  if (n >= 3) return out({ ok: false, error: "Too many codes requested. Try again in an hour." });
  c.put("rl:" + email, String(n + 1), 3600);

  if (MailApp.getRemainingDailyQuota() < 2) return out({ ok: false, error: "Daily email limit reached. Please contact us on WhatsApp." });

  if (hasBooking(email)) {
    const code = String(parseInt(Utilities.getUuid().replace(/-/g, "").slice(0, 8), 16) % 900000 + 100000);
    c.put("otp:" + email, JSON.stringify({ h: hash(code), t: 0 }), CODE_MINUTES * 60);
    const plainBody =
      "Namaskara Madhwa Youths,\n\n" +
      "Your YUVATMA login code is: " + code + "\n\n" +
      "This code is valid for " + CODE_MINUTES + " minutes.\n\n" +
      "Note: If this email landed in your Spam/Junk folder, please tap 'Report not spam' so you don't miss important trip updates.\n\n" +
      "Team YUVATMA - Yalagur Yatra";

    MailApp.sendEmail({
      to: email,
      replyTo: REPLY_TO,
      name: "Team YUVATMA - Yalagur Yatra",
      subject: "Your YUVATMA login code: " + code,
      body: plainBody,
      htmlBody: "<p>Namaskara Madhwa Youths 🙏</p><p>Your YUVATMA login code is: <b style='font-size:24px;letter-spacing:4px;color:#9e1b1f;background:#fef4e2;padding:4px 10px;border-radius:6px;border:1px solid #d9c9ae;display:inline-block;'>" + code + "</b></p><p>This code is valid for " + CODE_MINUTES + " minutes.</p><p style='font-size:12px;color:#777;'>If you did not request this login, please ignore this email.</p><p>Team YUVATMA</p>"
    });
  }
  return out({ ok: true });
}

function verifyCode(d) {
  const email = clean(d.email), c = CacheService.getScriptCache(), raw = c.get("otp:" + email);
  if (!raw) return out({ ok: false, error: "That code has expired. Please request a new code." });
  const o = JSON.parse(raw);
  if (o.h !== hash(String(d.code || "").trim())) {
    o.t++;
    if (o.t >= 5) {
      c.remove("otp:" + email);
      return out({ ok: false, error: "Too many incorrect attempts. Request a new code." });
    }
    c.put("otp:" + email, JSON.stringify(o), CODE_MINUTES * 60);
    return out({ ok: false, error: "Wrong code. " + (5 - o.t) + " attempts left." });
  }
  c.remove("otp:" + email);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  const S = tab("Sessions", H.S), v = S.getDataRange().getValues();
  for (let i = v.length - 1; i > 0; i--) {
    if (Number(v[i][2]) < Date.now()) S.deleteRow(i + 1); // remove expired sessions
  }
  S.appendRow([hash(token), email, Date.now() + SESSION_DAYS * 864e5]);
  return out({ ok: true, token: token });
}

function mine(d) {
  const email = sessionEmail(d.token);
  if (!email) return out({ ok: false, error: "expired" });
  const att = rows(tab("Attendees", H.A)), rep = rows(tab("Replies", H.R));
  const list = rows(tab("Bookings", H.B)).filter(function (r) {
    return String(r[8]).toLowerCase() === email;
  }).map(function (r) {
    return {
      id: r[1],
      n: r[2],
      total: r[3],
      name: r[4],
      age: r[5],
      gender: r[6] || "",
      mobile: r[7],
      email: r[8],
      area: r[9] || "",
      city: r[10] || "",
      addr: (r[9] ? r[9] + ", " : "") + (r[10] || ""),
      gotra: r[11] || "",
      matha: r[12] || "",
      idType: r[13] || "Aadhaar",
      idNumber: r[14] || "",
      idUrl: r[15] || "",
      contact: r[16],
      payLink: r[17] || (SITE_URL + "pay.html?id=" + r[1]),
      coordinatorName: r[18] || "",
      coordinatorPhone: r[19] || "",
      txn: r[20] || "",
      q: r[21] || "",
      status: r[22] || "ID Verification Pending",
      people: att.filter(function (a) { return a[0] === r[1]; }).map(function (a) {
        if (a.length >= 12) {
          return {
            role: a[1],
            name: a[2],
            age: a[3],
            gender: a[4] || "",
            mobile: a[5] || "",
            gotra: a[6] || "",
            matha: a[7] || "",
            parent: a[8] || "",
            idType: a[9] || "",
            idNumber: a[10] || "",
            idDocUrl: a[11] || ""
          };
        }
        return {
          role: a[1],
          name: a[2],
          age: a[3],
          gender: a[4] || "",
          mobile: a[5] || "",
          gotra: "",
          matha: "",
          parent: "",
          idType: a[6] || "",
          idNumber: a[7] || "",
          idDocUrl: a[8] || ""
        };
      }),
      replies: rep.filter(function (x) { return x[1] === r[1]; }).map(function (x) { return { text: x[2] }; })
    };
  });
  return out({ ok: true, list: list });
}

function logout(d) {
  const S = tab("Sessions", H.S), h = hash(String(d.token || "")), v = S.getDataRange().getValues();
  for (let i = v.length - 1; i > 0; i--) if (v[i][0] === h) S.deleteRow(i + 1);
  return out({ ok: true });
}

// ---------- ADMIN WEB PORTAL DATA & ACTIONS (admin.html) ----------

function adminList(d) {
  const currentAdmin = getAdminFromSession(d.token, d.passcode || d.key);
  if (!currentAdmin) {
    return out({ ok: false, error: "Unauthorized: Invalid or expired admin session. Please sign in." });
  }

  const B = tab("Bookings", H.B);
  const A = tab("Attendees", H.A);
  const I = tab("Interested", H.I);

  const bookingRows = B.getLastRow() > 1 ? B.getRange(2, 1, B.getLastRow() - 1, H.B.length).getValues() : [];
  const attendeeRows = A.getLastRow() > 1 ? A.getRange(2, 1, A.getLastRow() - 1, H.A.length).getValues() : [];
  const interestedRows = I.getLastRow() > 1 ? I.getRange(2, 1, I.getLastRow() - 1, H.I.length).getValues() : [];

  const bookings = bookingRows.map(function(r) {
    const id = r[1];
    // H.A: ["Booking ID", "Role", "Name", "Age", "Gender", "Mobile", "Gotra", "Matha", "Parent / Contact", "ID Proof Type", "ID Proof Number", "ID Proof Document URL"]
    const members = attendeeRows.filter(function(a) { return a[0] === id; }).map(function(a) {
      if (a.length >= 12) {
        return {
          role: a[1],
          name: a[2],
          age: a[3],
          gender: a[4] || "",
          mobile: a[5] || "",
          gotra: a[6] || "",
          matha: a[7] || "",
          parent: a[8] || "",
          idType: a[9] || "",
          idNumber: a[10] || "",
          idDocUrl: a[11] || ""
        };
      }
      return {
        role: a[1],
        name: a[2],
        age: a[3],
        gender: a[4] || "",
        mobile: a[5] || "",
        gotra: "",
        matha: "",
        parent: "",
        idType: a[6] || "",
        idNumber: a[7] || "",
        idDocUrl: a[8] || ""
      };
    });

    return {
      timestamp: r[0],
      id: r[1],
      people: Number(r[2]) || 1,
      total: Number(r[3]) || (PRICE * (Number(r[2]) || 1)),
      name: r[4],
      age: r[5],
      gender: r[6] || "",
      mobile: r[7],
      email: r[8],
      area: r[9] || "",
      city: r[10] || "",
      addr: (r[9] ? r[9] + ", " : "") + (r[10] || ""),
      gotra: r[11] || "",
      matha: r[12] || "",
      idType: r[13] || "Aadhaar",
      idNumber: r[14] || "",
      idDocUrl: r[15] || "",
      contact: r[16],
      payLink: r[17] || (SITE_URL + "pay.html?id=" + r[1]),
      coordinatorName: r[18] || "",
      coordinatorPhone: r[19] || "",
      txn: r[20] || "",
      q: r[21] || "",
      status: r[22] || "ID Verification Pending",
      verifiedBy: r[23] || "",
      verifiedAt: r[24] || "",
      notes: r[25] || "",
      members: members
    };
  });

  const interested = interestedRows.map(function(r) {
    return {
      timestamp: r[0],
      name: r[1],
      age: r[2],
      phone: r[3],
      gotra: r[4],
      matha: r[5] || ""
    };
  });

  // Admin team members (accessible by super admin or write admins)
  const adminListResult = (currentAdmin.isSuperAdmin || currentAdmin.access === "write") ? listAdmins() : [];

  return out({
    ok: true,
    stats: computeSeatStats(),
    bookings: bookings,
    interested: interested,
    admins: adminListResult,
    currentAdmin: currentAdmin
  });
}

function adminApproveId(d) {
  const currentAdmin = getAdminFromSession(d.token, d.passcode || d.key);
  if (!currentAdmin) return out({ ok: false, error: "Unauthorized. Please log in." });
  if (currentAdmin.access !== "write") {
    return out({ ok: false, error: "Permission Denied: Your admin account has Read-Only access." });
  }

  if (!d.id) return out({ ok: false, error: "Missing Booking ID." });

  const cleanId = String(d.id).trim().toUpperCase();
  const B = tab("Bookings", H.B);
  const lastRow = B.getLastRow();
  if (lastRow <= 1) return out({ ok: false, error: "No bookings found." });

  // Coordinator who verified ID
  const coordName = d.adminName || currentAdmin.name || "Vivek Jahagirdar";
  const coordPhone = String(d.adminPhone || currentAdmin.phone || "9739755771").replace(/\D/g, "") || "9739755771";
  const verifierTag = coordName + " (" + (d.adminEmail || currentAdmin.email) + ")";

  const values = B.getRange(2, 1, lastRow - 1, H.B.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (String(r[1]).trim().toUpperCase() === cleanId) {
      const rowIndex = i + 2;
      const id = r[1];
      const people = Number(r[2]) || 1;
      const total = Number(r[3]) || (people * PRICE);
      const name = r[4];
      const email = r[8];
      const idType = r[13] || "Valid ID";
      const payLink = SITE_URL + "pay.html?id=" + encodeURIComponent(id) + "&cphone=" + encodeURIComponent(coordPhone) + "&cname=" + encodeURIComponent(coordName);

      // Col 18: Payment Link, Col 19: Coordinator Name, Col 20: Coordinator Phone
      // Col 23: Status, Col 24: Verified By, Col 25: Verified At
      B.getRange(rowIndex, 18).setValue(payLink);
      B.getRange(rowIndex, 19).setValue(coordName);
      B.getRange(rowIndex, 20).setValue(coordPhone);
      B.getRange(rowIndex, 23, 1, 3).setValues([["Payment Pending (ID Verified)", verifierTag, new Date()]]);

      // Dispatch Payment Link Email
      try {
        sendPaymentLinkEmail(email, name, id, people, total, idType, payLink, coordName, coordPhone);
      } catch (err) {
        return out({ ok: false, error: "Status updated in sheet, but email failed: " + err.message });
      }

      return out({
        ok: true,
        message: "ID Approved & Payment Link email successfully dispatched to " + email,
        verifiedBy: verifierTag,
        coordinatorName: coordName,
        coordinatorPhone: coordPhone
      });
    }
  }
  return out({ ok: false, error: "Booking ID " + cleanId + " not found." });
}

function adminConfirmPayment(d) {
  const currentAdmin = getAdminFromSession(d.token, d.passcode || d.key);
  if (!currentAdmin) return out({ ok: false, error: "Unauthorized. Please log in." });
  if (currentAdmin.access !== "write") {
    return out({ ok: false, error: "Permission Denied: Your admin account has Read-Only access." });
  }

  if (!d.id) return out({ ok: false, error: "Missing Booking ID." });

  const cleanId = String(d.id).trim().toUpperCase();
  const B = tab("Bookings", H.B);
  const lastRow = B.getLastRow();
  if (lastRow <= 1) return out({ ok: false, error: "No bookings found." });

  // Record exactly which admin verified this!
  const verifierTag = (d.adminName || currentAdmin.name) + " (" + (d.adminEmail || currentAdmin.email) + ")";

  const values = B.getRange(2, 1, lastRow - 1, H.B.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (String(r[1]).trim().toUpperCase() === cleanId) {
      const rowIndex = i + 2;
      const id = r[1];
      const people = Number(r[2]) || 1;
      const total = Number(r[3]) || (people * PRICE);
      const name = r[4];
      const email = r[8];

      // Col 21: Transaction ID
      if (d.txnId) {
        B.getRange(rowIndex, 21).setValue(String(d.txnId).trim());
      }
      // Col 26: Notes
      if (d.notes) {
        B.getRange(rowIndex, 26).setValue(String(d.notes).trim());
      }

      // Col 23: Status, Col 24: Verified By, Col 25: Verified At
      B.getRange(rowIndex, 23, 1, 3).setValues([["Confirmed & Verified", verifierTag, new Date()]]);

      // Dispatch Confirmed & Verified Email
      try {
        sendVerifiedEmail(email, name, id, people, total);
      } catch (err) {
        return out({ ok: false, error: "Status updated in sheet, but email failed: " + err.message });
      }

      return out({
        ok: true,
        message: "Payment Confirmed & Official confirmation email dispatched to " + email,
        verifiedBy: verifierTag
      });
    }
  }
  return out({ ok: false, error: "Booking ID " + cleanId + " not found." });
}

function adminUpdateStatus(d) {
  const currentAdmin = getAdminFromSession(d.token, d.passcode || d.key);
  if (!currentAdmin || currentAdmin.access !== "write") {
    return out({ ok: false, error: "Permission denied." });
  }
  if (!d.id || !d.status) return out({ ok: false, error: "Missing ID or Status." });

  const cleanId = String(d.id).trim().toUpperCase();
  const B = tab("Bookings", H.B);
  const lastRow = B.getLastRow();
  if (lastRow <= 1) return out({ ok: false, error: "No bookings found." });

  const values = B.getRange(2, 1, lastRow - 1, H.B.length).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][1]).trim().toUpperCase() === cleanId) {
      const rowIndex = i + 2;
      B.getRange(rowIndex, 23).setValue(d.status);
      if (d.notes) B.getRange(rowIndex, 26).setValue(d.notes);
      return out({ ok: true, message: "Status updated to " + d.status });
    }
  }
  return out({ ok: false, error: "Booking ID not found." });
}

// ---------- Google Sheets Menu & Verification (Sheet Functions) ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu("YUVATMA")
    .addItem("1. Approve ID & Send Payment Link", "sendPaymentLinkSelected")
    .addItem("2. Confirm Payment & Mark Verified", "confirmPaymentSelected")
    .addSeparator()
    .addItem("🔑 Set / Change Main Owner Passcode", "setOwnerPasscodeManual")
    .addItem("🔄 Upgrade Sheet Columns (Preserves All Data)", "setupSheetHeaders")
    .addSeparator()
    .addItem("Live Seat Count Summary", "showSeatSummary")
    .addItem("Interested People Count", "showInterestedSummary")
    .addSeparator()
    .addItem("Reply to selected booking", "replySelected")
    .addItem("Open Payment Page for Selected", "openPaymentPageSelected")
    .addToUi();
}

function setOwnerPasscodeManual() {
  const ui = SpreadsheetApp.getUi();
  const current = getMasterAdminPasscode();
  const res = ui.prompt(
    "Set Main Admin Passcode",
    "Current Passcode: " + (current ? "********" : "Not set") + "\n\n" +
    "Enter a new Master Passcode for the Main Owner (min 4 characters):",
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const newPass = res.getResponseText().trim();
  if (!newPass || newPass.length < 4) {
    ui.alert("Passcode must be at least 4 characters long.");
    return;
  }
  PropertiesService.getScriptProperties().setProperty("admin_passcode", newPass);
  ui.alert("Success! Main Owner passcode has been updated securely in Script Properties.\n\nYou can now use this passcode to log in at admin.html.");
}

function showSeatSummary() {
  const s = computeSeatStats();
  SpreadsheetApp.getUi().alert(
    "YUVATMA 2026 - Seat Availability Summary\n\n" +
    "• Total Bus Capacity: " + s.totalSeats + " seats\n" +
    "• Total Registered/Reserved: " + s.bookedSeats + " seats\n" +
    "• Confirmed & Verified: " + s.confirmedSeats + " seats\n" +
    "• ID Verification Pending: " + s.idPendingSeats + " seats\n" +
    "• Payment Pending: " + s.paymentPendingSeats + " seats\n" +
    "• Seats Remaining: " + s.seatsLeft + " seats"
  );
}

function showInterestedSummary() {
  const I = tab("Interested", H.I);
  const count = Math.max(0, I.getLastRow() - 1);
  SpreadsheetApp.getUi().alert("YUVATMA 2026 - Interested Inquiries\n\nTotal Madhwa youths who expressed interest & joined group: " + count);
}

function selected() {
  const s = SpreadsheetApp.getActiveSheet(), r = s.getActiveRange().getRow();
  if (s.getName() !== "Bookings" || r < 2) {
    SpreadsheetApp.getUi().alert("Please select a booking row in the 'Bookings' tab first (Row 2 or below).");
    return null;
  }
  const rowValues = s.getRange(r, 1, 1, Math.max(s.getLastColumn(), H.B.length)).getValues()[0];
  return { s: s, r: r, v: rowValues };
}

// STEP 1: Organizer Manually Verifies ID Proof and Sends Payment Link from Sheet
function sendPaymentLinkSelected() {
  const x = selected(); if (!x) return;
  const ui = SpreadsheetApp.getUi();

  const id = String(x.v[1]);
  const people = x.v[2] || 1;
  const total = x.v[3] || (people * PRICE);
  const name = x.v[4] || "Pilgrim";
  const email = x.v[8];
  const matha = x.v[12] || "";
  const idType = x.v[13] || "Valid ID";
  const idNum = x.v[14] || "";
  const idDocUrl = x.v[15] || "";

  // Assign coordinator from active user email or script property
  const coordName = Session.getActiveUser().getEmail().split("@")[0] || "Vivek Jahagirdar";
  const coordPhone = PropertiesService.getScriptProperties().getProperty("admin_phone") || "9739755771";
  const payLink = SITE_URL + "pay.html?id=" + encodeURIComponent(id) + "&cphone=" + encodeURIComponent(coordPhone) + "&cname=" + encodeURIComponent(coordName);

  if (!email || !email.includes("@")) {
    ui.alert("No valid email found in row " + x.r + ".");
    return;
  }

  const promptMsg =
    "Approve ID Proof & Send Payment Link for:\n\n" +
    "• Booking ID: " + id + "\n" +
    "• Pilgrim: " + name + "\n" +
    (matha ? "• Matha: " + matha + "\n" : "") +
    "• ID Submitted: " + idType + " (" + idNum + ")\n" +
    (idDocUrl ? "• ID Document URL: " + idDocUrl + "\n" : "") +
    "• Seats: " + people + " (₹" + total + ")\n" +
    "• Coordinator: " + coordName + " (+91 " + coordPhone + ")\n" +
    "• Email: " + email + "\n\n" +
    "Do you want to mark this as ID Verified and dispatch the official Payment Link email?";

  const confirm = ui.alert("Approve ID & Send Payment Link", promptMsg, ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  // Update Col 18=Payment Link, 19=Coordinator Name, 20=Coordinator Phone, 23=Status, 24=Verified By, 25=Verified At
  x.s.getRange(x.r, 18).setValue(payLink);
  x.s.getRange(x.r, 19).setValue(coordName);
  x.s.getRange(x.r, 20).setValue(coordPhone);
  x.s.getRange(x.r, 23, 1, 3).setValues([["Payment Pending (ID Verified)", me(), new Date()]]);

  try {
    sendPaymentLinkEmail(email, name, id, people, total, idType, payLink, coordName, coordPhone);
    ui.alert("Success!\n\nID marked Verified for " + id + " and payment link email dispatched to: " + email);
  } catch (err) {
    ui.alert("Status updated in sheet, but email sending failed: " + err.message);
  }
}

// STEP 2: Organizer Confirms Payment & Marks Verified from Sheet
function confirmPaymentSelected() {
  const x = selected(); if (!x) return;
  const ui = SpreadsheetApp.getUi();

  const id = String(x.v[1]);
  const people = x.v[2] || 1;
  const total = x.v[3] || (people * PRICE);
  const name = x.v[4] || "Pilgrim";
  const email = x.v[8];
  const matha = x.v[12] || "";
  const txnId = x.v[20] || "";

  if (!email || !email.includes("@")) {
    ui.alert("No valid email found in row " + x.r + ".");
    return;
  }

  const promptMsg =
    "Confirm Payment & Mark Booking as Verified:\n\n" +
    "• Booking ID: " + id + "\n" +
    "• Pilgrim: " + name + "\n" +
    (matha ? "• Matha: " + matha + "\n" : "") +
    "• Seats: " + people + " (₹" + total + ")\n" +
    (txnId ? "• Transaction ID: " + txnId + "\n" : "") +
    "• Email: " + email + "\n\n" +
    "Do you confirm the payment screenshot received on WhatsApp, and want to mark this booking as 'Confirmed & Verified' and dispatch the official confirmation email?";

  const confirm = ui.alert("Confirm Payment & Mark Verified", promptMsg, ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  // Update Col 23=Status, 24=Verified By, 25=Verified At
  x.s.getRange(x.r, 23, 1, 3).setValues([["Confirmed & Verified", me(), new Date()]]);

  try {
    sendVerifiedEmail(email, name, id, people, total);
    ui.alert("Confirmed!\n\nBooking " + id + " for " + name + " marked as 'Confirmed & Verified'. Confirmation email dispatched to: " + email);
  } catch (err) {
    ui.alert("Status updated in sheet, but email sending failed: " + err.message);
  }
}

function openPaymentPageSelected() {
  const x = selected(); if (!x) return;
  const id = String(x.v[1]);
  const url = SITE_URL + "pay.html?id=" + encodeURIComponent(id);
  const html = "<script>window.open('" + url + "', '_blank');google.script.host.close();</script>";
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(250).setHeight(100), "Opening Payment Page…");
}

function setupSheetHeaders() {
  const B = tab("Bookings", H.B);
  ensureSheetColumns(B, H.B);
  const A = tab("Attendees", H.A);
  ensureSheetColumns(A, H.A);
  const I = tab("Interested", H.I);
  ensureSheetColumns(I, H.I);
  const M = tab("Admins", H.M);
  ensureSheetColumns(M, H.M);
  SpreadsheetApp.getUi().alert("Success!\n\nAll sheet headers and columns have been upgraded to the latest YUVATMA 2026 format.\n\nAll existing bookings, attendee records, inquiries, and admin credentials have been 100% preserved.");
}

function replySelected() {
  const x = selected(); if (!x) return;
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt("Reply to " + x.v[4] + " (" + x.v[1] + ")", "Question: " + (x.v[21] || "(none)") + "\n\nType your reply:", ui.ButtonSet.OK_CANCEL);
  const text = res.getResponseText().trim();
  if (res.getSelectedButton() !== ui.Button.OK || !text) return;
  MailApp.sendEmail({
    to: x.v[8], replyTo: REPLY_TO, name: "Team YUVATMA", subject: "YUVATMA 2026: reply to your query (" + x.v[1] + ")",
    htmlBody: "<p>Namaskara Madhwa Youths 🙏</p><p>Namaskara " + esc(x.v[4]) + ",</p><p>" + esc(text).replace(/\n/g, "<br>") + "</p><p>Booking ID: <b>" + x.v[1] + "</b></p><p>Warm regards,<br>Team YUVATMA</p>"
  });
  tab("Replies", H.R).appendRow([new Date(), x.v[1], text, me()].map(safe));
  ui.alert("Reply successfully sent to " + x.v[8] + ".");
}

// ---------- Helpers ----------
function sessionEmail(t) {
  if (!t) return "";
  const h = hash(String(t)), r = rows(tab("Sessions", H.S)).filter(function (x) { return x[0] === h && Number(x[2]) > Date.now(); })[0];
  return r ? String(r[1]) : "";
}

function hasBooking(email) {
  return rows(tab("Bookings", H.B)).some(function (r) { return String(r[8]).toLowerCase() === email; });
}

function rows(s) {
  const v = s.getDataRange().getValues();
  v.shift();
  return v;
}

function tab(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.setFrozenRows(1);
    if (name === "Sessions") s.hideSheet();
  }
  ensureSheetColumns(s, head);
  return s;
}

// Safely upgrades sheet columns to target layout without corrupting or losing existing rows
function ensureSheetColumns(s, targetHead) {
  const lastRow = s.getLastRow();
  const lastCol = s.getLastColumn();

  if (lastRow === 0) {
    s.getRange(1, 1, 1, targetHead.length).setValues([targetHead]).setFontWeight("bold");
    s.setFrozenRows(1);
    return;
  }

  const currentHead = s.getRange(1, 1, 1, Math.max(1, lastCol)).getValues()[0];

  // Quick check if already identical
  let identical = currentHead.length === targetHead.length;
  if (identical) {
    for (let i = 0; i < targetHead.length; i++) {
      if (String(currentHead[i]).trim().toLowerCase() !== String(targetHead[i]).trim().toLowerCase()) {
        identical = false;
        break;
      }
    }
  }
  if (identical) return;

  // If there are existing data rows, map and preserve ALL existing entries!
  if (lastRow > 1) {
    const oldValues = s.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const oldHeadMap = {};
    for (let i = 0; i < currentHead.length; i++) {
      oldHeadMap[String(currentHead[i]).trim().toLowerCase()] = i;
    }

    const newValues = [];
    for (let r = 0; r < oldValues.length; r++) {
      const oldRow = oldValues[r];
      const newRow = [];
      for (let c = 0; c < targetHead.length; c++) {
        const colName = String(targetHead[c]).trim().toLowerCase();
        let val = "";
        if (oldHeadMap[colName] !== undefined) {
          val = oldRow[oldHeadMap[colName]];
        } else if (colName === "id proof document url" && oldHeadMap["screenshot"] !== undefined) {
          val = oldRow[oldHeadMap["screenshot"]];
        } else if (colName === "payment link" && oldHeadMap["booking id"] !== undefined) {
          const bId = String(oldRow[oldHeadMap["booking id"]] || "").trim();
          val = bId ? SITE_URL + "pay.html?id=" + encodeURIComponent(bId) : "";
        } else if (colName === "id proof type") {
          val = "Aadhaar";
        }
        newRow.push(val);
      }
      newValues.push(newRow);
    }

    // Clear old range and write new remapped headers and data rows
    s.clearContents();
    s.getRange(1, 1, 1, targetHead.length).setValues([targetHead]).setFontWeight("bold");
    s.getRange(2, 1, newValues.length, targetHead.length).setValues(newValues);
  } else {
    // Only header row existed
    s.getRange(1, 1, 1, targetHead.length).setValues([targetHead]).setFontWeight("bold");
  }
  s.setFrozenRows(1);
}

function idFolder() {
  const it = DriveApp.getFoldersByName(ID_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ID_FOLDER_NAME);
}

function salt() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty("salt");
  if (!s) {
    s = Utilities.getUuid();
    p.setProperty("salt", s);
  }
  return s;
}

function hash(s) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s + salt()));
}

function me() {
  return Session.getActiveUser().getEmail() || "team";
}

function clean(e) {
  return String(e || "").trim().toLowerCase();
}

function safe(v) {
  return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function esc(s) {
  return String(s).replace(/[&<>]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
  });
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
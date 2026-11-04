// YUVATMA Backend - Google Apps Script
// Paste into: Extensions > Apps Script of your Google Sheet.
// Deploy as: Deploy > Manage deployments > Edit > New version > Deploy. (Execute as: Me, Who has access: Anyone)

const PRICE = 1785;                                              // Contribution per person (₹)
const TOTAL_SEATS = 35;                                          // Total bus capacity
const SITE_URL = "https://vivekjahagirdar26.github.io/yuvatma_bookings/";  // Where site is hosted (keep trailing slash)
const REPLY_TO = "jahagirdarvivek26@gmail.com";                  // Replies land here
const FOLDER_NAME = "YUVATMA Payment Screenshots";
const SESSION_DAYS = 7, CODE_MINUTES = 10;

const H = {
  B: ["Timestamp", "Booking ID", "People", "Total (₹)", "Name", "Age", "Mobile", "Email", "Address", "Gotra", "Parent / Emergency contact", "Transaction ID", "Screenshot", "Queries", "Status", "Verified By", "Verified At", "Notes"],
  A: ["Booking ID", "Role", "Name", "Age", "Mobile"],
  R: ["Time", "Booking ID", "Reply", "By"],
  S: ["Token hash", "Email", "Expires"],
  I: ["Timestamp", "Name", "Age", "Phone", "Gotra"]             // Interested inquiries
};

// Handle GET requests (e.g. for live seat availability check or interested count)
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action ? e.parameter.action : "seats";
    if (action === "seats" || action === "stats") {
      return getStats();
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
      case "interested": return recordInterested(d);
      case "seats":
      case "stats": return getStats();
      case "sendCode": return sendCode(d);
      case "verifyCode": return verifyCode(d);
      case "mine": return mine(d);
      case "logout": return logout(d);
    }
    return out({ ok: false, error: "Unknown action." });
  } catch (x) {
    return out({ ok: false, error: "Something went wrong on our side. Please try again: " + x.message });
  }
}

// ---------- Record Interested Person (WhatsApp Group Redirect) ----------
function recordInterested(d) {
  if (!d.name || !d.age || !d.phone || !d.gotra) {
    return out({ ok: false, error: "Please fill Name, Age, Phone, and Gotra." });
  }
  const age = Number(d.age);
  if (isNaN(age) || age < 18 || age > 35) {
    return out({ ok: false, error: "Age limit is 18–35 years." });
  }
  const cleanPhone = String(d.phone).replace(/\D/g, "");
  if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
    return out({ ok: false, error: "Please enter a valid 10-digit phone number." });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const I = tab("Interested", H.I);
    I.appendRow([new Date(), d.name.trim(), age, cleanPhone, d.gotra.trim()].map(safe));
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
  const lastRow = B.getLastRow();
  if (lastRow > 1) {
    const values = B.getRange(2, 3, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) {
      const n = Number(values[i][0]);
      if (!isNaN(n) && n > 0) totalBooked += n;
    }
  }
  const seatsLeft = Math.max(0, TOTAL_SEATS - totalBooked);
  return {
    totalSeats: TOTAL_SEATS,
    bookedSeats: totalBooked,
    seatsLeft: seatsLeft
  };
}

function getStats() {
  const stats = computeSeatStats();
  return out({
    ok: true,
    totalSeats: stats.totalSeats,
    bookedSeats: stats.bookedSeats,
    seatsLeft: stats.seatsLeft
  });
}

// ---------- Booking ----------
function book(d) {
  if (d.hp) return out({ ok: true, id: "YUV-0000" }); // spam trap honeypot
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
    const txns = B.getLastRow() > 1 ? B.getRange(2, 12, B.getLastRow() - 1, 1).getValues().flat() : [];
    if (txns.indexOf(d.txn) > -1) {
      return out({ ok: false, error: "This transaction ID has already been submitted. If you already booked, please check 'My booking' or contact us." });
    }

    const props = PropertiesService.getScriptProperties();
    const num = Number(props.getProperty("n") || 0) + 1;
    props.setProperty("n", String(num));
    const id = "YUV-" + String(num).padStart(4, "0");

    const p = d.p, total = d.n * PRICE;
    p.email = clean(p.email);
    const contact = Number(p.age) < 25 ? "Parent: " + p.parent : "Emergency: " + p.ecName + " (" + p.ecNum + ")";
    const file = folder().createFile(Utilities.newBlob(Utilities.base64Decode(d.shot), "image/jpeg", id + ".jpg"));

    B.appendRow([new Date(), id, d.n, total, p.name, p.age, p.mobile, p.email, p.addr, p.gotra || "", contact, d.txn, file.getUrl(), d.q || "", "Pending", "", "", ""].map(safe));
    A.appendRow([id, "Primary", p.name, p.age, p.mobile].map(safe));
    d.members.forEach(function (m, i) {
      A.appendRow([id, "Member " + (i + 2), m.name, m.age, m.mobile || ""].map(safe));
    });

    try { confirmMail(p, id, d.n, total); } catch (x) { /* Booking saved even if email fails */ }

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
  if (isNaN(age) || age < 18 || age > 35) return "Age must be between 18 and 35 years.";
  if (!d.txn || !d.shot) return "Transaction ID and payment screenshot are required.";
  if (d.members.length !== d.n - 1) return "Group member details don't match group size.";
  return "";
}

// ---------- Email-code login (Passwordless) ----------
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
    MailApp.sendEmail({
      to: email, replyTo: REPLY_TO, subject: "Your YUVATMA login code: " + code,
      htmlBody: "<p>Namaskara 🙏</p><p>Your YUVATMA login code is: <b style='font-size:22px;letter-spacing:3px;color:#9e1b1f;'>" + code + "</b></p><p>This code is valid for " + CODE_MINUTES + " minutes. If you did not request this, you can ignore this email.</p><p>Team YUVATMA</p>"
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
    return String(r[7]).toLowerCase() === email;
  }).map(function (r) {
    return {
      id: r[1], n: r[2], total: r[3], name: r[4], age: r[5], mobile: r[6], email: r[7], addr: r[8], gotra: r[9],
      contact: r[10], txn: r[11], q: r[13], status: r[14] || "Pending",
      people: att.filter(function (a) { return a[0] === r[1]; }).map(function (a) { return { role: a[1], name: a[2], age: a[3] }; }),
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

// ---------- Google Sheets Menu & Verification ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu("YUVATMA")
    .addItem("Live Seat Count Summary", "showSeatSummary")
    .addItem("Interested People Count", "showInterestedSummary")
    .addSeparator()
    .addItem("Reply to selected booking", "replySelected")
    .addItem("Mark selected as Verified", "verifySelected")
    .addToUi();
}

function showSeatSummary() {
  const s = computeSeatStats();
  SpreadsheetApp.getUi().alert(
    "YUVATMA 2026 - Seat Availability\n\n" +
    "• Total Bus Capacity: " + s.totalSeats + " seats\n" +
    "• Total Booked: " + s.bookedSeats + " seats\n" +
    "• Seats Remaining: " + s.seatsLeft + " seats"
  );
}

function showInterestedSummary() {
  const I = tab("Interested", H.I);
  const count = Math.max(0, I.getLastRow() - 1);
  SpreadsheetApp.getUi().alert("YUVATMA 2026 - Interested Inquiries\n\nTotal people who expressed interest & joined group: " + count);
}

function selected() {
  const s = SpreadsheetApp.getActiveSheet(), r = s.getActiveRange().getRow();
  if (s.getName() !== "Bookings" || r < 2) {
    SpreadsheetApp.getUi().alert("Please select a booking row in the 'Bookings' tab first.");
    return null;
  }
  return { s: s, r: r, v: s.getRange(r, 1, 1, H.B.length).getValues()[0] };
}

function replySelected() {
  const x = selected(); if (!x) return;
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt("Reply to " + x.v[4] + " (" + x.v[1] + ")", "Question: " + (x.v[13] || "(none)") + "\n\nType your reply:", ui.ButtonSet.OK_CANCEL);
  const text = res.getResponseText().trim();
  if (res.getSelectedButton() !== ui.Button.OK || !text) return;
  MailApp.sendEmail({
    to: x.v[7], replyTo: REPLY_TO, subject: "YUVATMA 2026: reply to your query (" + x.v[1] + ")",
    htmlBody: "<p>Namaskara " + esc(x.v[4]) + ",</p><p>" + esc(text).replace(/\n/g, "<br>") + "</p><p>Booking ID: <b>" + x.v[1] + "</b></p><p>Warm regards,<br>Team YUVATMA</p>"
  });
  tab("Replies", H.R).appendRow([new Date(), x.v[1], text, me()].map(safe));
  ui.alert("Reply successfully sent to " + x.v[7] + ".");
}

function verifySelected() {
  const x = selected(); if (!x) return;
  x.s.getRange(x.r, 15, 1, 3).setValues([["Verified", me(), new Date()]]);
  try {
    MailApp.sendEmail({
      to: x.v[7], replyTo: REPLY_TO, subject: "YUVATMA 2026: Booking Verified (" + x.v[1] + ")",
      htmlBody: "<p>Namaskara " + esc(x.v[4]) + ",</p><p>Your payment has been received and verified for booking <b>" + x.v[1] + "</b>!</p><p>We look forward to welcoming you for YUVATMA 2026 (November 28–29, 2026). Bus pickup timings and boarding point details will be sent to your WhatsApp number.</p><p>Check your booking status anytime: <a href='" + SITE_URL + "my-booking.html'>My Booking Portal</a></p><p>Jai Bajrangbali,<br>Team YUVATMA</p>"
    });
  } catch (e) {}
  SpreadsheetApp.getUi().alert(x.v[1] + " marked as Verified and email confirmation sent.");
}

// ---------- Helpers ----------
function confirmMail(p, id, n, total) {
  MailApp.sendEmail({
    to: p.email, replyTo: REPLY_TO, subject: "YUVATMA 2026: booking received (" + id + ")",
    htmlBody: "<p>Namaskara " + esc(p.name) + ",</p><p>We have successfully received your booking submission for <b>YUVATMA 2026 | Yalagur | GoSeva - 3.0</b> (November 28–29, 2026).</p>" +
      "<p><b>Booking ID: " + id + "</b><br>Seats Reserved: " + n + "<br>Total Contribution: ₹" + total + "</p>" +
      "<p>Our team will verify your payment screenshot and confirm your booking shortly. You can check your booking anytime: <a href='" + SITE_URL + "my-booking.html'>My Booking</a> (log in with your registered email: " + p.email + ").</p><p>Warm regards,<br>Team YUVATMA ❤️</p>"
  });
}

function sessionEmail(t) {
  if (!t) return "";
  const h = hash(String(t)), r = rows(tab("Sessions", H.S)).filter(function (x) { return x[0] === h && Number(x[2]) > Date.now(); })[0];
  return r ? String(r[1]) : "";
}

function hasBooking(email) {
  return rows(tab("Bookings", H.B)).some(function (r) { return String(r[7]).toLowerCase() === email; });
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
  if (s.getLastColumn() < head.length) {
    s.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold");
  }
  return s;
}

function folder() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
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

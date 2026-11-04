// Fallback definitions in case TRUE/FALSE are typed in uppercase
var TRUE = true, True = true, FALSE = false, False = false;

// Edit these values only. Everything else reads from here.
window.YUV = {
  // 1. Google Apps Script Web App URL
  API_URL: "https://script.google.com/macros/s/AKfycbz1dRrH2VNpmSD79Hx_OIAz-cDSub_Xsv_j2UB1yVeIdbGB6VVNYL-DjYE7pHrU8EY5/exec",

  // 2. Booking Status & Marketing Control
  // Set BOOKINGS_OPEN to:
  //   false -> Marketing mode: Price is hidden, booking wizard is hidden, and "Interested" button is active
  //   true  -> Bookings are LIVE: Registration wizard is active, price is shown, and "Book now" is active!
  BOOKINGS_OPEN: false,
  BOOKINGS_OPN: false,                  // Support both spellings so it never fails!
  BOOKING_OPEN_DATE_STR: "7th November 2026",

  // 3. Trip & Eligibility
  PRICE: 1785,                         // Contribution per person (₹)
  TOTAL_SEATS: 35,                      // Total bus seat capacity (live tracked)
  AGE_MIN: 18,                          // Age limit minimum
  AGE_MAX: 35,                          // Age limit maximum

  // 4. Payment UPI Details
  UPI_ID: "vivekvj26@ybl",              // Shown in payment step & QR code
  UPI_NAME: "YUVATMA",

  // 5. WhatsApp & Contact Details
  WHATSAPP_GROUP: "https://chat.whatsapp.com/E0sBKM5HKgl7DMPtVPsWwL?s=cl&p=a&iam=2",
  WHATSAPP: "https://chat.whatsapp.com/E0sBKM5HKgl7DMPtVPsWwL?s=cl&p=a&iam=2",
  PHONE: "+91 9739755771",
  EMAIL: "jahagirdarvivek26@gmail.com"
};

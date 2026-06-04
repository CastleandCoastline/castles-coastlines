import React from "react";

export default function Privacy() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px", fontFamily: "'Lato',sans-serif", color: "#1a2332", lineHeight: 1.7 }}>
      <h1 style={{ fontFamily: "'Playfair Display',serif" }}>Privacy Policy</h1>
      <p><em>Last updated: June 2026</em></p>

      <p>Castle &amp; Coastline Tours ("we", "us") operates the Castle &amp; Coastline mobile app and website. This policy explains what information we collect and how we use it.</p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Your name</strong> — your first name and surname, used to log you into your tour.</li>
        <li><strong>Feedback</strong> — any rating and message you choose to send us through the app.</li>
        <li><strong>Photos</strong> — any photos you choose to upload to share with your tour group.</li>
        <li><strong>Notification data</strong> — a device identifier used to send you tour notifications, handled through our notification provider, OneSignal.</li>
        <li><strong>Location</strong> — if you use the facility finder, your device location is used at that moment to find nearby services. It is not stored by us.</li>
      </ul>

      <h2>How we use it</h2>
      <p>We use this information solely to provide the tour experience: to log you in, show your itinerary, share group photos, send you tour reminders and updates, and improve the app based on your feedback. We do not sell your information or use it for advertising.</p>

      <h2>Who we share it with</h2>
      <p>We use trusted service providers to run the app: Supabase (data storage), Vercel (hosting), and OneSignal (notifications). They process data only to provide these services to us.</p>

      <h2>Data retention</h2>
      <p>We keep your information only as long as needed to run your tour and our service. You can ask us to delete your data at any time.</p>

      <h2>Your rights</h2>
      <p>Under UK data protection law you have the right to access, correct, or delete your personal data. To make a request, contact us using the details below.</p>

      <h2>Contact</h2>
      <p>For any questions about this policy or your data, contact Castle &amp; Coastline Tours at: <strong>danriding26@gmail.com</strong></p>
    </div>
  );
}

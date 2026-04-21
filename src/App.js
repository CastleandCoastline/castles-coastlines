import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase client ───────────────────────────────────────────────────────────
const supabase = createClient(
  "https://pukdpnkgsyewvbswoqyo.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1a2Rwbmtnc3lld3Zic3dvcXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTkwNDQsImV4cCI6MjA5MjMzNTA0NH0.UskWETDFraGynpZ2oT039DYpxGu8EJrgUgFN0AQ3Q8o"
);

// ── Guide password (change this to whatever you like) ─────────────────────────
const GUIDE_PASSWORD = "GUIDE2024";

// ── Helpers ───────────────────────────────────────────────────────────────────
async function loadAllTours() {
  const { data: tours, error } = await supabase
    .from("tours")
    .select("*")
    .order("created_at");
  if (error) throw error;

  const { data: days } = await supabase
    .from("days")
    .select("*")
    .order("day_number");

  const { data: scheduleItems } = await supabase
    .from("schedule_items")
    .select("*")
    .order("sort_order");

  const { data: attractions } = await supabase
    .from("attractions")
    .select("*")
    .order("sort_order");

  return tours.map((tour) => ({
    ...tour,
    days: (days || [])
      .filter((d) => d.tour_id === tour.id)
      .map((day) => ({
        ...day,
        day: day.day_number,
        title: day.title,
        location: day.location,
        schedule: (scheduleItems || [])
          .filter((s) => s.day_id === day.id)
          .map((s) => ({ time: s.time, label: s.label, note: s.note })),
        attractions: (attractions || [])
          .filter((a) => a.day_id === day.id)
          .map((a) => ({
            name: a.name,
            desc: a.description,
            lat: parseFloat(a.latitude),
            lng: parseFloat(a.longitude),
          })),
      })),
  }));
}

async function saveTourToDB(tour) {
  const { error } = await supabase.from("tours").upsert({
    id: tour.id,
    name: tour.name,
    duration: tour.duration,
    description: tour.description,
    password: tour.password,
    announcement: tour.announcement || "",
  });
  if (error) throw error;
}

async function saveDayToDB(tourId, day) {
  // Upsert day
  const { data: dayRow, error: dayErr } = await supabase
    .from("days")
    .upsert(
      {
        id: day.id || undefined,
        tour_id: tourId,
        day_number: day.day,
        title: day.title,
        location: day.location,
      },
      { onConflict: "id" }
    )
    .select()
    .single();
  if (dayErr) throw dayErr;

  const dayId = dayRow.id;

  // Delete and reinsert schedule
  await supabase.from("schedule_items").delete().eq("day_id", dayId);
  if (day.schedule.length > 0) {
    await supabase.from("schedule_items").insert(
      day.schedule.map((s, i) => ({
        day_id: dayId,
        time: s.time,
        label: s.label,
        note: s.note,
        sort_order: i,
      }))
    );
  }

  // Delete and reinsert attractions
  await supabase.from("attractions").delete().eq("day_id", dayId);
  if (day.attractions.length > 0) {
    await supabase.from("attractions").insert(
      day.attractions.map((a, i) => ({
        day_id: dayId,
        name: a.name,
        description: a.desc,
        latitude: a.lat,
        longitude: a.lng,
        sort_order: i,
      }))
    );
  }

  return dayId;
}

async function deleteDayFromDB(dayId) {
  await supabase.from("days").delete().eq("id", dayId);
}

async function deleteTourFromDB(tourId) {
  await supabase.from("tours").delete().eq("id", tourId);
}

// ── Leaflet Map ───────────────────────────────────────────────────────────────
const LeafletMap = ({ attractions }) => {
  const mapInstanceRef = useRef(null);
  const uid = useRef("map-" + Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!window.L || !attractions?.length) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    const center = attractions.reduce(
      (a, c) => [a[0] + c.lat / attractions.length, a[1] + c.lng / attractions.length],
      [0, 0]
    );
    const map = window.L.map(uid.current, { zoomControl: true, scrollWheelZoom: false }).setView(center, 13);
    mapInstanceRef.current = map;
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);
    attractions.forEach((a, i) => {
      const icon = window.L.divIcon({
        className: "",
        html: `<div style="width:30px;height:30px;border-radius:50%;background:#c9a96e;border:3px solid #1a2332;display:flex;align-items:center;justify-content:center;font-weight:700;color:#1a1a2e;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.5)">${i + 1}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      window.L.marker([a.lat, a.lng], { icon })
        .addTo(map)
        .bindPopup(`<strong>${a.name}</strong><br/><span style="color:#aaa">${a.desc}</span>`);
    });
    if (attractions.length > 1) {
      map.fitBounds(window.L.latLngBounds(attractions.map((a) => [a.lat, a.lng])), { padding: [30, 30] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attractions]);

  useEffect(() => () => { if (mapInstanceRef.current) mapInstanceRef.current.remove(); }, []);
  if (!attractions?.length) return null;
  return (
    <div style={{ marginTop: 16, borderRadius: 14, overflow: "hidden", border: "1px solid #c9a96e30" }}>
      <div id={uid.current} style={{ height: 280, width: "100%", background: "#1a2332" }} />
    </div>
  );
};

// ── QR Modal ──────────────────────────────────────────────────────────────────
const QRModal = ({ tour, appUrl, onClose }) => {
  const canvasRef = useRef(null);
  const [qrReady, setQrReady] = useState(false);
  const guestUrl = `${appUrl}?tour=${tour.id}`;

  useEffect(() => {
    if (!window.QRCode) {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      s.onload = () => setQrReady(true);
      document.head.appendChild(s);
    } else setQrReady(true);
  }, []);

  useEffect(() => {
    if (!qrReady || !canvasRef.current) return;
    canvasRef.current.innerHTML = "";
    new window.QRCode(canvasRef.current, {
      text: guestUrl,
      width: 220,
      height: 220,
      colorDark: "#1a2332",
      colorLight: "#f5f0e8",
      correctLevel: window.QRCode.CorrectLevel.H,
    });
  }, [qrReady, guestUrl]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000dd", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#1a2332", borderRadius: 24, padding: 28, maxWidth: 360, width: "100%", border: "1px solid #c9a96e30", textAlign: "center" }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: "#f0e6d3", marginBottom: 4 }}>{tour.name}</div>
        <div style={{ fontSize: 13, color: "#607080", marginBottom: 20 }}>Share this QR with your guests</div>
        <div style={{ background: "#f5f0e8", borderRadius: 16, padding: 20, display: "inline-block", marginBottom: 20 }}>
          {!qrReady ? (
            <div style={{ width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#607080" }}>Generating…</div>
          ) : (
            <div ref={canvasRef} />
          )}
        </div>
        <div style={{ background: "#c9a96e15", border: "1px solid #c9a96e40", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Guest Access Code</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#f0e6d3", letterSpacing: 4, fontFamily: "monospace" }}>{tour.password}</div>
          <div style={{ fontSize: 12, color: "#506070", marginTop: 4 }}>Guests enter this after scanning</div>
        </div>
        <div style={{ background: "#0d1520", borderRadius: 10, padding: "10px 14px", marginBottom: 20, textAlign: "left" }}>
          <div style={{ fontSize: 12, color: "#607080", lineHeight: 1.7 }}>
            <div>📱 <strong style={{ color: "#a0b0c0" }}>Scan</strong> the QR with your phone camera</div>
            <div>🔑 <strong style={{ color: "#a0b0c0" }}>Enter</strong> the access code above</div>
            <div>🏰 <strong style={{ color: "#a0b0c0" }}>View</strong> your full tour itinerary</div>
            <div style={{ marginTop: 6, borderTop: "1px solid #ffffff10", paddingTop: 6 }}>📲 <strong style={{ color: "#a0b0c0" }}>Add to Home Screen</strong> for app-like access</div>
          </div>
        </div>
        <button onClick={onClose} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Done</button>
      </div>
    </div>
  );
};

// ── Guest Login ───────────────────────────────────────────────────────────────
const GuestLogin = ({ tours, onUnlock, onGuideLogin }) => {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const tryUnlock = () => {
    if (code.trim().toUpperCase() === GUIDE_PASSWORD) {
      onGuideLogin();
      return;
    }
    const match = tours.find((t) => t.password.toUpperCase() === code.trim().toUpperCase());
    if (match) {
      onUnlock(match);
    } else {
      setError("That code doesn't match any tour. Please check with your guide.");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0d1520 0%,#1a2332 60%,#0d1520 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "'Lato',sans-serif" }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🏰</div>
      <div style={{ fontSize: 11, letterSpacing: 4, color: "#c9a96e", textTransform: "uppercase", marginBottom: 8 }}>Castles & Coastlines</div>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, color: "#f0e6d3", textAlign: "center", marginBottom: 8 }}>Welcome</div>
      <div style={{ color: "#607080", fontSize: 14, textAlign: "center", marginBottom: 40, maxWidth: 280, lineHeight: 1.6 }}>
        Enter the access code provided by your tour guide to view your itinerary
      </div>
      <div style={{ width: "100%", maxWidth: 320 }}>
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
          placeholder="TOURCODE"
          maxLength={12}
          style={{
            width: "100%", textAlign: "center", fontSize: 24, fontWeight: 700, letterSpacing: 6,
            padding: "16px 12px", borderRadius: 14, border: `2px solid ${error ? "#ff4444" : "#c9a96e40"}`,
            background: "#1a2332", color: "#f0e6d3", outline: "none", fontFamily: "monospace",
            marginBottom: 12,
            transform: shake ? "translateX(-6px)" : "none",
            transition: "transform 0.1s, border-color 0.2s",
          }}
        />
        {error && <div style={{ color: "#ff6666", fontSize: 13, textAlign: "center", marginBottom: 12 }}>{error}</div>}
        <button onClick={tryUnlock} style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 14, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
          Access My Tour →
        </button>
      </div>
      <div style={{ marginTop: 48, background: "#1a2332", borderRadius: 14, padding: "14px 18px", maxWidth: 300, border: "1px solid #ffffff10" }}>
        <div style={{ fontSize: 12, color: "#506070", textAlign: "center", lineHeight: 1.7 }}>
          📲 <strong style={{ color: "#8090a0" }}>Add to your home screen</strong> for quick access<br />
          <span style={{ fontSize: 11 }}>Tap Share → "Add to Home Screen" in Safari</span>
        </div>
      </div>
    </div>
  );
};

// ── Announcement Banner ───────────────────────────────────────────────────────
const AnnouncementBanner = ({ text }) => {
  if (!text) return null;
  return (
    <div style={{ background: "linear-gradient(135deg,#c9a96e,#a07840)", padding: "12px 20px", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>📢</span>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a2e", letterSpacing: 1, textTransform: "uppercase" }}>Guide Update</div>
        <div style={{ fontSize: 14, color: "#1a1a2e", marginTop: 2, fontWeight: 500 }}>{text}</div>
      </div>
    </div>
  );
};

// ── Guest View ────────────────────────────────────────────────────────────────
const GuestView = ({ tour, onLogout }) => {
  const [activeDay, setActiveDay] = useState(0);
  const day = tour.days[activeDay];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0d1520 0%,#1a2332 50%,#0d1520 100%)", fontFamily: "'Lato',sans-serif", color: "#f0e6d3" }}>
      <AnnouncementBanner text={tour.announcement} />
      <div style={{ background: "linear-gradient(180deg,#0a0f1a 0%,transparent 100%)", padding: "24px 24px 16px", borderBottom: "1px solid #ffffff10" }}>
        <button onClick={onLogout} style={{ background: "none", border: "none", color: "#506070", cursor: "pointer", fontSize: 12, marginBottom: 10, padding: 0 }}>← Change tour</button>
        <div style={{ fontSize: 11, letterSpacing: 3, color: "#c9a96e", textTransform: "uppercase", marginBottom: 4 }}>Castles & Coastlines</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{tour.name}</div>
        <div style={{ color: "#8090a0", fontSize: 13, marginTop: 4 }}>{tour.duration}-day tour</div>
      </div>

      {tour.days.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#405060" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗓️</div>
          <div>Your itinerary is being prepared. Check back soon!</div>
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto", padding: "14px 20px", display: "flex", gap: 8, borderBottom: "1px solid #ffffff10" }}>
            {tour.days.map((d, i) => (
              <button key={i} onClick={() => setActiveDay(i)} style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 20, border: `1px solid ${activeDay === i ? "#c9a96e" : "#ffffff20"}`, background: activeDay === i ? "#c9a96e" : "transparent", color: activeDay === i ? "#1a1a2e" : "#a0b0c0", fontWeight: activeDay === i ? 700 : 400, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                Day {d.day}
              </button>
            ))}
          </div>
          <div style={{ padding: "24px" }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "#c9a96e", textTransform: "uppercase", marginBottom: 4 }}>Day {day.day}</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{day.title}</div>
            <div style={{ color: "#7080a0", fontSize: 13, marginBottom: 24 }}>📍 {day.location}</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: "#c9a96e", marginBottom: 14 }}>Today's Schedule</div>
            {day.schedule.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 16, paddingBottom: 20 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#c9a96e", marginTop: 4 }} />
                  {i < day.schedule.length - 1 && <div style={{ width: 1, flex: 1, background: "#c9a96e30", marginTop: 4 }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#c9a96e" }}>{item.time}</span>
                    <span style={{ fontSize: 15, color: "#f0e6d3", fontWeight: 500 }}>{item.label}</span>
                  </div>
                  {item.note && <div style={{ fontSize: 13, color: "#6070a0", marginTop: 2 }}>{item.note}</div>}
                </div>
              </div>
            ))}
            {day.attractions?.length > 0 && (
              <>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: "#c9a96e", marginTop: 8, marginBottom: 14 }}>Attractions & Map</div>
                <LeafletMap attractions={day.attractions} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                  {day.attractions.map((a, i) => (
                    <a key={i} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.name + " " + day.location)}`} target="_blank" rel="noopener noreferrer"
                      style={{ background: "#1a2332", border: "1px solid #ffffff10", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#c9a96e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#1a1a2e", flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#f0e6d3", fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                        <div style={{ color: "#607080", fontSize: 12, marginTop: 2 }}>{a.desc}</div>
                      </div>
                      <span style={{ color: "#c9a96e", fontSize: 18 }}>↗</span>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── Edit Day Modal ─────────────────────────────────────────────────────────────
const EditDayModal = ({ day, onSave, onClose, saving }) => {
  const [d, setD] = useState(JSON.parse(JSON.stringify(day)));
  const updSched = (i, f, v) => { const s = [...d.schedule]; s[i] = { ...s[i], [f]: v }; setD({ ...d, schedule: s }); };
  const updAttr = (i, f, v) => { const a = [...d.attractions]; a[i] = { ...a[i], [f]: v }; setD({ ...d, attractions: a }); };
  const inp = (val, fn, ph, type = "text") => (
    <input value={val} onChange={(e) => fn(e.target.value)} placeholder={ph} type={type}
      style={{ background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "8px 10px", color: "#f0e6d3", fontSize: 13, width: "100%", outline: "none" }} />
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ background: "#1a2332", borderRadius: 20, padding: 24, maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: "#f0e6d3" }}>Edit Day {d.day}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#607080", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>Day Title</label>
          {inp(d.title, (v) => setD({ ...d, title: v }), "e.g. Arrival — Edinburgh")}
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>Location</label>
          {inp(d.location, (v) => setD({ ...d, location: v }), "e.g. Edinburgh, Scotland")}
        </div>
        <div style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Schedule</div>
        {d.schedule.map((s, i) => (
          <div key={i} style={{ background: "#0d1520", borderRadius: 10, padding: 12, marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: "0 0 76px" }}>{inp(s.time, (v) => updSched(i, "time", v), "09:00")}</div>
              <div style={{ flex: 1 }}>{inp(s.label, (v) => updSched(i, "label", v), "Activity")}</div>
              <button onClick={() => setD({ ...d, schedule: d.schedule.filter((_, j) => j !== i) })} style={{ background: "#ff444420", border: "none", borderRadius: 6, color: "#ff6666", cursor: "pointer", padding: "0 8px", fontSize: 16 }}>×</button>
            </div>
            {inp(s.note, (v) => updSched(i, "note", v), "Note (optional)")}
          </div>
        ))}
        <button onClick={() => setD({ ...d, schedule: [...d.schedule, { time: "", label: "", note: "" }] })} style={{ width: "100%", padding: "9px", background: "#c9a96e15", border: "1px dashed #c9a96e50", borderRadius: 10, color: "#c9a96e", fontSize: 13, cursor: "pointer", marginBottom: 20 }}>+ Add Time Slot</button>
        <div style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Attractions & Map Pins</div>
        {d.attractions.map((a, i) => (
          <div key={i} style={{ background: "#0d1520", borderRadius: 10, padding: 12, marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>{inp(a.name, (v) => updAttr(i, "name", v), "Attraction name")}</div>
              <button onClick={() => setD({ ...d, attractions: d.attractions.filter((_, j) => j !== i) })} style={{ background: "#ff444420", border: "none", borderRadius: 6, color: "#ff6666", cursor: "pointer", padding: "0 8px", fontSize: 16 }}>×</button>
            </div>
            {inp(a.desc, (v) => updAttr(i, "desc", v), "Short description")}
            <div style={{ display: "flex", gap: 6 }}>
              <input value={a.lat} onChange={(e) => updAttr(i, "lat", parseFloat(e.target.value) || 0)} placeholder="Latitude" type="number" step="0.0001"
                style={{ flex: 1, background: "#1a2332", border: "1px solid #ffffff15", borderRadius: 8, padding: "7px 8px", color: "#c9a96e", fontSize: 12, outline: "none" }} />
              <input value={a.lng} onChange={(e) => updAttr(i, "lng", parseFloat(e.target.value) || 0)} placeholder="Longitude" type="number" step="0.0001"
                style={{ flex: 1, background: "#1a2332", border: "1px solid #ffffff15", borderRadius: 8, padding: "7px 8px", color: "#c9a96e", fontSize: 12, outline: "none" }} />
            </div>
            <div style={{ fontSize: 11, color: "#405060" }}>💡 Right-click in Google Maps → "What's here?" for coordinates</div>
          </div>
        ))}
        <button onClick={() => setD({ ...d, attractions: [...d.attractions, { name: "", desc: "", lat: 54.0, lng: -2.0 }] })} style={{ width: "100%", padding: "9px", background: "#c9a96e15", border: "1px dashed #c9a96e50", borderRadius: 10, color: "#c9a96e", fontSize: 13, cursor: "pointer", marginBottom: 24 }}>+ Add Attraction</button>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 12, color: "#8090a0", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onSave(d)} disabled={saving} style={{ flex: 2, padding: "12px", background: saving ? "#806040" : "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Saving…" : "Save Day"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Add Tour Modal ─────────────────────────────────────────────────────────────
const AddTourModal = ({ onSave, onClose, saving }) => {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [desc, setDesc] = useState("");
  const [password, setPassword] = useState("");
  const inp = (val, fn, ph, type = "text") => (
    <input value={val} onChange={(e) => fn(e.target.value)} placeholder={ph} type={type}
      style={{ background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 14, width: "100%", outline: "none" }} />
  );
  const handleSave = () => {
    if (!name || !duration || !password) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
    onSave({ id, name, duration: parseInt(duration), description: desc, password: password.toUpperCase(), announcement: "", days: [] });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, display: "flex", alignItems: "center", padding: "0 16px" }}>
      <div style={{ background: "#1a2332", borderRadius: 20, padding: 24, width: "100%", maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30" }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: "#f0e6d3", marginBottom: 20 }}>New Tour</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>Tour Name</label>
          {inp(name, setName, "e.g. Highlands & Castles")}
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>Duration (days)</label>
          {inp(duration, setDuration, "e.g. 10", "number")}
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>Description</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief description..."
            style={{ background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 14, width: "100%", outline: "none", resize: "vertical", minHeight: 70, fontFamily: "'Lato',sans-serif" }} />
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>Guest Access Code</label>
          {inp(password, (v) => setPassword(v.toUpperCase()), "e.g. SCOTLAND24")}
          <div style={{ fontSize: 12, color: "#506070" }}>Guests enter this code to access this tour only.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 12, color: "#8090a0", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: "12px", background: saving ? "#806040" : "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Creating…" : "Create Tour"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Guide Dashboard ───────────────────────────────────────────────────────────
const GuideDashboard = ({ tours, onLogout, onRefresh }) => {
  const [activeTourId, setActiveTourId] = useState(tours[0]?.id || null);
  const [editingDay, setEditingDay] = useState(null);
  const [showAddTour, setShowAddTour] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [saving, setSaving] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [announcementSaved, setAnnouncementSaved] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const tour = tours.find((t) => t.id === activeTourId) || tours[0];

  useEffect(() => {
    if (tour) {
      setAnnouncementDraft(tour.announcement || "");
      setPasswordDraft(tour.password || "");
      setAnnouncementSaved(false);
      setEditingPassword(false);
    }
  }, [activeTourId]);

  const showStatus = (msg) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(""), 3000); };

  const saveDay = async (updatedDay) => {
    setSaving(true);
    try {
      await saveDayToDB(tour.id, updatedDay);
      await onRefresh();
      setEditingDay(null);
      showStatus("✓ Day saved");
    } catch (e) {
      showStatus("❌ Save failed — check connection");
    }
    setSaving(false);
  };

  const addDay = () => {
    const nextDay = tour.days.length > 0 ? Math.max(...tour.days.map((d) => d.day)) + 1 : 1;
    setEditingDay({ day: nextDay, title: `Day ${nextDay}`, location: "", schedule: [], attractions: [] });
  };

  const deleteDay = async (day) => {
    if (!window.confirm(`Delete Day ${day.day}: ${day.title}?`)) return;
    setSaving(true);
    try {
      if (day.id) await deleteDayFromDB(day.id);
      await onRefresh();
      showStatus("✓ Day deleted");
    } catch (e) {
      showStatus("❌ Delete failed");
    }
    setSaving(false);
  };

  const addTour = async (t) => {
    setSaving(true);
    try {
      await saveTourToDB(t);
      await onRefresh();
      setActiveTourId(t.id);
      setShowAddTour(false);
      showStatus("✓ Tour created");
    } catch (e) {
      showStatus("❌ Failed to create tour");
    }
    setSaving(false);
  };

  const saveAnnouncement = async () => {
    try {
      await supabase.from("tours").update({ announcement: announcementDraft }).eq("id", tour.id);
      await onRefresh();
      setAnnouncementSaved(true);
      setTimeout(() => setAnnouncementSaved(false), 2500);
    } catch (e) {
      showStatus("❌ Failed to post announcement");
    }
  };

  const clearAnnouncement = async () => {
    setAnnouncementDraft("");
    await supabase.from("tours").update({ announcement: "" }).eq("id", tour.id);
    await onRefresh();
  };

  const savePassword = async () => {
    try {
      await supabase.from("tours").update({ password: passwordDraft.toUpperCase() }).eq("id", tour.id);
      await onRefresh();
      setEditingPassword(false);
      showStatus("✓ Access code updated");
    } catch (e) {
      showStatus("❌ Failed to update code");
    }
  };

  const deleteTour = async () => {
    if (!window.confirm(`Permanently delete "${tour.name}" and all its days?`)) return;
    setSaving(true);
    try {
      await deleteTourFromDB(tour.id);
      await onRefresh();
      showStatus("✓ Tour deleted");
    } catch (e) {
      showStatus("❌ Failed to delete tour");
    }
    setSaving(false);
  };

  if (!tour) return (
    <div style={{ minHeight: "100vh", background: "#0d1520", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Lato',sans-serif", color: "#f0e6d3" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🏰</div>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, marginBottom: 20 }}>No tours yet</div>
      <button onClick={() => setShowAddTour(true)} style={{ padding: "12px 24px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Create Your First Tour</button>
      {showAddTour && <AddTourModal onSave={addTour} onClose={() => setShowAddTour(false)} saving={saving} />}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0d1520", fontFamily: "'Lato',sans-serif", color: "#f0e6d3" }}>
      {/* Status message */}
      {statusMsg && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#1a2332", border: "1px solid #c9a96e40", borderRadius: 10, padding: "8px 20px", color: "#c9a96e", fontSize: 13, fontWeight: 600, zIndex: 2000, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
          {statusMsg}
        </div>
      )}

      <div style={{ background: "linear-gradient(135deg,#1a2332 0%,#0d1520 100%)", padding: "28px 24px 20px", borderBottom: "1px solid #c9a96e30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 3, color: "#c9a96e", textTransform: "uppercase", marginBottom: 6 }}>Guide Dashboard</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 700 }}>Castles & Coastlines</div>
          </div>
          <button onClick={onLogout} style={{ background: "none", border: "1px solid #ffffff20", borderRadius: 8, color: "#607080", fontSize: 12, cursor: "pointer", padding: "6px 10px" }}>Log out</button>
        </div>
      </div>

      {/* Tour Tabs */}
      <div style={{ padding: "16px 20px 0", borderBottom: "1px solid #ffffff10" }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 16 }}>
          {tours.map((t) => (
            <button key={t.id} onClick={() => setActiveTourId(t.id)}
              style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 20, border: `1px solid ${activeTourId === t.id ? "#c9a96e" : "#ffffff20"}`, background: activeTourId === t.id ? "#c9a96e15" : "transparent", color: activeTourId === t.id ? "#c9a96e" : "#7080a0", fontWeight: activeTourId === t.id ? 600 : 400, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
              {t.name}
            </button>
          ))}
          <button onClick={() => setShowAddTour(true)} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 20, border: "1px dashed #c9a96e50", background: "transparent", color: "#c9a96e", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>+ New Tour</button>
        </div>
      </div>

      <div style={{ padding: "20px 24px" }}>
        {/* Stats */}
        <div style={{ background: "#1a2332", borderRadius: 16, padding: "16px 20px", marginBottom: 16, border: "1px solid #c9a96e20" }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{tour.name}</div>
          <div style={{ color: "#607080", fontSize: 12, marginBottom: 14 }}>{tour.description}</div>
          <div style={{ display: "flex", gap: 20 }}>
            {[["DAYS", tour.duration], ["LOADED", tour.days.length], ["STOPS", tour.days.reduce((a, d) => a + (d.attractions?.length || 0), 0)]].map(([l, v]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#c9a96e" }}>{v}</div>
                <div style={{ fontSize: 10, color: "#405060", letterSpacing: 1 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <button onClick={() => setShowQR(true)} style={{ padding: "13px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Show QR Code 📱</button>
          <button onClick={deleteTour} style={{ padding: "13px", background: "#ff444415", border: "1px solid #ff444430", borderRadius: 12, color: "#ff6666", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Delete Tour</button>
        </div>

        {/* Access Code */}
        <div style={{ background: "#1a2332", borderRadius: 16, padding: 20, marginBottom: 16, border: "1px solid #c9a96e20" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16 }}>🔑 Guest Access Code</div>
            <button onClick={() => setEditingPassword(!editingPassword)} style={{ background: "none", border: "none", color: "#c9a96e", fontSize: 13, cursor: "pointer" }}>{editingPassword ? "Cancel" : "Change"}</button>
          </div>
          {editingPassword ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input value={passwordDraft} onChange={(e) => setPasswordDraft(e.target.value.toUpperCase())} maxLength={12}
                style={{ flex: 1, background: "#0d1520", border: "1px solid #c9a96e40", borderRadius: 8, padding: "9px 12px", color: "#f0e6d3", fontSize: 16, fontFamily: "monospace", letterSpacing: 3, outline: "none" }} />
              <button onClick={savePassword} style={{ padding: "9px 16px", background: "#c9a96e", borderRadius: 8, border: "none", color: "#1a1a2e", fontWeight: 700, cursor: "pointer" }}>Save</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 4, color: "#f0e6d3", fontFamily: "monospace" }}>{tour.password}</div>
              <div style={{ fontSize: 12, color: "#506070" }}>Share with guests at tour start</div>
            </div>
          )}
        </div>

        {/* Announcement */}
        <div style={{ background: "#1a2332", borderRadius: 16, padding: 20, marginBottom: 20, border: "1px solid #c9a96e20" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>📢</span>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16 }}>Guest Announcement</div>
            {tour.announcement && <div style={{ marginLeft: "auto", background: "#c9a96e20", border: "1px solid #c9a96e40", borderRadius: 6, padding: "2px 8px", color: "#c9a96e", fontSize: 11 }}>LIVE</div>}
          </div>
          <div style={{ fontSize: 13, color: "#607080", marginBottom: 12 }}>Guests see this highlighted at the top of their view — saved to the database instantly</div>
          <textarea value={announcementDraft} onChange={(e) => setAnnouncementDraft(e.target.value)} placeholder="e.g. Coach departs 15 minutes early — meet at 8:45am in the lobby!"
            style={{ width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 10, padding: "10px 12px", color: "#f0e6d3", fontSize: 14, resize: "vertical", minHeight: 80, outline: "none", fontFamily: "'Lato',sans-serif" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {tour.announcement && <button onClick={clearAnnouncement} style={{ padding: "9px 14px", background: "#ff444415", border: "1px solid #ff444430", borderRadius: 10, color: "#ff6666", fontSize: 13, cursor: "pointer" }}>Clear</button>}
            <button onClick={saveAnnouncement} style={{ flex: 1, padding: "9px", background: announcementSaved ? "#2a4a2a" : "#c9a96e20", border: `1px solid ${announcementSaved ? "#4a8a4a" : "#c9a96e40"}`, borderRadius: 10, color: announcementSaved ? "#6abf6a" : "#c9a96e", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.3s" }}>
              {announcementSaved ? "✓ Posted to guests!" : "Post to Guests"}
            </button>
          </div>
        </div>

        {/* Days */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#607080", letterSpacing: 1, textTransform: "uppercase" }}>Itinerary Days</div>
          <button onClick={addDay} style={{ background: "#c9a96e15", border: "1px solid #c9a96e40", borderRadius: 8, padding: "5px 12px", color: "#c9a96e", fontSize: 12, cursor: "pointer" }}>+ Add Day</button>
        </div>

        {tour.days.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#405060", border: "1px dashed #ffffff15", borderRadius: 16 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗓️</div>
            <div style={{ marginBottom: 16 }}>No days yet — start building your itinerary</div>
            <button onClick={addDay} style={{ background: "linear-gradient(135deg,#c9a96e,#a07840)", border: "none", borderRadius: 10, padding: "10px 20px", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Add First Day</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tour.days.map((day) => (
              <div key={day.id || day.day} style={{ background: "#1a2332", borderRadius: 12, border: "1px solid #ffffff10", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#c9a96e20", border: "1px solid #c9a96e50", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#c9a96e", flexShrink: 0 }}>{day.day}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{day.title}</div>
                  <div style={{ color: "#506070", fontSize: 12, marginTop: 2 }}>📍 {day.location || "No location set"} · {day.schedule.length} events · {day.attractions?.length || 0} attractions</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setEditingDay(day)} style={{ background: "#c9a96e20", border: "1px solid #c9a96e40", borderRadius: 8, padding: "6px 12px", color: "#c9a96e", fontSize: 13, cursor: "pointer" }}>Edit</button>
                  <button onClick={() => deleteDay(day)} style={{ background: "#ff444415", border: "1px solid #ff444430", borderRadius: 8, padding: "6px 10px", color: "#ff6666", fontSize: 13, cursor: "pointer" }}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingDay && <EditDayModal day={editingDay} onSave={saveDay} onClose={() => setEditingDay(null)} saving={saving} />}
      {showAddTour && <AddTourModal onSave={addTour} onClose={() => setShowAddTour(false)} saving={saving} />}
      {showQR && <QRModal tour={tour} appUrl={window.location.href} onClose={() => setShowQR(false)} />}
    </div>
  );
};

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("login");
  const [guestTourId, setGuestTourId] = useState(null);
  const [isGuide, setIsGuide] = useState(false);

  const fetchTours = async () => {
    try {
      const data = await loadAllTours();
      setTours(data);
    } catch (e) {
      console.error("Failed to load tours:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    // Load Leaflet
    if (!window.L) {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(css);
      const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; document.head.appendChild(s);
    }
    fetchTours();
  }, []);

  const liveTour = guestTourId ? tours.find((t) => t.id === guestTourId) : null;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1520", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Lato',sans-serif", color: "#f0e6d3" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🏰</div>
        <div style={{ fontSize: 11, letterSpacing: 4, color: "#c9a96e", textTransform: "uppercase" }}>Castles & Coastlines</div>
        <div style={{ color: "#405060", fontSize: 13, marginTop: 12 }}>Loading your tours…</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0d1520; }
        ::-webkit-scrollbar-thumb { background: #c9a96e40; border-radius: 2px; }
        .leaflet-container { font-family: 'Lato', sans-serif !important; }
        .leaflet-popup-content-wrapper { background: #1a2332 !important; color: #f0e6d3 !important; border: 1px solid #c9a96e30 !important; border-radius: 10px !important; }
        .leaflet-popup-tip { background: #1a2332 !important; }
        textarea, input { font-family: 'Lato', sans-serif; }
      `}</style>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {view === "login" && (
          <GuestLogin
            tours={tours}
            onUnlock={(tour) => { setGuestTourId(tour.id); setView("guest"); }}
            onGuideLogin={() => { setIsGuide(true); setView("guide"); }}
          />
        )}
        {view === "guide" && isGuide && (
          <GuideDashboard
            tours={tours}
            onLogout={() => { setIsGuide(false); setView("login"); }}
            onRefresh={fetchTours}
          />
        )}
        {view === "guest" && liveTour && (
          <GuestView tour={liveTour} onLogout={() => setView("login")} />
        )}
      </div>
    </>
  );
}
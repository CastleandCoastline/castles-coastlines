/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://pukdpnkgsyewvbswoqyo.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1a2Rwbmtnc3lld3Zic3dvcXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTkwNDQsImV4cCI6MjA5MjMzNTA0NH0.UskWETDFraGynpZ2oT039DYpxGu8EJrgUgFN0AQ3Q8o"
);

const GUIDE_PASSWORD = "GUIDE2024";
const BUCKET = "tour-photos";

// ── Weather API (Open-Meteo — free, no key needed) ────────────────────────────
const WMO_CODES = {
  0: { label: "Clear", icon: "☀️" }, 1: { label: "Mainly clear", icon: "🌤️" },
  2: { label: "Partly cloudy", icon: "⛅" }, 3: { label: "Overcast", icon: "☁️" },
  45: { label: "Foggy", icon: "🌫️" }, 48: { label: "Icy fog", icon: "🌫️" },
  51: { label: "Light drizzle", icon: "🌦️" }, 53: { label: "Drizzle", icon: "🌦️" },
  55: { label: "Heavy drizzle", icon: "🌧️" }, 61: { label: "Light rain", icon: "🌧️" },
  63: { label: "Rain", icon: "🌧️" }, 65: { label: "Heavy rain", icon: "🌧️" },
  71: { label: "Light snow", icon: "🌨️" }, 73: { label: "Snow", icon: "❄️" },
  75: { label: "Heavy snow", icon: "❄️" }, 80: { label: "Showers", icon: "🌦️" },
  81: { label: "Rain showers", icon: "🌧️" }, 82: { label: "Heavy showers", icon: "⛈️" },
  95: { label: "Thunderstorm", icon: "⛈️" }, 99: { label: "Thunderstorm", icon: "⛈️" },
};

async function geocodeLocation(location) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
  const data = await res.json();
  if (!data.results?.length) return null;
  return { lat: data.results[0].latitude, lng: data.results[0].longitude, name: data.results[0].name };
}

async function fetchWeather(lat, lng) {
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FLondon&forecast_days=5`);
  const data = await res.json();
  return data.daily;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function loadAllTours() {
  const { data: tours, error } = await supabase.from("tours").select("*").order("created_at");
  if (error) throw error;
  const { data: days } = await supabase.from("days").select("*").order("day_number");
  const { data: scheduleItems } = await supabase.from("schedule_items").select("*").order("sort_order");
  const { data: attractions } = await supabase.from("attractions").select("*").order("sort_order");
  const { data: seats } = await supabase.from("seats").select("*").order("seat_number");
  return tours.map((tour) => ({
    ...tour,
    seats: (seats || []).filter((s) => s.tour_id === tour.id),
    days: (days || []).filter((d) => d.tour_id === tour.id).map((day) => ({
      ...day, day: day.day_number,
      schedule: (scheduleItems || []).filter((s) => s.day_id === day.id).map((s) => ({ time: s.time, label: s.label, note: s.note })),
      attractions: (attractions || []).filter((a) => a.day_id === day.id).map((a) => ({ name: a.name, desc: a.description, lat: parseFloat(a.latitude), lng: parseFloat(a.longitude) })),
    })),
  }));
}

async function saveTourToDB(tour) {
  const { error } = await supabase.from("tours").upsert({
    id: tour.id, name: tour.name, duration: tour.duration, description: tour.description,
    password: tour.password, announcement: tour.announcement || "",
    notes: tour.notes || "", guide_name: tour.guide_name || "",
    guide_phone: tour.guide_phone || "", guide_email: tour.guide_email || "",
    coach_rows: tour.coach_rows || 10, coach_cols: tour.coach_cols || 4,
  });
  if (error) throw error;
}

async function saveDayToDB(tourId, day) {
  const { data: dayRow, error: dayErr } = await supabase.from("days").upsert(
    { id: day.id || undefined, tour_id: tourId, day_number: day.day, title: day.title, location: day.location },
    { onConflict: "id" }
  ).select().single();
  if (dayErr) throw dayErr;
  const dayId = dayRow.id;
  await supabase.from("schedule_items").delete().eq("day_id", dayId);
  if (day.schedule.length > 0) await supabase.from("schedule_items").insert(day.schedule.map((s, i) => ({ day_id: dayId, time: s.time, label: s.label, note: s.note, sort_order: i })));
  await supabase.from("attractions").delete().eq("day_id", dayId);
  if (day.attractions.length > 0) await supabase.from("attractions").insert(day.attractions.map((a, i) => ({ day_id: dayId, name: a.name, description: a.desc, latitude: a.lat, longitude: a.lng, sort_order: i })));
  return dayId;
}

async function saveSeats(tourId, rows, cols, seatData) {
  await supabase.from("seats").delete().eq("tour_id", tourId);
  const toInsert = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const seatNum = r * cols + c + 1;
      const key = `${r}-${c}`;
      toInsert.push({ tour_id: tourId, seat_number: seatNum, row: r, col: c, guest_name: seatData[key] || "" });
    }
  }
  if (toInsert.length > 0) await supabase.from("seats").insert(toInsert);
}

async function deleteDayFromDB(dayId) { await supabase.from("days").delete().eq("id", dayId); }
async function deleteTourFromDB(tourId) { await supabase.from("tours").delete().eq("id", tourId); }

async function loadPhotos(tourId) {
  const { data, error } = await supabase.from("photos").select("*").eq("tour_id", tourId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((p) => ({ ...p, url: supabase.storage.from(BUCKET).getPublicUrl(p.storage_path).data.publicUrl }));
}

async function uploadPhoto(tourId, file, caption, uploadedBy) {
  const ext = file.name.split(".").pop();
  const path = `${tourId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (upErr) throw upErr;
  await supabase.from("photos").insert({ tour_id: tourId, storage_path: path, caption, uploaded_by: uploadedBy });
}

async function deletePhoto(photo) {
  await supabase.storage.from(BUCKET).remove([photo.storage_path]);
  await supabase.from("photos").delete().eq("id", photo.id);
}

// ── Weather Widget ────────────────────────────────────────────────────────────
const WeatherWidget = ({ location }) => {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!location) { setLoading(false); return; }
    setLoading(true); setError(false);
    (async () => {
      try {
        const geo = await geocodeLocation(location);
        if (!geo) { setError(true); setLoading(false); return; }
        const w = await fetchWeather(geo.lat, geo.lng);
        const days = w.time.slice(0, 5).map((date, i) => ({
          date, code: w.weathercode[i],
          max: Math.round(w.temperature_2m_max[i]),
          min: Math.round(w.temperature_2m_min[i]),
          rain: w.precipitation_probability_max[i],
        }));
        setWeather({ days, place: geo.name });
      } catch (e) { setError(true); }
      setLoading(false);
    })();
  }, [location]);

  if (loading) return (
    <div style={{ background: "#1a2332", borderRadius: 14, padding: "14px 18px", marginBottom: 20, border: "1px solid #ffffff10", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 20 }}>🌤️</span>
      <span style={{ color: "#506070", fontSize: 13 }}>Loading weather for {location}…</span>
    </div>
  );

  if (error || !weather) return null;

  return (
    <div style={{ background: "#1a2332", borderRadius: 14, padding: "14px 16px", marginBottom: 20, border: "1px solid #ffffff10" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>🌤️</span>
        <span style={{ fontSize: 12, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>5-Day Forecast — {weather.place}</span>
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {weather.days.map((day, i) => {
          const wmo = WMO_CODES[day.code] || { label: "Unknown", icon: "🌡️" };
          const date = new Date(day.date);
          const dayName = i === 0 ? "Today" : date.toLocaleDateString("en-GB", { weekday: "short" });
          return (
            <div key={i} style={{ flexShrink: 0, textAlign: "center", background: i === 0 ? "#c9a96e15" : "#0d1520", border: `1px solid ${i === 0 ? "#c9a96e40" : "#ffffff10"}`, borderRadius: 10, padding: "10px 12px", minWidth: 70 }}>
              <div style={{ fontSize: 11, color: i === 0 ? "#c9a96e" : "#607080", fontWeight: i === 0 ? 700 : 400, marginBottom: 4 }}>{dayName}</div>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{wmo.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f0e6d3" }}>{day.max}°</div>
              <div style={{ fontSize: 11, color: "#506070" }}>{day.min}°</div>
              {day.rain > 0 && <div style={{ fontSize: 10, color: "#6090c0", marginTop: 3 }}>💧{day.rain}%</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Coach Seating Plan ────────────────────────────────────────────────────────
const CoachSeatingPlan = ({ tour, guestName, isGuide }) => {
  const rows = tour.coach_rows || 10;
  const cols = tour.coach_cols || 4;
  const seats = tour.seats || [];

  const getSeat = (r, c) => seats.find((s) => s.row === r && s.col === c);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Coach Seating</div>
      <div style={{ color: "#7080a0", fontSize: 13, marginBottom: 20 }}>Find your seat before you board</div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        {[["#c9a96e", "Your seat"], ["#2a4a6b", "Taken"], ["#1a2332", "Available"]].map(([color, label]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: color, border: "1px solid #ffffff20" }} />
            <span style={{ fontSize: 12, color: "#8090a0" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Coach outline */}
      <div style={{ background: "#1a2332", borderRadius: 20, padding: 20, border: "1px solid #ffffff10" }}>
        {/* Driver area */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ background: "#0d1520", borderRadius: 10, padding: "8px 24px", border: "1px solid #c9a96e30", textAlign: "center" }}>
            <div style={{ fontSize: 20 }}>🚌</div>
            <div style={{ fontSize: 10, color: "#506070", marginTop: 2 }}>DRIVER</div>
          </div>
        </div>

        {/* Seat grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {Array.from({ length: cols }).map((_, c) => {
                const seatNum = r * cols + c + 1;
                const seat = getSeat(r, c);
                const occupied = seat?.guest_name;
                const isMySeat = occupied && guestName && occupied.toLowerCase() === guestName.toLowerCase();
                return (
                  <div key={c} style={{ display: "flex", alignItems: "center" }}>
                    {/* Aisle gap */}
                    {cols === 4 && c === 2 && <div style={{ width: 20 }} />}
                    <div title={occupied ? `Seat ${seatNum} — ${occupied}` : `Seat ${seatNum} — Available`}
                      style={{ width: 44, height: 46, borderRadius: 8, background: isMySeat ? "#c9a96e" : occupied ? "#2a4a6b" : "#0d1520", border: `1px solid ${isMySeat ? "#c9a96e" : occupied ? "#3a6a9b" : "#ffffff15"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "default", transition: "all 0.2s", gap: 1 }}>
                      {/* Seat number always visible at top */}
                      <div style={{ fontSize: 9, color: isMySeat ? "#1a1a2e" : occupied ? "#6080a0" : "#304050", fontWeight: 700, lineHeight: 1 }}>{seatNum}</div>
                      {isMySeat && <div style={{ fontSize: 13 }}>⭐</div>}
                      {occupied && !isMySeat && (
                        <div style={{ fontSize: 9, color: "#8090a0", textAlign: "center", padding: "0 2px", lineHeight: 1.2, maxWidth: 42, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {occupied.split(" ")[0]}
                        </div>
                      )}
                      {!occupied && <div style={{ fontSize: 9, color: "#304050" }}>○</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Back of coach */}
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <div style={{ fontSize: 10, color: "#405060", letterSpacing: 2, textTransform: "uppercase" }}>Rear of Coach</div>
        </div>
      </div>

      {!guestName && !isGuide && (
        <div style={{ background: "#c9a96e15", border: "1px solid #c9a96e30", borderRadius: 12, padding: "12px 16px", marginTop: 16, fontSize: 13, color: "#a09070", textAlign: "center" }}>
          💡 Your seat will be highlighted when your name is added by your guide
        </div>
      )}
    </div>
  );
};

// ── Seating Editor (Guide) ────────────────────────────────────────────────────
const SeatingEditor = ({ tour, onSave, onClose, saving }) => {
  const [rows, setRows] = useState(tour.coach_rows || 10);
  const [cols, setCols] = useState(tour.coach_cols || 4);
  const [seatData, setSeatData] = useState(() => {
    const d = {};
    (tour.seats || []).forEach((s) => { d[`${s.row}-${s.col}`] = s.guest_name; });
    return d;
  });
  const [editing, setEditing] = useState(null);
  const [nameInput, setNameInput] = useState("");

  const handleSeatClick = (r, c) => {
    const key = `${r}-${c}`;
    setEditing(key);
    setNameInput(seatData[key] || "");
  };

  const handleSeatSave = () => {
    if (editing) {
      setSeatData((prev) => ({ ...prev, [editing]: nameInput.trim() }));
      setEditing(null); setNameInput("");
    }
  };

  const clearSeat = () => {
    if (editing) { setSeatData((prev) => ({ ...prev, [editing]: "" })); setEditing(null); setNameInput(""); }
  };

  const [rotateAmount, setRotateAmount] = useState(1);
  const [rotateConfirm, setRotateConfirm] = useState(null);

  // Build clockwise seat order: left side top→bottom, right side bottom→top
  const buildClockwiseOrder = () => {
    const halfCols = Math.floor(cols / 2);
    const order = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < halfCols; col++) order.push(`${row}-${col}`);
    }
    for (let row = rows - 1; row >= 0; row--) {
      for (let col = cols - 1; col >= halfCols; col--) order.push(`${row}-${col}`);
    }
    return order;
  };

  const rotateSeat = (direction) => {
    const order = buildClockwiseOrder();
    const total = order.length;
    const steps = direction === "clockwise" ? rotateAmount : total - (rotateAmount % total);
    const newData = {};
    order.forEach((key, i) => {
      const newIndex = (i + steps) % total;
      const newKey = order[newIndex];
      if (seatData[key]) newData[newKey] = seatData[key];
    });
    setSeatData(newData);
    setRotateConfirm(null);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ background: "#1a2332", borderRadius: 20, padding: 24, maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: "#f0e6d3" }}>Coach Seating Plan</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#607080", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {/* Layout settings */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Rows</label>
            <input type="number" value={rows} min={1} max={20} onChange={(e) => setRows(parseInt(e.target.value) || 10)}
              style={{ width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "8px 10px", color: "#f0e6d3", fontSize: 14, outline: "none" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Seats per row</label>
            <select value={cols} onChange={(e) => setCols(parseInt(e.target.value))}
              style={{ width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "8px 10px", color: "#f0e6d3", fontSize: 14, outline: "none" }}>
              <option value={2}>2 (minibus)</option>
              <option value={3}>3</option>
              <option value={4}>4 (standard coach)</option>
            </select>
          </div>
        </div>

        {/* Rotation controls */}
        <div style={{ background: "#0d1520", borderRadius: 12, padding: "14px 16px", marginBottom: 16, border: "1px solid #ffffff10" }}>
          <div style={{ fontSize: 12, color: "#c9a96e", fontWeight: 600, marginBottom: 10 }}>🔄 Rotate Seating Plan</div>
          <div style={{ fontSize: 12, color: "#506070", marginBottom: 10 }}>Shifts everyone clockwise or anti-clockwise around the coach by the number of seats you choose.</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: "#8090a0", whiteSpace: "nowrap" }}>Rotate by</label>
            <input type="number" value={rotateAmount} min={1} max={rows * cols - 1} onChange={(e) => setRotateAmount(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: 60, background: "#1a2332", border: "1px solid #ffffff20", borderRadius: 8, padding: "6px 8px", color: "#f0e6d3", fontSize: 14, outline: "none", textAlign: "center" }} />
            <label style={{ fontSize: 11, color: "#8090a0" }}>seats</label>
          </div>
          {rotateConfirm ? (
            <div>
              <div style={{ fontSize: 12, color: "#ff9966", marginBottom: 8 }}>⚠️ This will move all assigned guests. Are you sure?</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => rotateSeat(rotateConfirm)} style={{ flex: 1, padding: "8px", background: "linear-gradient(135deg,#c9a96e,#a07840)", border: "none", borderRadius: 8, color: "#1a1a2e", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Yes, rotate</button>
                <button onClick={() => setRotateConfirm(null)} style={{ flex: 1, padding: "8px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 8, color: "#8090a0", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setRotateConfirm("clockwise")} style={{ flex: 1, padding: "8px", background: "#c9a96e15", border: "1px solid #c9a96e40", borderRadius: 8, color: "#c9a96e", fontSize: 13, cursor: "pointer" }}>↻ Clockwise</button>
              <button onClick={() => setRotateConfirm("anticlockwise")} style={{ flex: 1, padding: "8px", background: "#c9a96e15", border: "1px solid #c9a96e40", borderRadius: 8, color: "#c9a96e", fontSize: 13, cursor: "pointer" }}>↺ Anti-clockwise</button>
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: "#607080", marginBottom: 14 }}>Tap any seat to assign a guest name</div>

        {/* Mini seat grid for editing */}
        <div style={{ background: "#0d1520", borderRadius: 14, padding: 16, marginBottom: 16, maxHeight: 360, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <div style={{ background: "#1a2332", borderRadius: 8, padding: "6px 16px", border: "1px solid #c9a96e20" }}>
              <div style={{ fontSize: 16, textAlign: "center" }}>🚌</div>
              <div style={{ fontSize: 9, color: "#506070", textAlign: "center" }}>DRIVER</div>
            </div>
          </div>
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4, justifyContent: "center" }}>
              {Array.from({ length: cols }).map((_, c) => {
                const seatNum = r * cols + c + 1;
                const key = `${r}-${c}`;
                const name = seatData[key];
                const isSelected = editing === key;
                return (
                  <div key={c} style={{ display: "flex" }}>
                    {cols === 4 && c === 2 && <div style={{ width: 12 }} />}
                    <div onClick={() => handleSeatClick(r, c)}
                      style={{ width: 40, height: 38, borderRadius: 6, background: isSelected ? "#c9a96e30" : name ? "#2a4a6b" : "#1a2332", border: `1px solid ${isSelected ? "#c9a96e" : name ? "#3a6a9b" : "#ffffff15"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 1 }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: isSelected ? "#c9a96e" : name ? "#6080a0" : "#304050" }}>{seatNum}</div>
                      <div style={{ fontSize: 8, color: name ? "#a0b0c0" : "#304050", textAlign: "center", padding: "0 2px", lineHeight: 1.2, overflow: "hidden", maxWidth: 38, whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                        {name ? name.split(" ")[0].slice(0, 5) : "○"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Name input */}
        {editing && (
          <div style={{ background: "#0d1520", borderRadius: 12, padding: 14, marginBottom: 16, border: "1px solid #c9a96e30" }}>
            <div style={{ fontSize: 12, color: "#c9a96e", marginBottom: 8 }}>
              Seat {parseInt(editing.split("-")[0]) * cols + parseInt(editing.split("-")[1]) + 1} — Row {parseInt(editing.split("-")[0]) + 1}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSeatSave()} placeholder="Guest name"
                style={{ flex: 1, background: "#1a2332", border: "1px solid #ffffff20", borderRadius: 8, padding: "8px 10px", color: "#f0e6d3", fontSize: 14, outline: "none" }} />
              <button onClick={handleSeatSave} style={{ padding: "8px 14px", background: "#c9a96e", borderRadius: 8, border: "none", color: "#1a1a2e", fontWeight: 700, cursor: "pointer" }}>✓</button>
              <button onClick={clearSeat} style={{ padding: "8px 10px", background: "#ff444420", border: "1px solid #ff444430", borderRadius: 8, color: "#ff6666", cursor: "pointer" }}>✕</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 12, color: "#8090a0", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onSave(rows, cols, seatData)} disabled={saving}
            style={{ flex: 2, padding: "12px", background: saving ? "#806040" : "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Saving…" : "Save Seating Plan"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Leaflet Map ───────────────────────────────────────────────────────────────
const LeafletMap = ({ attractions }) => {
  const mapInstanceRef = useRef(null);
  const uid = useRef("map-" + Math.random().toString(36).slice(2));
  useEffect(() => {
    if (!window.L || !attractions?.length) return;
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    const center = attractions.reduce((a, c) => [a[0] + c.lat / attractions.length, a[1] + c.lng / attractions.length], [0, 0]);
    const map = window.L.map(uid.current, { zoomControl: true, scrollWheelZoom: false }).setView(center, 13);
    mapInstanceRef.current = map;
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
    attractions.forEach((a, i) => {
      const icon = window.L.divIcon({ className: "", html: `<div style="width:30px;height:30px;border-radius:50%;background:#c9a96e;border:3px solid #1a2332;display:flex;align-items:center;justify-content:center;font-weight:700;color:#1a1a2e;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.5)">${i + 1}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      window.L.marker([a.lat, a.lng], { icon }).addTo(map).bindPopup(`<strong>${a.name}</strong><br/><span style="color:#aaa">${a.desc}</span>`);
    });
    if (attractions.length > 1) map.fitBounds(window.L.latLngBounds(attractions.map((a) => [a.lat, a.lng])), { padding: [30, 30] });
  }, [attractions]);
  useEffect(() => () => { if (mapInstanceRef.current) mapInstanceRef.current.remove(); }, []);
  if (!attractions?.length) return null;
  return <div style={{ marginTop: 16, borderRadius: 14, overflow: "hidden", border: "1px solid #c9a96e30" }}><div id={uid.current} style={{ height: 280, width: "100%", background: "#1a2332" }} /></div>;
};

// ── QR Modal ──────────────────────────────────────────────────────────────────
const QRModal = ({ tour, appUrl, onClose }) => {
  const canvasRef = useRef(null);
  const [qrReady, setQrReady] = useState(false);
  const guestUrl = `${appUrl}?tour=${tour.id}`;
  useEffect(() => {
    if (!window.QRCode) { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"; s.onload = () => setQrReady(true); document.head.appendChild(s); }
    else setQrReady(true);
  }, []);
  useEffect(() => {
    if (!qrReady || !canvasRef.current) return;
    canvasRef.current.innerHTML = "";
    new window.QRCode(canvasRef.current, { text: guestUrl, width: 220, height: 220, colorDark: "#1a2332", colorLight: "#f5f0e8", correctLevel: window.QRCode.CorrectLevel.H });
  }, [qrReady, guestUrl]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000dd", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#1a2332", borderRadius: 24, padding: 28, maxWidth: 360, width: "100%", border: "1px solid #c9a96e30", textAlign: "center" }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: "#f0e6d3", marginBottom: 4 }}>{tour.name}</div>
        <div style={{ fontSize: 13, color: "#607080", marginBottom: 20 }}>Share this QR with your guests</div>
        <div style={{ background: "#f5f0e8", borderRadius: 16, padding: 20, display: "inline-block", marginBottom: 20 }}>
          {!qrReady ? <div style={{ width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#607080" }}>Generating…</div> : <div ref={canvasRef} />}
        </div>
        <div style={{ background: "#c9a96e15", border: "1px solid #c9a96e40", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Guest Access Code</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#f0e6d3", letterSpacing: 4, fontFamily: "monospace" }}>{tour.password}</div>
        </div>
        <button onClick={onClose} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Done</button>
      </div>
    </div>
  );
};

// ── Photo Components ──────────────────────────────────────────────────────────
const Lightbox = ({ photo, onClose, onDelete, isGuide }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000000ee", zIndex: 2000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
    <button onClick={onClose} style={{ position: "absolute", top: 20, right: 20, background: "none", border: "none", color: "#ffffff80", fontSize: 32, cursor: "pointer" }}>×</button>
    <img src={photo.url} alt={photo.caption} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 12, objectFit: "contain" }} />
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 16, textAlign: "center", maxWidth: 340 }}>
      {photo.caption && <div style={{ color: "#f0e6d3", fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{photo.caption}</div>}
      <div style={{ color: "#607080", fontSize: 12 }}>📷 {photo.uploaded_by} · {new Date(photo.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
      {isGuide && <button onClick={() => { onDelete(photo); onClose(); }} style={{ marginTop: 14, padding: "8px 20px", background: "#ff444420", border: "1px solid #ff444440", borderRadius: 10, color: "#ff6666", fontSize: 13, cursor: "pointer" }}>Delete Photo</button>}
    </div>
  </div>
);

const UploadModal = ({ tourId, onUploaded, onClose }) => {
  const [file, setFile] = useState(null); const [preview, setPreview] = useState(null); const [caption, setCaption] = useState(""); const [name, setName] = useState(""); const [uploading, setUploading] = useState(false); const [error, setError] = useState("");
  const fileRef = useRef(null);
  const handleFile = (f) => { if (!f) return; if (f.size > 10 * 1024 * 1024) { setError("Photo must be under 10MB"); return; } setFile(f); setPreview(URL.createObjectURL(f)); setError(""); };
  const handleUpload = async () => {
    if (!file) { setError("Please choose a photo first"); return; }
    if (!name.trim()) { setError("Please enter your name"); return; }
    setUploading(true);
    try { await uploadPhoto(tourId, file, caption.trim(), name.trim()); onUploaded(); onClose(); }
    catch (e) { setError("Upload failed — please check the photo storage bucket is set up in Supabase."); }
    setUploading(false);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ background: "#1a2332", borderRadius: 20, padding: 24, maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: "#f0e6d3" }}>Add a Photo</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#607080", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${preview ? "#c9a96e" : "#ffffff20"}`, borderRadius: 14, padding: preview ? 0 : "32px 20px", textAlign: "center", cursor: "pointer", marginBottom: 16, overflow: "hidden" }}>
          {preview ? <img src={preview} alt="preview" style={{ width: "100%", maxHeight: 240, objectFit: "cover", display: "block" }} /> : <><div style={{ fontSize: 36, marginBottom: 8 }}>📷</div><div style={{ color: "#c9a96e", fontSize: 14, fontWeight: 600 }}>Tap to choose a photo</div><div style={{ color: "#506070", fontSize: 12, marginTop: 4 }}>JPG, PNG or HEIC · Max 10MB</div></>}
          <input ref={fileRef} type="file" accept="image/*" onChange={(e) => handleFile(e.target.files[0])} style={{ display: "none" }} />
        </div>
        {preview && <button onClick={() => { setFile(null); setPreview(null); }} style={{ width: "100%", padding: "7px", background: "transparent", border: "1px solid #ffffff15", borderRadius: 8, color: "#607080", fontSize: 12, cursor: "pointer", marginBottom: 14 }}>Choose different photo</button>}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Your Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah" maxLength={40} style={{ width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 14, outline: "none" }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Caption <span style={{ color: "#506070", textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Sunrise over Loch Lomond" maxLength={120} style={{ width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 14, outline: "none" }} />
        </div>
        {error && <div style={{ color: "#ff6666", fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 12, color: "#8090a0", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleUpload} disabled={uploading} style={{ flex: 2, padding: "12px", background: uploading ? "#806040" : "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: uploading ? "default" : "pointer" }}>{uploading ? "Uploading…" : "Share Photo 📷"}</button>
        </div>
      </div>
    </div>
  );
};

const PhotoLibrary = ({ tour, isGuide }) => {
  const [photos, setPhotos] = useState([]); const [loading, setLoading] = useState(true); const [showUpload, setShowUpload] = useState(false); const [lightbox, setLightbox] = useState(null);
  const fetchPhotos = async () => { setLoading(true); try { setPhotos(await loadPhotos(tour.id)); } catch (e) { console.error(e); } setLoading(false); };
  useEffect(() => { fetchPhotos(); }, [tour.id]);
  const handleDelete = async (photo) => { if (!window.confirm("Delete this photo?")) return; try { await deletePhoto(photo); fetchPhotos(); } catch (e) { alert("Failed to delete"); } };
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700 }}>Tour Photos</div>
        <button onClick={() => setShowUpload(true)} style={{ background: "linear-gradient(135deg,#c9a96e,#a07840)", border: "none", borderRadius: 10, padding: "8px 14px", color: "#1a1a2e", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Add Photo</button>
      </div>
      <div style={{ color: "#7080a0", fontSize: 13, marginBottom: 24 }}>Shared memories from everyone on the tour</div>
      {loading ? <div style={{ textAlign: "center", padding: "40px 0", color: "#405060" }}><div style={{ fontSize: 32, marginBottom: 10 }}>📷</div><div>Loading photos…</div></div>
        : photos.length === 0 ? <div style={{ textAlign: "center", padding: "40px 20px", color: "#405060", border: "1px dashed #ffffff15", borderRadius: 16 }}><div style={{ fontSize: 40, marginBottom: 12 }}>📸</div><div style={{ marginBottom: 16 }}>No photos yet — be the first!</div><button onClick={() => setShowUpload(true)} style={{ background: "linear-gradient(135deg,#c9a96e,#a07840)", border: "none", borderRadius: 10, padding: "10px 20px", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Add First Photo</button></div>
        : <><div style={{ fontSize: 12, color: "#506070", marginBottom: 14 }}>{photos.length} photo{photos.length !== 1 ? "s" : ""} shared</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {photos.map((photo) => (<div key={photo.id} onClick={() => setLightbox(photo)} style={{ borderRadius: 12, overflow: "hidden", cursor: "pointer", background: "#1a2332", border: "1px solid #ffffff10" }}><img src={photo.url} alt={photo.caption} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} /><div style={{ padding: "8px 10px" }}>{photo.caption && <div style={{ color: "#d0c0b0", fontSize: 12, fontWeight: 500, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{photo.caption}</div>}<div style={{ color: "#506070", fontSize: 11 }}>📷 {photo.uploaded_by}</div></div></div>))}
          </div></>}
      {showUpload && <UploadModal tourId={tour.id} onUploaded={fetchPhotos} onClose={() => setShowUpload(false)} />}
      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} onDelete={handleDelete} isGuide={isGuide} />}
    </div>
  );
};

// ── Guest Login ───────────────────────────────────────────────────────────────
const GuestLogin = ({ tours, onUnlock, onGuideLogin }) => {
  const [code, setCode] = useState(""); const [error, setError] = useState(""); const [shake, setShake] = useState(false);
  const tryUnlock = () => {
    if (code.trim().toUpperCase() === GUIDE_PASSWORD) { onGuideLogin(); return; }
    const match = tours.find((t) => t.password.toUpperCase() === code.trim().toUpperCase());
    if (match) { onUnlock(match); } else { setError("That code doesn't match any tour. Please check with your guide."); setShake(true); setTimeout(() => setShake(false), 500); }
  };
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0d1520 0%,#1a2332 60%,#0d1520 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "'Lato',sans-serif" }}>
      <img src="/logo-app.png" alt="Castle & Coastline Tours" style={{ width: 180, height: 180, objectFit: "contain", marginBottom: 8 }} />
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, color: "#f0e6d3", textAlign: "center", marginBottom: 8 }}>Welcome</div>
      <div style={{ color: "#607080", fontSize: 14, textAlign: "center", marginBottom: 40, maxWidth: 280, lineHeight: 1.6 }}>Enter the access code provided by your tour guide</div>
      <div style={{ width: "100%", maxWidth: 320 }}>
        <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }} onKeyDown={(e) => e.key === "Enter" && tryUnlock()} placeholder="TOURCODE" maxLength={12}
          style={{ width: "100%", textAlign: "center", fontSize: 24, fontWeight: 700, letterSpacing: 6, padding: "16px 12px", borderRadius: 14, border: `2px solid ${error ? "#ff4444" : "#c9a96e40"}`, background: "#1a2332", color: "#f0e6d3", outline: "none", fontFamily: "monospace", marginBottom: 12, transform: shake ? "translateX(-6px)" : "none", transition: "transform 0.1s, border-color 0.2s" }} />
        {error && <div style={{ color: "#ff6666", fontSize: 13, textAlign: "center", marginBottom: 12 }}>{error}</div>}
        <button onClick={tryUnlock} style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 14, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>Access My Tour →</button>
      </div>
      <div style={{ marginTop: 48, background: "#1a2332", borderRadius: 14, padding: "14px 18px", maxWidth: 300, border: "1px solid #ffffff10" }}>
        <div style={{ fontSize: 12, color: "#506070", textAlign: "center", lineHeight: 1.7 }}>📲 <strong style={{ color: "#8090a0" }}>Add to your home screen</strong> for quick access<br /><span style={{ fontSize: 11 }}>Tap Share → "Add to Home Screen" in Safari</span></div>
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
      <div><div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a2e", letterSpacing: 1, textTransform: "uppercase" }}>Guide Update</div><div style={{ fontSize: 14, color: "#1a1a2e", marginTop: 2, fontWeight: 500 }}>{text}</div></div>
    </div>
  );
};

// ── Guest Nav ─────────────────────────────────────────────────────────────────
const GuestNav = ({ active, onChange }) => {
  const tabs = [{ id: "itinerary", icon: "🗓️", label: "Itinerary" }, { id: "coach", icon: "🚌", label: "Seats" }, { id: "photos", icon: "📸", label: "Photos" }, { id: "notes", icon: "📝", label: "Notes" }, { id: "contact", icon: "📞", label: "Contact" }];
  return (
    <div style={{ display: "flex", borderTop: "1px solid #ffffff10", background: "#0d1520", position: "sticky", bottom: 0 }}>
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => onChange(tab.id)} style={{ flex: 1, padding: "10px 2px 8px", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, borderTop: `2px solid ${active === tab.id ? "#c9a96e" : "transparent"}` }}>
          <span style={{ fontSize: 16 }}>{tab.icon}</span>
          <span style={{ fontSize: 9, color: active === tab.id ? "#c9a96e" : "#506070", fontFamily: "'Lato',sans-serif", fontWeight: active === tab.id ? 700 : 400 }}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

// ── Contact Page ──────────────────────────────────────────────────────────────
const ContactPage = ({ tour }) => {
  const hasContact = tour.guide_name || tour.guide_phone || tour.guide_email;
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Your Guide</div>
      <div style={{ color: "#7080a0", fontSize: 13, marginBottom: 24 }}>Get in touch any time</div>
      {!hasContact ? <div style={{ textAlign: "center", padding: "40px 20px", color: "#405060", border: "1px dashed #ffffff15", borderRadius: 16 }}><div style={{ fontSize: 36, marginBottom: 10 }}>📞</div><div>Contact details coming soon</div></div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {tour.guide_name && <div style={{ background: "#1a2332", borderRadius: 16, padding: 20, border: "1px solid #c9a96e20", display: "flex", alignItems: "center", gap: 16 }}><div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#c9a96e,#a07840)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🧭</div><div><div style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>Your Tour Guide</div><div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: "#f0e6d3" }}>{tour.guide_name}</div></div></div>}
          {tour.guide_phone && <a href={`tel:${tour.guide_phone}`} style={{ background: "#1a2332", borderRadius: 16, padding: "18px 20px", border: "1px solid #ffffff10", display: "flex", alignItems: "center", gap: 14, textDecoration: "none" }}><div style={{ width: 44, height: 44, borderRadius: 12, background: "#c9a96e20", border: "1px solid #c9a96e40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>📱</div><div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#607080", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>Phone</div><div style={{ fontSize: 17, fontWeight: 600, color: "#f0e6d3" }}>{tour.guide_phone}</div></div><div style={{ background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 10, padding: "7px 14px", color: "#1a1a2e", fontWeight: 700, fontSize: 13 }}>Call</div></a>}
          {tour.guide_email && <a href={`mailto:${tour.guide_email}`} style={{ background: "#1a2332", borderRadius: 16, padding: "18px 20px", border: "1px solid #ffffff10", display: "flex", alignItems: "center", gap: 14, textDecoration: "none" }}><div style={{ width: 44, height: 44, borderRadius: 12, background: "#c9a96e20", border: "1px solid #c9a96e40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>✉️</div><div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#607080", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>Email</div><div style={{ fontSize: 15, fontWeight: 600, color: "#f0e6d3" }}>{tour.guide_email}</div></div><div style={{ background: "#c9a96e20", border: "1px solid #c9a96e40", borderRadius: 10, padding: "7px 14px", color: "#c9a96e", fontWeight: 700, fontSize: 13 }}>Email</div></a>}
        </div>}
    </div>
  );
};

// ── Notes Page ────────────────────────────────────────────────────────────────
const NotesPage = ({ tour }) => {
  const notes = tour.notes || "";
  const paragraphs = notes.split("\n").filter((p) => p.trim());
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Tour Notes</div>
      <div style={{ color: "#7080a0", fontSize: 13, marginBottom: 24 }}>Tips, recommendations & important info</div>
      {!notes ? <div style={{ textAlign: "center", padding: "40px 20px", color: "#405060", border: "1px dashed #ffffff15", borderRadius: 16 }}><div style={{ fontSize: 36, marginBottom: 10 }}>📝</div><div>No notes yet — check back soon!</div></div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{paragraphs.map((para, i) => (<div key={i} style={{ background: "#1a2332", borderRadius: 14, padding: "16px 18px", border: "1px solid #ffffff10", display: "flex", gap: 12, alignItems: "flex-start" }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: "#c9a96e", marginTop: 6, flexShrink: 0 }} /><div style={{ fontSize: 14, color: "#d0c0b0", lineHeight: 1.7 }}>{para}</div></div>))}</div>}
    </div>
  );
};

// ── Guest View ────────────────────────────────────────────────────────────────
const GuestView = ({ tour, onLogout, isGuide, startPage }) => {
  const [activeDay, setActiveDay] = useState(0);
  const [activePage, setActivePage] = useState(startPage || "itinerary");
  const day = tour.days[activeDay];
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0d1520 0%,#1a2332 50%,#0d1520 100%)", fontFamily: "'Lato',sans-serif", color: "#f0e6d3", display: "flex", flexDirection: "column" }}>
      <AnnouncementBanner text={tour.announcement} />
      <div style={{ background: "linear-gradient(180deg,#0a0f1a 0%,transparent 100%)", padding: "20px 24px 14px", borderBottom: "1px solid #ffffff10" }}>
        <button onClick={onLogout} style={{ background: "none", border: "none", color: "#506070", cursor: "pointer", fontSize: 12, marginBottom: 8, padding: 0 }}>← Change tour</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <img src="/logo-app.png" alt="logo" style={{ width: 32, height: 32, objectFit: "contain" }} />
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#c9a96e", textTransform: "uppercase" }}>Castle & Coastline</div>
        </div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700 }}>{tour.name}</div>
        <div style={{ color: "#8090a0", fontSize: 12, marginTop: 3 }}>{tour.duration}-day tour</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {activePage === "itinerary" && (
          <>
            {tour.days.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "#405060" }}><div style={{ fontSize: 40, marginBottom: 12 }}>🗓️</div><div>Your itinerary is being prepared. Check back soon!</div></div>
              : <>
                <div style={{ overflowX: "auto", padding: "12px 20px", display: "flex", gap: 8, borderBottom: "1px solid #ffffff10" }}>
                  {tour.days.map((d, i) => (<button key={i} onClick={() => setActiveDay(i)} style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 20, border: `1px solid ${activeDay === i ? "#c9a96e" : "#ffffff20"}`, background: activeDay === i ? "#c9a96e" : "transparent", color: activeDay === i ? "#1a1a2e" : "#a0b0c0", fontWeight: activeDay === i ? 700 : 400, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>Day {d.day}</button>))}
                </div>
                <div style={{ padding: 24 }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, color: "#c9a96e", textTransform: "uppercase", marginBottom: 4 }}>Day {day.day}</div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{day.title}</div>
                  <div style={{ color: "#7080a0", fontSize: 13, marginBottom: 16 }}>📍 {day.location}</div>
                  {/* Weather for this day's location */}
                  {day.location && <WeatherWidget location={day.location} />}
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
                  {day.attractions?.length > 0 && <>
                    <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: "#c9a96e", marginTop: 8, marginBottom: 14 }}>Attractions & Map</div>
                    <LeafletMap attractions={day.attractions} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                      {day.attractions.map((a, i) => (<a key={i} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.name + " " + day.location)}`} target="_blank" rel="noopener noreferrer" style={{ background: "#1a2332", border: "1px solid #ffffff10", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}><div style={{ width: 28, height: 28, borderRadius: "50%", background: "#c9a96e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#1a1a2e", flexShrink: 0 }}>{i + 1}</div><div style={{ flex: 1 }}><div style={{ color: "#f0e6d3", fontWeight: 600, fontSize: 14 }}>{a.name}</div><div style={{ color: "#607080", fontSize: 12, marginTop: 2 }}>{a.desc}</div></div><span style={{ color: "#c9a96e", fontSize: 18 }}>↗</span></a>))}
                    </div>
                  </>}
                </div>
              </>}
          </>
        )}
        {activePage === "coach" && <CoachSeatingPlan tour={tour} guestName={null} isGuide={isGuide} />}
        {activePage === "photos" && <PhotoLibrary tour={tour} isGuide={isGuide} />}
        {activePage === "notes" && <NotesPage tour={tour} />}
        {activePage === "contact" && <ContactPage tour={tour} />}
      </div>
      <GuestNav active={activePage} onChange={setActivePage} />
    </div>
  );
};

// ── Edit Day Modal ─────────────────────────────────────────────────────────────
const EditDayModal = ({ day, onSave, onClose, saving }) => {
  const [d, setD] = useState(JSON.parse(JSON.stringify(day)));
  const updSched = (i, f, v) => { const s = [...d.schedule]; s[i] = { ...s[i], [f]: v }; setD({ ...d, schedule: s }); };
  const updAttr = (i, f, v) => { const a = [...d.attractions]; a[i] = { ...a[i], [f]: v }; setD({ ...d, attractions: a }); };
  const inp = (val, fn, ph, type = "text") => (<input value={val} onChange={(e) => fn(e.target.value)} placeholder={ph} type={type} style={{ background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "8px 10px", color: "#f0e6d3", fontSize: 13, width: "100%", outline: "none" }} />);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ background: "#1a2332", borderRadius: 20, padding: 24, maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: "#f0e6d3" }}>Edit Day {d.day}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#607080", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>Day Title</label>{inp(d.title, (v) => setD({ ...d, title: v }), "e.g. Arrival — Edinburgh")}
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>Location</label>{inp(d.location, (v) => setD({ ...d, location: v }), "e.g. Edinburgh, Scotland")}
        </div>
        <div style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Schedule</div>
        {d.schedule.map((s, i) => (<div key={i} style={{ background: "#0d1520", borderRadius: 10, padding: 12, marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}><div style={{ display: "flex", gap: 8 }}><div style={{ flex: "0 0 76px" }}>{inp(s.time, (v) => updSched(i, "time", v), "09:00")}</div><div style={{ flex: 1 }}>{inp(s.label, (v) => updSched(i, "label", v), "Activity")}</div><button onClick={() => setD({ ...d, schedule: d.schedule.filter((_, j) => j !== i) })} style={{ background: "#ff444420", border: "none", borderRadius: 6, color: "#ff6666", cursor: "pointer", padding: "0 8px", fontSize: 16 }}>×</button></div>{inp(s.note, (v) => updSched(i, "note", v), "Note (optional)")}</div>))}
        <button onClick={() => setD({ ...d, schedule: [...d.schedule, { time: "", label: "", note: "" }] })} style={{ width: "100%", padding: "9px", background: "#c9a96e15", border: "1px dashed #c9a96e50", borderRadius: 10, color: "#c9a96e", fontSize: 13, cursor: "pointer", marginBottom: 20 }}>+ Add Time Slot</button>
        <div style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Attractions & Map Pins</div>
        {d.attractions.map((a, i) => (<div key={i} style={{ background: "#0d1520", borderRadius: 10, padding: 12, marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}><div style={{ display: "flex", gap: 8 }}><div style={{ flex: 1 }}>{inp(a.name, (v) => updAttr(i, "name", v), "Attraction name")}</div><button onClick={() => setD({ ...d, attractions: d.attractions.filter((_, j) => j !== i) })} style={{ background: "#ff444420", border: "none", borderRadius: 6, color: "#ff6666", cursor: "pointer", padding: "0 8px", fontSize: 16 }}>×</button></div>{inp(a.desc, (v) => updAttr(i, "desc", v), "Short description")}<div style={{ display: "flex", gap: 6 }}><input value={a.lat} onChange={(e) => updAttr(i, "lat", parseFloat(e.target.value) || 0)} placeholder="Latitude" type="number" step="0.0001" style={{ flex: 1, background: "#1a2332", border: "1px solid #ffffff15", borderRadius: 8, padding: "7px 8px", color: "#c9a96e", fontSize: 12, outline: "none" }} /><input value={a.lng} onChange={(e) => updAttr(i, "lng", parseFloat(e.target.value) || 0)} placeholder="Longitude" type="number" step="0.0001" style={{ flex: 1, background: "#1a2332", border: "1px solid #ffffff15", borderRadius: 8, padding: "7px 8px", color: "#c9a96e", fontSize: 12, outline: "none" }} /></div><div style={{ fontSize: 11, color: "#405060" }}>💡 Right-click in Google Maps → "What's here?" for coordinates</div></div>))}
        <button onClick={() => setD({ ...d, attractions: [...d.attractions, { name: "", desc: "", lat: 54.0, lng: -2.0 }] })} style={{ width: "100%", padding: "9px", background: "#c9a96e15", border: "1px dashed #c9a96e50", borderRadius: 10, color: "#c9a96e", fontSize: 13, cursor: "pointer", marginBottom: 24 }}>+ Add Attraction</button>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 12, color: "#8090a0", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onSave(d)} disabled={saving} style={{ flex: 2, padding: "12px", background: saving ? "#806040" : "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>{saving ? "Saving…" : "Save Day"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Add Tour Modal ─────────────────────────────────────────────────────────────
const AddTourModal = ({ onSave, onClose, saving }) => {
  const [name, setName] = useState(""); const [duration, setDuration] = useState(""); const [desc, setDesc] = useState(""); const [password, setPassword] = useState("");
  const inp = (val, fn, ph, type = "text") => (<input value={val} onChange={(e) => fn(e.target.value)} placeholder={ph} type={type} style={{ background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 14, width: "100%", outline: "none" }} />);
  const handleSave = () => {
    if (!name || !duration || !password) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
    onSave({ id, name, duration: parseInt(duration), description: desc, password: password.toUpperCase(), announcement: "", notes: "", guide_name: "", guide_phone: "", guide_email: "", coach_rows: 10, coach_cols: 4, days: [], seats: [] });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, display: "flex", alignItems: "center", padding: "0 16px" }}>
      <div style={{ background: "#1a2332", borderRadius: 20, padding: 24, width: "100%", maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30" }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: "#f0e6d3", marginBottom: 20 }}>New Tour</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>Tour Name</label>{inp(name, setName, "e.g. Highlands & Castles")}
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>Duration (days)</label>{inp(duration, setDuration, "e.g. 10", "number")}
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>Description</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief description..." style={{ background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 14, width: "100%", outline: "none", resize: "vertical", minHeight: 70, fontFamily: "'Lato',sans-serif" }} />
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>Guest Access Code</label>{inp(password, (v) => setPassword(v.toUpperCase()), "e.g. SCOTLAND24")}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 12, color: "#8090a0", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: "12px", background: saving ? "#806040" : "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>{saving ? "Creating…" : "Create Tour"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Tour Settings Modal ───────────────────────────────────────────────────────
const TourSettingsModal = ({ tour, onSave, onClose, saving }) => {
  const [t, setT] = useState({ notes: tour.notes || "", guide_name: tour.guide_name || "", guide_phone: tour.guide_phone || "", guide_email: tour.guide_email || "" });
  const inp = (label, val, fn, ph, type = "text") => (<div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}><label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>{label}</label><input value={val} onChange={(e) => fn(e.target.value)} placeholder={ph} type={type} style={{ background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 14, width: "100%", outline: "none" }} /></div>);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ background: "#1a2332", borderRadius: 20, padding: 24, maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: "#f0e6d3" }}>Notes & Contact</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#607080", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: "#c9a96e", fontFamily: "'Playfair Display',serif", marginBottom: 14 }}>Your Contact Details</div>
        {inp("Your Name", t.guide_name, (v) => setT({ ...t, guide_name: v }), "e.g. James McAllister")}
        {inp("Phone Number", t.guide_phone, (v) => setT({ ...t, guide_phone: v }), "e.g. +44 7700 900000", "tel")}
        {inp("Email Address", t.guide_email, (v) => setT({ ...t, guide_email: v }), "e.g. james@castlescoastlines.com", "email")}
        <div style={{ fontSize: 13, color: "#c9a96e", fontFamily: "'Playfair Display',serif", marginBottom: 6, marginTop: 6 }}>Tour Notes for Guests</div>
        <div style={{ fontSize: 12, color: "#506070", marginBottom: 10 }}>Each line becomes a separate note card for guests.</div>
        <textarea value={t.notes} onChange={(e) => setT({ ...t, notes: e.target.value })} placeholder={"Best fish and chips in St Andrews: The Tailend\nBring waterproof shoes for Glencoe\nHotel wifi: highland2024"}
          style={{ width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 10, padding: "12px", color: "#f0e6d3", fontSize: 14, resize: "vertical", minHeight: 120, outline: "none", fontFamily: "'Lato',sans-serif", lineHeight: 1.7, marginBottom: 20 }} />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 12, color: "#8090a0", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onSave(t)} disabled={saving} style={{ flex: 2, padding: "12px", background: saving ? "#806040" : "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>{saving ? "Saving…" : "Save Settings"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Guide Dashboard ───────────────────────────────────────────────────────────
const GuideDashboard = ({ tours, onLogout, onRefresh, onViewTour }) => {
  const [activeTourId, setActiveTourId] = useState(tours[0]?.id || null);
  const [editingDay, setEditingDay] = useState(null);
  const [showAddTour, setShowAddTour] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSeating, setShowSeating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [announcementSaved, setAnnouncementSaved] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const tour = tours.find((t) => t.id === activeTourId) || tours[0];

  useEffect(() => {
    if (tour) { setAnnouncementDraft(tour.announcement || ""); setPasswordDraft(tour.password || ""); setAnnouncementSaved(false); setEditingPassword(false); }
  }, [activeTourId]);

  const showStatus = (msg) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(""), 3000); };
  const saveDay = async (updatedDay) => { setSaving(true); try { await saveDayToDB(tour.id, updatedDay); await onRefresh(); setEditingDay(null); showStatus("✓ Day saved"); } catch (e) { showStatus("❌ Save failed"); } setSaving(false); };
  const addDay = () => { const n = tour.days.length > 0 ? Math.max(...tour.days.map((d) => d.day)) + 1 : 1; setEditingDay({ day: n, title: `Day ${n}`, location: "", schedule: [], attractions: [] }); };
  const deleteDay = async (day) => { if (!window.confirm(`Delete Day ${day.day}?`)) return; setSaving(true); try { if (day.id) await deleteDayFromDB(day.id); await onRefresh(); showStatus("✓ Day deleted"); } catch (e) { showStatus("❌ Delete failed"); } setSaving(false); };
  const addTour = async (t) => { setSaving(true); try { await saveTourToDB(t); await onRefresh(); setActiveTourId(t.id); setShowAddTour(false); showStatus("✓ Tour created"); } catch (e) { showStatus("❌ Failed"); } setSaving(false); };
  const saveSettings = async (settings) => { setSaving(true); try { await supabase.from("tours").update({ notes: settings.notes, guide_name: settings.guide_name, guide_phone: settings.guide_phone, guide_email: settings.guide_email }).eq("id", tour.id); await onRefresh(); setShowSettings(false); showStatus("✓ Saved"); } catch (e) { showStatus("❌ Failed"); } setSaving(false); };
  const saveSeating = async (rows, cols, seatData) => { setSaving(true); try { await supabase.from("tours").update({ coach_rows: rows, coach_cols: cols }).eq("id", tour.id); await saveSeats(tour.id, rows, cols, seatData); await onRefresh(); setShowSeating(false); showStatus("✓ Seating plan saved"); } catch (e) { showStatus("❌ Failed to save seating"); } setSaving(false); };
  const saveAnnouncement = async () => { try { await supabase.from("tours").update({ announcement: announcementDraft }).eq("id", tour.id); await onRefresh(); setAnnouncementSaved(true); setTimeout(() => setAnnouncementSaved(false), 2500); } catch (e) { showStatus("❌ Failed"); } };
  const clearAnnouncement = async () => { setAnnouncementDraft(""); await supabase.from("tours").update({ announcement: "" }).eq("id", tour.id); await onRefresh(); };
  const savePassword = async () => { try { await supabase.from("tours").update({ password: passwordDraft.toUpperCase() }).eq("id", tour.id); await onRefresh(); setEditingPassword(false); showStatus("✓ Code updated"); } catch (e) { showStatus("❌ Failed"); } };
  const deleteTour = async () => { if (!window.confirm(`Permanently delete "${tour.name}"?`)) return; setSaving(true); try { await deleteTourFromDB(tour.id); await onRefresh(); showStatus("✓ Deleted"); } catch (e) { showStatus("❌ Failed"); } setSaving(false); };

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
      {statusMsg && <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#1a2332", border: "1px solid #c9a96e40", borderRadius: 10, padding: "8px 20px", color: "#c9a96e", fontSize: 13, fontWeight: 600, zIndex: 2000, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>{statusMsg}</div>}
      <div style={{ background: "linear-gradient(135deg,#1a2332 0%,#0d1520 100%)", padding: "28px 24px 20px", borderBottom: "1px solid #c9a96e30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div><div style={{ fontSize: 11, letterSpacing: 3, color: "#c9a96e", textTransform: "uppercase", marginBottom: 6 }}>Guide Dashboard</div><div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 700 }}>Castle & Coastline</div></div>
          <button onClick={onLogout} style={{ background: "none", border: "1px solid #ffffff20", borderRadius: 8, color: "#607080", fontSize: 12, cursor: "pointer", padding: "6px 10px" }}>Log out</button>
        </div>
      </div>
      <div style={{ padding: "16px 20px 0", borderBottom: "1px solid #ffffff10" }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 16 }}>
          {tours.map((t) => (<button key={t.id} onClick={() => setActiveTourId(t.id)} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 20, border: `1px solid ${activeTourId === t.id ? "#c9a96e" : "#ffffff20"}`, background: activeTourId === t.id ? "#c9a96e15" : "transparent", color: activeTourId === t.id ? "#c9a96e" : "#7080a0", fontWeight: activeTourId === t.id ? 600 : 400, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>{t.name}</button>))}
          <button onClick={() => setShowAddTour(true)} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 20, border: "1px dashed #c9a96e50", background: "transparent", color: "#c9a96e", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>+ New Tour</button>
        </div>
      </div>
      <div style={{ padding: "20px 24px" }}>
        <div style={{ background: "#1a2332", borderRadius: 16, padding: "16px 20px", marginBottom: 16, border: "1px solid #c9a96e20" }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{tour.name}</div>
          <div style={{ color: "#607080", fontSize: 12, marginBottom: 14 }}>{tour.description}</div>
          <div style={{ display: "flex", gap: 20 }}>
            {[["DAYS", tour.duration], ["LOADED", tour.days.length], ["STOPS", tour.days.reduce((a, d) => a + (d.attractions?.length || 0), 0)], ["SEATS", (tour.seats || []).filter(s => s.guest_name).length]].map(([l, v]) => (
              <div key={l} style={{ textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 700, color: "#c9a96e" }}>{v}</div><div style={{ fontSize: 10, color: "#405060", letterSpacing: 1 }}>{l}</div></div>
            ))}
          </div>
        </div>

        {/* Action grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <button onClick={() => setShowQR(true)} style={{ padding: "13px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Show QR Code 📱</button>
          <button onClick={() => setShowSettings(true)} style={{ padding: "13px", background: "#1a2332", border: "1px solid #c9a96e40", borderRadius: 12, color: "#c9a96e", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Notes & Contact ✏️</button>
          <button onClick={() => setShowSeating(true)} style={{ padding: "13px", background: "#1a2332", border: "1px solid #c9a96e40", borderRadius: 12, color: "#c9a96e", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Seating Plan 🚌</button>
          <button onClick={() => onViewTour(tour)} style={{ padding: "13px", background: "#1a2332", border: "1px solid #ffffff15", borderRadius: 12, color: "#8090a0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Guest View ↗</button>
        </div>

        <div style={{ background: "#1a2332", borderRadius: 16, padding: 20, marginBottom: 16, border: "1px solid #c9a96e20" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16 }}>🔑 Guest Access Code</div>
            <button onClick={() => setEditingPassword(!editingPassword)} style={{ background: "none", border: "none", color: "#c9a96e", fontSize: 13, cursor: "pointer" }}>{editingPassword ? "Cancel" : "Change"}</button>
          </div>
          {editingPassword ? (<div style={{ display: "flex", gap: 8 }}><input value={passwordDraft} onChange={(e) => setPasswordDraft(e.target.value.toUpperCase())} maxLength={12} style={{ flex: 1, background: "#0d1520", border: "1px solid #c9a96e40", borderRadius: 8, padding: "9px 12px", color: "#f0e6d3", fontSize: 16, fontFamily: "monospace", letterSpacing: 3, outline: "none" }} /><button onClick={savePassword} style={{ padding: "9px 16px", background: "#c9a96e", borderRadius: 8, border: "none", color: "#1a1a2e", fontWeight: 700, cursor: "pointer" }}>Save</button></div>)
            : (<div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 4, color: "#f0e6d3", fontFamily: "monospace" }}>{tour.password}</div><div style={{ fontSize: 12, color: "#506070" }}>Share with guests at tour start</div></div>)}
        </div>

        <div style={{ background: "#1a2332", borderRadius: 16, padding: 20, marginBottom: 20, border: "1px solid #c9a96e20" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>📢</span>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16 }}>Guest Announcement</div>
            {tour.announcement && <div style={{ marginLeft: "auto", background: "#c9a96e20", border: "1px solid #c9a96e40", borderRadius: 6, padding: "2px 8px", color: "#c9a96e", fontSize: 11 }}>LIVE</div>}
          </div>
          <textarea value={announcementDraft} onChange={(e) => setAnnouncementDraft(e.target.value)} placeholder="e.g. Coach departs 15 minutes early — meet at 8:45am in the lobby!" style={{ width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 10, padding: "10px 12px", color: "#f0e6d3", fontSize: 14, resize: "vertical", minHeight: 80, outline: "none", fontFamily: "'Lato',sans-serif" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {tour.announcement && <button onClick={clearAnnouncement} style={{ padding: "9px 14px", background: "#ff444415", border: "1px solid #ff444430", borderRadius: 10, color: "#ff6666", fontSize: 13, cursor: "pointer" }}>Clear</button>}
            <button onClick={saveAnnouncement} style={{ flex: 1, padding: "9px", background: announcementSaved ? "#2a4a2a" : "#c9a96e20", border: `1px solid ${announcementSaved ? "#4a8a4a" : "#c9a96e40"}`, borderRadius: 10, color: announcementSaved ? "#6abf6a" : "#c9a96e", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.3s" }}>{announcementSaved ? "✓ Posted to guests!" : "Post to Guests"}</button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#607080", letterSpacing: 1, textTransform: "uppercase" }}>Itinerary Days</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addDay} style={{ background: "#c9a96e15", border: "1px solid #c9a96e40", borderRadius: 8, padding: "5px 12px", color: "#c9a96e", fontSize: 12, cursor: "pointer" }}>+ Add Day</button>
            <button onClick={deleteTour} style={{ background: "#ff444415", border: "1px solid #ff444430", borderRadius: 8, padding: "5px 12px", color: "#ff6666", fontSize: 12, cursor: "pointer" }}>Delete Tour</button>
          </div>
        </div>

        {tour.days.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#405060", border: "1px dashed #ffffff15", borderRadius: 16 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗓️</div><div style={{ marginBottom: 16 }}>No days yet</div>
            <button onClick={addDay} style={{ background: "linear-gradient(135deg,#c9a96e,#a07840)", border: "none", borderRadius: 10, padding: "10px 20px", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Add First Day</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tour.days.map((day) => (
              <div key={day.id || day.day} style={{ background: "#1a2332", borderRadius: 12, border: "1px solid #ffffff10", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#c9a96e20", border: "1px solid #c9a96e50", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#c9a96e", flexShrink: 0 }}>{day.day}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{day.title}</div>
                  <div style={{ color: "#506070", fontSize: 12, marginTop: 2 }}>📍 {day.location || "No location"} · {day.schedule.length} events · {day.attractions?.length || 0} attractions</div>
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
      {showSettings && <TourSettingsModal tour={tour} onSave={saveSettings} onClose={() => setShowSettings(false)} saving={saving} />}
      {showSeating && <SeatingEditor tour={tour} onSave={saveSeating} onClose={() => setShowSeating(false)} saving={saving} />}
    </div>
  );
};

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("login");
  const [guestTourId, setGuestTourId] = useState(null);
  const [guestStartPage, setGuestStartPage] = useState("itinerary");
  const [isGuide, setIsGuide] = useState(false);

  const fetchTours = async () => {
    try { const data = await loadAllTours(); setTours(data); }
    catch (e) { console.error("Failed to load tours:", e); }
    setLoading(false);
  };

  useEffect(() => {
    if (!window.L) {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(css);
      const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; document.head.appendChild(s);
    }
    // PWA manifest and icons
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifest = document.createElement("link"); manifest.rel = "manifest"; manifest.href = "/manifest.json"; document.head.appendChild(manifest);
    }
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      const appleIcon = document.createElement("link"); appleIcon.rel = "apple-touch-icon"; appleIcon.href = "/icons/icon-512.png"; document.head.appendChild(appleIcon);
    }
    if (!document.querySelector('meta[name="theme-color"]')) {
      const theme = document.createElement("meta"); theme.name = "theme-color"; theme.content = "#0d1520"; document.head.appendChild(theme);
    }
    fetchTours();
  }, []);

  const liveTour = guestTourId ? tours.find((t) => t.id === guestTourId) : null;
  const handleViewTour = (tour, page = "itinerary") => { setGuestTourId(tour.id); setGuestStartPage(page); setView("guest"); };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0d1520", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Lato',sans-serif", color: "#f0e6d3" }}>
      <img src="/logo-app.png" alt="Castle & Coastline Tours" style={{ width: 120, height: 120, objectFit: "contain", marginBottom: 8 }} />
      <div style={{ color: "#405060", fontSize: 13, marginTop: 12 }}>Loading your tours…</div>
    </div>
  );

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
        {view === "login" && <GuestLogin tours={tours} onUnlock={(tour) => { setGuestTourId(tour.id); setGuestStartPage("itinerary"); setView("guest"); }} onGuideLogin={() => { setIsGuide(true); setView("guide"); }} />}
        {view === "guide" && isGuide && <GuideDashboard tours={tours} onLogout={() => { setIsGuide(false); setView("login"); }} onRefresh={fetchTours} onViewTour={handleViewTour} />}
        {view === "guest" && liveTour && <GuestView tour={liveTour} onLogout={() => setView("login")} isGuide={isGuide} startPage={guestStartPage} />}
      </div>
    </>
  );
}
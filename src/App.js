/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
inject();
injectSpeedInsights();

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

function parseSingleTime(str) {
  if (!str) return null;
  const t = str.trim().toUpperCase();
  const ampm = t.includes('AM') || t.includes('PM');
  if (ampm) {
    const isPM = t.includes('PM');
    const clean = t.replace('AM','').replace('PM','').trim();
    const [hStr, mStr] = clean.split(':');
    let h = parseInt(hStr);
    const m = parseInt(mStr || '0');
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h * 60 + m;
  }
  const parts = t.split(':');
  if (parts.length < 2) return null;
  return parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
}

function parseTimeMins(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(/\s*[-\u2013]\s*/);
  if (parts.length >= 2) {
    return { start: parseSingleTime(parts[0]), end: parseSingleTime(parts[1]), isRange: true };
  }
  return { start: parseSingleTime(parts[0]), end: null, isRange: false };
}

async function geocodeLocation(location) {
  // Fetch more results and prioritise UK and Ireland
  const res = await fetch("https://pukdpnkgsyewvbswoqyo.supabase.co/functions/v1/weather", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1a2Rwbmtnc3lld3Zic3dvcXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTkwNDQsImV4cCI6MjA5MjMzNTA0NH0.UskWETDFraGynpZ2oT039DYpxGu8EJrgUgFN0AQ3Q8o"
    },
    body: JSON.stringify({ geocode: location })
  });
  const data = await res.json();
  if (!data.results?.length) return null;

  // Priority countries — UK and Ireland first
  const priority = ['GB', 'IE'];
  const prioritised = data.results.find(r => priority.includes(r.country_code));
  const best = prioritised || data.results[0];

  return { lat: best.latitude, lng: best.longitude, name: best.name };
}

async function fetchWeather(lat, lng) {
  const res = await fetch("https://pukdpnkgsyewvbswoqyo.supabase.co/functions/v1/weather", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1a2Rwbmtnc3lld3Zic3dvcXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTkwNDQsImV4cCI6MjA5MjMzNTA0NH0.UskWETDFraGynpZ2oT039DYpxGu8EJrgUgFN0AQ3Q8o"
    },
    body: JSON.stringify({ lat, lng })
  });
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
    start_date: tour.start_date || "", current_day_override: tour.current_day_override || null,
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
  // Use COACH_LAYOUT seat numbers as keys
  COACH_LAYOUT.forEach(row => {
    [...row.left, ...(row.right || [])].forEach(num => {
      const key = "seat-" + num;
      toInsert.push({ tour_id: tourId, seat_number: num, row: 0, col: num, guest_name: seatData[key] || "" });
    });
  });
  if (toInsert.length > 0) await supabase.from("seats").insert(toInsert);
}

async function deleteDayFromDB(dayId) { await supabase.from("days").delete().eq("id", dayId); }
async function deleteTourFromDB(tourId) { await supabase.from("tours").delete().eq("id", tourId); }

async function duplicateTour(sourceTour, newName, newPassword, newStartDate) {
  // 1. Create the new tour with a fresh id, copying itinerary-level fields but NOT guest data
  const newTourId = (newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) + "-" + Date.now();
  const { error: tourErr } = await supabase.from("tours").insert({
    id: newTourId, name: newName, duration: sourceTour.duration, description: sourceTour.description || "",
    password: newPassword, announcement: "", notes: sourceTour.notes || "",
    guide_name: sourceTour.guide_name || "", guide_phone: sourceTour.guide_phone || "",
    guide_email: sourceTour.guide_email || "",
    coach_rows: sourceTour.coach_rows || 10, coach_cols: sourceTour.coach_cols || 4,
    start_date: newStartDate || "", current_day_override: null,
  });
  if (tourErr) throw tourErr;

  // 2. Copy each day, and its schedule_items + attractions
  const { data: srcDays } = await supabase.from("days").select("*").eq("tour_id", sourceTour.id).order("day_number");
  for (const d of (srcDays || [])) {
    const { data: newDay, error: dErr } = await supabase.from("days").insert({
      tour_id: newTourId, day_number: d.day_number, title: d.title, location: d.location,
    }).select().single();
    if (dErr) throw dErr;
    // schedule items
    const { data: sched } = await supabase.from("schedule_items").select("*").eq("day_id", d.id).order("sort_order");
    if (sched && sched.length) {
      await supabase.from("schedule_items").insert(sched.map(s => ({
        day_id: newDay.id, time: s.time, label: s.label, note: s.note, sort_order: s.sort_order,
      })));
    }
    // attractions
    const { data: attr } = await supabase.from("attractions").select("*").eq("day_id", d.id).order("sort_order");
    if (attr && attr.length) {
      await supabase.from("attractions").insert(attr.map(a => ({
        day_id: newDay.id, name: a.name, description: a.description, latitude: a.latitude, longitude: a.longitude, sort_order: a.sort_order,
      })));
    }
  }

  // 3. Copy excursions (itinerary content), but clear tour-specific dates/deadlines so you set them fresh
  const { data: srcExc } = await supabase.from("excursions").select("*").eq("tour_id", sourceTour.id).order("sort_order");
  for (const e of (srcExc || [])) {
    await supabase.from("excursions").insert({
      tour_id: newTourId, title: e.title, subtitle: e.subtitle || "", description: e.description || "",
      price: e.price || 0, date: "", location: e.location || "", deadline: "",
      image_path: e.image_path || "", sort_order: e.sort_order || 0,
    });
  }

  // NOTE: photos, excursion_bookings, and announcements are intentionally NOT copied — new group starts clean.
  return newTourId;
}

function isDeadlinePassed(deadline) {
  if (!deadline) return false;
  // Parse deadline like "17 May" or "17 May 2025"
  try {
    const year = new Date().getFullYear();
    const d = new Date(`${deadline} ${year}`);
    if (isNaN(d)) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  } catch (e) { return false; }
}

async function loadExcursions(tourId) {
  const { data, error } = await supabase.from("excursions").select("*").eq("tour_id", tourId).order("sort_order");
  if (error) throw error;
  return data || [];
}

async function saveExcursion(tourId, excursion) {
  const { data, error } = await supabase.from("excursions").upsert({
    id: excursion.id || undefined, tour_id: tourId, title: excursion.title,
    subtitle: excursion.subtitle || "", description: excursion.description || "",
    price: parseFloat(excursion.price) || 0, date: excursion.date || "",
    location: excursion.location || "", deadline: excursion.deadline || "",
    image_path: excursion.image_path || "", sort_order: excursion.sort_order || 0,
  }).select().single();
  if (error) throw error;
  return data;
}

async function deleteExcursion(id) { await supabase.from("excursions").delete().eq("id", id); }

// ── Master Excursion Library ──
async function loadMasterExcursions() {
  const { data, error } = await supabase.from("master_excursions").select("*").order("title");
  if (error) throw error;
  return (data || []).map(m => ({
    ...m,
    url: m.image_path ? supabase.storage.from("excursion-photos").getPublicUrl(m.image_path).data.publicUrl : null
  }));
}
async function saveMasterExcursion(m) {
  const row = {
    title: m.title, subtitle: m.subtitle || "",
    description: m.description || "", price: parseFloat(m.price) || 0,
    duration: m.duration || "", location: m.location || "", image_path: m.image_path || ""
  };
  let res;
  if (m.id) {
    res = await supabase.from("master_excursions").update(row).eq("id", m.id).select().single();
  } else {
    res = await supabase.from("master_excursions").insert(row).select().single();
  }
  if (res.error) throw res.error;
  return res.data;
}
async function deleteMasterExcursion(id) { await supabase.from("master_excursions").delete().eq("id", id); }
async function uploadMasterExcursionPhoto(file, masterId) {
  const ext = file.name.split(".").pop();
  const path = `master-${masterId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("excursion-photos").upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw error;
  return path;
}

async function loadBookings(tourId) {
  const { data, error } = await supabase.from("excursion_bookings").select("*").eq("tour_id", tourId).order("created_at");
  if (error) throw error;
  return data || [];
}

async function submitBooking(tourId, excursionId, guestNames, numPeople, paymentMethod) {
  const { error } = await supabase.from("excursion_bookings").insert({
    excursion_id: excursionId, tour_id: tourId,
    guest_names: guestNames, num_people: numPeople, payment_method: paymentMethod,
  });
  if (error) throw error;
}

async function deleteBooking(id) { await supabase.from("excursion_bookings").delete().eq("id", id); }

async function uploadExcursionPhoto(file, excursionId) {
  const ext = file.name.split(".").pop();
  const path = `${excursionId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("excursion-photos").upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw error;
  return path;
}

async function loadPhotos(tourId, includeReported = false) {
  let q = supabase.from("photos").select("*").eq("tour_id", tourId);
  if (!includeReported) q = q.eq("reported", false);
  const { data, error } = await q.order("created_at", { ascending: false });
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
async function reportPhoto(photo) {
  await supabase.from("photos").update({ reported: true }).eq("id", photo.id);
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


const COACH_LAYOUT = [
  { left: [1,2],     right: [3,4] },
  { left: [5,6],     right: [7,8] },
  { left: [9,10],    right: [11,12] },
  { left: [13,14],   right: [15,16] },
  { left: [17,18],   right: [19,20] },
  { left: [21,22],   right: null },
  { left: [23,24],   right: null },
  { left: [25,26],   right: [27,28] },
  { left: [29,30],   right: [31,32] },
  { left: [33,34],   right: [35,36] },
  { left: [37,38],   right: [39,40] },
  { left: [41,42],   right: [43,44] },
  { left: [45,46],   right: [47,48] },
  { left: [49,50,51,52,53], right: [], isBack: true },
];

// Clockwise rotation order (14 positions)
const ROTATION_ORDER = [
  [1,2], [5,6], [9,10], [13,14], [17,18], [21,22], [23,24],
  [25,26], [29,30], [33,34], [37,38], [41,42], [45,46],
  [49,50,51,52,53],
  [47,48], [43,44], [39,40], [35,36], [31,32], [27,28],
  [19,20], [15,16], [11,12], [7,8], [3,4]
];

// ── Coach Seating Plan ────────────────────────────────────────────────────────
const CoachSeatingPlan = ({ tour, guestName, isGuide }) => {
  const seats = tour.seats || [];
  const getSeatByNum = (num) => seats.find(s => s.seat_number === num);

  const SeatTile = ({ num, wide }) => {
    const seat = getSeatByNum(num);
    const occupied = seat?.guest_name || "";
    const firstName = occupied.split(" ")[0] || "";
    const lastName = occupied.split(" ").slice(1).join(" ") || "";
    const isMySeat = occupied && guestName && occupied.toLowerCase() === guestName.toLowerCase();
    return (
      <div title={occupied ? `Seat ${num} — ${occupied}` : `Seat ${num} — Available`}
        style={{ flex: wide ? 1 : 1, minHeight: 72, minWidth: 0, borderRadius: 10,
          background: isMySeat ? "#c9a96e" : occupied ? "#2a4a6b" : "#0d1520",
          border: `2px solid ${isMySeat ? "#c9a96e" : occupied ? "#3a6a9b" : "#ffffff15"}`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "4px 2px", gap: 1, transition: "all 0.2s" }}>
        <div style={{ fontSize: 11, color: isMySeat ? "#1a1a2e" : occupied ? "#a0c0e0" : "#506070", fontWeight: 700 }}>{num}</div>
        {isMySeat && <div style={{ fontSize: 14 }}>⭐</div>}
        {occupied && !isMySeat && (
          <>
            <div style={{ fontSize: firstName.length > 6 ? 8 : 9, fontWeight: 600, color: "#f0e6d3", textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px" }}>{firstName}</div>
            {lastName && <div style={{ fontSize: lastName.length > 6 ? 7 : 8, color: "#8090a0", textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px" }}>{lastName}</div>}
          </>
        )}
        {!occupied && <div style={{ fontSize: 9, color: "#304050" }}>○</div>}
      </div>
    );
  };

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
        {/* Front of coach — Guide left, Driver right */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <div style={{ flex: 1, background: "#1a3a2a", borderRadius: 10, padding: "10px 6px", border: "1px solid #2a6a4a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 60 }}>
            <div style={{ fontSize: 18 }}>🧑‍✈️</div>
            <div style={{ fontSize: 10, color: "#6abf8a", marginTop: 3, fontWeight: 600, letterSpacing: 1 }}>GUIDE</div>
          </div>
          <div style={{ width: 20, flexShrink: 0 }} />
          <div style={{ flex: 1, background: "#1a2a3a", borderRadius: 10, padding: "10px 6px", border: "1px solid #2a4a6a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 60 }}>
            <div style={{ fontSize: 18 }}>🚌</div>
            <div style={{ fontSize: 10, color: "#6a8abf", marginTop: 3, fontWeight: 600, letterSpacing: 1 }}>DRIVER</div>
          </div>
        </div>
        {/* Custom seat layout using COACH_LAYOUT */}
        <div key={seats.map(s => s.guest_name).join(",")} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {COACH_LAYOUT.map((row, rowIdx) => (
            <div key={rowIdx} style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
              {/* Left seats — full width for back row */}
              <div style={{ flex: row.isBack ? "0 0 100%" : 1, display: "flex", gap: 4 }}>
                {row.left.map(num => <SeatTile key={num} num={num} />)}
              </div>
              {!row.isBack && <div style={{ width: 20, flexShrink: 0 }} />}
              {/* Right seats, toilet, or empty for back row */}
              {!row.isBack && (
                <div style={{ flex: 1, display: "flex", gap: 4 }}>
                  {row.right === null ? (
                    <div style={{ flex: 1, minHeight: 72, borderRadius: 10, background: "#111a26", border: "1px dashed #ffffff15", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                      <div style={{ fontSize: 14 }}>🚻</div>
                      <div style={{ fontSize: 8, color: "#304050" }}>WC</div>
                    </div>
                  ) : (
                    row.right.map(num => <SeatTile key={num} num={num} />)
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Back of coach */}
        <div style={{ textAlign: "center", marginTop: 10 }}>
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
    (tour.seats || []).forEach((s) => { 
      if (s.seat_number) d["seat-" + s.seat_number] = s.guest_name;
      else d[s.row + "-" + s.col] = s.guest_name;
    });
    return d;
  });
  const [editing, setEditing] = useState(null);
  const [nameInput, setNameInput] = useState("");

  const handleSeatClick = (num) => {
    const key = "seat-" + num;
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

  const showStatus = (msg) => { /* status handled by parent */ };

  const [rotateAmount, setRotateAmount] = useState(2);
  const [dragFrom, setDragFrom] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  const handlePasteNames = () => {
    const names = pasteText.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
    const newData = { ...seatData };
    // Get all seat numbers in order from COACH_LAYOUT
    const allSeats = [];
    COACH_LAYOUT.forEach(row => {
      row.left.forEach(num => allSeats.push(num));
      if (row.right && row.right.length > 0) row.right.forEach(num => allSeats.push(num));
    });
    names.forEach((name, i) => {
      if (i < allSeats.length) newData["seat-" + allSeats[i]] = name;
    });
    setSeatData(newData);
    setPasteText("");
    setShowPaste(false);
  };


  const handleSeatSwap = (key) => {
    if (!dragFrom) {
      // First tap — select this seat to swap
      setDragFrom(key);
    } else if (dragFrom === key) {
      // Tapped same seat — deselect
      setDragFrom(null);
    } else {
      // Second tap — swap the two seats
      setSeatData(prev => {
        const updated = { ...prev };
        const fromName = updated[dragFrom] || "";
        const toName = updated[key] || "";
        updated[dragFrom] = toName;
        updated[key] = fromName;
        return updated;
      });
      setDragFrom(null);
    }
  };
  const [rotateConfirm, setRotateConfirm] = useState(null);

  // Build clockwise seat order: left side top→bottom, right side bottom→top
  const rotateSeat = (direction) => {
    // Use ROTATION_ORDER which correctly skips toilet and handles back row
    const order = ROTATION_ORDER;
    const total = order.length;
    const steps = direction === "clockwise" ? rotateAmount : total - (rotateAmount % total);
    const newData = { ...seatData };
    // Clear all seats first
    order.forEach(group => {
      group.forEach(num => { newData["seat-" + num] = ""; });
    });
    // Rotate
    order.forEach((group, i) => {
      const newIndex = (i + steps) % total;
      const newGroup = order[newIndex];
      // Move all names from this group to the new group
      group.forEach((num, j) => {
        const name = seatData["seat-" + num] || "";
        if (name && j < newGroup.length) {
          newData["seat-" + newGroup[j]] = name;
        }
      });
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
          <button onClick={() => { if (window.confirm("Clear all names from the seating plan?")) { setSeatData({}); showStatus && showStatus("✓ All seats cleared"); } }}
          style={{ width: "100%", padding: "8px", background: "#ff444415", border: "1px solid #ff444430", borderRadius: 8, color: "#ff6666", fontSize: 12, cursor: "pointer", marginBottom: 10 }}>
          🗑️ Clear All Names
        </button>
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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: dragFrom ? "#c9a96e" : "#607080" }}>{dragFrom ? "Now tap another seat to swap" : "Tap to select · Tap again to swap · Double-tap to edit"}</div>
          <button onClick={() => setShowPaste(p => !p)}
            style={{ background: "#c9a96e15", border: "1px solid #c9a96e40", borderRadius: 8, padding: "5px 12px", color: "#c9a96e", fontSize: 12, cursor: "pointer" }}>
            📋 Paste Names
          </button>
        </div>
        {showPaste && (
          <div style={{ background: "#0d1520", borderRadius: 12, padding: 14, marginBottom: 14, border: "1px solid #c9a96e30" }}>
            <div style={{ fontSize: 11, color: "#c9a96e", marginBottom: 8 }}>Paste names below — one per line, fills seats in order</div>
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
              placeholder={"John Smith\nMary Jones\nPeter Brown\n..."}
              style={{ width: "100%", minHeight: 120, background: "#1a2332", border: "1px solid #ffffff20", borderRadius: 8, padding: "8px 10px", color: "#f0e6d3", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "'Lato',sans-serif" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => setShowPaste(false)}
                style={{ flex: 1, padding: "8px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 8, color: "#8090a0", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={handlePasteNames}
                style={{ flex: 2, padding: "8px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 8, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Fill Seats</button>
            </div>
          </div>
        )}

        {/* Mini seat grid for editing */}
        <div key={JSON.stringify(seatData)} style={{ background: "#0d1520", borderRadius: 14, padding: 16, marginBottom: 16, maxHeight: 360, overflowY: "auto" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 12, alignItems: "center" }}>
          <div style={{ flex: 1, background: "#1a3a2a", borderRadius: 8, padding: "6px 10px", border: "1px solid #2a6a4a", textAlign: "center" }}>
            <div style={{ fontSize: 14 }}>🧑‍✈️</div>
            <div style={{ fontSize: 9, color: "#6abf8a", fontWeight: 600 }}>GUIDE</div>
          </div>
          <div style={{ width: 12, flexShrink: 0 }} />
          <div style={{ flex: 1, background: "#1a2a3a", borderRadius: 8, padding: "6px 10px", border: "1px solid #2a4a6a", textAlign: "center" }}>
            <div style={{ fontSize: 14 }}>🚌</div>
            <div style={{ fontSize: 9, color: "#6a8abf", fontWeight: 600 }}>DRIVER</div>
          </div>
        </div>
          {COACH_LAYOUT.map((row, rowIdx) => (
            <div key={rowIdx} style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "stretch" }}>
              {/* Left seats */}
              <div style={{ flex: row.isBack ? "0 0 100%" : 1, display: "flex", gap: 3 }}>
                {row.left.map(num => {
                  const key = "seat-" + num;
                  const name = seatData[key] || "";
                  const isSelected = editing === key;
                  const isSwapSelected = dragFrom === key;
                  return (
                    <div key={num}
                      onClick={() => { if (editing) return; handleSeatSwap(key); }}
                      onDoubleClick={() => { setDragFrom(null); handleSeatClick(num); }}
                      style={{ flex: 1, minHeight: 52, borderRadius: 6, background: isSwapSelected ? "#c9a96e40" : isSelected ? "#c9a96e30" : name ? "#1a3a5a" : "#1a2332", border: `1px solid ${isSwapSelected ? "#c9a96e" : isSelected ? "#c9a96e60" : name ? "#c9a96e40" : "#ffffff15"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: "3px 2px", gap: 1 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: isSelected ? "#c9a96e" : name ? "#6080a0" : "#304050" }}>{num}</div>
                      {name ? (
                        <>
                          <div style={{ fontSize: name.split(" ")[0].length > 6 ? 7 : 8, fontWeight: 600, color: "#f0e6d3", textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px" }}>{name.split(" ")[0]}</div>
                          {name.split(" ").length > 1 && <div style={{ fontSize: 7, color: "#8090a0", textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px" }}>{name.split(" ").slice(1).join(" ")}</div>}
                        </>
                      ) : <div style={{ fontSize: 8, color: "#304050" }}>○</div>}
                    </div>
                  );
                })}
              </div>
              {/* Aisle */}
              {!row.isBack && <div style={{ width: 12, flexShrink: 0 }} />}
              {/* Right seats or toilet */}
              {!row.isBack && (
                <div style={{ flex: 1, display: "flex", gap: 3 }}>
                  {row.right === null ? (
                    <div style={{ flex: 1, minHeight: 52, borderRadius: 6, background: "#111a26", border: "1px dashed #ffffff10", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ fontSize: 12 }}>🚻</div>
                      <div style={{ fontSize: 7, color: "#304050" }}>WC</div>
                    </div>
                  ) : (
                    row.right.map(num => {
                      const key = "seat-" + num;
                      const name = seatData[key] || "";
                      const isSelected = editing === key;
                      const isSwapSelected = dragFrom === key;
                      return (
                        <div key={num}
                          onClick={() => { if (editing) return; handleSeatSwap(key); }}
                          onDoubleClick={() => { setDragFrom(null); handleSeatClick(num); }}
                          style={{ flex: 1, minHeight: 52, borderRadius: 6, background: isSwapSelected ? "#c9a96e40" : isSelected ? "#c9a96e30" : name ? "#1a3a5a" : "#1a2332", border: `1px solid ${isSwapSelected ? "#c9a96e" : isSelected ? "#c9a96e60" : name ? "#c9a96e40" : "#ffffff15"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: "3px 2px", gap: 1 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: isSelected ? "#c9a96e" : name ? "#6080a0" : "#304050" }}>{num}</div>
                          {name ? (
                            <>
                              <div style={{ fontSize: name.split(" ")[0].length > 6 ? 7 : 8, fontWeight: 600, color: "#f0e6d3", textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px" }}>{name.split(" ")[0]}</div>
                              {name.split(" ").length > 1 && <div style={{ fontSize: 7, color: "#8090a0", textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px" }}>{name.split(" ").slice(1).join(" ")}</div>}
                            </>
                          ) : <div style={{ fontSize: 8, color: "#304050" }}>○</div>}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
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
const LeafletMap = ({ attractions, schedule }) => {
  const mapInstanceRef = useRef(null);
  const uid = useRef("map-" + Math.random().toString(36).slice(2));

  const getNextAttractionIndex = () => {
    if (!schedule?.length) return 0;
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    const nextSched = schedule.find(s => {
      if (!s.time) return false;
      const parsed = parseTimeMins(s.time);
      return parsed && parsed.start > nowMins;
    });
    if (!nextSched) return attractions.length - 1;
    // Find attraction closest in sort_order to next schedule item
    return Math.min(
      schedule.filter(s => {
        if (!s.time) return false;
        const p = parseTimeMins(s.time);
        return p && p.start <= nowMins;
      }).length,
      attractions.length - 1
    );
  };

  useEffect(() => {
    if (!window.L || !attractions?.length) return;
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }

    const nextIdx = getNextAttractionIndex();
    const center = [attractions[nextIdx].lat, attractions[nextIdx].lng];
    const map = window.L.map(uid.current, { zoomControl: true, scrollWheelZoom: false }).setView(center, 15);
    mapInstanceRef.current = map;
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(map);

    const sortedAttractions = [...attractions].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    sortedAttractions.forEach((a, i) => {
      const isPast = i < nextIdx;
      const isNext = i === nextIdx;
      const bg = isNext ? "#c9a96e" : isPast ? "#506070" : "#1a2332";
      const border = isNext ? "#a07840" : isPast ? "#304050" : "#c9a96e60";
      const textColor = isNext ? "#1a1a2e" : "#f0e6d3";
      const opacity = isPast ? 0.45 : 1;
      const size = isNext ? 36 : 28;
      const icon = window.L.divIcon({
        className: "",
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid ${border};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${isNext ? 14 : 11}px;color:${textColor};opacity:${opacity};box-shadow:${isNext ? '0 0 0 4px rgba(201,169,110,0.3)' : 'none'}">${i + 1}</div>`,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
      });
      window.L.marker([a.lat, a.lng], { icon }).addTo(map)
        .bindPopup(`<strong>${a.name}</strong>${a.desc ? '<br/><span style="color:#aaa;font-size:12px">' + a.desc + '</span>' : ''}${isPast ? '<br/><span style="color:#888;font-size:11px">✓ Visited</span>' : isNext ? '<br/><span style="color:#c9a96e;font-size:11px">▶ Next stop</span>' : ''}`);
    });

    // If multiple attractions show all, else zoom to next
    if (attractions.length > 1 && nextIdx === 0) {
      map.fitBounds(window.L.latLngBounds(sortedAttractions.map(a => [a.lat, a.lng])), { padding: [30, 30] });
    }
  }, [attractions, schedule]);

  useEffect(() => () => { if (mapInstanceRef.current) mapInstanceRef.current.remove(); }, []);
  if (!attractions?.length) return null;
  return (
    <div style={{ marginTop: 16, borderRadius: 14, overflow: "hidden", border: "1px solid #c9a96e30" }}>
      <div id={uid.current} style={{ height: 260, width: "100%" }} />
    </div>
  );
};

// ── QR Modal ──────────────────────────────────────────────────────────────────
const QRModal = ({ tour, appUrl, onClose }) => {
  const canvasRef = useRef(null);
  const [qrReady, setQrReady] = useState(false);
  const guestUrl = `https://castleandcoastline.co.uk?tour=${tour.id}`;
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
      {!isGuide && <button onClick={async () => { if (window.confirm("Report this photo as inappropriate? It will be hidden immediately and reviewed.")) { await reportPhoto(photo); onClose(); window.alert("Thank you. This photo has been hidden and will be reviewed."); } }} style={{ marginTop: 14, marginLeft: 8, padding: "8px 20px", background: "#ffffff10", border: "1px solid #ffffff20", borderRadius: 10, color: "#a0b0c0", fontSize: 13, cursor: "pointer" }}>⚐ Report</button>}
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
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah" maxLength={40} style={{ width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 16, outline: "none" }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Caption <span style={{ color: "#506070", textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Sunrise over Loch Lomond" maxLength={120} style={{ width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 16, outline: "none" }} />
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
  const [reported, setReported] = useState([]);
  const fetchPhotos = async () => {
    setLoading(true);
    try {
      const all = await loadPhotos(tour.id, isGuide);
      if (isGuide) {
        setPhotos(all.filter(p => !p.reported));
        setReported(all.filter(p => p.reported));
      } else {
        setPhotos(all);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { fetchPhotos(); }, [tour.id]);
  const handleDelete = async (photo) => { if (!window.confirm("Delete this photo?")) return; try { await deletePhoto(photo); fetchPhotos(); } catch (e) { alert("Failed to delete"); } };
  const handleRestore = async (photo) => { try { await supabase.from("photos").update({ reported: false }).eq("id", photo.id); fetchPhotos(); } catch (e) { alert("Failed to restore"); } };
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700 }}>Tour Photos</div>
        <button onClick={() => setShowUpload(true)} style={{ background: "linear-gradient(135deg,#c9a96e,#a07840)", border: "none", borderRadius: 10, padding: "8px 14px", color: "#1a1a2e", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Add Photo</button>
      </div>
      <div style={{ color: "#7080a0", fontSize: 13, marginBottom: 24 }}>Shared memories from everyone on the tour</div>
      {isGuide && reported.length > 0 && (
        <div style={{ background: "#3a2a2a", border: "1px solid #6a4a4a", borderRadius: 12, padding: 14, marginBottom: 20 }}>
          <div style={{ color: "#e0a0a0", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>⚐ {reported.length} reported photo{reported.length !== 1 ? "s" : ""} — hidden from guests, awaiting your review</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {reported.map((photo) => (
              <div key={photo.id} style={{ borderRadius: 12, overflow: "hidden", background: "#1a2332", border: "1px solid #6a4a4a" }}>
                <img src={photo.url} alt={photo.caption} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                <div style={{ padding: 8, display: "flex", gap: 6 }}>
                  <button onClick={() => handleRestore(photo)} style={{ flex: 1, padding: "7px", background: "#2a3a2a", border: "1px solid #4a6a4a", borderRadius: 8, color: "#8aba8a", fontSize: 12, cursor: "pointer" }}>Restore</button>
                  <button onClick={() => handleDelete(photo)} style={{ flex: 1, padding: "7px", background: "#ff444420", border: "1px solid #ff444440", borderRadius: 8, color: "#ff6666", fontSize: 12, cursor: "pointer" }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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

// ── Countdown Banner ──────────────────────────────────────────────────────────
const CountdownBanner = ({ schedule }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  if (!schedule || schedule.length === 0) return null;

  const nowMins = now.getHours() * 60 + now.getMinutes();

  let next = null;
  let diff = null;
  let isDeparture = false;

  for (const s of schedule) {
    if (!s.time) continue;
    const parsed = parseTimeMins(s.time);
    if (!parsed || parsed.start === null) continue;
    // Between start and end of a range — show departure countdown
    if (parsed.isRange && parsed.end !== null && parsed.start <= nowMins && parsed.end > nowMins) {
      next = s; diff = parsed.end - nowMins; isDeparture = true; break;
    }
    // Start time is upcoming
    if (parsed.start > nowMins) {
      next = s; diff = parsed.start - nowMins; isDeparture = false; break;
    }
  }

  if (!next || diff === null) return (
    <div style={{ background: "#1a2332", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "10px 20px", display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#506070", flexShrink: 0 }} />
      <div style={{ fontSize: 13, color: "#607080" }}>All events completed for today</div>
    </div>
  );
  const hrs = Math.floor(diff / 60);
  const mins = diff % 60;

  const dotColor = diff <= 2 ? "#e84444" : diff <= 10 ? "#e8a060" : "#6abf6a";
  const bgColor = diff <= 2 ? "rgba(232,68,68,0.08)" : diff <= 10 ? "rgba(232,160,96,0.08)" : "rgba(26,35,50,1)";
  const borderColor = diff <= 2 ? "rgba(232,68,68,0.25)" : diff <= 10 ? "rgba(232,160,96,0.2)" : "rgba(201,169,110,0.15)";
  const timeColor = diff <= 2 ? "#e84444" : diff <= 10 ? "#e8a060" : "#c9a96e";
  const urgencyLabel = diff <= 2
    ? (isDeparture ? "⚠️ Departing now" : "⚠️ Starting now")
    : diff <= 10
    ? (isDeparture ? "Time to head back!" : "Coming up soon")
    : (isDeparture ? "Departing" : "Next up");

  const countdownText = hrs > 0
    ? `${hrs}h ${mins}m`
    : `${mins} min`;

  return (
    <div style={{ background: bgColor, borderBottom: `1px solid ${borderColor}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.5s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0, transition: "background 0.5s" }} />
        <div>
          <div style={{ fontSize: 11, color: "#8090a0" }}>{urgencyLabel}</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: "#f0e6d3" }}>{next.label}</div>
          {next.note && <div style={{ fontSize: 12, color: "#506070", marginTop: 2 }}>{next.note}</div>}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: timeColor, fontVariantNumeric: "tabular-nums", transition: "color 0.5s" }}>{countdownText}</div>
        <div style={{ fontSize: 11, color: "#506070" }}>{next.time}</div>
      </div>
    </div>
  );
};

// ── Excursion Editor (Guide) ─────────────────────────────────────────────────
const ExcursionEditor = ({ excursion, tourId, onSave, onClose, saving }) => {
  const [e, setE] = useState({ title: "", subtitle: "", description: "", price: "", date: "", location: "", deadline: "", image_path: "", sort_order: 0, ...excursion });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(excursion?.image_path ? supabase.storage.from("excursion-photos").getPublicUrl(excursion.image_path).data.publicUrl : null);
  const fileRef = useRef(null);

  const inp = (label, val, fn, ph, type = "text") => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 5 }}>{label}</label>
      <input value={val} onChange={ev => fn(ev.target.value)} placeholder={ph} type={type}
        style={{ width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "9px 12px", color: "#f0e6d3", fontSize: 14, outline: "none" }} />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ background: "#1a2332", borderRadius: 20, padding: 24, maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: "#f0e6d3" }}>{excursion?.id ? "Edit Excursion" : "New Excursion"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#607080", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {/* Photo upload */}
        <div onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${photoPreview ? "#c9a96e" : "#ffffff20"}`, borderRadius: 12, marginBottom: 16, overflow: "hidden", cursor: "pointer", minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {photoPreview ? <img src={photoPreview} alt="preview" style={{ width: "100%", maxHeight: 160, objectFit: "cover", display: "block" }} />
            : <div style={{ textAlign: "center", padding: 20 }}><div style={{ fontSize: 24, marginBottom: 6 }}>📷</div><div style={{ color: "#c9a96e", fontSize: 13 }}>Tap to add photo</div></div>}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={ev => { const f = ev.target.files[0]; if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); } }} />
        </div>

        {inp("Title", e.title, v => setE({...e, title: v}), "e.g. The Scottish Evening")}
        {inp("Subtitle", e.subtitle, v => setE({...e, subtitle: v}), "e.g. An unforgettable night of Scottish culture")}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Description</label>
          <textarea value={e.description} onChange={ev => setE({...e, description: ev.target.value})} placeholder="Describe the excursion..."
            style={{ width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "9px 12px", color: "#f0e6d3", fontSize: 13, outline: "none", resize: "vertical", minHeight: 80, fontFamily: "'Lato',sans-serif" }} />
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>{inp("Price (£)", e.price, v => setE({...e, price: v}), "e.g. 95", "number")}</div>
          <div style={{ flex: 1 }}>{inp("Date", e.date, v => setE({...e, date: v}), "e.g. Thu 21 May")}</div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>{inp("Location", e.location, v => setE({...e, location: v}), "e.g. Edinburgh")}</div>
          <div style={{ flex: 1 }}>{inp("Booking Deadline", e.deadline, v => setE({...e, deadline: v}), "e.g. 17 May")}</div>
        </div>
        {inp("Sort Order", e.sort_order, v => setE({...e, sort_order: parseInt(v) || 0}), "0", "number")}
        {inp("Tour Day Override (optional)", e.tour_day || "", v => setE({...e, tour_day: parseInt(v) || null}), "e.g. 3 — overrides date matching", "number")}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 12, color: "#8090a0", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onSave(e, photoFile)} disabled={saving}
            style={{ flex: 2, padding: "12px", background: saving ? "#806040" : "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Saving…" : "Save Excursion"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Excursion Bookings Summary (Guide) ────────────────────────────────────────
const ExcursionSummary = ({ excursion, bookings, onClose, onDeleteBooking }) => {
  const excBookings = bookings.filter(b => b.excursion_id === excursion.id);
  const totalPeople = excBookings.reduce((a, b) => a + (b.num_people || 1), 0);
  const totalRevenue = totalPeople * excursion.price;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ background: "#1a2332", borderRadius: 20, padding: 24, maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: "#f0e6d3" }}>{excursion.title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#607080", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          {[["BOOKINGS", excBookings.length], ["PEOPLE", totalPeople], ["TOTAL", `£${totalRevenue}`]].map(([l, v]) => (
            <div key={l} style={{ flex: 1, background: "#0d1520", borderRadius: 10, padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#c9a96e" }}>{v}</div>
              <div style={{ fontSize: 10, color: "#506070", letterSpacing: 1 }}>{l}</div>
            </div>
          ))}
        </div>
        {excBookings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 20px", color: "#405060" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎭</div>
            <div>No bookings yet</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {excBookings.map(b => (
              <div key={b.id} style={{ background: "#0d1520", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#f0e6d3" }}>{b.guest_names}</div>
                  <div style={{ fontSize: 12, color: "#607080", marginTop: 2 }}>
                    {b.num_people} {b.num_people === 1 ? "person" : "people"} · {b.payment_method || "Payment TBC"} · £{b.num_people * excursion.price}
                  </div>
                </div>
                <button onClick={() => onDeleteBooking(b.id)} style={{ background: "#ff444415", border: "1px solid #ff444430", borderRadius: 6, padding: "4px 8px", color: "#ff6666", fontSize: 12, cursor: "pointer" }}>×</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{ width: "100%", marginTop: 16, padding: "12px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Done</button>
      </div>
    </div>
  );
};

// ── Excursion Day Inline (bottom of itinerary) ───────────────────────────────
const ExcursionDayInline = ({ tour, dayLocation, guestName, dayIdx }) => {
  const [excursions, setExcursions] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [booking, setBooking] = useState(null);
  const [guestNames, setGuestNames] = useState(guestName || "");
  useEffect(() => { setGuestNames(guestName || ""); }, [guestName]);
  const [numPeople, setNumPeople] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("Credit Card");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      const [exc, book] = await Promise.all([loadExcursions(tour.id), loadBookings(tour.id)]);
      // Match by tour_day override first, then by calendar date, then by location
      const tourStartDate = tour.start_date ? new Date(tour.start_date) : null;
      const relevant = exc.filter(e => {
        // Manual day override on excursion
        if (e.tour_day) {
          if (!tourStartDate) return false;
          const excDate = new Date(tourStartDate);
          excDate.setDate(excDate.getDate() + e.tour_day - 1);
          const today = new Date();
          return excDate.toDateString() === today.toDateString() ||
            (dayIdx !== undefined && e.tour_day === dayIdx + 1);
        }
        // Match by excursion date string vs tour calendar date
        if (e.date && tourStartDate) {
          try {
            const excCal = new Date(`${e.date} ${new Date().getFullYear()}`);
            if (!isNaN(excCal)) {
              // Find which day of tour this date falls on
              const tourDay = Math.round((excCal - tourStartDate) / 86400000);
              return tourDay === dayIdx;
            }
          } catch(err) {}
        }
        // Fallback: location matching
        if (!e.location || !dayLocation) return false;
        const excLoc = e.location.toLowerCase().trim();
        const dayLoc = dayLocation.split('-')[0].split('–')[0].split(',')[0].toLowerCase().trim();
        return excLoc.includes(dayLoc) || dayLoc.includes(excLoc);
      });
      setExcursions(relevant);
      setBookings(book);
    } catch(e) { console.error(e); }
  };

  useEffect(() => { fetchData(); }, [tour.id, dayLocation, guestName]);

  const myBooking = (excId) => {
    if (!guestName) return null;
    const surname = guestName.toLowerCase().trim();
    return bookings.find(b => b.excursion_id === excId && b.guest_names.toLowerCase().trim().includes(surname));
  };

  const handleBook = async () => {
    if (!guestNames.trim()) { setError("Please enter your name"); return; }
    setSubmitting(true);
    try {
      await submitBooking(tour.id, booking.id, guestNames.trim(), numPeople, paymentMethod);
      setBooking(null); setGuestNames(guestName || ""); setNumPeople(1); setError("");
      fetchData();
    } catch(e) { setError("Failed — please try again"); }
    setSubmitting(false);
  };

  if (excursions.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: "#c9a96e", marginBottom: 14 }}>Optional Excursions Today</div>
      {excursions.map(exc => {
        const booked = myBooking(exc.id);
        const deadlinePassed = isDeadlinePassed(exc.deadline);
        return (
          <div key={exc.id} style={{ background: "#1a2332", borderRadius: 14, border: `1px solid ${booked ? "#c9a96e40" : "#ffffff10"}`, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ flex: 1, marginRight: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f0e6d3" }}>{exc.title}</div>
                {exc.subtitle && <div style={{ fontSize: 12, color: "#8090a0", marginTop: 2 }}>{exc.subtitle}</div>}
                {exc.deadline && <div style={{ fontSize: 11, color: "#506070", marginTop: 4 }}>📅 Deadline: {exc.deadline}</div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#c9a96e" }}>£{exc.price}</div>
                <div style={{ fontSize: 10, color: "#506070" }}>per person</div>
              </div>
            </div>
            {booked ? (
              <div>
                <div style={{ background: "rgba(106,191,106,0.1)", border: "1px solid rgba(106,191,106,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: "#6abf6a", fontWeight: 600 }}>✓ Booked — {booked.guest_names} · {booked.num_people} {booked.num_people === 1 ? "person" : "people"} · £{booked.num_people * exc.price}</div>
                </div>
                {!deadlinePassed && (
                  <button onClick={async () => { if (window.confirm("Cancel this booking?")) { await deleteBooking(booked.id); fetchData(); } }}
                    style={{ width: "100%", padding: "8px", background: "#ff444415", border: "1px solid #ff444430", borderRadius: 8, color: "#ff6666", fontSize: 12, cursor: "pointer" }}>
                    Cancel booking
                  </button>
                )}
              </div>
            ) : deadlinePassed ? (
              <div style={{ fontSize: 12, color: "#506070", textAlign: "center", padding: "6px 0" }}>Booking deadline has passed</div>
            ) : (
              <button onClick={() => { setBooking(exc); setError(""); }}
                style={{ width: "100%", padding: "10px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 8, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Book this excursion
              </button>
            )}
          </div>
        );
      })}

      {booking && (
        <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 3000, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#1a2332", borderRadius: "20px 20px 0 0", padding: 24, paddingBottom: 60, width: "100%", maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30", maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: "#f0e6d3" }}>{booking.title}</div>
              <button onClick={() => { setBooking(null); setError(""); setGuestNames(guestName || ""); setNumPeople(1); }} style={{ background: "none", border: "none", color: "#607080", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Name(s)</label>
              <input value={guestNames} onChange={e => setGuestNames(e.target.value)} placeholder="e.g. John & Mary Smith"
                style={{ width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 16, outline: "none" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Number of people</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => setNumPeople(p => Math.max(1, p - 1))} style={{ width: 36, height: 36, borderRadius: "50%", background: "#0d1520", border: "1px solid #ffffff20", color: "#f0e6d3", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#f0e6d3", minWidth: 30, textAlign: "center" }}>{numPeople}</div>
                <button onClick={() => setNumPeople(p => p + 1)} style={{ width: 36, height: 36, borderRadius: "50%", background: "#0d1520", border: "1px solid #ffffff20", color: "#f0e6d3", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                <div style={{ marginLeft: "auto", fontSize: 16, fontWeight: 700, color: "#c9a96e" }}>£{numPeople * booking.price}</div>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Payment method</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Prepaid", "Credit Card", "Cash"].map(method => (
                  <button key={method} onClick={() => setPaymentMethod(method)}
                    style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${paymentMethod === method ? "#c9a96e" : "#ffffff20"}`, background: paymentMethod === method ? "#c9a96e15" : "transparent", color: paymentMethod === method ? "#c9a96e" : "#8090a0", fontSize: 13, cursor: "pointer" }}>
                    {method}
                  </button>
                ))}
              </div>
            </div>
            {error && <div style={{ color: "#ff6666", fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</div>}
            <button onClick={handleBook} disabled={submitting}
              style={{ width: "100%", padding: "14px", marginBottom: "max(env(safe-area-inset-bottom, 16px), 16px)", background: submitting ? "#806040" : "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 15, cursor: submitting ? "default" : "pointer" }}>
              {submitting ? "Booking…" : `Confirm Booking — £${numPeople * booking.price}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Excursion Day Banner ─────────────────────────────────────────────────────
// ── Guest Excursions Page ─────────────────────────────────────────────────────
const ExcursionsPage = ({ tour, guestName }) => {
  const [excursions, setExcursions] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null); // excursion being booked
  const [photoView, setPhotoView] = useState(null); // excursion photo being viewed full-screen
  const [guestNames, setGuestNames] = useState("");
  const [numPeople, setNumPeople] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("Credit Card");
  const [submitting, setSubmitting] = useState(false);
  const [, setSubmitted] = useState({});
  const [error, setError] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [exc, book] = await Promise.all([loadExcursions(tour.id), loadBookings(tour.id)]);
      setExcursions(exc);
      setBookings(book);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [tour.id, guestName]);

  const handleSubmitBooking = async () => {
    if (!guestNames.trim()) { setError("Please enter at least one name"); return; }
    setSubmitting(true);
    try {
      await submitBooking(tour.id, booking.id, guestNames.trim(), numPeople, paymentMethod);
      setSubmitted(prev => ({ ...prev, [booking.id]: true }));
      setBooking(null); setGuestNames(""); setNumPeople(1); setError("");
      fetchData();
    } catch (e) { setError("Failed to submit — please try again"); }
    setSubmitting(false);
  };

  const myBooking = (excId) => {
    if (!guestName) return null;
    const surname = guestName.toLowerCase().trim();
    return bookings.find(b => b.excursion_id === excId && b.guest_names.toLowerCase().trim().includes(surname));
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#607080" }}><div style={{ fontSize: 32, marginBottom: 10 }}>🎭</div><div>Loading excursions…</div></div>;

  if (excursions.length === 0) return (
    <div style={{ padding: 40, textAlign: "center", color: "#405060" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🎭</div>
      <div>No optional excursions for this tour yet — check back soon!</div>
    </div>
  );

  const totalSelected = excursions.reduce((sum, exc) => {
    const b = myBooking(exc.id);
    return sum + (b ? b.num_people * exc.price : 0);
  }, 0);
  const countSelected = excursions.filter(exc => myBooking(exc.id)).length;

  return (
    <div style={{ padding: "0 0 20px" }}>
      <div style={{ padding: "20px 20px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Optional Excursions</div>
          {guestName && (
            <button onClick={() => { localStorage.removeItem("cc_guest_surname"); window.location.reload(); }}
              style={{ background: "none", border: "1px solid #ffffff20", borderRadius: 8, padding: "4px 10px", color: "#607080", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>
              Not {guestName}?
            </button>
          )}
        </div>
        <div style={{ color: "#7080a0", fontSize: 13 }}>Viewing as <strong style={{ color: "#c9a96e" }}>{guestName || "Guest"}</strong></div>
      </div>

      {excursions.map(exc => {
        const booked = myBooking(exc.id);
        const photoUrl = exc.image_path ? supabase.storage.from("excursion-photos").getPublicUrl(exc.image_path).data.publicUrl : null;
        return (
          <div key={exc.id} style={{ margin: "0 14px 14px", background: "#1a2332", borderRadius: 16, border: `1px solid ${booked ? "#c9a96e40" : "#ffffff10"}`, overflow: "hidden" }}>
            {photoUrl && <img src={photoUrl} alt={exc.title} onClick={() => setPhotoView(photoUrl)} style={{ width: "100%", height: 160, objectFit: "cover", display: "block", cursor: "pointer" }} />}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ flex: 1, marginRight: 10 }}>
                  {exc.date && <div style={{ fontSize: 12, color: "#c9a96e", marginBottom: 3 }}>{exc.date}{exc.location ? ` · ${exc.location}` : ""}</div>}
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#f0e6d3", lineHeight: 1.3 }}>{exc.title}</div>
                  {exc.subtitle && <div style={{ fontSize: 13, color: "#8090a0", marginTop: 3 }}>{exc.subtitle}</div>}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#c9a96e" }}>£{exc.price}</div>
                  <div style={{ fontSize: 10, color: "#506070" }}>per person</div>
                </div>
              </div>
              {exc.description && <div style={{ fontSize: 13, color: "#8090a0", lineHeight: 1.6, marginBottom: 12 }}>{exc.description}</div>}
              {exc.deadline && <div style={{ fontSize: 11, color: "#506070", marginBottom: 12 }}>📅 Booking deadline: {exc.deadline}</div>}

              {(() => {
                const deadlinePassed = isDeadlinePassed(exc.deadline);
                if (booked) return (
                  <div>
                    <div style={{ background: "rgba(106,191,106,0.1)", border: "1px solid rgba(106,191,106,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                      <div style={{ fontSize: 13, color: "#6abf6a", fontWeight: 600, marginBottom: 2 }}>✓ Booked — {booked.guest_names}</div>
                      <div style={{ fontSize: 12, color: "#506070" }}>{booked.num_people} {booked.num_people === 1 ? "person" : "people"} · {booked.payment_method} · £{booked.num_people * exc.price}</div>
                    </div>
                    {!deadlinePassed ? (
                      <button onClick={async () => { if (window.confirm("Remove your booking for this excursion?")) { try { await deleteBooking(booked.id); fetchData(); } catch(e) { console.error(e); } } }}
                        style={{ width: "100%", padding: "9px", background: "#ff444415", border: "1px solid #ff444430", borderRadius: 10, color: "#ff6666", fontSize: 13, cursor: "pointer" }}>
                        Cancel booking
                      </button>
                    ) : (
                      <div style={{ fontSize: 11, color: "#506070", textAlign: "center", padding: "6px 0" }}>Booking deadline passed — contact your guide to make changes</div>
                    )}
                  </div>
                );
                if (deadlinePassed) return (
                  <div style={{ background: "#ffffff08", borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#506070" }}>Booking deadline has passed</div>
                  </div>
                );
                return (
                  <button onClick={() => { setBooking(exc); setError(""); }}
                    style={{ width: "100%", padding: "11px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 10, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                    Book this excursion
                  </button>
                );
              })()}
            </div>
          </div>
        );
      })}

      {/* Running total */}
      {countSelected > 0 && (
        <div style={{ margin: "0 14px", background: "#1a2332", borderRadius: 14, padding: "14px 18px", border: "1px solid #c9a96e30", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#607080" }}>Your total</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#c9a96e" }}>£{totalSelected}</div>
          </div>
          <div style={{ fontSize: 12, color: "#8090a0", textAlign: "right" }}>
            {countSelected} excursion{countSelected !== 1 ? "s" : ""} booked
          </div>
        </div>
      )}

      {/* Excursion photo full-screen viewer */}
      {photoView && (
        <div onClick={() => setPhotoView(null)} style={{ position: "fixed", inset: 0, background: "#000000ee", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <img src={photoView} alt="Excursion" style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 12, objectFit: "contain" }} />
          <button onClick={() => setPhotoView(null)} style={{ position: "absolute", top: "max(env(safe-area-inset-top, 20px), 20px)", right: 20, background: "#1a2332cc", border: "1px solid #ffffff30", borderRadius: 20, width: 40, height: 40, color: "#f0e6d3", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
      )}

      {/* Booking modal */}
      {booking && (
        <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 3000, display: "flex", alignItems: "flex-end", padding: "0" }}>
          <div style={{ background: "#1a2332", borderRadius: "20px 20px 0 0", padding: 24, paddingBottom: 60, width: "100%", maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30", maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: "#f0e6d3" }}>{booking.title}</div>
              <button onClick={() => { setBooking(null); setError(""); setGuestNames(guestName || ""); setNumPeople(1); }} style={{ background: "none", border: "none", color: "#607080", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Name(s)</label>
              <input value={guestNames} onChange={e => setGuestNames(e.target.value)} placeholder="e.g. John & Mary Smith"
                style={{ width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 16, outline: "none" }} />
              <div style={{ fontSize: 11, color: "#506070", marginTop: 4 }}>Enter all names if booking for a group</div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Number of people</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => setNumPeople(p => Math.max(1, p - 1))}
                  style={{ width: 36, height: 36, borderRadius: "50%", background: "#0d1520", border: "1px solid #ffffff20", color: "#f0e6d3", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#f0e6d3", minWidth: 30, textAlign: "center" }}>{numPeople}</div>
                <button onClick={() => setNumPeople(p => p + 1)}
                  style={{ width: 36, height: 36, borderRadius: "50%", background: "#0d1520", border: "1px solid #ffffff20", color: "#f0e6d3", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                <div style={{ marginLeft: "auto", fontSize: 16, fontWeight: 700, color: "#c9a96e" }}>£{numPeople * booking.price}</div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Payment method</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Prepaid", "Credit Card", "Cash"].map(method => (
                  <button key={method} onClick={() => setPaymentMethod(method)}
                    style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${paymentMethod === method ? "#c9a96e" : "#ffffff20"}`, background: paymentMethod === method ? "#c9a96e15" : "transparent", color: paymentMethod === method ? "#c9a96e" : "#8090a0", fontSize: 13, cursor: "pointer" }}>
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {error && <div style={{ color: "#ff6666", fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</div>}

            <button onClick={handleSubmitBooking} disabled={submitting}
              style={{ width: "100%", padding: "14px", marginBottom: "max(env(safe-area-inset-bottom, 16px), 16px)", background: submitting ? "#806040" : "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 15, cursor: submitting ? "default" : "pointer" }}>
              {submitting ? "Booking…" : `Confirm Booking — £${numPeople * booking.price}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Combined Contact & Emergency Page ────────────────────────────────────────
const ContactAndEmergencyPage = ({ tour }) => {
  const hasContact = tour.guide_name || tour.guide_phone || tour.guide_email;
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);

  const FACILITY_TYPES = [
    { key: "hospital", label: "Hospital / A&E", icon: "🏥", search: "hospital" },
    { key: "pharmacy", label: "Pharmacy", icon: "💊", search: "pharmacy" },
    { key: "police", label: "Police Station", icon: "🚓", search: "police+station" },
    { key: "doctors", label: "GP / Doctor", icon: "👨‍⚕️", search: "GP+doctor" },
  ];

  const requestLocation = () => {
    setLoading(true); setError("");
    navigator.geolocation.getCurrentPosition(
      pos => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLoading(false); },
      err => { setLoading(false); if (err.code === 1) setPermissionDenied(true); else setError("Could not get location. Please try again."); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Guide Contact */}
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Contact</div>
      <div style={{ color: "#7080a0", fontSize: 13, marginBottom: 20 }}>Your guide & emergency services</div>

      {hasContact ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          {tour.guide_name && (
            <div style={{ background: "#1a2332", borderRadius: 16, padding: "18px 20px", border: "1px solid #c9a96e30", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Your Guide</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 700 }}>{tour.guide_name}</div>
            </div>
          )}
          {tour.guide_phone && (
            <a href={`tel:${tour.guide_phone}`} style={{ display: "flex", alignItems: "center", gap: 16, background: "#1a2332", borderRadius: 16, padding: "16px 20px", textDecoration: "none", border: "1px solid #ffffff10" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#c9a96e20", border: "1px solid #c9a96e40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>📞</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "#607080", marginBottom: 3 }}>Phone</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f0e6d3" }}>{tour.guide_phone}</div>
              </div>
              <div style={{ background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 10, padding: "8px 16px", color: "#1a1a2e", fontWeight: 700, fontSize: 14 }}>Call</div>
            </a>
          )}
          {tour.guide_email && (
            <a href={`mailto:${tour.guide_email}`} style={{ display: "flex", alignItems: "center", gap: 16, background: "#1a2332", borderRadius: 16, padding: "16px 20px", textDecoration: "none", border: "1px solid #ffffff10" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#c9a96e20", border: "1px solid #c9a96e40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>✉️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "#607080", marginBottom: 3 }}>Email</div>
                <div style={{ fontSize: 15, color: "#f0e6d3" }}>{tour.guide_email}</div>
              </div>
              <div style={{ background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 10, padding: "8px 16px", color: "#1a1a2e", fontWeight: 700, fontSize: 14 }}>Email</div>
            </a>
          )}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "24px 20px", color: "#405060", border: "1px dashed #ffffff15", borderRadius: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📞</div><div>Contact details coming soon</div>
        </div>
      )}

      {/* Emergency Numbers */}
      <div style={{ background: "#2a1a1a", borderRadius: 14, padding: 16, border: "1px solid #ff444430", marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#ff6666", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Emergency Numbers</div>
        {[["🚨", "999", "UK Emergency", "Police, Fire, Ambulance"], ["🚨", "112", "EU Emergency", "Works across Europe"], ["🏥", "111", "NHS Non-Emergency", "Medical advice (UK)"]].map(([icon, num, label, desc]) => (
          <div key={num} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#f0e6d3" }}>{num} — {label}</div>
                <div style={{ fontSize: 11, color: "#7080a0" }}>{desc}</div>
              </div>
            </div>
            <a href={`tel:${num}`} style={{ background: "#ff444420", border: "1px solid #ff444440", borderRadius: 8, padding: "6px 14px", color: "#ff6666", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>Call</a>
          </div>
        ))}
      </div>

      {/* GPS Facilities */}
      <div style={{ fontSize: 12, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Find Nearby Facilities</div>
      {!location && !loading && (
        <div style={{ textAlign: "center", padding: "20px", background: "#1a2332", borderRadius: 14, border: "1px solid #ffffff10", marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "#8090a0", marginBottom: 14, lineHeight: 1.6 }}>Tap below to find the nearest hospital, pharmacy, police station and GP based on your location</div>
          {permissionDenied
            ? <div style={{ color: "#ff6666", fontSize: 13 }}>Location permission denied. Please enable in Settings → Safari → Location.</div>
            : <button onClick={requestLocation} style={{ padding: "10px 20px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 10, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>📍 Use My Location</button>}
        </div>
      )}
      {loading && <div style={{ textAlign: "center", padding: "20px", color: "#607080" }}>📍 Getting your location…</div>}
      {error && <div style={{ color: "#ff8888", fontSize: 13, textAlign: "center", marginBottom: 12 }}>{error}</div>}
      {location && (
        <div>
          <div style={{ fontSize: 12, color: "#506070", marginBottom: 10 }}>Tap to open Google Maps near your current location</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {FACILITY_TYPES.map((f, i) => (
              <a key={i} href={`https://www.google.com/maps/search/${f.search}/@${location.lat},${location.lng},14z`} target="_blank" rel="noopener noreferrer"
                style={{ background: "#1a2332", borderRadius: 12, padding: "14px 16px", border: "1px solid #ffffff10", display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
                <span style={{ fontSize: 28, flexShrink: 0 }}>{f.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#f0e6d3" }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: "#506070" }}>Opens Google Maps near you</div>
                </div>
                <span style={{ color: "#c9a96e", fontSize: 16 }}>→</span>
              </a>
            ))}
          </div>
          <button onClick={requestLocation} style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "#506070", fontSize: 12, cursor: "pointer" }}>🔄 Refresh location</button>
        </div>
      )}
    </div>
  );
};

// ── Guest Login ───────────────────────────────────────────────────────────────
const GuestLogin = ({ tours, onUnlock, onGuideLogin }) => {
  const [code, setCode] = useState(() => localStorage.getItem("cc_tour_code") || "");
  const [surname, setSurname] = useState(() => localStorage.getItem("cc_guest_surname") || "");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  // Auto-login if we have saved credentials
  useEffect(() => {
    const savedCode = localStorage.getItem("cc_tour_code");
    const savedSurname = localStorage.getItem("cc_guest_surname");
    if (savedCode && savedSurname) {
      if (savedCode.toUpperCase() === GUIDE_PASSWORD) { onGuideLogin(); return; }
      const match = tours.find(t => t.password.toUpperCase() === savedCode.toUpperCase());
      if (match) { onUnlock(match, savedSurname); }
    }
  }, [tours]);

  const tryUnlock = () => {
    const trimCode = code.trim().toUpperCase();
    const trimSurname = surname.trim();
    if (!trimCode) { setError("Please enter your tour code"); return; }
    if (trimCode === GUIDE_PASSWORD) { localStorage.setItem("cc_tour_code", trimCode); onGuideLogin(); return; }
    if (!trimSurname) { setError("Please enter your last name"); return; }
    const match = tours.find(t => t.password.toUpperCase() === trimCode);
    if (match) {
      localStorage.setItem("cc_tour_code", trimCode);
      localStorage.setItem("cc_guest_surname", trimSurname);
      onUnlock(match, trimSurname);
    } else {
      setError("That code doesn't match any tour — please check with your guide.");
      setShake(true); setTimeout(() => setShake(false), 500);
    }
  };

  const inp = (val, fn, ph, extra = {}) => (
    <input value={val} onChange={e => { fn(e.target.value); setError(""); }}
      onKeyDown={e => e.key === "Enter" && tryUnlock()} placeholder={ph}
      style={{ width: "100%", textAlign: "center", fontSize: 18, fontWeight: 600, padding: "13px 12px", borderRadius: 12, border: `2px solid ${error ? "#ff4444" : "#c9a96e40"}`, background: "#1a2332", color: "#f0e6d3", outline: "none", marginBottom: 10, transition: "border-color 0.2s", ...extra }} />
  );

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0d1520 0%,#1a2332 60%,#0d1520 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "'Lato',sans-serif" }}>
      <img src="/logo-app.png" alt="Castle & Coastline Tours" style={{ width: 160, height: 160, objectFit: "contain", marginBottom: 12 }} />
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, color: "#f0e6d3", textAlign: "center", marginBottom: 6 }}>Welcome</div>
      <div style={{ color: "#607080", fontSize: 13, textAlign: "center", marginBottom: 32, maxWidth: 280, lineHeight: 1.6 }}>Enter your tour code and last name to access your tour</div>
      <div style={{ width: "100%", maxWidth: 320, transform: shake ? "translateX(-6px)" : "none", transition: "transform 0.1s" }}>
        <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Tour Code</label>
        {inp(code, v => setCode(v.toUpperCase()), "e.g. HIGHLANDS2025", { fontFamily: "monospace", letterSpacing: 4, fontSize: 20, fontWeight: 700 })}
        <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Last Name</label>
        {inp(surname, setSurname, "e.g. Smith")}
        {error && <div style={{ color: "#ff6666", fontSize: 13, textAlign: "center", marginBottom: 10 }}>{error}</div>}
        <button onClick={tryUnlock} style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 14, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 16, cursor: "pointer", marginTop: 4 }}>
          Access My Tour →
        </button>
      </div>
      <div style={{ marginTop: 40, background: "#1a2332", borderRadius: 14, padding: "14px 18px", maxWidth: 300, border: "1px solid #ffffff10" }}>
        <div style={{ fontSize: 12, color: "#506070", textAlign: "center", lineHeight: 1.7 }}>🔔 <strong style={{ color: "#8090a0" }}>Allow notifications</strong> to get tour updates<br /><span style={{ fontSize: 11 }}>Your guide can send live announcements and you'll get a reminder 10 minutes before each activity — even offline.</span></div>
      </div>
    </div>
  );
};

// ── Announcement Banner ───────────────────────────────────────────────────────
const AnnouncementBanner = ({ text }) => {
  if (!text) return null;
  return (
    <div style={{ background: "linear-gradient(135deg,#f0851f,#d2691e)", paddingTop: "max(env(safe-area-inset-top, 60px), 60px)", paddingBottom: 12, paddingLeft: 20, paddingRight: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>📢</span>
      <div><div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a2e", letterSpacing: 1, textTransform: "uppercase" }}>Guide Update</div><div style={{ fontSize: 14, color: "#1a1a2e", marginTop: 2, fontWeight: 500 }}>{text}</div></div>
    </div>
  );
};

// ── Guest Nav ─────────────────────────────────────────────────────────────────
const GuestNav = ({ active, onChange }) => {
  const tabs = [{ id: "itinerary", icon: "🗓️", label: "Itinerary" }, { id: "coach", icon: "🚌", label: "Seats" }, { id: "photos", icon: "📸", label: "Photos" }, { id: "excursions", icon: "🎭", label: "Excursions" }, { id: "info", icon: "💡", label: "Info" }, { id: "contact", icon: "📞", label: "Contact" }];
  return (
    <div className="guest-nav" style={{ display: "flex", borderTop: "1px solid #ffffff10", background: "#0d1520", flexShrink: 0, paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => onChange(tab.id)} style={{ flex: 1, padding: "12px 2px 10px", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, borderTop: `2px solid ${active === tab.id ? "#c9a96e" : "transparent"}` }}>
          <span style={{ fontSize: 18 }}>{tab.icon}</span>
          <span style={{ fontSize: 11, color: active === tab.id ? "#c9a96e" : "#506070", fontFamily: "'Lato',sans-serif", fontWeight: active === tab.id ? 700 : 400 }}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

// ── Contact Page ──────────────────────────────────────────────────────────────
// ── Local Phrases by region ───────────────────────────────────────────────────
const PHRASES = {
  scotland: {
    label: "Scottish Gaelic & Scots",
    flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    items: [
      { phrase: "Halò / Hiya", meaning: "Hello" },
      { phrase: "Tapadh leat", meaning: "Thank you (to one person)" },
      { phrase: "Màth dha-rìribh", meaning: "Excellent / Really good" },
      { phrase: "Slàinte mhath", meaning: "Good health (toast)" },
      { phrase: "Dinnae fash yersel", meaning: "Don't worry about it" },
      { phrase: "Braw", meaning: "Brilliant / Lovely" },
      { phrase: "Och aye", meaning: "Oh yes" },
      { phrase: "Loch", meaning: "Lake" },
      { phrase: "Glen", meaning: "Valley" },
      { phrase: "Ben", meaning: "Mountain peak" },
    ],
  },
  ireland: {
    label: "Irish & Hiberno-English",
    flag: "🇮🇪",
    items: [
      { phrase: "Dia dhuit", meaning: "Hello (lit. God be with you)" },
      { phrase: "Go raibh maith agat", meaning: "Thank you" },
      { phrase: "Sláinte", meaning: "Cheers / Good health" },
      { phrase: "Grand", meaning: "Fine / Good (used constantly)" },
      { phrase: "Craic", meaning: "Fun, good times, chat" },
      { phrase: "Fierce", meaning: "Very (e.g. fierce cold)" },
      { phrase: "Gobsmacked", meaning: "Astonished" },
      { phrase: "The Jacks", meaning: "The toilet" },
      { phrase: "Fáilte", meaning: "Welcome" },
      { phrase: "Céad míle fáilte", meaning: "A hundred thousand welcomes" },
    ],
  },
  wales: {
    label: "Welsh",
    flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    items: [
      { phrase: "Bore da", meaning: "Good morning" },
      { phrase: "Diolch", meaning: "Thank you" },
      { phrase: "Iechyd da", meaning: "Good health (toast)" },
      { phrase: "Croeso", meaning: "Welcome" },
      { phrase: "Cwtch", meaning: "A hug / cosy space" },
      { phrase: "Lush", meaning: "Lovely / great" },
      { phrase: "Tidy", meaning: "Good / sorted" },
    ],
  },
  england: {
    label: "British English",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    items: [
      { phrase: "Cheers", meaning: "Thanks / goodbye" },
      { phrase: "Brilliant", meaning: "Excellent" },
      { phrase: "Quite", meaning: "Rather / somewhat" },
      { phrase: "Gutted", meaning: "Very disappointed" },
      { phrase: "Chuffed", meaning: "Very pleased" },
      { phrase: "Knackered", meaning: "Exhausted" },
      { phrase: "Blimey", meaning: "Expression of surprise" },
    ],
  },
};

const detectRegion = (location) => {
  if (!location) return null;
  const l = location.toLowerCase();
  if (l.includes("scotland") || l.includes("edinburgh") || l.includes("glasgow") || l.includes("highland") || l.includes("inverness") || l.includes("loch") || l.includes("aberdeen") || l.includes("stirling") || l.includes("skye")) return "scotland";
  if (l.includes("ireland") || l.includes("dublin") || l.includes("cork") || l.includes("galway") || l.includes("kerry") || l.includes("belfast") || l.includes("limerick") || l.includes("wicklow") || l.includes("donegal")) return "ireland";
  if (l.includes("wales") || l.includes("cardiff") || l.includes("swansea") || l.includes("snowdon")) return "wales";
  return "england";
};

// ── Currency Converter ─────────────────────────────────────────────────────────
const CurrencyConverter = () => {
  const [amount, setAmount] = useState("10");
  const [from, setFrom] = useState("GBP");
  const [to, setTo] = useState("EUR");
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const currencies = ["GBP", "EUR", "USD", "CAD", "AUD", "JPY", "CHF", "SEK", "NOK", "NZD"];

  const fetchRates = (baseCurrency) => {
    setLoading(true);
    // Use exchangerate-api free endpoint
    fetch(`https://api.exchangerate-api.com/v4/latest/${baseCurrency}`)
      .then(r => r.json())
      .then(d => {
        if (d.rates) {
          setRates(d.rates);
          setLastUpdated(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
        }
        setLoading(false);
      })
      .catch(() => {
        // Fallback to frankfurter
        fetch(`https://api.frankfurter.app/latest?from=${baseCurrency}`)
          .then(r => r.json())
          .then(d => {
            if (d.rates) {
              setRates({ ...d.rates, [baseCurrency]: 1 });
              setLastUpdated(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
            }
            setLoading(false);
          })
          .catch(() => setLoading(false));
      });
  };

  useEffect(() => { fetchRates(from); }, [from]);

  const rate = rates[to] || null;
  const result = rate && amount ? (parseFloat(amount) * rate).toFixed(rate < 0.1 ? 0 : 2) : null;

  const handleSwap = () => {
    const newFrom = to;
    const newTo = from;
    setFrom(newFrom);
    setTo(newTo);
  };

  return (
    <div style={{ background: "#1a2332", borderRadius: 14, padding: 18, border: "1px solid #ffffff10", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "#c9a96e", fontWeight: 600 }}>💱 Currency Converter</div>
        <button onClick={() => fetchRates(from)} style={{ background: "none", border: "none", color: "#506070", fontSize: 11, cursor: "pointer" }}>
          {loading ? "updating…" : lastUpdated ? `Updated ${lastUpdated} 🔄` : "Load rates"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="Amount"
          style={{ flex: 1, background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 18, fontWeight: 700, outline: "none" }} />
        <select value={from} onChange={e => setFrom(e.target.value)}
          style={{ flex: 1, background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 8px", color: "#f0e6d3", fontSize: 14, outline: "none" }}>
          {currencies.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, height: 1, background: "#ffffff15" }} />
        <button onClick={handleSwap} style={{ background: "#c9a96e20", border: "1px solid #c9a96e40", borderRadius: 20, padding: "5px 14px", color: "#c9a96e", fontSize: 14, cursor: "pointer" }}>⇅</button>
        <div style={{ flex: 1, height: 1, background: "#ffffff15" }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, background: "#0d1520", border: "1px solid #c9a96e30", borderRadius: 8, padding: "10px 12px", fontSize: 20, fontWeight: 700, color: "#c9a96e", minHeight: 44, display: "flex", alignItems: "center" }}>
          {loading ? <span style={{ fontSize: 13, color: "#506070" }}>Loading…</span> : result ? result : <span style={{ fontSize: 13, color: "#506070" }}>Tap 🔄 to load</span>}
        </div>
        <select value={to} onChange={e => setTo(e.target.value)}
          style={{ flex: 1, background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 8px", color: "#f0e6d3", fontSize: 14, outline: "none" }}>
          {currencies.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      {rate && !loading && <div style={{ fontSize: 11, color: "#506070", textAlign: "center" }}>1 {from} = {rate.toFixed(4)} {to}</div>}
    </div>
  );
};

// ── Useful Info Page ───────────────────────────────────────────────────────────
const UsefulInfoPage = ({ tour, currentLocation }) => {
  const notes = tour.notes || "";
  const region = detectRegion(currentLocation || "");

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Useful Info</div>
      <div style={{ color: "#7080a0", fontSize: 13, marginBottom: 24 }}>Tips, currency & local phrases</div>

      {/* Currency Converter */}
      <CurrencyConverter />

      {/* Local Phrases — show all regions, highlight current */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Local Phrases</div>
        {Object.entries(PHRASES).sort(([a], [b]) => {
          if (a === region) return -1;
          if (b === region) return 1;
          return 0;
        }).map(([key, lang]) => {
          const isCurrent = region === key;
          return (
            <div key={key} style={{ background: "#1a2332", borderRadius: 14, padding: 16, border: `1px solid ${isCurrent ? "#c9a96e40" : "#ffffff10"}`, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>{lang.flag}</span>
                <div style={{ fontSize: 13, color: isCurrent ? "#c9a96e" : "#8090a0", fontWeight: 600 }}>{lang.label}</div>
                {isCurrent && <div style={{ marginLeft: "auto", background: "#c9a96e20", border: "1px solid #c9a96e40", borderRadius: 20, padding: "2px 8px", fontSize: 10, color: "#c9a96e" }}>TODAY'S REGION</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {lang.items.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < lang.items.length - 1 ? "1px solid #ffffff08" : "none" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#f0e6d3" }}>{p.phrase}</div>
                    <div style={{ fontSize: 12, color: "#7080a0", textAlign: "right", maxWidth: "55%" }}>{p.meaning}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Guide Notes */}
      {notes ? (
        <div>
          <div style={{ fontSize: 12, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12, fontWeight: 600 }}>Guide Notes</div>
          <div style={{ background: "#1a2332", borderRadius: 14, padding: "16px 18px", border: "1px solid #ffffff10" }}>
            <div style={{ fontSize: 14, color: "#d0c0b0", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{notes}</div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "30px 20px", color: "#405060", border: "1px dashed #ffffff15", borderRadius: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
          <div>No guide notes yet — check back soon!</div>
        </div>
      )}
    </div>
  );
};

// ── Emergency Page ─────────────────────────────────────────────────────────────
const EmergencyPage = () => {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);

  const FACILITY_TYPES = [
    { key: "hospital", label: "Hospital / A&E", icon: "🏥", search: "hospital" },
    { key: "pharmacy", label: "Pharmacy", icon: "💊", search: "pharmacy" },
    { key: "police", label: "Police Station", icon: "🚓", search: "police+station" },
    { key: "doctors", label: "GP / Doctor", icon: "👨‍⚕️", search: "GP+doctor" },
  ];

  const requestLocation = () => {
    setLoading(true); setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ lat: latitude, lng: longitude });
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        if (err.code === 1) setPermissionDenied(true);
        else setError("Could not get your location. Please try again.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Emergency</div>
      <div style={{ color: "#7080a0", fontSize: 13, marginBottom: 20 }}>Nearest hospitals, pharmacies & emergency services</div>

      {/* Always visible emergency numbers */}
      <div style={{ background: "#2a1a1a", borderRadius: 14, padding: 16, border: "1px solid #ff444430", marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#ff6666", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Emergency Numbers</div>
        {[["🚨 999", "UK Emergency — Police, Fire, Ambulance"], ["🚨 112", "EU Emergency — works across Europe"], ["🏥 111", "NHS Non-Emergency Medical Advice (UK)"]].map(([num, desc]) => (
          <div key={num} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f0e6d3" }}>{num}</div>
              <div style={{ fontSize: 11, color: "#7080a0" }}>{desc}</div>
            </div>
            <a href={`tel:${num.replace(/[^0-9]/g, '')}`}
              style={{ background: "#ff444420", border: "1px solid #ff444440", borderRadius: 8, padding: "6px 14px", color: "#ff6666", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
              Call
            </a>
          </div>
        ))}
      </div>

      {/* Location-based facilities */}
      {!location && !loading && (
        <div style={{ textAlign: "center", padding: "30px 20px", background: "#1a2332", borderRadius: 16, border: "1px solid #ffffff10" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📍</div>
          <div style={{ color: "#f0e6d3", fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Find Nearby Facilities</div>
          <div style={{ color: "#607080", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>Tap below — we'll detect your location then show buttons to find the nearest hospital, pharmacy, police station and GP in Google Maps</div>
          {permissionDenied ? (
            <div style={{ color: "#ff6666", fontSize: 13, padding: "0 10px" }}>Location permission denied. Please go to your phone Settings → Safari → Location and set it to Allow.</div>
          ) : (
            <button onClick={requestLocation} style={{ padding: "12px 24px", background: "linear-gradient(135deg,#c9a96e,#a07840)", borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              📍 Use My Location
            </button>
          )}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#607080" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📍</div>
          <div>Getting your location…</div>
        </div>
      )}

      {error && (
        <div style={{ background: "#2a1a1a", borderRadius: 12, padding: 16, border: "1px solid #ff444430", color: "#ff8888", fontSize: 13, marginBottom: 16, textAlign: "center" }}>
          {error}
          <button onClick={requestLocation} style={{ display: "block", margin: "10px auto 0", padding: "8px 16px", background: "#ff444420", border: "1px solid #ff444440", borderRadius: 8, color: "#ff6666", fontSize: 12, cursor: "pointer" }}>Try Again</button>
        </div>
      )}

      {location && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>Nearest Facilities</div>
            <button onClick={requestLocation} style={{ background: "none", border: "none", color: "#607080", fontSize: 12, cursor: "pointer" }}>🔄 Refresh location</button>
          </div>
          <div style={{ fontSize: 12, color: "#506070", marginBottom: 14 }}>Tap any button to open in Google Maps and find the nearest one to you</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FACILITY_TYPES.map((f, i) => (
              <div key={i} style={{ background: "#1a2332", borderRadius: 14, padding: "16px 18px", border: "1px solid #ffffff10", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 32, flexShrink: 0 }}>{f.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#f0e6d3", marginBottom: 2 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: "#506070" }}>Opens Google Maps near your location</div>
                </div>
                <a href={`https://www.google.com/maps/search/${f.search}/@${location.lat},${location.lng},14z`} target="_blank" rel="noopener noreferrer"
                  style={{ background: "linear-gradient(135deg,#c9a96e,#a07840)", border: "none", borderRadius: 10, padding: "8px 14px", color: "#1a1a2e", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0, textDecoration: "none" }}>
                  Find →
                </a>
              </div>
            ))}
          </div>
          <div style={{ background: "#1a2332", borderRadius: 12, padding: "12px 16px", marginTop: 14, border: "1px solid #ffffff10" }}>
            <div style={{ fontSize: 12, color: "#506070", textAlign: "center", lineHeight: 1.6 }}>
              📍 Location detected · Tap <strong style={{ color: "#8090a0" }}>Find →</strong> to search Google Maps near you
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ── Guest View ────────────────────────────────────────────────────────────────
const GuestView = ({ tour, onLogout, isGuide, startPage, isOffline, guestName }) => {
  const [activePage, setActivePage] = useState(startPage || "itinerary");
  const [fontScale, setFontScale] = useState(1);
  const fs = (size) => Math.round(size * fontScale);

  // Work out which day index to show based on start date or override
  const calcDayIndex = () => {
    if (tour.current_day_override) {
      const idx = tour.days.findIndex(d => d.day === tour.current_day_override);
      return idx >= 0 ? idx : 0;
    }
    if (tour.start_date) {
      const start = new Date(tour.start_date);
      const today = new Date();
      const diff = Math.floor((today - start) / 86400000);
      const dayNum = Math.max(1, Math.min(tour.duration, diff + 1));
      const idx = tour.days.findIndex(d => d.day === dayNum);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  };

  const [activeDay, setActiveDay] = useState(calcDayIndex);
  const day = tour.days[activeDay];

  // Keep the app fresh while open: refresh data + countdown every 30s, and on foreground
  const [, forceTick] = useState(0);
  useEffect(() => {
    const tick = setInterval(() => { forceTick(t => t + 1); }, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') forceTick(t => t + 1); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  const currentLocation = (day?.location || "").split('-')[0].split('–')[0].trim();

  // Has the tour finished? (past the final day)
  const tourIsComplete = (() => {
    if (tour.notifications_ended) return true; // manual override from guide
    if (!tour.start_date) return false;
    const start = new Date(tour.start_date);
    const end = new Date(start);
    end.setDate(end.getDate() + tour.duration); // day after final day
    end.setHours(0, 0, 0, 0);
    return new Date() >= end;
  })();

  // Once tour is complete, cancel any pending reminders and untag from OneSignal
  useEffect(() => {
    if (!tourIsComplete) return;
    (async () => {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length) {
          await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
        }
      } catch(e) { console.log('Could not cancel reminders:', e); }
      try {
        const _osMod = await import('@onesignal/capacitor-plugin'); const OneSignal = _osMod.OneSignal || _osMod.default;
        await OneSignal.User.removeTag("tour_id");
        console.log('Tour complete — removed tour_id tag, notifications stopped');
      } catch(e) { console.log('Could not remove tag:', e); }
    })();
  }, [tourIsComplete]);

  // Schedule local notifications (10 mins before each schedule item) — works offline
  useEffect(() => {
    if (isGuide) return; // only guests get reminders
    if (tourIsComplete) return; // no reminders after tour ends
    const scheduleLocalReminders = async () => {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const perm = await LocalNotifications.requestPermissions();
        if (perm.display !== 'granted') return;

        // Clear any previously scheduled reminders to avoid duplicates
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length) {
          await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
        }

        const tourStartDate = tour.start_date ? new Date(tour.start_date) : null;
        if (!tourStartDate) return;

        const toSchedule = [];
        let notifId = 1;
        tour.days.forEach(d => {
          if (!d.schedule?.length) return;
          const dayDate = new Date(tourStartDate);
          dayDate.setDate(dayDate.getDate() + (d.day - 1));
          d.schedule.forEach(item => {
            if (!item.time || !item.label) return;
            const parsed = parseTimeMins(item.time);
            if (!parsed) return;
            const itemDate = new Date(dayDate);
            itemDate.setHours(Math.floor(parsed.start / 60), parsed.start % 60, 0, 0);
            const reminderDate = new Date(itemDate.getTime() - 10 * 60 * 1000);
            if (reminderDate > new Date()) {
              toSchedule.push({
                id: notifId++,
                title: `⏰ ${item.label} in 10 minutes`,
                body: item.note || `${item.label} is starting soon — please be ready!`,
                schedule: { at: reminderDate },
              });
            }
          });
        });

        if (toSchedule.length) {
          await LocalNotifications.schedule({ notifications: toSchedule });
          console.log(`Scheduled ${toSchedule.length} local reminders`);
        }
      } catch(e) {
        console.log('Local notifications not available:', e);
      }
    };
    scheduleLocalReminders();
  }, [tour.id, tour.start_date]);
  return (
    <div style={{ height: "100dvh", minHeight: "-webkit-fill-available", background: "linear-gradient(160deg,#0d1520 0%,#1a2332 50%,#0d1520 100%)", fontFamily: "'Lato',sans-serif", color: "#f0e6d3", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <AnnouncementBanner text={tour.announcement} />
      {isOffline && (
        <div style={{ background: "#2a3a2a", borderBottom: "1px solid #4a6a4a", padding: "8px 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>📵</span>
          <span style={{ fontSize: 12, color: "#8aba8a" }}>Offline — showing saved itinerary. Connect to see latest updates.</span>
        </div>
      )}
      <div style={{ background: "linear-gradient(180deg,#0a0f1a 0%,transparent 100%)", borderBottom: "1px solid #ffffff10" }}>
        {/* Branding bar — full width */}
        <div style={{ background: "#1a2332", paddingTop: tour.announcement ? "12px" : "max(env(safe-area-inset-top, 64px), 64px)", paddingBottom: "12px", paddingLeft: "20px", paddingRight: "20px", display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo-app.png" alt="logo" style={{ width: 44, height: 44, objectFit: "contain", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 700, color: "#f0e6d3", lineHeight: 1.1 }}>Castle & Coastline</div>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "#c9a96e", textTransform: "uppercase", marginTop: 3 }}>Tours of the UK & Ireland</div>
          </div>
          <button onClick={() => { localStorage.removeItem("cc_guest_surname"); onLogout(); }} style={{ background: "none", border: "1px solid #ffffff15", borderRadius: 8, color: "#506070", cursor: "pointer", fontSize: 11, padding: "4px 8px", flexShrink: 0 }}>← Exit</button>
        </div>
        {/* Tour name and font slider on same row */}
        <div style={{ padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: "#f0e6d3" }}>{tour.name}</div>
            <div style={{ fontSize: 11, color: "#607080", marginTop: 2 }}>{tour.duration}-day tour</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#506070", fontWeight: 700 }}>A</span>
            <input
              type="range"
              min={1}
              max={3.5}
              step={0.05}
              value={fontScale}
              onChange={e => setFontScale(parseFloat(e.target.value))}
              style={{ width: 80, accentColor: "#c9a96e", cursor: "pointer" }}
            />
            <span style={{ fontSize: 16, color: "#c9a96e", fontWeight: 700 }}>A</span>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {activePage === "itinerary" && (
          <>
            {tour.days.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "#405060" }}><div style={{ fontSize: 40, marginBottom: 12 }}>🗓️</div><div>Your itinerary is being prepared. Check back soon!</div></div>
              : <>
                <div style={{ overflowX: "auto", padding: "12px 20px", display: "flex", gap: 8, borderBottom: "1px solid #ffffff10" }}>
                  {tour.days.map((d, i) => (<button key={i} onClick={() => setActiveDay(i)} style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 20, border: `1px solid ${activeDay === i ? "#c9a96e" : "#ffffff20"}`, background: activeDay === i ? "#c9a96e" : "transparent", color: activeDay === i ? "#1a1a2e" : "#a0b0c0", fontWeight: activeDay === i ? 700 : 400, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>Day {d.day}</button>))}
                </div>
                {activeDay === calcDayIndex() && <CountdownBanner schedule={day.schedule} />}
                <div style={{ padding: 24 }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{day.title}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#c9a96e", marginBottom: 16 }}>📍 {day.location}</div>
                  <ExcursionDayInline tour={tour} dayLocation={day.location} guestName={guestName} dayIdx={activeDay} />
                  {/* Weather for this day's location */}
                  {day.location && <WeatherWidget location={day.location.split('-')[0].split('–')[0].trim()} />}
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: "#c9a96e", marginBottom: 14 }}>Today's Schedule</div>
                  {day.schedule.map((item, i) => {
                    const isCurrentDay = activeDay === calcDayIndex();
                    const allDone = day.schedule.every(s => {
                      if (!s.time) return true;
                      const p = parseTimeMins(s.time);
                      if (!p) return true;
                      const nowM = new Date().getHours() * 60 + new Date().getMinutes();
                      const checkMins = p.isRange && p.end ? p.end : p.start;
                      return checkMins < nowM;
                    });
                    const isPast = (() => {
                      if (!isCurrentDay || allDone) return false;
                      if (!item.time) return false;
                      const parsed = parseTimeMins(item.time);
                      const nowM = new Date().getHours() * 60 + new Date().getMinutes();
                      const checkMins = parsed.isRange && parsed.end ? parsed.end : parsed.start;
                      return checkMins !== null && checkMins < nowM;
                    })();
                    const isNext = (() => {
                      if (!isCurrentDay || allDone) return false;
                      if (!item.time) return false;
                      const nowM = new Date().getHours() * 60 + new Date().getMinutes();
                      const nextIndex = day.schedule.findIndex(s => {
                        if (!s.time) return false;
                        const p = parseTimeMins(s.time);
                        if (!p) return false;
                        if (p.isRange && p.start <= nowM && p.end && p.end > nowM) return true;
                        return p.start > nowM;
                      });
                      return nextIndex === i;
                    })();
                    return (
                    <div key={i} style={{ display: "flex", gap: 16, paddingBottom: 20, opacity: isPast ? 0.4 : 1, transition: "opacity 0.3s" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#c9a96e", marginTop: 4 }} />
                        {i < day.schedule.length - 1 && <div style={{ width: 1, flex: 1, background: "#c9a96e30", marginTop: 4 }} />}
                      </div>
                      <div style={{ flex: 1, background: isNext ? "rgba(201,169,110,0.08)" : "transparent", border: isNext ? "1px solid rgba(201,169,110,0.2)" : "1px solid transparent", borderRadius: isNext ? 10 : 0, padding: isNext ? "10px 14px" : "0" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                          <span style={{ fontSize: fs(15), fontWeight: 700, color: "#c9a96e" }}>{item.time}</span>
                          <span style={{ fontSize: fs(15), color: "#f0e6d3", fontWeight: 500 }}>{item.label}</span>
                        </div>
                        {item.note && <div style={{ fontSize: fs(13), color: "#6070a0", marginTop: 2 }}>{item.note}</div>}
                      </div>
                    </div>
                  );})}
                  {day.attractions?.length > 0 && <>
                    <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: "#c9a96e", marginTop: 8, marginBottom: 14 }}>Attractions & Map</div>
                    <LeafletMap attractions={day.attractions} schedule={day.schedule} />
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
        {activePage === "info" && <UsefulInfoPage tour={tour} currentLocation={currentLocation} />}
        {activePage === "excursions" && <ExcursionsPage tour={tour} guestName={guestName} />}
        {activePage === "emergency" && <EmergencyPage />}
        {activePage === "contact" && <ContactAndEmergencyPage tour={tour} />}
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
  const updAttrMulti = (i, updates) => { const a = [...d.attractions]; a[i] = { ...a[i], ...updates }; setD({ ...d, attractions: a }); };
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
        {d.attractions.map((a, i) => (
          <div key={i} style={{ background: "#0d1520", borderRadius: 10, padding: 12, marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>{inp(a.name, (v) => updAttr(i, "name", v), "Attraction name")}</div>
              <button onClick={() => setD({ ...d, attractions: d.attractions.filter((_, j) => j !== i) })}
                style={{ background: "#ff444420", border: "none", borderRadius: 6, color: "#ff6666", cursor: "pointer", padding: "0 8px", fontSize: 16 }}>×</button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1 }}>{inp(a.desc, (v) => updAttr(i, "desc", v), "Short description")}</div>
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: "#c9a96e", marginBottom: 3 }}>Map #</div>
                <input value={a.sort_order || i + 1} onChange={e => updAttr(i, "sort_order", parseInt(e.target.value) || i + 1)} type="number" min={1} max={20}
                  style={{ width: 52, background: "#1a2332", border: "1px solid #c9a96e40", borderRadius: 8, padding: "7px 6px", color: "#c9a96e", fontSize: 13, outline: "none", textAlign: "center", fontWeight: 700 }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={a.searchQuery || ""} onChange={e => updAttr(i, "searchQuery", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); fetch("https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(e.target.value) + "&format=json&limit=1&countrycodes=gb,ie", { headers: { "Accept-Language": "en" } }).then(r => r.json()).then(data => { if (data?.[0]) { updAttrMulti(i, { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), searchDone: data[0].display_name.split(",").slice(0,2).join(",") }); } }); } }}
                placeholder="Search location e.g. Edinburgh Castle"
                style={{ flex: 1, background: "#1a2332", border: "1px solid #c9a96e40", borderRadius: 8, padding: "7px 8px", color: "#f0e6d3", fontSize: 13, outline: "none" }} />
              <button onClick={() => {
                const query = a.searchQuery || a.name;
                if (!query) return;
                fetch("https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(query) + "&format=json&limit=5", { headers: { "Accept-Language": "en" } })
                  .then(r => r.json())
                  .then(data => {
                    const best = data?.find(r => r.display_name.toLowerCase().includes("uk") || r.display_name.toLowerCase().includes("ireland") || r.display_name.toLowerCase().includes("scotland") || r.display_name.toLowerCase().includes("england") || r.display_name.toLowerCase().includes("wales")) || data?.[0];
                    if (best) { updAttrMulti(i, { lat: parseFloat(best.lat), lng: parseFloat(best.lon), searchDone: best.display_name.split(",").slice(0,2).join(",") }); }
                    else updAttrMulti(i, { searchDone: "Not found — try a different name" });
                  });
              }} style={{ background: "linear-gradient(135deg,#c9a96e,#a07840)", border: "none", borderRadius: 8, padding: "7px 14px", color: "#1a1a2e", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                🔍 Find
              </button>
            </div>
            {a.searchDone && <div style={{ fontSize: 11, color: a.searchDone.includes("Not found") ? "#ff6666" : "#6abf6a", padding: "4px 8px", background: a.searchDone.includes("Not found") ? "#ff444410" : "#6abf6a10", borderRadius: 6 }}>
              {a.searchDone.includes("Not found") ? "❌ " : "✓ "}{a.searchDone}
            </div>}
            <div style={{ display: "flex", gap: 6 }}>
              <input value={a.lat} onChange={(e) => updAttr(i, "lat", parseFloat(e.target.value) || 0)} placeholder="Latitude" type="number" step="0.0001" style={{ flex: 1, background: "#1a2332", border: "1px solid #ffffff15", borderRadius: 8, padding: "7px 8px", color: "#c9a96e", fontSize: 12, outline: "none" }} />
              <input value={a.lng} onChange={(e) => updAttr(i, "lng", parseFloat(e.target.value) || 0)} placeholder="Longitude" type="number" step="0.0001" style={{ flex: 1, background: "#1a2332", border: "1px solid #ffffff15", borderRadius: 8, padding: "7px 8px", color: "#c9a96e", fontSize: 12, outline: "none" }} />
            </div>
            <div style={{ fontSize: 11, color: "#405060" }}>💡 Type a place name and tap Find, or enter coordinates manually</div>
          </div>
        ))}
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
    onSave({ id, name, duration: parseInt(duration), description: desc, password: password.toUpperCase(), announcement: "", notes: "", guide_name: "", guide_phone: "", guide_email: "", coach_rows: 10, coach_cols: 4, start_date: "", current_day_override: null, days: [], seats: [] });
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
  const [t, setT] = useState({ notes: tour.notes || "", guide_name: tour.guide_name || "", guide_phone: tour.guide_phone || "", guide_email: tour.guide_email || "", start_date: tour.start_date || "" });
  const inp = (label, val, fn, ph, type = "text") => (<div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}><label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>{label}</label><input value={val} onChange={(e) => fn(e.target.value)} placeholder={ph} type={type} style={{ background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 14, width: "100%", outline: "none" }} /></div>);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ background: "#1a2332", borderRadius: 20, padding: 24, maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: "#f0e6d3" }}>Notes & Contact</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#607080", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: "#c9a96e", fontFamily: "'Playfair Display',serif", marginBottom: 14 }}>Tour Start Date</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase" }}>Tour Start Date</label>
          <input value={t.start_date} onChange={e => setT({ ...t, start_date: e.target.value })} type="date"
            style={{ background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 14, width: "100%", outline: "none" }} />
          <div style={{ fontSize: 11, color: "#506070" }}>The app will automatically show the correct day based on today's date</div>
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

// ── Excursion Manager (Guide) ────────────────────────────────────────────────
const ExcursionManager = ({ tour, onClose, onRefresh, showStatus }) => {
  const [showLibPicker, setShowLibPicker] = useState(false);
  const [libItems, setLibItems] = useState([]);
  const [excursions, setExcursions] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingExc, setEditingExc] = useState(null);
  const [viewingBookings, setViewingBookings] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [exc, book] = await Promise.all([loadExcursions(tour.id), loadBookings(tour.id)]);
      setExcursions(exc); setBookings(book);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSaveExcursion = async (excData, photoFile) => {
    setSaving(true);
    try {
      const saved = await saveExcursion(tour.id, excData);
      if (photoFile) {
        const imgPath = await uploadExcursionPhoto(photoFile, saved.id);
        await supabase.from("excursions").update({ image_path: imgPath }).eq("id", saved.id);
      }
      await fetchData(); setEditingExc(null); showStatus("✓ Excursion saved");
    } catch (e) { showStatus("❌ Failed to save"); }
    setSaving(false);
  };

  const [deletedExc, setDeletedExc] = useState(null);
  const [undoTimer, setUndoTimer] = useState(null);

  const handleDeleteExcursion = async (exc) => {
    if (!window.confirm(`Delete "${exc.title}"?`)) return;
    setDeletedExc(exc);
    showStatus("Deleted — tap Undo to restore");
    const timer = setTimeout(async () => {
      try { await deleteExcursion(exc.id); await fetchData(); }
      catch(e) { showStatus("❌ Failed to delete"); }
      setDeletedExc(null);
    }, 6000);
    setUndoTimer(timer);
    await fetchData();
  };

  const handleUndoDelete = () => {
    if (undoTimer) clearTimeout(undoTimer);
    setDeletedExc(null); setUndoTimer(null);
    showStatus("✓ Restored");
    fetchData();
  };

  const handleDeleteBooking = async (id) => {
    if (!window.confirm("Remove this booking?")) return;
    try { await deleteBooking(id); await fetchData(); }
    catch (e) { showStatus("❌ Failed"); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ background: "#1a2332", borderRadius: 20, padding: 24, maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: "#f0e6d3" }}>Manage Excursions</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#607080", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setEditingExc({})}
            style={{ flex: 1, padding: "11px", background: "#c9a96e15", border: "1px dashed #c9a96e50", borderRadius: 10, color: "#c9a96e", fontSize: 13, cursor: "pointer" }}>
            + New Excursion
          </button>
          <button onClick={async () => { try { setLibItems(await loadMasterExcursions()); setShowLibPicker(true); } catch(e){ showStatus("❌ Could not load library"); } }}
            style={{ flex: 1, padding: "11px", background: "#1a2332", border: "1px solid #c9a96e40", borderRadius: 10, color: "#c9a96e", fontSize: 13, cursor: "pointer" }}>
            📚 Add from Library
          </button>
        </div>
        {deletedExc && (
          <div style={{ background: "#2a3a2a", border: "1px solid #4a6a4a", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, color: "#8aba8a" }}>"{deletedExc.title}" deleted</div>
            <button onClick={handleUndoDelete} style={{ background: "#6abf6a20", border: "1px solid #6abf6a40", borderRadius: 6, padding: "4px 12px", color: "#6abf6a", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Undo</button>
          </div>
        )}

        {loading ? <div style={{ textAlign: "center", padding: 30, color: "#607080" }}>Loading…</div>
          : excursions.length === 0 ? <div style={{ textAlign: "center", padding: 30, color: "#405060" }}><div style={{ fontSize: 32, marginBottom: 8 }}>🎭</div><div>No excursions yet</div></div>
          : excursions.map(exc => {
            const excBookings = bookings.filter(b => b.excursion_id === exc.id);
            const totalPeople = excBookings.reduce((a, b) => a + (b.num_people || 1), 0);
            return (
              <div key={exc.id} style={{ background: "#0d1520", borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid #ffffff10" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#f0e6d3" }}>{exc.title}</div>
                    <div style={{ fontSize: 12, color: "#607080", marginTop: 2 }}>{exc.date}{exc.location ? ` · ${exc.location}` : ""} · £{exc.price}</div>
                    {exc.deadline && <div style={{ fontSize: 11, color: "#506070", marginTop: 2 }}>Deadline: {exc.deadline}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setEditingExc(exc)} style={{ background: "#c9a96e20", border: "1px solid #c9a96e40", borderRadius: 6, padding: "4px 10px", color: "#c9a96e", fontSize: 12, cursor: "pointer" }}>Edit</button>
                    <button onClick={() => handleDeleteExcursion(exc)} style={{ background: "#ff444415", border: "1px solid #ff444430", borderRadius: 6, padding: "4px 8px", color: "#ff6666", fontSize: 12, cursor: "pointer" }}>×</button>
                  </div>
                </div>
                <button onClick={() => setViewingBookings(exc)}
                  style={{ background: totalPeople > 0 ? "#c9a96e15" : "#ffffff08", border: `1px solid ${totalPeople > 0 ? "#c9a96e40" : "#ffffff15"}`, borderRadius: 8, padding: "6px 12px", color: totalPeople > 0 ? "#c9a96e" : "#607080", fontSize: 12, cursor: "pointer" }}>
                  {totalPeople > 0 ? `${excBookings.length} bookings · ${totalPeople} people · £${totalPeople * exc.price}` : "No bookings yet"}
                </button>
              </div>
            );
          })}

        <button onClick={onClose} style={{ width: "100%", marginTop: 8, padding: "12px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 12, color: "#8090a0", fontSize: 14, cursor: "pointer" }}>Close</button>
      </div>
      {editingExc !== null && <ExcursionEditor excursion={editingExc && Object.keys(editingExc).length ? editingExc : null} tourId={tour.id} onSave={handleSaveExcursion} onClose={() => setEditingExc(null)} saving={saving} />}
      {showLibPicker && (
        <div style={{ position: "fixed", inset: 0, background: "#000000aa", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowLibPicker(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#1a2332", borderRadius: 16, padding: 20, maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: "#f0e6d3", marginBottom: 4 }}>Add from Library</div>
            <div style={{ color: "#7080a0", fontSize: 13, marginBottom: 16 }}>Pick an excursion — you'll set the date and deadline next.</div>
            {libItems.length === 0 ? <div style={{ color: "#607080", textAlign: "center", padding: 20 }}>Your library is empty. Add excursions via the 📚 Library button on the dashboard.</div>
              : libItems.map(m => (
                <div key={m.id} onClick={() => { setShowLibPicker(false); setEditingExc({ title: m.title, subtitle: m.subtitle, description: m.description, price: m.price, location: m.location, image_path: m.image_path, date: "", deadline: "", sort_order: 0 }); }}
                  style={{ display: "flex", gap: 12, alignItems: "center", background: "#0d1520", border: "1px solid #ffffff10", borderRadius: 12, padding: 10, marginBottom: 8, cursor: "pointer" }}>
                  {m.url && <img src={m.url} alt={m.title} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#f0e6d3", fontSize: 14 }}>{m.title}</div>
                    <div style={{ color: "#7080a0", fontSize: 12 }}>£{m.price}{m.duration ? ` · ${m.duration}` : ""}{m.location ? ` · ${m.location}` : ""}</div>
                  </div>
                </div>
              ))}
            <button onClick={() => setShowLibPicker(false)} style={{ width: "100%", marginTop: 8, padding: "11px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 12, color: "#8090a0", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
      {viewingBookings && <ExcursionSummary excursion={viewingBookings} bookings={bookings} onClose={() => setViewingBookings(null)} onDeleteBooking={handleDeleteBooking} />}
    </div>
  );
};

// ── Excursion Library (Manage Content) ───────────────────────────────────────
const ExcursionLibrary = ({ onClose, showStatus }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => { setLoading(true); try { setItems(await loadMasterExcursions()); } catch(e){ console.error(e);} setLoading(false); };
  useEffect(() => { fetchItems(); }, []);

  const handleSave = async (m, file) => {
    setSaving(true);
    try {
      const saved = await saveMasterExcursion(m);
      if (file) {
        const imgPath = await uploadMasterExcursionPhoto(file, saved.id);
        await saveMasterExcursion({ ...saved, image_path: imgPath });
      }
      await fetchItems(); setEditing(null); showStatus("✓ Saved to library");
    } catch(e){ showStatus("❌ Save failed"); }
    setSaving(false);
  };
  const handleDelete = async (id) => { if(!window.confirm("Delete this from your library? (Tours already using it are unaffected.)")) return; try { await deleteMasterExcursion(id); fetchItems(); showStatus("✓ Deleted"); } catch(e){ showStatus("❌ Failed"); } };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d1520", zIndex: 2000, overflowY: "auto" }}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 700, color: "#f0e6d3" }}>Excursion Library</div>
          <button onClick={onClose} style={{ background: "#1a2332", border: "1px solid #ffffff20", borderRadius: 10, padding: "8px 16px", color: "#8090a0", cursor: "pointer" }}>Done</button>
        </div>
        <div style={{ color: "#7080a0", fontSize: 13, marginBottom: 20 }}>Build your reusable excursions once, then add them to any tour.</div>

        <button onClick={() => setEditing({ title:"", subtitle:"", description:"", price:"", duration:"", location:"", image_path:"" })}
          style={{ width:"100%", padding:"12px", background:"linear-gradient(135deg,#c9a96e,#a07840)", border:"none", borderRadius:12, color:"#1a1a2e", fontWeight:700, fontSize:14, cursor:"pointer", marginBottom:20 }}>+ Add Excursion to Library</button>

        {loading ? <div style={{ color:"#506070", textAlign:"center", padding:30 }}>Loading…</div>
          : items.length === 0 ? <div style={{ textAlign:"center", padding:"30px 20px", color:"#405060", border:"1px dashed #ffffff15", borderRadius:16 }}>No saved excursions yet — add your first above.</div>
          : <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {items.map(m => (
                <div key={m.id} style={{ background:"#1a2332", borderRadius:14, border:"1px solid #ffffff10", overflow:"hidden", display:"flex" }}>
                  {m.url && <img src={m.url} alt={m.title} style={{ width:90, height:90, objectFit:"cover", flexShrink:0 }} />}
                  <div style={{ padding:"12px 14px", flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, color:"#f0e6d3", fontSize:15 }}>{m.title}</div>
                    {m.subtitle && <div style={{ color:"#c9a96e", fontSize:12, marginBottom:2 }}>{m.subtitle}</div>}
                    <div style={{ color:"#7080a0", fontSize:12 }}>£{m.price}{m.duration ? ` · ${m.duration}` : ""}{m.location ? ` · ${m.location}` : ""}</div>
                    <div style={{ display:"flex", gap:8, marginTop:8 }}>
                      <button onClick={() => setEditing(m)} style={{ padding:"5px 12px", background:"#0d1520", border:"1px solid #ffffff20", borderRadius:8, color:"#8090a0", fontSize:12, cursor:"pointer" }}>Edit</button>
                      <button onClick={() => handleDelete(m.id)} style={{ padding:"5px 12px", background:"#ff444420", border:"1px solid #ff444440", borderRadius:8, color:"#ff6666", fontSize:12, cursor:"pointer" }}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>}
      </div>
      {editing && <MasterExcursionEditor item={editing} onSave={handleSave} onClose={() => setEditing(null)} saving={saving} />}
    </div>
  );
};

const MasterExcursionEditor = ({ item, onSave, onClose, saving }) => {
  const [m, setM] = useState({ title:"", subtitle:"", description:"", price:"", duration:"", location:"", image_path:"", ...item });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(item?.url || null);
  const fld = { width:"100%", background:"#0d1520", border:"1px solid #ffffff20", borderRadius:8, padding:"10px 12px", color:"#f0e6d3", fontSize:14, marginBottom:10, outline:"none", boxSizing:"border-box", fontFamily:"'Lato',sans-serif" };
  return (
    <div style={{ position:"fixed", inset:0, background:"#000000aa", zIndex:3000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#1a2332", borderRadius:16, padding:20, maxWidth:480, width:"100%", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:20, color:"#f0e6d3", marginBottom:16 }}>{item?.id ? "Edit Excursion" : "New Excursion"}</div>
        <input value={m.title} onChange={e=>setM({...m,title:e.target.value})} placeholder="Title" style={fld} />
        <input value={m.subtitle} onChange={e=>setM({...m,subtitle:e.target.value})} placeholder="Subtitle (optional)" style={fld} />
        <textarea value={m.description} onChange={e=>setM({...m,description:e.target.value})} placeholder="Description" style={{...fld, minHeight:90, resize:"vertical"}} />
        <input value={m.price} onChange={e=>setM({...m,price:e.target.value})} placeholder="Price (£)" type="number" style={fld} />
        <input value={m.duration} onChange={e=>setM({...m,duration:e.target.value})} placeholder="Duration (e.g. 3 hours)" style={fld} />
        <input value={m.location} onChange={e=>setM({...m,location:e.target.value})} placeholder="Location / area" style={fld} />
        <label style={{ display:"block", border:"1px dashed #ffffff20", borderRadius:10, padding:14, textAlign:"center", cursor:"pointer", marginBottom:8, color:"#c9a96e", fontSize:13 }}>
          {preview ? <img src={preview} alt="preview" style={{ width:"100%", maxHeight:160, objectFit:"cover", borderRadius:8 }} /> : "📷 Add a photo"}
          <input type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{ const f=e.target.files[0]; if(f){ setFile(f); setPreview(URL.createObjectURL(f)); } }} />
        </label>
        {preview && <button onClick={() => { setFile(null); setPreview(null); setM({...m, image_path: ""}); }} style={{ width:"100%", padding:"8px", background:"transparent", border:"1px solid #ff444440", borderRadius:8, color:"#ff6666", fontSize:12, cursor:"pointer", marginBottom:14 }}>Remove photo</button>}
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:"12px", background:"#0d1520", border:"1px solid #ffffff20", borderRadius:12, color:"#8090a0", cursor:"pointer" }}>Cancel</button>
          <button onClick={()=>{ if(!m.title.trim()){return;} onSave(m, file); }} disabled={saving} style={{ flex:2, padding:"12px", background:saving?"#806040":"linear-gradient(135deg,#c9a96e,#a07840)", border:"none", borderRadius:12, color:"#1a1a2e", fontWeight:700, cursor:saving?"default":"pointer" }}>{saving?"Saving…":"Save"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Duplicate Tour Modal ─────────────────────────────────────────────────────
const DuplicateTourModal = ({ tour, onSave, onClose, saving }) => {
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState("");
  const fld = { width: "100%", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 8, padding: "11px 13px", color: "#f0e6d3", fontSize: 14, marginBottom: 4, outline: "none", boxSizing: "border-box", fontFamily: "'Lato',sans-serif" };
  const finalName = note.trim() ? `${tour.name} — ${note.trim()}` : tour.name;
  const submit = () => {
    if (!password.trim()) { setError("Please set a login code for the new group"); return; }
    if (!startDate) { setError("Please set a start date"); return; }
    onSave({ name: finalName, password: password.trim().toUpperCase(), startDate });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#1a2332", borderRadius: 16, padding: 24, maxWidth: 440, width: "100%", maxHeight: "90vh", overflowY: "auto", border: "1px solid #c9a96e30" }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: "#f0e6d3", marginBottom: 6 }}>Duplicate Tour</div>
        <div style={{ color: "#7080a0", fontSize: 13, marginBottom: 18 }}>Creates a fresh, separate tour with the same itinerary — its own photos, bookings and announcements. Guest data isn't copied over.</div>

        <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Label for this group <span style={{ color: "#506070", textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
        <input value={note} onChange={e => { setNote(e.target.value); setError(""); }} placeholder="e.g. September group, or a date" style={fld} />
        <div style={{ fontSize: 12, color: "#607080", marginBottom: 16 }}>Will appear as: <span style={{ color: "#c9a96e" }}>{finalName}</span></div>

        <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>New login code</label>
        <input value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder="Code the new group will use to log in" style={{ ...fld, marginBottom: 16 }} />

        <label style={{ fontSize: 11, color: "#c9a96e", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Start date</label>
        <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setError(""); }} style={{ ...fld, marginBottom: 16 }} />

        {error && <div style={{ color: "#ff6666", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "#0d1520", border: "1px solid #ffffff20", borderRadius: 12, color: "#8090a0", cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{ flex: 2, padding: "12px", background: saving ? "#806040" : "linear-gradient(135deg,#c9a96e,#a07840)", border: "none", borderRadius: 12, color: "#1a1a2e", fontWeight: 700, cursor: saving ? "default" : "pointer" }}>{saving ? "Duplicating…" : "Create duplicate"}</button>
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
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSeating, setShowSeating] = useState(false);
  const [showExcursions, setShowExcursions] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
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
  const saveDay = async (updatedDay) => { setSaving(true); try { await saveDayToDB(tour.id, updatedDay); await onRefresh(); setEditingDay(null); showStatus("✓ Day saved");
    } catch (e) { showStatus("❌ Save failed"); } setSaving(false); };
  const addDay = () => { const n = tour.days.length > 0 ? Math.max(...tour.days.map((d) => d.day)) + 1 : 1; setEditingDay({ day: n, title: `Day ${n}`, location: "", schedule: [], attractions: [] }); };
  const deleteDay = async (day) => { if (!window.confirm(`Delete Day ${day.day}?`)) return; setSaving(true); try { if (day.id) await deleteDayFromDB(day.id); await onRefresh(); showStatus("✓ Day deleted"); } catch (e) { showStatus("❌ Delete failed"); } setSaving(false); };
  const addTour = async (t) => { setSaving(true); try { await saveTourToDB(t); await onRefresh(); setActiveTourId(t.id); setShowAddTour(false); showStatus("✓ Tour created"); } catch (e) { showStatus("❌ Failed"); } setSaving(false); };
  const handleDuplicate = async ({ name, password, startDate }) => { setSaving(true); try { const newId = await duplicateTour(tour, name, password, startDate); await onRefresh(); setActiveTourId(newId); setShowDuplicate(false); showStatus("✓ Tour duplicated"); } catch (e) { console.error(e); showStatus("❌ Duplicate failed"); } setSaving(false); };
  const saveSettings = async (settings) => { setSaving(true); try { await supabase.from("tours").update({ notes: settings.notes, guide_name: settings.guide_name, guide_phone: settings.guide_phone, guide_email: settings.guide_email, start_date: settings.start_date, current_day_override: null }).eq("id", tour.id); await onRefresh(); setShowSettings(false); showStatus("✓ Saved"); } catch (e) { showStatus("❌ Failed"); } setSaving(false); };
  const saveSeating = async (rows, cols, seatData) => { setSaving(true); try { await supabase.from("tours").update({ coach_rows: rows, coach_cols: cols }).eq("id", tour.id); await saveSeats(tour.id, rows, cols, seatData); await onRefresh(); setShowSeating(false); showStatus("✓ Seating plan saved"); } catch (e) { showStatus("❌ Failed to save seating"); } setSaving(false); };
  const saveAnnouncement = async () => {
    try {
      await supabase.from("tours").update({ announcement: announcementDraft }).eq("id", tour.id);
      await onRefresh();
      setAnnouncementSaved(true);
      setTimeout(() => setAnnouncementSaved(false), 2500);
      // Send push notification to guests on this tour
      if (announcementDraft.trim() && !tour.notifications_ended) {
        try {
          await sendTourNotification(tour.id, "Guide Update 📢", announcementDraft);
        } catch(e) { console.log("Notification send failed:", e); }
      }
    } catch (e) { showStatus("❌ Failed"); }
  };
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
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowLibrary(true)} style={{ background: "#c9a96e15", border: "1px solid #c9a96e40", borderRadius: 8, color: "#c9a96e", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "6px 10px" }}>📚 Library</button>
            <button onClick={onLogout} style={{ background: "none", border: "1px solid #ffffff20", borderRadius: 8, color: "#607080", fontSize: 12, cursor: "pointer", padding: "6px 10px" }}>Log out</button>
          </div>
        </div>
      </div>
      <div style={{ padding: "16px 20px 0", borderBottom: "1px solid #ffffff10" }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 16 }}>
          {tours.map((t) => (<button key={t.id} onClick={() => setActiveTourId(t.id)} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 20, border: `1px solid ${activeTourId === t.id ? "#c9a96e" : "#ffffff20"}`, background: activeTourId === t.id ? "#c9a96e15" : "transparent", color: activeTourId === t.id ? "#c9a96e" : "#7080a0", fontWeight: activeTourId === t.id ? 600 : 400, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>{t.name}</button>))}
          <button onClick={() => setShowAddTour(true)} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 20, border: "1px dashed #c9a96e50", background: "transparent", color: "#c9a96e", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>+ New Tour</button>
          {tour && <button onClick={() => setShowDuplicate(true)} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 20, border: "1px solid #c9a96e40", background: "#c9a96e15", color: "#c9a96e", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>⧉ Duplicate</button>}
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
          <button onClick={() => setShowExcursions(true)} style={{ padding: "13px", background: "#1a2332", border: "1px solid #c9a96e40", borderRadius: 12, color: "#c9a96e", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Excursions 🎭</button>
        </div>
        {/* Day override */}
        <div style={{ background: "#1a2332", borderRadius: 14, padding: "14px 18px", marginBottom: 16, border: "1px solid #ffffff10" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f0e6d3" }}>📅 Current Tour Day</div>
              <div style={{ fontSize: 11, color: "#506070", marginTop: 2 }}>
                {tour.start_date ? `Auto: Day ${Math.max(1, Math.min(tour.duration, Math.floor((new Date() - new Date(tour.start_date)) / 86400000) + 1))} based on start date` : "Set a start date in Notes & Contact to auto-detect"}
              </div>
            </div>
            {tour.current_day_override && (
              <button onClick={async () => { await supabase.from("tours").update({ current_day_override: null }).eq("id", tour.id); await onRefresh(); showStatus("✓ Override cleared"); }}
                style={{ background: "#ff444415", border: "1px solid #ff444430", borderRadius: 8, padding: "4px 10px", color: "#ff6666", fontSize: 11, cursor: "pointer" }}>
                Clear override
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "#8090a0" }}>Override to day:</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Array.from({ length: Math.min(tour.duration, 20) }, (_, i) => i + 1).map(d => (
                <button key={d} onClick={async () => { await supabase.from("tours").update({ current_day_override: d }).eq("id", tour.id); await onRefresh(); showStatus(`✓ Set to Day ${d}`); }}
                  style={{ width: 34, height: 30, background: tour.current_day_override === d ? "#c9a96e" : "#0d1520", border: `1px solid ${tour.current_day_override === d ? "#c9a96e" : "#ffffff20"}`, borderRadius: 6, color: tour.current_day_override === d ? "#1a1a2e" : "#8090a0", fontSize: 12, fontWeight: tour.current_day_override === d ? 700 : 400, cursor: "pointer" }}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button onClick={async () => {
          const ending = !tour.notifications_ended;
          if (ending && !window.confirm("End all notifications for this tour? Guests can still use the app but will stop receiving reminders and announcements.")) return;
          await supabase.from("tours").update({ notifications_ended: ending }).eq("id", tour.id);
          await onRefresh();
          showStatus(ending ? "✓ Notifications ended for this tour" : "✓ Notifications re-enabled");
        }}
          style={{ width: "100%", padding: "12px", background: tour.notifications_ended ? "#2a3a2a" : "#3a2a2a", border: `1px solid ${tour.notifications_ended ? "#4a6a4a" : "#6a4a4a"}`, borderRadius: 12, color: tour.notifications_ended ? "#8aba8a" : "#e0a0a0", fontWeight: 600, fontSize: 13, cursor: "pointer", marginBottom: 10 }}>
          {tour.notifications_ended ? "🔕 Notifications ended — tap to re-enable" : "🔔 End tour notifications"}
        </button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <button onClick={() => onViewTour(tour)} style={{ padding: "13px", background: "#1a2332", border: "1px solid #ffffff15", borderRadius: 12, color: "#8090a0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>👁 Guest View</button>
          <button onClick={() => onViewTour(tour, "photos")} style={{ padding: "13px", background: "#1a2332", border: "1px solid #c9a96e40", borderRadius: 12, color: "#c9a96e", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>📸 Photos</button>
        </div>
        <button onClick={() => { window.location.href = '/menu'; }} style={{ width: "100%", padding: "13px", background: "#1a2332", border: "1px solid #c9a96e40", borderRadius: 12, color: "#c9a96e", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span>🍽️</span><span>Menu Orders</span>
        </button>

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
      {showExcursions && <ExcursionManager tour={tour} onClose={() => setShowExcursions(false)} onRefresh={onRefresh} showStatus={showStatus} />}
      {showLibrary && <ExcursionLibrary onClose={() => setShowLibrary(false)} showStatus={showStatus} />}
      {showDuplicate && tour && <DuplicateTourModal tour={tour} onSave={handleDuplicate} onClose={() => setShowDuplicate(false)} saving={saving} />}
    </div>
  );
};

// ── Root ──────────────────────────────────────────────────────────────────────
// ── OneSignal Notification Helper ────────────────────────────────────────────
const SUPABASE_FN_URL = "https://pukdpnkgsyewvbswoqyo.supabase.co/functions/v1/send-notification";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1a2Rwbmtnc3lld3Zic3dvcXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTkwNDQsImV4cCI6MjA5MjMzNTA0NH0.UskWETDFraGynpZ2oT039DYpxGu8EJrgUgFN0AQ3Q8o";

const sendTourNotification = async (tourId, title, message, sendAt = null) => {
  try {
    const res = await fetch(SUPABASE_FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ tourId, title, message, sendAt })
    });
    const data = await res.json();
    if (data.errors) throw new Error(JSON.stringify(data.errors));
    return data;
  } catch(e) {
    console.error("Notification send error:", e);
    throw e;
  }
};

export default function App() {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("login");
  const [guestTourId, setGuestTourId] = useState(null);
  const [guestStartPage, setGuestStartPage] = useState("itinerary");
  const [guestName, setGuestName] = useState(() => localStorage.getItem("cc_guest_surname") || "");
  const [isGuide, setIsGuide] = useState(false);

  const [isOffline, setIsOffline] = useState(false);

  const fetchTours = async () => {
    try {
      const data = await loadAllTours();
      setTours(data);
      setIsOffline(false);
      // Save to device for offline use
      localStorage.setItem('cc_tours_cache', JSON.stringify(data));
      localStorage.setItem('cc_tours_cache_time', new Date().toISOString());
    } catch (e) {
      console.error("Failed to load tours:", e);
      // Try loading from device cache
      const cached = localStorage.getItem('cc_tours_cache');
      if (cached) {
        setTours(JSON.parse(cached));
        setIsOffline(true);
      }
    }
    setLoading(false);
  };

  // Listen for online/offline events
  useEffect(() => {
    const goOnline = () => { setIsOffline(false); fetchTours(); };
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

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
    // Poll for fresh tour data (announcements, schedule) every 30s while app is open
    const tourPoll = setInterval(() => { fetchTours(); }, 30000);
    // Refresh immediately when app returns to foreground
    const onVisible = () => { if (document.visibilityState === 'visible') fetchTours(); };
    document.addEventListener('visibilitychange', onVisible);
    window._ccCleanup = () => { clearInterval(tourPoll); document.removeEventListener('visibilitychange', onVisible); };
    // Prevent zoom on input focus
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) viewportMeta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

    // Initialise OneSignal if running as native app
    setTimeout(async () => {
      try {
        const _osMod = await import('@onesignal/capacitor-plugin'); const OneSignal = _osMod.OneSignal || _osMod.default;
        OneSignal.initialize("7c02d0d0-5dff-4f7b-b1fe-79382b8235ef");
        await OneSignal.Notifications.requestPermission(true);
        console.log('OneSignal initialised');
        // Store init function globally so we can tag after login
        window._oneSignalReady = true;
      } catch(e) {
        console.log('OneSignal not available:', e);
      }
    }, 1000);

    // Register service worker for offline support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(() => console.log('Service worker registered'))
        .catch((e) => console.log('SW registration failed:', e));
    }
    return () => { if (window._ccCleanup) window._ccCleanup(); };
  }, []);

  const liveTour = guestTourId ? tours.find((t) => t.id === guestTourId) : null;
  const handleViewTour = (tour, page = "itinerary") => { setGuestTourId(tour.id); setGuestStartPage(page); setIsGuide(true); setView("guest"); };

  const tagGuestDevice = async (tourId, attempt = 0) => {
    try {
      const _osMod = await import('@onesignal/capacitor-plugin'); const OneSignal = _osMod.OneSignal || _osMod.default;
      await OneSignal.User.addTag("tour_id", tourId);
      console.log("Tagged device with tour_id:", tourId);
    } catch(e) {
      // OneSignal may not be ready yet — retry up to 5 times over ~10s
      if (attempt < 5) { setTimeout(() => tagGuestDevice(tourId, attempt + 1), 2000); return; }
      console.log("Could not tag device:", e);
    }
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0d1520", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Lato',sans-serif", color: "#f0e6d3" }}>
      <img src="/logo-app.png" alt="Castle & Coastline Tours" style={{ width: 120, height: 120, objectFit: "contain", marginBottom: 8 }} />
      <div style={{ color: "#405060", fontSize: 13, marginTop: 12 }}>Loading your tours…</div>
    </div>
  );

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; height: -webkit-fill-available; overflow-x: hidden; background: #0d1520; }
        #root { height: 100dvh; height: -webkit-fill-available; background: #0d1520; }
        .app-header { padding-top: max(env(safe-area-inset-top, 44px), 44px) !important; }
        @media (orientation: landscape) { .guest-nav { padding: 4px 2px !important; } }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0d1520; }
        ::-webkit-scrollbar-thumb { background: #c9a96e40; border-radius: 2px; }
        .leaflet-container { font-family: 'Lato', sans-serif !important; }
        .leaflet-popup-content-wrapper { background: #1a2332 !important; color: #f0e6d3 !important; border: 1px solid #c9a96e30 !important; border-radius: 10px !important; }
        .leaflet-popup-tip { background: #1a2332 !important; }
        textarea, input { font-family: 'Lato', sans-serif; }
        .large-text { font-size: 118% !important; }
        .large-text .sched-time { font-size: 17px !important; }
        .large-text .sched-label { font-size: 17px !important; }
        @media (orientation: landscape) {
          .guest-nav { padding: 6px 2px 4px !important; }
          .guest-nav span:first-child { font-size: 14px !important; }
        }
      `}</style>
      <div style={{ width: "100%", maxWidth: "100vw", overflowX: "hidden" }}>
        {view === "login" && (
          <>
            {isOffline && (
              <div style={{ background: "#2a3a2a", padding: "10px 20px", textAlign: "center", fontSize: 12, color: "#8aba8a" }}>
                📵 You're offline — using saved tour data
              </div>
            )}
            <GuestLogin tours={tours} onUnlock={(tour, surname) => { setGuestTourId(tour.id); setGuestStartPage("itinerary"); setGuestName(surname); setIsGuide(false); setView("guest"); tagGuestDevice(tour.id); }} onGuideLogin={() => { setIsGuide(true); setView("guide"); }} />
          </>
        )}
        {view === "guide" && isGuide && <GuideDashboard tours={tours} onLogout={() => { setIsGuide(false); setView("login"); }} onRefresh={fetchTours} onViewTour={handleViewTour} />}
        {view === "guest" && liveTour && <GuestView tour={liveTour} onLogout={() => { localStorage.removeItem("cc_guest_surname"); setView("login"); }} isGuide={isGuide} startPage={guestStartPage} isOffline={isOffline} guestName={guestName} />}
      </div>
    </>
  );
}
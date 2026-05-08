/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://pukdpnkgsyewvbswoqyo.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1a2Rwbmtnc3lld3Zic3dvcXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTkwNDQsImV4cCI6MjA5MjMzNTA0NH0.UskWETDFraGynpZ2oT039DYpxGu8EJrgUgFN0AQ3Q8o"
);

const ADMIN_PIN = "140669";
const GOLD = "#c9a96e";
const DARK = "#0d1520";
const MID = "#1a2332";
const TEXT = "#f0e6d3";
const SUB = "#607080";

const StatCard = ({ label, value, sub, color }) => (
  <div style={{ background: MID, borderRadius: 14, padding: "16px 20px", border: `1px solid ${color || GOLD}30`, flex: 1, minWidth: 140 }}>
    <div style={{ fontSize: 11, color: SUB, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 700, color: color || GOLD, fontFamily: "'Playfair Display',serif" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>{sub}</div>}
  </div>
);

export default function StatsPage() {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [selectedTour, setSelectedTour] = useState(null);

  const tryUnlock = () => {
    if (pin === ADMIN_PIN) { setUnlocked(true); }
    else { setError("Incorrect PIN"); setShake(true); setTimeout(() => setShake(false), 500); setPin(""); }
  };

  const loadStats = async () => {
    setLoading(true);
    try {
      const [
        { data: tours },
        { data: bookings },
        { data: photos },
        { data: excursions },
        { data: seats },
        { data: days },
      ] = await Promise.all([
        supabase.from("tours").select("*"),
        supabase.from("excursion_bookings").select("*, excursions(title, price)"),
        supabase.from("photos").select("*"),
        supabase.from("excursions").select("*"),
        supabase.from("seats").select("*"),
        supabase.from("days").select("*"),
      ]);

      setData({ tours, bookings, photos, excursions, seats, days });
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { if (unlocked) loadStats(); }, [unlocked]);

  if (!unlocked) return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,${DARK},${MID})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "'Lato',sans-serif" }}>
      <img src="/logo-app.png" alt="Castle & Coastline" style={{ width: 100, height: 100, objectFit: "contain", marginBottom: 16 }} />
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: TEXT, marginBottom: 6 }}>Admin Stats</div>
      <div style={{ fontSize: 13, color: SUB, marginBottom: 32 }}>Castle & Coastline — restricted access</div>
      <div style={{ width: "100%", maxWidth: 280, transform: shake ? "translateX(-6px)" : "none", transition: "transform 0.1s" }}>
        <input value={pin} onChange={e => { setPin(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && tryUnlock()}
          placeholder="••••••" maxLength={6} type="password"
          style={{ width: "100%", textAlign: "center", fontSize: 28, letterSpacing: 8, padding: "14px", borderRadius: 12, border: `2px solid ${error ? "#ff4444" : "#c9a96e40"}`, background: MID, color: TEXT, outline: "none", marginBottom: 10, fontFamily: "monospace" }} />
        {error && <div style={{ color: "#ff6666", fontSize: 13, textAlign: "center", marginBottom: 10 }}>{error}</div>}
        <button onClick={tryUnlock} style={{ width: "100%", padding: "13px", background: `linear-gradient(135deg,${GOLD},#a07840)`, borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
          Access →
        </button>
      </div>
    </div>
  );

  if (loading || !data) return (
    <div style={{ minHeight: "100vh", background: DARK, display: "flex", alignItems: "center", justifyContent: "center", color: SUB, fontFamily: "'Lato',sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <img src="/logo-app.png" alt="" style={{ width: 80, height: 80, objectFit: "contain", marginBottom: 12 }} />
        <div>Loading stats…</div>
      </div>
    </div>
  );

  const { tours, bookings, photos, excursions, seats, days } = data;

  // Global stats
  const totalRevenue = bookings?.reduce((sum, b) => sum + (b.num_people * (b.excursions?.price || 0)), 0) || 0;
  const totalBookings = bookings?.length || 0;
  const totalPhotos = photos?.length || 0;

  // Per excursion stats
  const excursionStats = excursions?.map(exc => {
    const excBookings = bookings?.filter(b => b.excursion_id === exc.id) || [];
    const people = excBookings.reduce((s, b) => s + (b.num_people || 1), 0);
    const revenue = people * exc.price;
    return { ...exc, bookingCount: excBookings.length, people, revenue };
  }).sort((a, b) => b.revenue - a.revenue) || [];

  // Selected tour stats
  const tourStats = selectedTour ? {
    bookings: bookings?.filter(b => b.tour_id === selectedTour.id) || [],
    photos: photos?.filter(p => p.tour_id === selectedTour.id) || [],
    excursions: excursions?.filter(e => e.tour_id === selectedTour.id) || [],
    seats: seats?.filter(s => s.tour_id === selectedTour.id && s.guest_name) || [],
    days: days?.filter(d => d.tour_id === selectedTour.id) || [],
  } : null;

  const tourRevenue = tourStats ? bookings?.filter(b => {
    const exc = excursions?.find(e => e.id === b.excursion_id);
    return exc?.tour_id === selectedTour.id;
  }).reduce((sum, b) => sum + (b.num_people * (b.excursions?.price || 0)), 0) : 0;

  return (
    <div style={{ minHeight: "100vh", background: DARK, fontFamily: "'Lato',sans-serif", color: TEXT }}>
      {/* Header */}
      <div style={{ background: MID, padding: "20px 24px", borderBottom: "1px solid #c9a96e30", display: "flex", alignItems: "center", gap: 14 }}>
        <img src="/logo-app.png" alt="logo" style={{ width: 44, height: 44, objectFit: "contain" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: GOLD, textTransform: "uppercase" }}>Castle & Coastline</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700 }}>Admin Stats</div>
        </div>
        <button onClick={() => { setUnlocked(false); setPin(""); setSelectedTour(null); }}
          style={{ background: "none", border: "1px solid #ffffff20", borderRadius: 8, color: SUB, fontSize: 12, cursor: "pointer", padding: "6px 10px" }}>
          Lock
        </button>
        <button onClick={loadStats} style={{ background: "#c9a96e15", border: "1px solid #c9a96e40", borderRadius: 8, color: GOLD, fontSize: 12, cursor: "pointer", padding: "6px 10px" }}>
          🔄 Refresh
        </button>
      </div>

      <div style={{ padding: "20px 20px 40px", maxWidth: 600, margin: "0 auto" }}>

        {!selectedTour ? (
          <>
            {/* Global overview */}
            <div style={{ fontSize: 12, color: GOLD, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 14 }}>Platform Overview</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
              <StatCard label="Total Tours" value={tours?.length || 0} />
              <StatCard label="Total Revenue" value={`£${totalRevenue.toLocaleString()}`} color="#6abf6a" />
              <StatCard label="Bookings" value={totalBookings} />
              <StatCard label="Photos" value={totalPhotos} />
            </div>

            {/* Top excursions */}
            {excursionStats.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: GOLD, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Top Excursions by Revenue</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                  {excursionStats.slice(0, 5).map((exc, i) => (
                    <div key={exc.id} style={{ background: MID, borderRadius: 12, padding: "12px 16px", border: "1px solid #ffffff10", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#c9a96e20", border: "1px solid #c9a96e40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: GOLD, flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{exc.title}</div>
                        <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>{exc.bookingCount} bookings · {exc.people} people</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#6abf6a" }}>£{exc.revenue}</div>
                        <div style={{ fontSize: 10, color: SUB }}>£{exc.price}pp</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Recent bookings */}
            {bookings?.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: GOLD, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Recent Bookings</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                  {[...bookings].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8).map(b => (
                    <div key={b.id} style={{ background: MID, borderRadius: 10, padding: "10px 14px", border: "1px solid #ffffff10", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{b.guest_names}</div>
                        <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>{b.excursions?.title || "Unknown"} · {b.num_people} {b.num_people === 1 ? "person" : "people"}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#6abf6a" }}>£{b.num_people * (b.excursions?.price || 0)}</div>
                        <div style={{ fontSize: 10, color: SUB }}>{new Date(b.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Tours list */}
            <div style={{ fontSize: 12, color: GOLD, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>All Tours</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tours?.map(tour => {
                const tourBookings = bookings?.filter(b => {
                  const exc = excursions?.find(e => e.id === b.excursion_id);
                  return exc?.tour_id === tour.id;
                }) || [];
                const tourPhotos = photos?.filter(p => p.tour_id === tour.id) || [];
                const tourSeats = seats?.filter(s => s.tour_id === tour.id && s.guest_name) || [];
                const rev = tourBookings.reduce((sum, b) => sum + (b.num_people * (b.excursions?.price || 0)), 0);
                return (
                  <div key={tour.id} onClick={() => setSelectedTour(tour)}
                    style={{ background: MID, borderRadius: 14, padding: "14px 16px", border: "1px solid #ffffff10", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: TEXT }}>{tour.name}</div>
                      <div style={{ fontSize: 12, color: SUB, marginTop: 3 }}>{tour.duration}-day · {tourSeats.length} guests · {tourPhotos.length} photos · {tourBookings.length} bookings</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#6abf6a" }}>£{rev}</div>
                      <div style={{ fontSize: 11, color: GOLD }}>View →</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {/* Tour detail */}
            <button onClick={() => setSelectedTour(null)} style={{ background: "none", border: "none", color: SUB, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 16 }}>← Back to overview</button>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{selectedTour.name}</div>
            <div style={{ fontSize: 13, color: SUB, marginBottom: 20 }}>{selectedTour.duration}-day tour · Code: {selectedTour.password}</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
              <StatCard label="Guests" value={tourStats.seats.length} />
              <StatCard label="Revenue" value={`£${tourRevenue}`} color="#6abf6a" />
              <StatCard label="Bookings" value={tourStats.bookings.length} />
              <StatCard label="Photos" value={tourStats.photos.length} />
            </div>

            {/* Tour excursions */}
            {tourStats.excursions.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: GOLD, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Excursions</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                  {tourStats.excursions.map(exc => {
                    const excBookings = bookings?.filter(b => b.excursion_id === exc.id) || [];
                    const people = excBookings.reduce((s, b) => s + (b.num_people || 1), 0);
                    return (
                      <div key={exc.id} style={{ background: MID, borderRadius: 12, padding: "12px 16px", border: "1px solid #ffffff10", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{exc.title}</div>
                          <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>{excBookings.length} bookings · {people} people · £{exc.price}pp</div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#6abf6a" }}>£{people * exc.price}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Guest names */}
            {tourStats.seats.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: GOLD, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Guests on Coach</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                  {tourStats.seats.map((s, i) => (
                    <div key={i} style={{ background: MID, borderRadius: 20, padding: "5px 14px", border: "1px solid #ffffff15", fontSize: 13, color: TEXT }}>
                      {s.guest_name} <span style={{ color: SUB, fontSize: 11 }}>seat {s.seat_number || (s.row * 4 + s.col + 1)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Recent bookings for this tour */}
            {tourStats.bookings.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: GOLD, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Bookings</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {tourStats.bookings.map(b => (
                    <div key={b.id} style={{ background: MID, borderRadius: 10, padding: "10px 14px", border: "1px solid #ffffff10", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{b.guest_names}</div>
                        <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>{b.excursions?.title} · {b.num_people} {b.num_people === 1 ? "person" : "people"} · {b.payment_method}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#6abf6a" }}>£{b.num_people * (b.excursions?.price || 0)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

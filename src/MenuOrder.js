import { inject } from '@vercel/analytics';
inject();
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://pukdpnkgsyewvbswoqyo.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1a2Rwbmtnc3lld3Zic3dvcXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTkwNDQsImV4cCI6MjA5MjMzNTA0NH0.UskWETDFraGynpZ2oT039DYpxGu8EJrgUgFN0AQ3Q8o"
);

const GUIDE_PIN = "GUIDE2024";

// ── Shared styles ─────────────────────────────────────────────────────────────
const GOLD = "#c9a96e";
const DARK = "#0d1520";
const MID = "#1a2332";
const TEXT = "#f0e6d3";
const SUB = "#607080";

// ── DB helpers ────────────────────────────────────────────────────────────────
async function loadMenus() {
  const { data: menus, error } = await supabase.from("menus").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const { data: courses } = await supabase.from("menu_courses").select("*").order("sort_order");
  const { data: options } = await supabase.from("menu_options").select("*").order("sort_order");
  return (menus || []).map((m) => ({
    ...m,
    courses: (courses || []).filter((c) => c.menu_id === m.id).map((c) => ({
      ...c,
      options: (options || []).filter((o) => o.course_id === c.id),
    })),
  }));
}

async function saveMenu(menu) {
  const { data: m, error } = await supabase.from("menus").upsert({ id: menu.id || undefined, name: menu.name, restaurant: menu.restaurant, meal_type: menu.meal_type, date: menu.date, active: menu.active || false }).select().single();
  if (error) throw error;
  return m;
}

async function saveCourse(menuId, course) {
  const { data: c, error } = await supabase.from("menu_courses").upsert({ id: course.id || undefined, menu_id: menuId, name: course.name, sort_order: course.sort_order }).select().single();
  if (error) throw error;
  await supabase.from("menu_options").delete().eq("course_id", c.id);
  if (course.options.length > 0) {
    await supabase.from("menu_options").insert(course.options.map((o, i) => ({ course_id: c.id, name: o.name, description: o.description || "", allergens: o.allergens || "", sort_order: i })));
  }
  return c;
}

async function deleteMenu(menuId) {
  await supabase.from("menus").delete().eq("id", menuId);
}

async function loadOrders(menuId) {
  const { data, error } = await supabase.from("menu_orders").select("*").eq("menu_id", menuId).order("created_at");
  if (error) throw error;
  return data || [];
}

async function submitOrder(menuId, guestName, selections) {
  const { error } = await supabase.from("menu_orders").insert({ menu_id: menuId, guest_name: guestName, selections: JSON.stringify(selections), created_at: new Date().toISOString() });
  if (error) throw error;
}

async function deleteAllOrders(menuId) {
  await supabase.from("menu_orders").delete().eq("menu_id", menuId);
}

// ── PIN Entry ─────────────────────────────────────────────────────────────────
const PinEntry = ({ onUnlock }) => {
  const [pin, setPin] = useState(""); const [error, setError] = useState(""); const [shake, setShake] = useState(false);
  const tryUnlock = () => {
    if (pin.trim().toUpperCase() === GUIDE_PIN) { onUnlock(); }
    else { setError("Incorrect PIN"); setShake(true); setTimeout(() => setShake(false), 500); setPin(""); }
  };
  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,${DARK} 0%,${MID} 60%,${DARK} 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "'Lato',sans-serif" }}>
      <img src="/logo-app.png" alt="Castle & Coastline" style={{ width: 140, height: 140, objectFit: "contain", marginBottom: 12 }} />
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: TEXT, marginBottom: 4, textAlign: "center" }}>Menu Orders</div>
      <div style={{ fontSize: 13, color: SUB, marginBottom: 40, textAlign: "center" }}>Guide access only</div>
      <div style={{ width: "100%", maxWidth: 300 }}>
        <input value={pin} onChange={(e) => { setPin(e.target.value.toUpperCase()); setError(""); }} onKeyDown={(e) => e.key === "Enter" && tryUnlock()} placeholder="GUIDE PIN" maxLength={12}
          style={{ width: "100%", textAlign: "center", fontSize: 22, fontWeight: 700, letterSpacing: 5, padding: "14px 12px", borderRadius: 12, border: `2px solid ${error ? "#ff4444" : "#c9a96e40"}`, background: MID, color: TEXT, outline: "none", fontFamily: "monospace", marginBottom: 12, transform: shake ? "translateX(-6px)" : "none", transition: "transform 0.1s" }} />
        {error && <div style={{ color: "#ff6666", fontSize: 13, textAlign: "center", marginBottom: 10 }}>{error}</div>}
        <button onClick={tryUnlock} style={{ width: "100%", padding: "13px", background: `linear-gradient(135deg,${GOLD},#a07840)`, borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Access →</button>
      </div>
    </div>
  );
};

// ── Guest Ordering Screen ─────────────────────────────────────────────────────
const GuestOrderScreen = ({ menu, onOrderSubmitted, locked }) => {
  const [step, setStep] = useState("name"); // name | ordering | confirm | done
  const [guestName, setGuestName] = useState("");
  const [selections, setSelections] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setStep("name"); setGuestName(""); setSelections({}); setError(""); };

  const handleNameNext = () => {
    if (!guestName.trim()) { setError("Please enter your name"); return; }
    setError("");
    setStep("ordering");
  };

  const handleSelect = (courseId, optionName) => {
    setSelections((prev) => ({ ...prev, [courseId]: optionName }));
  };

  const allSelected = menu.courses.every((c) => selections[c.id]);

  const handleSubmit = async () => {
    if (!allSelected) { setError("Please make a selection for every course"); return; }
    setSubmitting(true);
    try {
      await submitOrder(menu.id, guestName.trim(), selections);
      setStep("done");
      onOrderSubmitted();
    } catch (e) { setError("Failed to submit — please try again"); }
    setSubmitting(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,${DARK} 0%,${MID} 60%,${DARK} 100%)`, fontFamily: "'Lato',sans-serif", color: TEXT, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: MID, padding: "20px 24px 16px", borderBottom: `1px solid #ffffff10` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo-app.png" alt="logo" style={{ width: 36, height: 36, objectFit: "contain" }} />
          <div>
            <div style={{ fontSize: 10, letterSpacing: 3, color: GOLD, textTransform: "uppercase" }}>Castle & Coastline</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700 }}>{menu.restaurant}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <span style={{ background: "#c9a96e20", border: `1px solid #c9a96e40`, borderRadius: 20, padding: "3px 10px", fontSize: 11, color: GOLD }}>{menu.meal_type}</span>
          {menu.date && <span style={{ background: "#ffffff08", border: "1px solid #ffffff15", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: SUB }}>{menu.date}</span>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>

        {/* Step: Name */}
        {step === "name" && (
          <div style={{ maxWidth: 400, margin: "0 auto" }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Welcome!</div>
            <div style={{ color: SUB, fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>Please enter your name then make your menu selections. Pass the iPad to the next guest when you're done.</div>
            <label style={{ fontSize: 11, color: GOLD, letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Your Name</label>
            <input value={guestName} onChange={(e) => { setGuestName(e.target.value); setError(""); }} onKeyDown={(e) => e.key === "Enter" && handleNameNext()} placeholder="e.g. Sarah" autoFocus
              style={{ width: "100%", background: MID, border: `2px solid ${error ? "#ff4444" : "#c9a96e40"}`, borderRadius: 12, padding: "14px 16px", color: TEXT, fontSize: 18, outline: "none", marginBottom: 12 }} />
            {error && <div style={{ color: "#ff6666", fontSize: 13, marginBottom: 10 }}>{error}</div>}
            <button onClick={handleNameNext} style={{ width: "100%", padding: "14px", background: `linear-gradient(135deg,${GOLD},#a07840)`, borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
              View Menu →
            </button>
          </div>
        )}

        {/* Step: Ordering */}
        {step === "ordering" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Hello, {guestName}!</div>
            <div style={{ color: SUB, fontSize: 13, marginBottom: 24 }}>Please select one option for each course</div>

            {menu.courses.map((course) => (
              <div key={course.id} style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, flexShrink: 0 }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: 1 }}>{course.name}</div>
                  {selections[course.id] && <div style={{ marginLeft: "auto", fontSize: 11, color: "#6abf6a" }}>✓ Selected</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {course.options.map((option) => {
                    const selected = selections[course.id] === option.name;
                    return (
                      <div key={option.id} onClick={() => handleSelect(course.id, option.name)}
                        style={{ background: selected ? "#c9a96e20" : MID, border: `2px solid ${selected ? GOLD : "#ffffff10"}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${selected ? GOLD : "#304050"}`, background: selected ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                          {selected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1a1a2e" }} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15, color: selected ? TEXT : "#c0d0e0" }}>{option.name}</div>
                          {option.description && <div style={{ fontSize: 12, color: SUB, marginTop: 3, lineHeight: 1.5 }}>{option.description}</div>}
                          {option.allergens && <div style={{ fontSize: 11, color: "#c9a96e80", marginTop: 4, fontStyle: "italic" }}>⚠️ {option.allergens}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {error && <div style={{ color: "#ff6666", fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</div>}

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => { setStep("name"); setSelections({}); }} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 12, color: SUB, fontSize: 14, cursor: "pointer" }}>← Back</button>
              <button onClick={() => { if (!allSelected) { setError("Please select an option for every course"); return; } setError(""); setStep("confirm"); }}
                style={{ flex: 2, padding: "12px", background: allSelected ? `linear-gradient(135deg,${GOLD},#a07840)` : "#1a2332", border: allSelected ? "none" : "1px solid #ffffff15", borderRadius: 12, color: allSelected ? "#1a1a2e" : SUB, fontWeight: 700, fontSize: 15, cursor: allSelected ? "pointer" : "default" }}>
                Review Order →
              </button>
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && (
          <div style={{ maxWidth: 420, margin: "0 auto" }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Confirm Your Order</div>
            <div style={{ color: SUB, fontSize: 13, marginBottom: 24 }}>Please check your selections before confirming</div>

            <div style={{ background: MID, borderRadius: 16, padding: 20, border: "1px solid #c9a96e20", marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: GOLD, fontWeight: 600, marginBottom: 14 }}>Order for {guestName}</div>
              {menu.courses.map((course) => (
                <div key={course.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid #ffffff08" }}>
                  <div style={{ fontSize: 12, color: SUB, textTransform: "uppercase", letterSpacing: 1, flex: 1 }}>{course.name}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, flex: 2, textAlign: "right" }}>{selections[course.id]}</div>
                </div>
              ))}
            </div>

            {error && <div style={{ color: "#ff6666", fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep("ordering")} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 12, color: SUB, fontSize: 14, cursor: "pointer" }}>← Edit</button>
              <button onClick={handleSubmit} disabled={submitting}
                style={{ flex: 2, padding: "12px", background: submitting ? "#806040" : `linear-gradient(135deg,${GOLD},#a07840)`, borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 15, cursor: submitting ? "default" : "pointer" }}>
                {submitting ? "Submitting…" : "Confirm Order ✓"}
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div style={{ maxWidth: 380, margin: "60px auto 0", textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Order Placed!</div>
            <div style={{ color: SUB, fontSize: 14, marginBottom: 40, lineHeight: 1.6 }}>Thank you {guestName}! Your order has been recorded. Please pass the iPad to the next guest.</div>
            <button onClick={reset} style={{ width: "100%", padding: "16px", background: `linear-gradient(135deg,${GOLD},#a07840)`, borderRadius: 14, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
              Next Guest →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Order Summary ─────────────────────────────────────────────────────────────
const OrderSummary = ({ menu, orders, onBack, onClearOrders }) => {
  const [copied, setCopied] = useState(false);

  // Group orders by course option
  const grouped = {};
  menu.courses.forEach((course) => {
    grouped[course.name] = {};
    course.options.forEach((opt) => { grouped[course.name][opt.name] = []; });
    orders.forEach((order) => {
      const sels = JSON.parse(order.selections || "{}");
      const choice = sels[course.id];
      if (choice) {
        if (!grouped[course.name][choice]) grouped[course.name][choice] = [];
        grouped[course.name][choice].push(order.guest_name);
      }
    });
  });

  const buildTextSummary = () => {
    let text = `📋 ORDER SUMMARY\n${menu.restaurant} — ${menu.meal_type}${menu.date ? " — " + menu.date : ""}\n${orders.length} guest${orders.length !== 1 ? "s" : ""}\n\n`;
    menu.courses.forEach((course) => {
      text += `── ${course.name.toUpperCase()} ──\n`;
      course.options.forEach((opt) => {
        const guests = grouped[course.name][opt.name] || [];
        if (guests.length > 0) text += `${opt.name} (×${guests.length}): ${guests.join(", ")}\n`;
      });
      text += "\n";
    });
    text += "── INDIVIDUAL ORDERS ──\n";
    orders.forEach((o) => {
      const sels = JSON.parse(o.selections || "{}");
      text += `${o.guest_name}: `;
      text += menu.courses.map((c) => sels[c.id] || "—").join(" | ");
      text += "\n";
    });
    return text;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(buildTextSummary());
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div style={{ minHeight: "100vh", background: DARK, fontFamily: "'Lato',sans-serif", color: TEXT }}>
      <div style={{ background: MID, padding: "20px 24px", borderBottom: "1px solid #c9a96e30", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: SUB, fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: GOLD, letterSpacing: 2, textTransform: "uppercase" }}>Order Summary</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700 }}>{menu.restaurant}</div>
        </div>
        <div style={{ background: "#c9a96e20", border: "1px solid #c9a96e40", borderRadius: 20, padding: "4px 12px", fontSize: 13, color: GOLD, fontWeight: 700 }}>{orders.length} orders</div>
      </div>

      <div style={{ padding: 24 }}>
        {orders.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#405060" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div>No orders yet — pass the iPad to your guests!</div>
          </div>
        ) : (
          <>
            {/* By course summary */}
            {menu.courses.map((course) => (
              <div key={course.id} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: GOLD, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10, fontWeight: 700 }}>{course.name}</div>
                {course.options.map((opt) => {
                  const guests = grouped[course.name]?.[opt.name] || [];
                  if (guests.length === 0) return null;
                  return (
                    <div key={opt.id} style={{ background: MID, borderRadius: 12, padding: "12px 16px", marginBottom: 8, border: "1px solid #ffffff10", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{opt.name}</div>
                        {opt.allergens && <div style={{ fontSize: 11, color: "#c9a96e80", fontStyle: "italic", marginBottom: 3 }}>⚠️ {opt.allergens}</div>}
                        <div style={{ fontSize: 12, color: SUB }}>{guests.join(", ")}</div>
                      </div>
                      <div style={{ background: "#c9a96e20", border: "1px solid #c9a96e40", borderRadius: 20, padding: "3px 10px", fontSize: 13, color: GOLD, fontWeight: 700, flexShrink: 0, marginLeft: 10 }}>×{guests.length}</div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Individual orders */}
            <div style={{ fontSize: 11, color: GOLD, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10, fontWeight: 700, marginTop: 8 }}>Individual Orders</div>
            {orders.map((order) => {
              const sels = JSON.parse(order.selections || "{}");
              return (
                <div key={order.id} style={{ background: MID, borderRadius: 12, padding: "12px 16px", marginBottom: 8, border: "1px solid #ffffff10" }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: GOLD, marginBottom: 6 }}>{order.guest_name}</div>
                  {menu.courses.map((c) => (
                    <div key={c.id} style={{ display: "flex", gap: 10, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, color: SUB, textTransform: "uppercase", letterSpacing: 1, minWidth: 70 }}>{c.name}</span>
                      <span style={{ fontSize: 13, color: TEXT }}>{sels[c.id] || "—"}</span>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
              <button onClick={copyToClipboard} style={{ width: "100%", padding: "14px", background: copied ? "#2a4a2a" : `linear-gradient(135deg,${GOLD},#a07840)`, borderRadius: 12, border: "none", color: copied ? "#6abf6a" : "#1a1a2e", fontWeight: 700, fontSize: 15, cursor: "pointer", transition: "all 0.3s" }}>
                {copied ? "✓ Copied to clipboard!" : "📋 Copy Summary to Send"}
              </button>
              <button onClick={() => { if (window.confirm("Clear all orders for this menu? This cannot be undone.")) onClearOrders(); }}
                style={{ width: "100%", padding: "12px", background: "#ff444415", border: "1px solid #ff444430", borderRadius: 12, color: "#ff6666", fontSize: 14, cursor: "pointer" }}>
                Clear All Orders
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Menu Editor ───────────────────────────────────────────────────────────────
const MenuEditor = ({ menu, onSave, onClose, saving }) => {
  const [name, setName] = useState(menu?.name || "");
  const [restaurant, setRestaurant] = useState(menu?.restaurant || "");
  const [mealType, setMealType] = useState(menu?.meal_type || "Dinner");
  const [date, setDate] = useState(menu?.date || "");
  const [courses, setCourses] = useState(menu?.courses || []);

  const addCourse = () => setCourses([...courses, { id: null, name: "", sort_order: courses.length, options: [] }]);
  const updateCourse = (i, field, val) => { const c = [...courses]; c[i] = { ...c[i], [field]: val }; setCourses(c); };
  const removeCourse = (i) => setCourses(courses.filter((_, j) => j !== i));
  const addOption = (i) => { const c = [...courses]; c[i].options = [...c[i].options, { name: "", description: "" }]; setCourses(c); };
  const updateOption = (ci, oi, field, val) => { const c = [...courses]; c[ci].options[oi] = { ...c[ci].options[oi], [field]: val }; setCourses(c); };
  const removeOption = (ci, oi) => { const c = [...courses]; c[ci].options = c[ci].options.filter((_, j) => j !== oi); setCourses(c); };

  const inp = (val, fn, ph, type = "text") => (
    <input value={val} onChange={(e) => fn(e.target.value)} placeholder={ph} type={type}
      style={{ background: DARK, border: "1px solid #ffffff20", borderRadius: 8, padding: "8px 10px", color: TEXT, fontSize: 13, width: "100%", outline: "none" }} />
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ background: MID, borderRadius: 20, padding: 24, maxWidth: 480, margin: "0 auto", border: "1px solid #c9a96e30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: TEXT }}>{menu ? "Edit Menu" : "New Menu"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: SUB, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: GOLD, letterSpacing: 1, textTransform: "uppercase" }}>Restaurant Name</label>
          {inp(restaurant, setRestaurant, "e.g. The Witchery, Edinburgh")}
          <label style={{ fontSize: 11, color: GOLD, letterSpacing: 1, textTransform: "uppercase" }}>Menu Name</label>
          {inp(name, setName, "e.g. Set Dinner Menu")}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: GOLD, letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Meal Type</label>
              <select value={mealType} onChange={(e) => setMealType(e.target.value)}
                style={{ width: "100%", background: DARK, border: "1px solid #ffffff20", borderRadius: 8, padding: "8px 10px", color: TEXT, fontSize: 13, outline: "none" }}>
                {["Breakfast", "Lunch", "Dinner", "Afternoon Tea", "Supper"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: GOLD, letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Date</label>
              {inp(date, setDate, "e.g. 14 July", "text")}
            </div>
          </div>
        </div>

        {/* Courses */}
        <div style={{ fontSize: 11, color: GOLD, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Courses & Options</div>
        {courses.map((course, ci) => (
          <div key={ci} style={{ background: DARK, borderRadius: 12, padding: 14, marginBottom: 12, border: "1px solid #ffffff10" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>{inp(course.name, (v) => updateCourse(ci, "name", v), "Course name, e.g. Starter")}</div>
              <button onClick={() => removeCourse(ci)} style={{ background: "#ff444420", border: "none", borderRadius: 6, color: "#ff6666", cursor: "pointer", padding: "0 10px", fontSize: 16 }}>×</button>
            </div>
            {course.options.map((opt, oi) => (
              <div key={oi} style={{ display: "flex", flexDirection: "column", gap: 5, background: MID, borderRadius: 8, padding: 10, marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: 1 }}>{inp(opt.name, (v) => updateOption(ci, oi, "name", v), "Dish name")}</div>
                  <button onClick={() => removeOption(ci, oi)} style={{ background: "#ff444415", border: "none", borderRadius: 6, color: "#ff6666", cursor: "pointer", padding: "0 8px", fontSize: 14 }}>×</button>
                </div>
                {inp(opt.description, (v) => updateOption(ci, oi, "description", v), "Description (optional)")}
                {inp(opt.allergens || "", (v) => updateOption(ci, oi, "allergens", v), "Allergens (optional) e.g. Gluten, Dairy, Nuts")}
              </div>
            ))}
            <button onClick={() => addOption(ci)} style={{ width: "100%", padding: "7px", background: "#c9a96e10", border: "1px dashed #c9a96e30", borderRadius: 8, color: GOLD, fontSize: 12, cursor: "pointer", marginTop: 4 }}>+ Add Option</button>
          </div>
        ))}
        <button onClick={addCourse} style={{ width: "100%", padding: "9px", background: "#c9a96e15", border: "1px dashed #c9a96e50", borderRadius: 10, color: GOLD, fontSize: 13, cursor: "pointer", marginBottom: 20 }}>+ Add Course</button>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #ffffff20", borderRadius: 12, color: SUB, fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onSave({ ...menu, name, restaurant, meal_type: mealType, date, courses })} disabled={saving}
            style={{ flex: 2, padding: "12px", background: saving ? "#806040" : `linear-gradient(135deg,${GOLD},#a07840)`, borderRadius: 12, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Saving…" : "Save Menu"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Guide Dashboard ───────────────────────────────────────────────────────────
const GuideDashboard = ({ menus, onRefresh, onLogout }) => {
  const [view, setView] = useState("menus"); // menus | ordering | summary
  const [activeMenu, setActiveMenu] = useState(null);
  const [orders, setOrders] = useState([]);
  const [editingMenu, setEditingMenu] = useState(null);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [orderCount, setOrderCount] = useState(0);

  // Block iOS swipe-back when locked — must be at top level, not inside conditional
  useEffect(() => {
    if (!locked) return;
    let startX = 0; let startY = 0;
    const onStart = (e) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; };
    const onMove = (e) => {
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dx > dy + 5) e.preventDefault();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    window.history.pushState(null, '', window.location.href);
    const onPop = () => window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      window.removeEventListener('popstate', onPop);
    };
  }, [locked]);

  const showStatus = (msg) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(""), 3000); };

  const fetchOrders = async (menuId) => {
    try { const o = await loadOrders(menuId); setOrders(o); setOrderCount(o.length); }
    catch (e) { console.error(e); }
  };

  const handleStartOrdering = async (menu) => {
    setActiveMenu(menu);
    await fetchOrders(menu.id);
    setView("ordering");
  };

  const handleSaveMenu = async (menuData) => {
    setSaving(true);
    try {
      const saved = await saveMenu(menuData);
      for (let i = 0; i < menuData.courses.length; i++) {
        await saveCourse(saved.id, { ...menuData.courses[i], sort_order: i });
      }
      await onRefresh(); showStatus("✓ Menu saved");
      setEditingMenu(null);
    } catch (e) { showStatus("❌ Failed to save"); }
    setSaving(false);
  };

  const handleDeleteMenu = async (menuId) => {
    if (!window.confirm("Delete this menu and all its orders?")) return;
    try { await deleteMenu(menuId); await onRefresh(); showStatus("✓ Menu deleted"); }
    catch (e) { showStatus("❌ Failed"); }
  };

  const handleClearOrders = async () => {
    try { await deleteAllOrders(activeMenu.id); await fetchOrders(activeMenu.id); showStatus("✓ Orders cleared"); }
    catch (e) { showStatus("❌ Failed"); }
  };

  // Locked ordering mode — fullscreen, no way out except PIN
  if (locked && view === "ordering" && activeMenu) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <GuestOrderScreen menu={activeMenu} onOrderSubmitted={() => fetchOrders(activeMenu.id)} locked={true} />
        {/* Hidden unlock area — double tap top right corner */}
        <div onDoubleClick={() => { const pin = window.prompt("Enter guide PIN to unlock:"); if (pin?.toUpperCase() === GUIDE_PIN) setLocked(false); }}
          style={{ position: "fixed", top: 0, right: 0, width: 60, height: 60, zIndex: 10000, cursor: "default" }} />
      </div>
    );
  }

  if (view === "ordering" && activeMenu) {
    return (
      <div style={{ minHeight: "100vh", background: DARK, fontFamily: "'Lato',sans-serif" }}>
        {statusMsg && <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: MID, border: "1px solid #c9a96e40", borderRadius: 10, padding: "8px 20px", color: GOLD, fontSize: 13, fontWeight: 600, zIndex: 2000 }}>{statusMsg}</div>}
        {/* Guide controls bar */}
        <div style={{ background: "#0a0f1a", padding: "10px 20px", display: "flex", gap: 10, alignItems: "center", borderBottom: "1px solid #ffffff10" }}>
          <button onClick={() => setView("menus")} style={{ background: "none", border: "none", color: SUB, fontSize: 12, cursor: "pointer", padding: 0 }}>← Back</button>
          <div style={{ flex: 1, fontSize: 12, color: SUB }}>{orderCount} order{orderCount !== 1 ? "s" : ""} received</div>
          <button onClick={() => { setView("summary"); fetchOrders(activeMenu.id); }}
            style={{ background: "#c9a96e20", border: "1px solid #c9a96e40", borderRadius: 8, padding: "5px 12px", color: GOLD, fontSize: 12, cursor: "pointer" }}>
            View Orders
          </button>
          <button onClick={() => setLocked(true)}
            style={{ background: "linear-gradient(135deg,#c9a96e,#a07840)", border: "none", borderRadius: 8, padding: "6px 12px", color: "#1a1a2e", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            🔒 Lock for Guests
          </button>
        </div>
        <GuestOrderScreen menu={activeMenu} onOrderSubmitted={() => fetchOrders(activeMenu.id)} locked={false} />
      </div>
    );
  }

  if (view === "summary" && activeMenu) {
    return <OrderSummary menu={activeMenu} orders={orders} onBack={() => { setView("ordering"); fetchOrders(activeMenu.id); }} onClearOrders={handleClearOrders} />;
  }

  // Menu list
  return (
    <div style={{ minHeight: "100vh", background: DARK, fontFamily: "'Lato',sans-serif", color: TEXT }}>
      {statusMsg && <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: MID, border: "1px solid #c9a96e40", borderRadius: 10, padding: "8px 20px", color: GOLD, fontSize: 13, fontWeight: 600, zIndex: 2000, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>{statusMsg}</div>}

      <div style={{ background: `linear-gradient(135deg,${MID} 0%,${DARK} 100%)`, padding: "28px 24px 20px", borderBottom: "1px solid #c9a96e30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src="/logo-app.png" alt="logo" style={{ width: 44, height: 44, objectFit: "contain" }} />
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, color: GOLD, textTransform: "uppercase" }}>Castle & Coastline</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700 }}>Menu Orders</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => window.location.href = '/'} style={{ background: "none", border: "1px solid #ffffff20", borderRadius: 8, color: SUB, fontSize: 12, cursor: "pointer", padding: "6px 10px" }}>← Tour App</button>
            <button onClick={onLogout} style={{ background: "none", border: "1px solid #ffffff20", borderRadius: 8, color: SUB, fontSize: 12, cursor: "pointer", padding: "6px 10px" }}>Log out</button>
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: SUB, letterSpacing: 1, textTransform: "uppercase" }}>Your Menus</div>
          <button onClick={() => setEditingMenu({})} style={{ background: "#c9a96e15", border: "1px solid #c9a96e40", borderRadius: 8, padding: "5px 14px", color: GOLD, fontSize: 13, cursor: "pointer" }}>+ New Menu</button>
        </div>

        {menus.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#405060", border: "1px dashed #ffffff15", borderRadius: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🍽️</div>
            <div style={{ marginBottom: 16 }}>No menus yet — create your first one</div>
            <button onClick={() => setEditingMenu({})} style={{ background: `linear-gradient(135deg,${GOLD},#a07840)`, border: "none", borderRadius: 10, padding: "10px 20px", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Create Menu</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {menus.map((menu) => (
              <div key={menu.id} style={{ background: MID, borderRadius: 16, border: "1px solid #ffffff10", overflow: "hidden" }}>
                <div style={{ padding: "16px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700 }}>{menu.restaurant}</div>
                      <div style={{ fontSize: 13, color: SUB, marginTop: 2 }}>{menu.name} · {menu.meal_type}{menu.date ? " · " + menu.date : ""}</div>
                      <div style={{ fontSize: 12, color: "#506070", marginTop: 4 }}>{menu.courses?.length || 0} course{menu.courses?.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setEditingMenu(menu)} style={{ background: "#c9a96e20", border: "1px solid #c9a96e40", borderRadius: 8, padding: "5px 10px", color: GOLD, fontSize: 12, cursor: "pointer" }}>Edit</button>
                      <button onClick={() => handleDeleteMenu(menu.id)} style={{ background: "#ff444415", border: "1px solid #ff444430", borderRadius: 8, padding: "5px 8px", color: "#ff6666", fontSize: 12, cursor: "pointer" }}>×</button>
                    </div>
                  </div>
                  <button onClick={() => handleStartOrdering(menu)}
                    style={{ width: "100%", padding: "11px", background: `linear-gradient(135deg,${GOLD},#a07840)`, borderRadius: 10, border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 8 }}>
                    🍽️ Start Taking Orders
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingMenu !== null && <MenuEditor menu={editingMenu?.id ? editingMenu : null} onSave={handleSaveMenu} onClose={() => setEditingMenu(null)} saving={saving} />}
    </div>
  );
};

// ── Root ──────────────────────────────────────────────────────────────────────
export default function MenuOrder() {
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);

  const fetchMenus = async () => {
    try { setMenus(await loadMenus()); }
    catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchMenus(); }, []);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: DARK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Lato',sans-serif", color: TEXT }}>
      <img src="/logo-app.png" alt="Castle & Coastline" style={{ width: 100, height: 100, objectFit: "contain", marginBottom: 12 }} />
      <div style={{ fontSize: 13, color: SUB, marginTop: 8 }}>Loading…</div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${DARK}; }
      `}</style>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {!unlocked ? <PinEntry onUnlock={() => setUnlocked(true)} /> : <GuideDashboard menus={menus} onRefresh={fetchMenus} onLogout={() => setUnlocked(false)} />}
      </div>
    </>
  );
}
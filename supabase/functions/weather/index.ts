import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CACHE_HOURS = 6;
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const key = body.geocode ? `geo:${body.geocode.toLowerCase()}` : `fc:${body.lat},${body.lng}`;

    // Try cache first
    try {
      const { data: cached } = await supabase.from("weather_cache").select("payload, updated_at").eq("cache_key", key).single();
      if (cached) {
        const ageHours = (Date.now() - new Date(cached.updated_at).getTime()) / 3600000;
        if (ageHours < CACHE_HOURS) {
          return new Response(JSON.stringify(cached.payload), { headers: { ...cors, "Content-Type": "application/json" } });
        }
      }
    } catch (_) { /* no cache yet, carry on */ }

    // Fetch fresh
    const url = body.geocode
      ? `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(body.geocode)}&count=10&language=en&format=json`
      : `https://api.open-meteo.com/v1/forecast?latitude=${body.lat}&longitude=${body.lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FLondon&forecast_days=5`;
    const r = await fetch(url);
    const data = await r.json();

    // Save to cache (best effort)
    try { await supabase.from("weather_cache").upsert({ cache_key: key, payload: data, updated_at: new Date().toISOString() }); } catch (_) {}

    return new Response(JSON.stringify(data), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: r.ok ? 200 : 400,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      headers: { ...cors, "Content-Type": "application/json" }, status: 500,
    });
  }
});

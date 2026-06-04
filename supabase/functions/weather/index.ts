import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    let url;
    if (body.geocode) {
      url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(body.geocode)}&count=10&language=en&format=json`;
    } else {
      url = `https://api.open-meteo.com/v1/forecast?latitude=${body.lat}&longitude=${body.lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FLondon&forecast_days=5`;
    }
    const r = await fetch(url);
    const data = await r.json();
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Solo modelli gratuiti: "openrouter/free" (router automatico) oppure
// ID con suffisso ":free". Mai modelli a pagamento dal client.
function isValidFreeModel(model) {
  if (model === 'openrouter/free') return true;
  return typeof model === 'string' && /^[a-z0-9-]+\/[a-z0-9.\-]+:free$/i.test(model);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verifica il JWT dell'utente autenticato (la chiave anon resta segreta
    // lato server; il client non puo' chiamare OpenRouter direttamente)
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return new Response(JSON.stringify({ error: 'Non autenticato' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Token non valido' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Body JSON non valido' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }
    const { messages, system_instruction, model } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages mancante o vuoto' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) {
      console.error('OPENROUTER_API_KEY non configurato: usa `supabase secrets set OPENROUTER_API_KEY=...`');
      return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY non configurato sul server' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
    }

    // Build the request body for OpenRouter
    const openRouterMessages = [];
    if (system_instruction) {
      openRouterMessages.push({ role: 'system', content: system_instruction });
    }
    openRouterMessages.push(...messages);

    const payload = {
      model: isValidFreeModel(model) ? model : "openrouter/free",
      messages: openRouterMessages,
      temperature: 0.7
    }

    // Call OpenRouter
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://acadr3w.github.io/app-budget-x9z2q7a/", // Your site URL
        "X-Title": "Bilancio Pro" // Your site name
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorStr = await response.text();
      console.error("OpenRouter API error:", errorStr);
      return new Response(
        JSON.stringify({ error: `OpenRouter API error: ${response.status} - ${errorStr.slice(0, 500)}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
      );
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})
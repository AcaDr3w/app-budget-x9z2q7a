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

// Backup automatici quando il modello richiesto fallisce o sparisce
const FALLBACK_MODELS = [
  'google/gemini-2.5-flash-exp:free',
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen-2.5-coder-32b-instruct:free'
];

// Modelli vision gratuiti: SOLO questi sanno leggere un'immagine.
// Usati quando il body chiede `vision: true` (es. OCR scontrini).
const VISION_MODELS = [
  'google/gemini-2.5-flash-exp:free',
  'google/gemini-2.0-flash-exp:free'
];

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function callOpenRouter(apiKey, payload) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://acadr3w.github.io/app-budget-x9z2q7a/",
      "X-Title": "Bilancio Pro"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) {}
  return { ok: response.ok, status: response.status, text, parsed };
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
    const { messages, system_instruction, model, vision } = body;

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

    // Lista dei modelli da provare in ordine (fallback automatico):
    // 1) il modello richiesto dal client (se valido, ossia :free)
    // 2) "random" -> fallback in ordine casuale
    // 3) altrimenti il fallback statico, senza duplicati
    let candidates;
    if (vision) {
      candidates = [...VISION_MODELS];
    } else if (model === 'random') {
      candidates = shuffle(FALLBACK_MODELS);
    } else {
      candidates = [isValidFreeModel(model) ? model : 'openrouter/free', ...FALLBACK_MODELS];
      candidates = [...new Set(candidates)];
    }

    let lastError = null;
    for (const candidate of candidates) {
      const payload = {
        model: candidate,
        messages: openRouterMessages,
        temperature: 0.7
      };

      try {
        const result = await callOpenRouter(apiKey, payload);
        if (result.ok) {
          const content = result.parsed?.choices?.[0]?.message?.content || '';
          return new Response(
            JSON.stringify({ content }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // 401/403 = problema di chiave, non del modello: stop immediato
        if (result.status === 401 || result.status === 403) {
          return new Response(
            JSON.stringify({ error: `OpenRouter API error: ${result.status} - ${result.text.slice(0, 500)}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
          );
        }
        lastError = { status: result.status, text: result.text };
        console.warn(`[OR] Modello ${candidate} fallito (${result.status}), provo il backup...`);
      } catch (e) {
        lastError = { status: 'timeout/network', text: e.message };
        console.warn(`[OR] Modello ${candidate} errore: ${e.message}, provo il backup...`);
      }
    }

    return new Response(
      JSON.stringify({ error: `Tutti i modelli free falliti. Ultimo errore: ${lastError?.status} - ${(lastError?.text || '').slice(0, 300)}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})
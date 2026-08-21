import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Stessa lista vision di chat-openrouter (vedi MEMORY: catalogo free agosto 2026,
// free tier Gemini chiuso). Mantenere sincronizzata con l'altra funzione.
const VISION_MODELS = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'openrouter/free'
];

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
    signal: AbortSignal.timeout(45000)
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) {}
  return { ok: response.ok, status: response.status, text, parsed };
}

// Estrae il primo oggetto JSON dalla risposta (stesso comportamento di parseAIJson client)
function extractJson(text) {
  let t = (text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch (e) {}
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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
    const uid = userData.user.id;

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Body JSON non valido' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }
    const { jobId } = body;
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'jobId mancante' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    // Il job deve essere dell'utente (RLS lo garantisce comunque)
    const { data: job, error: jobErr } = await supabase
      .from('receipt_jobs').select('*').eq('id', jobId).maybeSingle();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: 'Job non trovato' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 });
    }

    const mark = async (changes) => {
      await supabase.from('receipt_jobs')
        .update({ ...changes, updated_at: Date.now() })
        .eq('id', jobId);
    };

    await mark({ status: 'processing' });

    // Scarica la foto dallo storage (come utente, RLS lo permette)
    const path = `${uid}/${jobId}.jpg`;
    const { data: imgData, error: imgErr } = await supabase.storage.from('receipts').download(path);
    if (imgErr || !imgData) {
      await mark({ status: 'failed', error: 'Foto non trovata nello storage' });
      return new Response(JSON.stringify({ error: 'Foto non trovata' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    const buf = await imgData.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const dataUri = `data:image/jpeg;base64,${btoa(binary)}`;

    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) {
      await mark({ status: 'failed', error: 'OPENROUTER_API_KEY non configurato' });
      return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY non configurato sul server' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
    }

    const messages = [
      { role: 'system', content: 'Sei un OCR di scontrini italiani. Regola ASSOLUTA: il TOTALE è SOLO l\'ultimo importo in fondo allo scontrino, di solito preceduto da "TOTALE", "TOTAL", "DA PAGARE", "IMPORTO", "TOT. €", ed è il valore effettivamente pagato. NON sommare mai i prezzi delle singole voci e NON sommare il totale a se stesso. Se in fondo non c\'è un totale esplicito, importo: null. Non inventare, non arrotondare. Lingua: Italiano. Rispondi SEMPRE e SOLO con JSON valido, senza markdown.' },
      { role: 'user', content: [
        { type: 'text', text: 'Estrai i dati da questo scontrino. Rispondi SOLO con JSON: {"importo": number|null, "somma_voci": number|null, "negozio": string|null, "data": "YYYY-MM-DD"|null, "categoria_suggerita": string|null}. importo = SOLO il TOTALE in fondo allo scontrino (numero senza valuta e senza separatori). somma_voci = somma dei prezzi delle singole voci (solo diagnostica, può essere null). Esempio: voci "Pane 1,20 / Latte 1,80" e in fondo "TOTALE € 3,00" → importo = 3.00 (MAI 6.00). Se l\'immagine non è uno scontrino o il totale non è leggibile, importo: null.' },
        { type: 'image_url', image_url: { url: dataUri } }
      ]}
    ];

    let lastError = null;
    for (const candidate of VISION_MODELS) {
      const payload = {
        model: candidate,
        messages,
        temperature: 0.2
      };
      try {
        const result = await callOpenRouter(apiKey, payload);
        if (result.ok) {
          const content = result.parsed?.choices?.[0]?.message?.content || '';
          const parsed = extractJson(content);
          let importo = null;
          if (parsed && parsed.importo != null) {
            const n = Number(String(parsed.importo).replace(',', '.').replace(/\s/g, ''));
            importo = isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
          }
          await mark({
            status: importo != null ? 'done' : 'failed',
            importo,
            negozio: parsed && parsed.negozio ? String(parsed.negozio) : null,
            data_scontrino: parsed && typeof parsed.data === 'string' ? parsed.data : null,
            categoria_suggerita: parsed && parsed.categoria_suggerita ? String(parsed.categoria_suggerita) : null,
            error: importo == null ? 'Importo non riconosciuto' : null
          });
          return new Response(JSON.stringify({ ok: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        lastError = { status: result.status, text: result.text.slice(0, 300) };
        console.warn(`[RECEIPT] Modello ${candidate} fallito (${result.status}), provo il backup...`);
      } catch (e) {
        lastError = { status: 'timeout/network', text: e.message };
        console.warn(`[RECEIPT] Modello ${candidate} errore: ${e.message}, provo il backup...`);
      }
    }

    await mark({ status: 'failed', error: `Tutti i modelli free falliti: ${lastError?.status} - ${(lastError?.text || '').slice(0, 200)}` });
    return new Response(JSON.stringify({ error: 'Analisi fallita' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 })
  }
})
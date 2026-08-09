import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages, system_instruction } = await req.json()

    // Build the request body for OpenRouter
    const openRouterMessages = [];
    if (system_instruction) {
      openRouterMessages.push({ role: 'system', content: system_instruction });
    }
    if (messages && Array.isArray(messages)) {
      openRouterMessages.push(...messages);
    }

    const payload = {
      // Usa un modello free di default
      model: "google/gemini-2.5-flash-exp:free", 
      messages: openRouterMessages,
      temperature: 0.7
    }

    // Call OpenRouter
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://acadr3w.github.io/app-budget-x9z2q7a/", // Your site URL
        "X-Title": "Bilancio Pro" // Your site name
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorStr = await response.text();
      console.error("OpenRouter API error:", errorStr);
      throw new Error(`OpenRouter API error: ${response.status}`);
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

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

function parsePriceStringToTSNumberFormat(price: string): number {
  return Number(price.replaceAll(".", "").replaceAll(",", "."));
}

Deno.serve(async (req: any) => {
  try {
    const now = new Date();
    now.setSeconds(0, 0);
    const unixTimestamp = Math.floor(now.getTime() / 1000);

    // Call external API
    const response = await fetch(
      `https://www.gold.de/api/metalle-intraday.php?func=intraday&_=${unixTimestamp}`
    );
    const data = await response.json();

    const preciousMetalData: { [key: string]: number } = {};
    preciousMetalData["goldPriceEUR"] = parsePriceStringToTSNumberFormat(
      data.au_gold_eur_o
    );
    preciousMetalData["goldPriceUSD"] = parsePriceStringToTSNumberFormat(
      data.au_gold_usd_o
    );
    preciousMetalData["silverPriceEUR"] = parsePriceStringToTSNumberFormat(
      data.au_silber_eur_o
    );
    preciousMetalData["silverPriceUSD"] = parsePriceStringToTSNumberFormat(
      data.au_silber_usd_o
    );
    preciousMetalData["platinumPriceEUR"] = parsePriceStringToTSNumberFormat(
      data.au_platin_eur.slice(0, -4)
    );
    preciousMetalData["platinumPriceUSD"] = parsePriceStringToTSNumberFormat(
      data.au_platin_usd.slice(0, -4)
    );
    preciousMetalData["palladiumPriceEUR"] = parsePriceStringToTSNumberFormat(
      data.au_palladium_eur.slice(0, -4)
    );
    preciousMetalData["palladiumPriceUSD"] = parsePriceStringToTSNumberFormat(
      data.au_palladium_usd.slice(0, -4)
    );

    const fromEURToUSDExchangeRate = parsePriceStringToTSNumberFormat(
      data.au_wechselkurs
    );

    const supabaseAdminClient: SupabaseClient = createClient(
      // Supabase API URL - env var exported by default when deployed.
      Deno.env.get("SUPABASE_URL") ?? "",
      // Supabase API SERVICE ROLE KEY - env var exported by default when deployed.
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error_precious_metal_prices } = await supabaseAdminClient
      .from("precious_metal_prices")
      .insert([
        {
          timestamp: now.toISOString,
          gold_eur: preciousMetalData["goldPriceEUR"],
          gold_usd: preciousMetalData["goldPriceUSD"],
          silver_eur: preciousMetalData["silverPriceEUR"],
          silver_usd: preciousMetalData["silverPriceUSD"],
          platinum_eur: preciousMetalData["platinumPriceEUR"],
          platinum_usd: preciousMetalData["platinumPriceUSD"],
          palladium_eur: preciousMetalData["palladiumPriceEUR"],
          palladium_usd: preciousMetalData["palladiumPriceUSD"],
        },
      ]);

    const { error_currency_exchange_rates } = await supabaseAdminClient
      .from("currency_exchange_rates")
      .insert([
        {
          timestamp: now,
          from_eur_to_usd: fromEURToUSDExchangeRate,
        },
      ]);

    return new Response(
      JSON.stringify({
        message: "Data has been fetched ans saved successfully",
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
    });
  }
});

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

// API Response type for gold.de cache API
interface GoldDeApiResponse {
  // Base ounce prices
  au_gold_eur_o: number;
  au_gold_usd_o: number;
  au_gold_chf_o: number;
  au_silber_eur_o: number;
  au_silber_usd_o: number;
  au_silber_chf_o: number;
  au_platin_eur_o: number;
  au_platin_usd_o: number;
  au_platin_chf_o: number;
  au_palladium_eur_o: number;
  au_palladium_usd_o: number;
  au_palladium_chf_o: number;

  // Gold per gram
  au_gold_eur_o_gramm: number;
  au_gold_usd_o_gramm: number;
  au_gold_chf_o_gramm: number;

  // Gold per kilo
  au_gold_eur_o_kilo: number;
  au_gold_usd_o_kilo: number;
  au_gold_chf_o_kilo: number;

  // Gold purity prices EUR
  au_gold_eur_o_333: number;
  au_gold_eur_o_585: number;
  au_gold_eur_o_750: number;
  au_gold_eur_o_833: number;
  au_gold_eur_o_900: number;
  au_gold_eur_o_916: number;
  au_gold_eur_o_999: number;

  // Gold purity prices USD
  au_gold_usd_o_333: number;
  au_gold_usd_o_585: number;
  au_gold_usd_o_750: number;
  au_gold_usd_o_833: number;
  au_gold_usd_o_900: number;
  au_gold_usd_o_916: number;
  au_gold_usd_o_999: number;

  // Gold purity prices CHF
  au_gold_chf_o_333: number;
  au_gold_chf_o_585: number;
  au_gold_chf_o_750: number;
  au_gold_chf_o_833: number;
  au_gold_chf_o_900: number;
  au_gold_chf_o_916: number;
  au_gold_chf_o_999: number;

  // Exchange rates
  au_wechselkurs_eur_usd: number;
  au_wechselkurs_eur_chf: number;

  // Constants
  feinunze_gramm: number;

  // Timestamp
  timestamp: number;
}

Deno.serve(async (_req: Request) => {
  try {
    const now = new Date();
    now.setSeconds(0, 0);
    const unixTimestamp = Math.floor(now.getTime() / 1000);

    // Call new gold.de cache API (returns numbers directly, no string parsing needed)
    const response = await fetch(
      `https://www.gold.de/cache/api.json?_=${unixTimestamp}`,
    );
    const data: GoldDeApiResponse = await response.json();

    const supabaseAdminClient: SupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Insert precious metal prices with all extended fields
    const { error: errorPreciousMetalPrices } = await supabaseAdminClient
      .from("precious_metal_prices")
      .insert([
        {
          timestamp: now.toISOString(),

          // Base ounce prices (existing columns)
          gold_eur: data.au_gold_eur_o,
          gold_usd: data.au_gold_usd_o,
          silver_eur: data.au_silber_eur_o,
          silver_usd: data.au_silber_usd_o,
          platinum_eur: data.au_platin_eur_o,
          platinum_usd: data.au_platin_usd_o,
          palladium_eur: data.au_palladium_eur_o,
          palladium_usd: data.au_palladium_usd_o,

          // CHF prices (new columns)
          gold_chf: data.au_gold_chf_o,
          silver_chf: data.au_silber_chf_o,
          platinum_chf: data.au_platin_chf_o,
          palladium_chf: data.au_palladium_chf_o,

          // Gold per gram (new columns)
          gold_eur_gram: data.au_gold_eur_o_gramm,
          gold_usd_gram: data.au_gold_usd_o_gramm,
          gold_chf_gram: data.au_gold_chf_o_gramm,

          // Gold per kilo (new columns)
          gold_eur_kilo: data.au_gold_eur_o_kilo,
          gold_usd_kilo: data.au_gold_usd_o_kilo,
          gold_chf_kilo: data.au_gold_chf_o_kilo,

          // Gold purity prices EUR (new columns)
          gold_eur_333: data.au_gold_eur_o_333,
          gold_eur_585: data.au_gold_eur_o_585,
          gold_eur_750: data.au_gold_eur_o_750,
          gold_eur_833: data.au_gold_eur_o_833,
          gold_eur_900: data.au_gold_eur_o_900,
          gold_eur_916: data.au_gold_eur_o_916,
          gold_eur_999: data.au_gold_eur_o_999,

          // Gold purity prices USD (new columns)
          gold_usd_333: data.au_gold_usd_o_333,
          gold_usd_585: data.au_gold_usd_o_585,
          gold_usd_750: data.au_gold_usd_o_750,
          gold_usd_833: data.au_gold_usd_o_833,
          gold_usd_900: data.au_gold_usd_o_900,
          gold_usd_916: data.au_gold_usd_o_916,
          gold_usd_999: data.au_gold_usd_o_999,

          // Gold purity prices CHF (new columns)
          gold_chf_333: data.au_gold_chf_o_333,
          gold_chf_585: data.au_gold_chf_o_585,
          gold_chf_750: data.au_gold_chf_o_750,
          gold_chf_833: data.au_gold_chf_o_833,
          gold_chf_900: data.au_gold_chf_o_900,
          gold_chf_916: data.au_gold_chf_o_916,
          gold_chf_999: data.au_gold_chf_o_999,
        },
      ]);

    if (errorPreciousMetalPrices) {
      console.error(
        "Error inserting precious metal prices:",
        errorPreciousMetalPrices,
      );
    }

    // Insert currency exchange rates
    const { error: errorCurrencyExchangeRates } = await supabaseAdminClient
      .from("currency_exchange_rates")
      .insert([
        {
          timestamp: now.toISOString(),
          from_eur_to_usd: data.au_wechselkurs_eur_usd,
          from_eur_to_chf: data.au_wechselkurs_eur_chf,
        },
      ]);

    if (errorCurrencyExchangeRates) {
      console.error(
        "Error inserting currency exchange rates:",
        errorCurrencyExchangeRates,
      );
    }

    return new Response(
      JSON.stringify({
        message: "Data has been fetched and saved successfully",
        timestamp: now.toISOString(),
        goldEur: data.au_gold_eur_o,
        feinunzeGramm: data.feinunze_gramm,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error in fetchAndSafePreciousMetalPrices:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

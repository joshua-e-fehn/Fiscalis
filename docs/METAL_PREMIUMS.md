# Metal premiums: calibration

The vault values each item at its **liquidation value**:

    value = spot (EUR/oz) × fine troy oz × (1 + sellPremium) × quantity

`sellPremium` is what a dealer pays you, relative to spot. `buyPremium` is what you would pay to buy the item today. It only feeds the "cost to acquire" figure. Both are stored per vault item. They default from the catalog product, and you can edit them per item.

The calibrated values live in [`frontend/convex/lib/metalPremiums.ts`](../frontend/convex/lib/metalPremiums.ts), the single source of truth. `seedCatalog` seeds from that file, and `premiumCalibration:applyPremiumCalibration` writes it to the live catalog.

## Calibration: 2026-11-11 (manual, one-off)

- **Market:** private buyer in Germany, EUR. Spot comes from the gold.de header at the time of each quote (Au ≈ 3631, Ag ≈ 47.44, Pt ≈ 1410, Pd ≈ 974 EUR/oz).
- **Definitions:** `premium = price / (spot × fine oz) − 1`, with 1 oz = 31.1034768 g. Buy = dealer ask including VAT where due. Sell = the dealer's published Ankauf (bid), which is VAT-free for a private seller.
- **VAT:**
  - Gold: VAT-free investment gold (§25c UStG).
  - Silver bars, platinum and palladium: 19% VAT included in the buy premium. Buying into VAT-free storage would be about 19 points cheaper.
  - 1 oz silver coins: mixed. Some dealers use margin taxation (§25a), others charge 19% VAT.
- **Sources:**
  - gold.de price comparison, per product (https://www.gold.de/kaufen/…), using the full dealer lists where the page exposes them (22–36 asks for gold coins).
  - Dealer price lists cross-checked directly: Degussa (https://www.degussa-goldhandel.de/preise/preisliste/) and philoro (https://philoro.de/preisliste).
  - Dealers covered include ESG, Heubach, philoro, pro aurum, Degussa, Münze Österreich, Heraeus, GoldSilberShop, Auragentum, myVALOR, MP Edelmetalle, Münzhandel Kleiner, Silber-Corner, Anlagegold24 and Geiger.
- **Method:** each value is a median across dealers. Five research agents gathered the quotes and two independent agents re-fetched samples to verify them.
- **Corrections applied after verification:**
  - gold.de bar pages and silver coin pages list only the 5–9 *cheapest* offers, some of them used or second-grade. Full dealer lists and brand dealers sit higher:
    - 1 g gold bar: Degussa +13.3%, philoro +12.5%.
    - 100 g and 1 kg gold bars: brand dealers +1.6% to +3.6%.
    - Silver Maple: +29.1% across 34 dealers. 1 kg silver bar: +27.6% across 35 dealers.
  - Gold bar and silver buy premiums were raised toward the full-list or brand level.
  - Large gold bar sells were set to −2.2%; brand dealers bid about −2.75%.
  - Platinum bar 1 oz sell was set to −4.1% (median of 10 bids).
- **Judgment calls** (revert here if you disagree):
  - The gold 2 g sell is interpolated, because the raw median was feed noise.
  - Silver coin sells are +1.5%. The full-list median is +4.3%, but the range runs from −10% (Degussa −6.2%) to +15.6%, so I picked a conservative value inside the supported 0% to +4%.
  - Palladium coins are essentially not offered for sale in Germany, so their buy premiums are borrowed from analogous products and are low-confidence.
- **Excluded:** shipping and insurance (they matter for 1–2 g bars and single coins), and UK specifics (Britannias are exempt from UK capital gains tax, and UK VAT differs).

### Values

| Product | buy | sell | basis | adjusted from first synthesis |
| -- | -- | -- | -- | -- |
| Gold Bar 1g | +8.0% | -1.5% | direct-median | buy +5.3%→+8.0% |
| Gold Bar 2g | +7.0% | -1.6% | interpolated | buy +6.4%→+7.0% |
| Gold Bar 5g | +3.5% | -1.6% | direct-median | buy +2.6%→+3.5% |
| Gold Bar 10g | +2.8% | -1.6% | direct-median | buy +1.9%→+2.8%; sell -1.4%→-1.6% |
| Gold Bar 20g | +2.0% | -1.8% | direct-median | buy +1.2%→+2.0% |
| Gold Bar 1 oz | +1.5% | -1.9% | direct-median | buy +0.7%→+1.5% |
| Gold Bar 50g | +1.5% | -2.0% | direct-median | buy +1.0%→+1.5%; sell -1.6%→-2.0% |
| Gold Bar 100g | +1.2% | -2.2% | direct-median | buy +0.6%→+1.2%; sell -2.1%→-2.2% |
| Gold Bar 250g | +1.1% | -2.2% | direct-median | buy +0.5%→+1.1%; sell -2.1%→-2.2% |
| Gold Bar 500g | +1.1% | -2.2% | direct-median | buy +0.5%→+1.1%; sell -1.7%→-2.2% |
| Gold Bar 1kg | +1.2% | -2.2% | direct-median | buy +0.6%→+1.2%; sell -1.8%→-2.2% |
| Philharmonic 1 oz | +2.5% | -2.0% | direct-median | — |
| Maple Leaf 1 oz | +2.8% | -2.3% | direct-median | — |
| Krugerrand 1 oz | +2.3% | -2.0% | direct-median | — |
| American Eagle 1 oz | +4.4% | -2.0% | direct-median | — |
| Kangaroo 1 oz | +2.9% | -2.0% | direct-median | — |
| Britannia 1 oz | +2.6% | -2.2% | direct-median | — |
| Chinese Panda 30g | +4.0% | -2.6% | direct-median | — |
| Philharmonic 1/2 oz | +6.7% | -2.0% | direct-median | — |
| Maple Leaf 1/2 oz | +6.8% | -1.9% | direct-median | — |
| Krugerrand 1/2 oz | +6.7% | -1.4% | direct-median | — |
| American Eagle 1/2 oz | +8.2% | -1.9% | direct-median | — |
| Philharmonic 1/4 oz | +9.0% | -1.6% | direct-median | — |
| Maple Leaf 1/4 oz | +9.2% | -1.6% | direct-median | — |
| Krugerrand 1/4 oz | +9.0% | -1.0% | direct-median | — |
| American Eagle 1/4 oz | +12.0% | -1.8% | direct-median | — |
| Philharmonic 1/10 oz | +11.9% | -1.2% | direct-median | — |
| Maple Leaf 1/10 oz | +12.2% | -1.6% | direct-median | — |
| Krugerrand 1/10 oz | +11.5% | -1.4% | direct-median | — |
| American Eagle 1/10 oz | +15.7% | -1.9% | direct-median | — |
| Silver Bar 1 oz | +41.0% | -4.4% | direct-median | buy +37.1%→+41.0% |
| Silver Bar 100g | +41.0% | -4.5% | direct-median | buy +37.9%→+41.0%; sell -3.0%→-4.5% |
| Silver Bar 250g | +32.0% | -6.2% | direct-median | buy +28.4%→+32.0% |
| Silver Bar 500g | +29.0% | -6.0% | direct-median | buy +25.4%→+29.0% |
| Silver Bar 1kg | +27.6% | -4.9% | direct-median | buy +24.0%→+27.6% |
| Silver Bar 5kg | +26.0% | -4.3% | direct-median | buy +22.8%→+26.0% |
| Silver Maple Leaf 1 oz | +29.0% | +1.5% | direct-median | buy +21.6%→+29.0% |
| Silver Philharmonic 1 oz | +29.0% | +1.5% | direct-median | buy +21.5%→+29.0% |
| Silver Kangaroo 1 oz | +31.0% | +1.5% | direct-median | buy +24.3%→+31.0% |
| Silver Britannia 1 oz | +31.0% | +1.5% | direct-median | buy +24.3%→+31.0% |
| Silver American Eagle 1 oz | +35.0% | -3.1% | direct-median | buy +27.4%→+35.0% |
| Platinum Bar 10g | +37.3% | -6.4% | direct-median | — |
| Platinum Bar 1 oz | +30.2% | -4.1% | direct-median | buy +29.4%→+30.2%; sell -3.3%→-4.1% |
| Platinum Philharmonic 1 oz | +31.2% | -4.1% | direct-median | — |
| Platinum Maple Leaf 1 oz | +29.4% | -3.4% | direct-median | — |
| Platinum American Eagle 1 oz | +40.0% | -5.3% | direct-median | — |
| Palladium Bar 1 oz | +34.0% | -5.7% | direct-median | — |
| Palladium Maple Leaf 1 oz | +34.0% | -4.2% | analogous-product | — |
| Palladium American Eagle 1 oz | +40.0% | +0.0% | analogous-product | — |

**Custom items** (no catalog entry) default per metal and category to the 1 oz medians (`customItemPremiums`). Jewelry and scrap were not researched and fall back to the bar values, so adjust them per item.

## Live premiums: not implemented, and why

As of 2026-11-11 there is no easy, legitimate live feed of per-product dealer bid and ask prices in EUR:

- **Spot-only APIs:** gold.de's free API (`api.edelmetalle.de/public.json`), metals-api, metalpriceapi and MetalCharts provide spot prices only, not product premiums.
- **Dealers without a feed:** Degussa and philoro publish bid and ask in HTML or browser-generated PDFs, but offer no feed, and philoro's terms limit use to trading with them. pro aurum blocks automated clients.
- **gold.de:** its price-list PDFs (`/cache/pdf/*_preisliste.pdf`, refreshed 3× per working day) and its comparison endpoint contain best dealer bid and ask. But its imprint requires written consent for reuse, and the PDFs show best offers, not medians.

**Path to live premiums:** get written permission or a data licence from gold.de (info@gold.de). Then add a daily Convex cron that parses the price lists into per-product medians and updates `metalCatalog` defaults. Until then, re-run this calibration periodically (premiums are fairly stable over weeks) by editing `metalPremiums.ts` and running:

```bash
npx convex run premiumCalibration:applyPremiumCalibration '{"dryRun":true}'
npx convex run premiumCalibration:applyPremiumCalibration
```

The backfill only touches vault items whose premiums still equal the previous catalog defaults. Hand-edited items are left alone.

import { describe, expect, it } from "vitest";
import { parseDkbCsv, splitCsvLine } from "./dkbCsv";

// Shape of a real export (2026-11-19), account data replaced
const EXPORT = [
  '"Girokonto";"DE00120300000000000000"',
  "",
  '"Kontostand vom 19.11.2026:";"2.581,25 €"',
  '""',
  '"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"',
  '"19.11.26";"19.11.26";"Gebucht";"ISSUER";"WEST.HUB.SHOP/CAMBRIDGE";"VISA Debitkartenumsatz vom 18.11.2026";"Ausgang";"DE00000000000000000000";"-4,67";"";"";"1"',
  '"16.11.26";"20.11.26";"Gebucht";"Fehn,Joshua";"DKB AG";"Depot 0511391062 Wertp.Abrechn. 16.11.2026 000002823074800 WKN A2N812 Gesch.Art KV Stück              2,0000 BIT GL.TECH.LEAD. R-I ISIN DE000A2N8127";"Ausgang";"0000000000";"-1.760,32";"";"";""',
  '"18.09.26";"22.09.26";"Gebucht";"DKB AG";"Fehn,Joshua";"Depot 0511391062 Wertp.Abrechn. 18.09.2026 000001855305700 WKN A111X9 Gesch.Art VV Stück              15,0000 IS C.MSCI EMIMI U.ETF DLA ISIN IE00BKM4GZ66";"Eingang";"0000000000";"706,28";"";"";""',
  "",
].join("\r\n");

describe("parseDkbCsv", () => {
  it("reads the depot trades with their cash", () => {
    const result = parseDkbCsv(`﻿${EXPORT}`);
    expect(result?.rows).toBe(3);
    expect(result?.trades).toEqual([
      expect.objectContaining({
        isin: "DE000A2N8127",
        side: "buy",
        quantity: 2,
        cash: 1760.32,
        currency: "EUR",
        reference: "000002823074800",
      }),
      expect.objectContaining({
        isin: "IE00BKM4GZ66",
        side: "sell",
        quantity: 15,
        cash: 706.28,
      }),
    ]);
  });

  it("is null for a file that is not a DKB export", () => {
    expect(parseDkbCsv("a;b;c\n1;2;3")).toBeNull();
  });
});

describe("splitCsvLine", () => {
  it("keeps separators and escaped quotes inside quotes", () => {
    expect(splitCsvLine('"a;b";"say ""hi""";c')).toEqual(["a;b", 'say "hi"', "c"]);
  });
});

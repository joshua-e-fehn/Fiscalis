# Darlehensrechner – Datenmodell (JSON Schema) & Berechnungslogik

Dieses Dokument ist als **Implementierungs-Blueprint** für Coding Agents gedacht. Es beschreibt:
- ein **einheitliches Eingabeformat** für mehrere Darlehensarten,
- ein **JSON Schema** (Draft 2020-12) zur Validierung,
- eine **Berechnungslogik** (Pseudocode) inkl. **Sondertilgungen**,
- Konventionen (Zinstage, Rundung, Reihenfolge der Buchungen).

---

## 1. Abgedeckte Darlehensarten (Rückzahlungsart)

### 1) Annuitätendarlehen (konstante Rate)
- Pro Periode konstante Gesamtzahlung (Rate).
- Zinsanteil sinkt, Tilgungsanteil steigt.

### 2) Ratendarlehen / Tilgungsdarlehen (konstante Tilgung)
- Pro Periode konstante **Tilgung**.
- Gesamtzahlung sinkt über die Zeit (weil Zins auf Restschuld sinkt).

### 3) Endfälliges Darlehen / Bullet Loan (Zins laufend, Tilgung am Ende)
- Während Laufzeit nur Zinsen.
- Am Ende einmalige (Ballon-)Tilgung.

### 4) Tilgungsaussetzung (Interest-only Phase, danach Amortisation)
- In der **Grace-Phase**: nur Zinsen, keine Tilgung.
- Danach: Umstieg auf Annuität / konstante Tilgung / Bullet.

---

## 2. Grundannahmen & Konventionen

### 2.1 Zeitachse / Perioden
- Der Rechner generiert eine **Periodenliste** aus `start_date`, `term` und `payment_frequency`.
- Jede Periode hat:
  - `period_start` (inkl.)  
  - `period_end` (exkl. oder inkl.; konsistent definieren)  
  - `payment_date` (typisch am Ende der Periode)

> Empfehlung: `period_end` als **Zahlungsstichtag** behandeln, Zinsen werden für `(period_start, period_end]` berechnet.

### 2.2 Zinsberechnung (Day Count)
Unterstützte Konventionen:
- `30E/360` (Eurobond/ISDA 30E/360)
- `ACT/360`
- `ACT/365F`

**Perioden-Zins:**
```
interest = balance * annual_rate * year_fraction(period_start, period_end, day_count)
```

### 2.3 Rundung
- Alle zahlungsrelevanten Beträge in **Cent** runden.
- Empfehlung: **Banker's rounding** vermeiden; nutze Standard `HALF_UP`.

### 2.4 Reihenfolge der Buchungen in einer Periode
Empfohlene Reihenfolge (transparent & üblich):
1. **Zinsen** berechnen
2. **Gebühren** (falls vorhanden)
3. **Regelzahlung** (Rate / Tilgung / Zinszahlung)
4. **Sondertilgung(en)** am `payment_date` (oder definierter `date`)
5. Rest → neue `closing_balance`

> Sondertilgungen reduzieren die Restschuld **zusätzlich** zur Regeltilgung.  
> Optional kann Sondertilgung auch *vor* der Regelzahlung wirken; das ist konfigurierbar (`prepayment_timing`).

---

## 3. Datenmodell – Überblick

### 3.1 Top-Level Objekt (Input)
- `loan_type`: Darlehensart
- `principal`: Darlehensbetrag (Auszahlung / Nominal)
- `start_date`: Valuta (YYYY-MM-DD)
- `term_months`: Laufzeit in Monaten
- `interest`: Zinsparameter
- `schedule`: Zahlungsrhythmus & Konventionen
- `amortization`: Regeln je Darlehensart
- `events`: Sondertilgungen & Gebühren

### 3.2 Output (Amortisationsplan)
Pro Periode erzeugen:
- `period_index`
- `period_start`, `period_end`, `payment_date`
- `opening_balance`
- `interest_amount`
- `fee_amount`
- `scheduled_payment`
- `scheduled_principal`
- `prepayment_amount`
- `total_payment`
- `closing_balance`

---

## 4. JSON Schema (Draft 2020-12)

> Hinweis: Das Schema ist **strikt** (`additionalProperties: false`), damit Implementierungen frühzeitig Fehler finden.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/loan-calculator.schema.json",
  "title": "LoanCalculatorInput",
  "type": "object",
  "additionalProperties": false,
  "required": ["loan_type", "principal", "start_date", "term_months", "interest", "schedule", "amortization"],
  "properties": {
    "loan_type": {
      "type": "string",
      "enum": ["ANNUITY", "CONSTANT_PRINCIPAL", "BULLET", "INTEREST_ONLY_THEN"]
    },
    "principal": { "type": "number", "exclusiveMinimum": 0 },
    "start_date": { "type": "string", "format": "date" },
    "term_months": { "type": "integer", "minimum": 1 },

    "interest": {
      "type": "object",
      "additionalProperties": false,
      "required": ["rate_pa", "rate_type", "day_count"],
      "properties": {
        "rate_pa": { "type": "number", "minimum": 0 },
        "rate_type": { "type": "string", "enum": ["FIXED", "VARIABLE"] },
        "day_count": { "type": "string", "enum": ["30E/360", "ACT/360", "ACT/365F"] }
      }
    },

    "schedule": {
      "type": "object",
      "additionalProperties": false,
      "required": ["payment_frequency", "payment_timing", "rounding", "currency"],
      "properties": {
        "payment_frequency": { "type": "string", "enum": ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"] },
        "payment_timing": { "type": "string", "enum": ["END_OF_PERIOD", "BEGIN_OF_PERIOD"] },
        "currency": { "type": "string", "minLength": 3, "maxLength": 3 },

        "rounding": {
          "type": "object",
          "additionalProperties": false,
          "required": ["scale", "mode"],
          "properties": {
            "scale": { "type": "integer", "enum": [2] },
            "mode": { "type": "string", "enum": ["HALF_UP"] }
          }
        },

        "prepayment_timing": {
          "type": "string",
          "enum": ["AFTER_SCHEDULED_PAYMENT", "BEFORE_SCHEDULED_PAYMENT"],
          "default": "AFTER_SCHEDULED_PAYMENT"
        }
      }
    },

    "amortization": {
      "type": "object",
      "additionalProperties": false,
      "required": ["rules"],
      "properties": {
        "rules": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "payment_amount": { "type": "number", "exclusiveMinimum": 0 },
            "principal_repayment_per_period": { "type": "number", "exclusiveMinimum": 0 },
            "balloon_amount": { "type": "number", "minimum": 0 },

            "grace_periods": { "type": "integer", "minimum": 1 },
            "post_grace": {
              "type": "object",
              "additionalProperties": false,
              "required": ["loan_type", "rules"],
              "properties": {
                "loan_type": { "type": "string", "enum": ["ANNUITY", "CONSTANT_PRINCIPAL", "BULLET"] },
                "rules": { "type": "object", "additionalProperties": true }
              }
            }
          }
        }
      }
    },

    "events": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "prepayments": {
          "type": "array",
          "default": [],
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["date", "amount"],
            "properties": {
              "date": { "type": "string", "format": "date" },
              "amount": { "type": "number", "exclusiveMinimum": 0 }
            }
          }
        },
        "fees": {
          "type": "array",
          "default": [],
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["date", "amount", "type"],
            "properties": {
              "date": { "type": "string", "format": "date" },
              "amount": { "type": "number", "minimum": 0 },
              "type": { "type": "string", "enum": ["UPFRONT", "PER_PERIOD", "ONE_OFF"] }
            }
          }
        }
      }
    }
  },

  "allOf": [
    {
      "if": { "properties": { "loan_type": { "const": "ANNUITY" } } },
      "then": {
        "properties": {
          "amortization": {
            "properties": {
              "rules": { "required": ["payment_amount"] }
            }
          }
        }
      }
    },
    {
      "if": { "properties": { "loan_type": { "const": "CONSTANT_PRINCIPAL" } } },
      "then": {
        "properties": {
          "amortization": {
            "properties": {
              "rules": { "required": ["principal_repayment_per_period"] }
            }
          }
        }
      }
    },
    {
      "if": { "properties": { "loan_type": { "const": "INTEREST_ONLY_THEN" } } },
      "then": {
        "properties": {
          "amortization": {
            "properties": {
              "rules": { "required": ["grace_periods", "post_grace"] }
            }
          }
        }
      }
    }
  ]
}
```

### 4.1 Schema-Notizen (für Implementierer)
- Für `ANNUITY` wird `payment_amount` vorausgesetzt (Rate ist vorgegeben).
  - Alternative Eingaben (z. B. Rate berechnen aus Laufzeit/Anfangstilgung) könnt ihr als **zweites Schema** ergänzen.
- Für `BULLET`: `balloon_amount` ist optional; Default = gesamte Restschuld am Ende.

---

## 5. Beispiel-Inputs

### 5.1 Annuität
```json
{
  "loan_type": "ANNUITY",
  "principal": 100000,
  "start_date": "2026-02-01",
  "term_months": 240,
  "interest": { "rate_pa": 0.03, "rate_type": "FIXED", "day_count": "30E/360" },
  "schedule": {
    "payment_frequency": "MONTHLY",
    "payment_timing": "END_OF_PERIOD",
    "currency": "EUR",
    "rounding": { "scale": 2, "mode": "HALF_UP" },
    "prepayment_timing": "AFTER_SCHEDULED_PAYMENT"
  },
  "amortization": { "rules": { "payment_amount": 555.00 } },
  "events": {
    "prepayments": [{ "date": "2027-06-30", "amount": 5000 }]
  }
}
```

### 5.2 Konstante Tilgung
```json
{
  "loan_type": "CONSTANT_PRINCIPAL",
  "principal": 100000,
  "start_date": "2026-02-01",
  "term_months": 240,
  "interest": { "rate_pa": 0.03, "rate_type": "FIXED", "day_count": "30E/360" },
  "schedule": {
    "payment_frequency": "MONTHLY",
    "payment_timing": "END_OF_PERIOD",
    "currency": "EUR",
    "rounding": { "scale": 2, "mode": "HALF_UP" }
  },
  "amortization": { "rules": { "principal_repayment_per_period": 416.67 } }
}
```

### 5.3 Bullet / Endfällig
```json
{
  "loan_type": "BULLET",
  "principal": 100000,
  "start_date": "2026-02-01",
  "term_months": 120,
  "interest": { "rate_pa": 0.03, "rate_type": "FIXED", "day_count": "ACT/365F" },
  "schedule": {
    "payment_frequency": "MONTHLY",
    "payment_timing": "END_OF_PERIOD",
    "currency": "EUR",
    "rounding": { "scale": 2, "mode": "HALF_UP" }
  },
  "amortization": { "rules": { "balloon_amount": 100000 } }
}
```

### 5.4 Tilgungsaussetzung → danach Annuität
```json
{
  "loan_type": "INTEREST_ONLY_THEN",
  "principal": 100000,
  "start_date": "2026-02-01",
  "term_months": 240,
  "interest": { "rate_pa": 0.03, "rate_type": "FIXED", "day_count": "30E/360" },
  "schedule": {
    "payment_frequency": "MONTHLY",
    "payment_timing": "END_OF_PERIOD",
    "currency": "EUR",
    "rounding": { "scale": 2, "mode": "HALF_UP" }
  },
  "amortization": {
    "rules": {
      "grace_periods": 60,
      "post_grace": {
        "loan_type": "ANNUITY",
        "rules": { "payment_amount": 700.00 }
      }
    }
  }
}
```

---

## 6. Berechnungslogik (Pseudocode)

### 6.1 Hilfsfunktionen

#### 6.1.1 Zahlungsrhythmus → Perioden generieren
```text
function periods = generate_periods(start_date, term_months, payment_frequency, payment_timing):
    step_months = {MONTHLY:1, QUARTERLY:3, SEMI_ANNUAL:6, ANNUAL:12}[payment_frequency]
    n = ceil(term_months / step_months)

    periods = []
    current_start = start_date

    for i in 1..n:
        period_end = add_months(current_start, step_months)
        payment_date = (payment_timing == END_OF_PERIOD) ? period_end : current_start
        periods.append({index:i, period_start:current_start, period_end:period_end, payment_date:payment_date})
        current_start = period_end

    return periods
```

#### 6.1.2 Year fraction (Day Count)
```text
function yf = year_fraction(d1, d2, day_count):
    switch day_count:
      case "ACT/360":  yf = actual_days(d1,d2) / 360
      case "ACT/365F": yf = actual_days(d1,d2) / 365
      case "30E/360":  yf = days_30E_360(d1,d2) / 360
```

#### 6.1.3 Runden
```text
function x = round_money(value, scale=2, mode=HALF_UP):
    return round(value, scale, mode)
```

---

### 6.2 Event-Indexing (Sondertilgungen & Gebühren)
```text
function map = index_events_by_date(events):
    prepayments_by_date = {date -> sum(amount)}
    fees_by_date = {date -> sum(amount)}
    return {prepayments_by_date, fees_by_date}
```

> Vereinfachung: Events wirken am `payment_date`.  
> (Intra-Period Events erfordern Zins-Splitting; nicht Teil dieses Minimal-Blueprints.)

---

### 6.3 Kernalgorithmus: Amortisationsplan
```text
function schedule = build_amortization_schedule(input):
    periods = generate_periods(input.start_date, input.term_months, input.schedule.payment_frequency, input.schedule.payment_timing)
    events = index_events_by_date(input.events ?? {})

    balance = input.principal
    schedule_rows = []

    for each period in periods:
        opening = balance

        yf = year_fraction(period.period_start, period.period_end, input.interest.day_count)
        interest = round_money(opening * input.interest.rate_pa * yf)

        fee = round_money(events.fees_by_date.get(period.payment_date, 0))

        (scheduled_payment, scheduled_principal) =
            compute_scheduled_cashflows(input, period.index, opening, interest)

        prepay = round_money(events.prepayments_by_date.get(period.payment_date, 0))

        # Optional order: prepayment before/after scheduled payment
        if input.schedule.prepayment_timing == "BEFORE_SCHEDULED_PAYMENT":
            prepay_applied = min(prepay, balance)
            balance = balance - prepay_applied
        else:
            prepay_applied = 0

        alloc = allocate_payment(scheduled_payment, interest, fee, balance, scheduled_principal)

        balance = balance - alloc.principal_paid

        if input.schedule.prepayment_timing == "AFTER_SCHEDULED_PAYMENT":
            prepay_applied = min(prepay, balance)
            balance = balance - prepay_applied

        closing = max(balance, 0)

        total_payment = alloc.total_paid + prepay_applied

        schedule_rows.append({
          period_index: period.index,
          period_start: period.period_start,
          period_end: period.period_end,
          payment_date: period.payment_date,
          opening_balance: opening,
          interest_amount: interest,
          fee_amount: fee,
          scheduled_payment: alloc.total_paid,
          scheduled_principal: alloc.principal_paid,
          prepayment_amount: prepay_applied,
          total_payment: total_payment,
          closing_balance: closing
        })

        if closing <= 0.00:
            break

    return schedule_rows
```

---

### 6.4 Scheduled Cashflows je Darlehensart

#### 6.4.1 Annuität (konstante Rate)
```text
function compute_scheduled_cashflows(input, k, opening, interest):
    rate = input.amortization.rules.payment_amount
    return (rate, null)  # principal determined by allocation
```

#### 6.4.2 Konstante Tilgung
```text
function compute_scheduled_cashflows(input, k, opening, interest):
    p = input.amortization.rules.principal_repayment_per_period
    principal = min(p, opening)
    payment = interest + principal
    return (payment, principal)
```

#### 6.4.3 Bullet / Endfällig
```text
function compute_scheduled_cashflows(input, k, opening, interest):
    balloon = input.amortization.rules.balloon_amount ?? input.principal
    if is_last_period(k, input):
        principal = min(balloon, opening)
        return (interest + principal, principal)
    else:
        return (interest, 0)
```

#### 6.4.4 Tilgungsaussetzung → danach X
```text
function compute_scheduled_cashflows(input, k, opening, interest):
    g = input.amortization.rules.grace_periods
    if k <= g:
        return (interest, 0)

    post = input.amortization.rules.post_grace
    virtual = clone(input)
    virtual.loan_type = post.loan_type
    virtual.principal = opening
    virtual.term_months = remaining_term_months(input, g)
    virtual.amortization.rules = post.rules

    return compute_scheduled_cashflows(virtual, k - g, opening, interest)
```

---

### 6.5 Payment Allocation (Zins, Gebühren, Tilgung)
```text
function allocate_payment(scheduled_payment, interest, fee, opening_balance, scheduled_principal):
    pay = max(scheduled_payment, 0)

    if scheduled_principal is not null:
        principal_paid = min(scheduled_principal, opening_balance)
        total_paid = interest + fee + principal_paid
        return {principal_paid, total_paid}

    remaining = pay
    interest_paid = min(interest, remaining); remaining -= interest_paid
    fee_paid = min(fee, remaining); remaining -= fee_paid
    principal_paid = min(opening_balance, remaining)

    total_paid = interest_paid + fee_paid + principal_paid
    return {principal_paid, total_paid}
```

**Unterdeckung (optional):**
- Wenn `pay < interest + fee`: entweder Fehler werfen oder Rückstände modellieren.  
Blueprint-Empfehlung: **Fehler** (Input invalid), solange keine Arrears-Logik implementiert wird.

---

## 7. Sondertilgungen (Prepayments) – Regeln

### 7.1 Grundregel
- `prepayment_applied = min(prepayment_amount, current_balance)`  
- Sondertilgung reduziert Restschuld direkt.

### 7.2 Timing
- `AFTER_SCHEDULED_PAYMENT` (Default): erst Regelzahlung, dann Sondertilgung.
- `BEFORE_SCHEDULED_PAYMENT`: erst Sondertilgung, dann Regelzahlung.

> Intra-Period Sondertilgungen (z. B. mitten im Monat) erfordern Zins-Splitting; nicht Teil dieses Minimal-Blueprints.

---

## 8. Validierungen & Edge Cases

### 8.1 Overpayment am Ende
- In letzter Periode principal_paid auf Restschuld cappen.
- Optional: letzte Zahlung reduzieren.

### 8.2 Bullet balloon_amount
- `balloon_amount` > Restschuld → cappen.
- `balloon_amount` < Restschuld → Restschuld bleibt (oder Fehler).

### 8.3 Konstante Tilgung über Laufzeit
- Tilgung in letzten Perioden cappen.
- Wenn nach Laufzeit Restschuld > 0: als Fehler oder „balloon-like remainder“ behandeln.

### 8.4 Rundungsdrift
- Zinsen und Zahlungen runden, Restschuld cappen.
- Letzte Periode als „balancing period“ behandeln (closing exakt 0).

---

## 9. Implementierungsempfehlung (Architektur)
- Validator: JSON Schema
- Engine:
  - Perioden-Generator
  - Zinsberechnung (Day Count)
  - LoanType-Strategie (scheduled cashflows)
  - Event-Processor (fees, prepayments)
  - Allocator (interest/fees/principal)
- Output:
  - Amortisationsplan + Summen (optional): total_interest, total_fees, total_paid

---

## 10. Minimaler Testkatalog
1. Annuität ohne Sondertilgung → Restschuld am Ende ~0
2. Annuität mit Sondertilgung → Plan endet früher oder Restschuld sinkt schneller
3. Konstante Tilgung → Rate sinkt
4. Bullet → nur Zinszahlungen, am Ende große Tilgung
5. Interest-only 12 Monate, danach Annuität → erste 12 Monate nur Zins

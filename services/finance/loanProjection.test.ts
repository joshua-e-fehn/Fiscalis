import { describe, it, expect } from "vitest";

import {
  buildLoanSchedule,
  calculateLoanSchedule,
  computeNextPaymentDate,
  initialScheduledPayment,
  loanKpis,
  LOAN_TYPES,
  monthsBetweenISODates,
  nextLoanPayment,
  paymentSplitBasis,
  projectLoan,
  recurringExtraOn,
  resolveRecurringExtras,
  isLegacyFullTermAnnuityPayment,
  isLegacyInterestOnlyThenPayment,
  rederiveScheduledPayment,
  resolveGracePeriods,
  scheduledPaymentAfterEdit,
  splitLoanPayment,
  type LoanInput,
  type LoanType,
  type ScheduleLoan,
  type SchedulePayment,
} from "./loanScheduleService";

// 1000 at 10% over 4 annual periods: round numbers to check by hand
const base: ScheduleLoan = {
  loanType: "ANNUITY",
  paymentFrequency: "ANNUAL",
  originalPrincipal: 1000,
  currentBalance: 1000,
  annualInterestRate: 0.1,
  termMonths: 48,
  scheduledPayment: 315.47,
  startDate: "2026-01-01",
  status: "active",
};

function loanOf(loanType: LoanType, extra: Partial<ScheduleLoan> = {}) {
  const loan = { ...base, loanType, ...extra };
  return { ...loan, scheduledPayment: initialScheduledPayment(loan) };
}

const calcInput: LoanInput = {
  loanType: "ANNUITY",
  principal: 1000,
  annualInterestRate: 0.1,
  termPeriods: 4,
  paymentFrequency: "ANNUAL",
  startDate: "2026-01-01",
};

describe("calculateLoanSchedule — every loan type amortises to exactly 0", () => {
  for (const loanType of LOAN_TYPES) {
    for (const paymentFrequency of [
      "MONTHLY",
      "QUARTERLY",
      "SEMI_ANNUAL",
      "ANNUAL",
    ] as const) {
      it(`${loanType} ${paymentFrequency}`, () => {
        const result = calculateLoanSchedule({
          loanType,
          principal: 250000,
          annualInterestRate: 0.065,
          termPeriods: 10 * { MONTHLY: 12, QUARTERLY: 4, SEMI_ANNUAL: 2, ANNUAL: 1 }[paymentFrequency],
          paymentFrequency,
          startDate: "2026-01-31",
          gracePeriods: loanType === "INTEREST_ONLY_THEN" ? 4 : undefined,
        });
        const last = result.schedule[result.schedule.length - 1];
        expect(last.closingBalance).toBe(0);
        expect(last.cumulativePrincipal).toBe(250000);
        expect(result.totalPayment).toBeCloseTo(
          250000 + result.totalInterest,
          2,
        );
      });
    }
  }
});

describe("calculateLoanSchedule — loan type rules", () => {
  it("ANNUITY pays a constant payment and settles the last period", () => {
    const { schedule, typicalPayment } = calculateLoanSchedule(calcInput);
    expect(typicalPayment).toBe(315.47);
    expect(schedule.map((r) => r.scheduledPayment)).toEqual([
      315.47, 315.47, 315.47, 315.47,
    ]);
    expect(schedule[3].closingBalance).toBe(0);
  });

  it("CONSTANT_PRINCIPAL repays principal / n plus declining interest", () => {
    const { schedule } = calculateLoanSchedule({
      ...calcInput,
      loanType: "CONSTANT_PRINCIPAL",
    });
    expect(schedule.map((r) => [r.principalPayment, r.interestAmount])).toEqual(
      [
        [250, 100],
        [250, 75],
        [250, 50],
        [250, 25],
      ],
    );
  });

  it("BULLET pays interest only and the principal at the end", () => {
    const { schedule } = calculateLoanSchedule({
      ...calcInput,
      loanType: "BULLET",
    });
    expect(schedule.map((r) => r.scheduledPayment)).toEqual([
      100, 100, 100, 1100,
    ]);
  });

  it("INTEREST_ONLY_THEN pays interest during grace, then a fixed annuity", () => {
    const { schedule } = calculateLoanSchedule({
      ...calcInput,
      loanType: "INTEREST_ONLY_THEN",
      gracePeriods: 2,
    });
    expect(schedule.map((r) => r.scheduledPayment)).toEqual([
      100, 100, 576.19, 576.19,
    ]);
    expect(schedule[3].closingBalance).toBe(0);
  });

  it("INTEREST_ONLY_THEN defaults to no grace periods, like the tracker", () => {
    expect(
      resolveGracePeriods({
        loanType: "INTEREST_ONLY_THEN",
        termMonths: 48,
        paymentFrequency: "ANNUAL",
      }),
    ).toBe(0);
    expect(
      resolveGracePeriods({
        loanType: "INTEREST_ONLY_THEN",
        gracePeriods: 10,
        termMonths: 48,
        paymentFrequency: "ANNUAL",
      }),
    ).toBe(3);
  });

  it("settles an underpaying fixed payment at the end and flags it", () => {
    const result = calculateLoanSchedule({ ...calcInput, fixedPayment: 50 });
    expect(result.paymentBelowInterest).toBe(true);
    expect(result.schedule.slice(0, 3).map((r) => r.principalPayment)).toEqual(
      [0, 0, 0],
    );
    expect(result.schedule[3]).toMatchObject({
      principalPayment: 1000,
      closingBalance: 0,
    });
    expect(
      projectLoan({ ...base, scheduledPayment: 50 }, []).finalBalloon,
    ).toBe(1000);
  });

  it("anchors monthly due dates to a month-end start date", () => {
    const { schedule } = calculateLoanSchedule({
      ...calcInput,
      paymentFrequency: "MONTHLY",
      termPeriods: 4,
      startDate: "2026-01-31",
    });
    expect(schedule.map((r) => r.paymentDate)).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });
});

describe("calculateLoanSchedule — prepayments", () => {
  it("a prepayment on the start date reduces the opening balance", () => {
    const result = calculateLoanSchedule({
      ...calcInput,
      prepayments: [{ date: "2026-01-01", amount: 200 }],
    });
    expect(result.schedule[0]).toMatchObject({
      openingBalance: 800,
      interestAmount: 80,
      prepaymentAmount: 200,
    });
    expect(result.totalPrepayments).toBe(200);
    expect(result.schedule[result.schedule.length - 1].cumulativePrincipal).toBe(
      1000,
    );
  });

  it("reduce_term keeps the payment and shortens the term", () => {
    const result = calculateLoanSchedule({
      ...calcInput,
      prepayments: [{ date: "2027-01-01", amount: 300 }],
    });
    expect(result.schedule[1].scheduledPayment).toBe(315.47);
    expect(result.numberOfPayments).toBe(3);
  });

  it("reduce_payment keeps the term and lowers the payment", () => {
    const result = calculateLoanSchedule({
      ...calcInput,
      prepayments: [{ date: "2027-01-01", amount: 300 }],
      prepaymentEffect: "reduce_payment",
    });
    expect(result.numberOfPayments).toBe(4);
    expect(result.schedule[1].scheduledPayment).toBeLessThan(315.47);
  });

  it("caps prepayments per calendar year and charges the penalty", () => {
    const result = calculateLoanSchedule({
      ...calcInput,
      prepayments: [
        { date: "2026-06-01", amount: 80 },
        { date: "2026-07-01", amount: 80 },
      ],
      maxAnnualPrepaymentRate: 0.1,
      prepaymentPenaltyRate: 0.02,
    });
    expect(result.totalPrepayments).toBe(100);
    expect(result.totalPenalty).toBe(2);
  });

  it("treats a zero annual prepayment cap as no prepayments, an absent one as no cap", () => {
    const prepayments = [{ date: "2026-06-01", amount: 100 }];
    const none = calculateLoanSchedule({
      ...calcInput,
      prepayments,
      extraPerPeriod: 50,
      maxAnnualPrepaymentRate: 0,
    });
    expect(none.totalPrepayments).toBe(0);
    expect(none.schedule.every((r) => r.prepaymentAmount === 0)).toBe(true);
    expect(
      calculateLoanSchedule({ ...calcInput, prepayments }).totalPrepayments,
    ).toBe(100);
  });

  it("counts prepayment penalties in what is paid", () => {
    const plain = calculateLoanSchedule({
      ...calcInput,
      prepayments: [{ date: "2026-06-01", amount: 100 }],
    });
    const result = calculateLoanSchedule({
      ...calcInput,
      prepayments: [{ date: "2026-06-01", amount: 100 }],
      prepaymentPenaltyRate: 0.02,
    });
    expect(result.schedule[0].penaltyAmount).toBe(2);
    expect(result.schedule[0].totalPayment).toBe(
      plain.schedule[0].totalPayment + 2,
    );
    expect(result.totalPayment).toBe(plain.totalPayment + 2);

    // A prepayment on the start date is charged with the first row
    const upfront = calculateLoanSchedule({
      ...calcInput,
      prepayments: [{ date: calcInput.startDate, amount: 100 }],
      prepaymentPenaltyRate: 0.02,
    });
    expect(upfront.schedule[0].penaltyAmount).toBe(2);
    expect(upfront.totalPenalty).toBe(2);
  });

  it("adds a recurring extra to every period", () => {
    const result = calculateLoanSchedule({ ...calcInput, extraPerPeriod: 100 });
    expect(result.schedule[0].prepaymentAmount).toBe(100);
    expect(result.numberOfPayments).toBe(3);
  });
});

describe("projectLoan — What-If on a tracked loan, per loan type", () => {
  for (const loanType of LOAN_TYPES) {
    it(`${loanType}: an extra per period never costs more interest and pays off sooner or equal`, () => {
      const loan = loanOf(loanType, { gracePeriods: 2 });
      const baseline = projectLoan(loan, []);
      const scenario = projectLoan(loan, [], { extraPerPeriod: 100 });
      expect(baseline.rows[baseline.rows.length - 1].closingBalance).toBe(0);
      expect(scenario.rows[scenario.rows.length - 1].closingBalance).toBe(0);
      expect(scenario.totalInterest).toBeLessThan(baseline.totalInterest);
      expect(scenario.rows.length).toBeLessThanOrEqual(baseline.rows.length);
    });
  }

  it("BULLET's baseline pays the principal at the end, not via the stored payment", () => {
    const loan = loanOf("BULLET");
    expect(loan.scheduledPayment).toBe(100);
    const baseline = projectLoan(loan, []);
    expect(baseline.rows.map((r) => r.payment)).toEqual([100, 100, 100, 1100]);
    expect(baseline.totalInterest).toBe(400);
  });

  it("INTEREST_ONLY_THEN with reduce_term keeps the post-grace payment", () => {
    const loan = loanOf("INTEREST_ONLY_THEN", { gracePeriods: 2 });
    const scenario = projectLoan(loan, [], {
      oneTimePrepayments: [{ date: "2026-06-01", amount: 300 }],
    });
    expect(scenario.rows.map((r) => r.payment)).toEqual([100, 70, 576.19, 213.19]);
  });

  it("INTEREST_ONLY_THEN with reduce_payment lowers the post-grace payment", () => {
    const loan = loanOf("INTEREST_ONLY_THEN", { gracePeriods: 2 });
    const scenario = projectLoan(loan, [], {
      oneTimePrepayments: [{ date: "2026-06-01", amount: 300 }],
      prepaymentEffect: "reduce_payment",
    });
    expect(scenario.rows).toHaveLength(4);
    expect(scenario.rows[2].payment).toBe(403.33);
  });

  it("CONSTANT_PRINCIPAL reduce_payment spreads the rest over the remaining periods", () => {
    const loan = loanOf("CONSTANT_PRINCIPAL");
    const scenario = projectLoan(loan, [], {
      oneTimePrepayments: [{ date: "2027-01-01", amount: 150 }],
      prepaymentEffect: "reduce_payment",
    });
    // Paid with the first due date: 1000 − 250 − 150 = 600 over 3 periods
    expect(scenario.rows.map((r) => r.principal)).toEqual([250, 200, 200, 200]);
  });

  it("a new rate re-derives the annuity over the remaining periods", () => {
    const scenario = projectLoan(base, [], { newRate: 0.05 });
    expect(scenario.rows[0].payment).toBe(282.01);
    expect(scenario.rows).toHaveLength(4);
  });

  it("enforces the loan's prepayment cap and penalty", () => {
    const loan = { ...base, maxAnnualPrepaymentRate: 0.05, prepaymentPenaltyRate: 0.01 };
    const scenario = projectLoan(loan, [], { extraPerPeriod: 200 });
    expect(scenario.rows[0].prepayment).toBe(50);
    expect(scenario.prepaymentsCapped).toBeGreaterThan(0);
    expect(scenario.totalPenalty).toBeGreaterThan(0);
  });

  it("starts the recurring extra at extraPerPeriodFrom", () => {
    const scenario = projectLoan(base, [], {
      extraPerPeriod: 50,
      extraPerPeriodFrom: "2028-01-01",
    });
    expect(scenario.rows.map((r) => r.prepayment).slice(0, 3)).toEqual([
      0, 50, 50,
    ]);
  });

  it("matches the projected rows of buildLoanSchedule without options", () => {
    const rows = buildLoanSchedule(base, [], "2026-01-01");
    const projection = projectLoan(base, [], {}, "2026-01-01");
    expect(projection.rows.map((r) => r.payment)).toEqual(
      rows.map((r) => r.payment),
    );
  });
});

describe("next payment & KPIs", () => {
  const paid = (
    paymentDate: string,
    principalPortion: number,
    interestPortion: number,
    paymentType: SchedulePayment["paymentType"] = "scheduled",
  ): SchedulePayment => ({
    paymentDate,
    amount: principalPortion + interestPortion,
    principalPortion,
    interestPortion,
    paymentType,
  });

  it("CONSTANT_PRINCIPAL's next payment declines (not the stored first payment)", () => {
    const loan = { ...loanOf("CONSTANT_PRINCIPAL"), currentBalance: 750 };
    expect(loan.scheduledPayment).toBe(350);
    expect(
      nextLoanPayment(loan, [paid("2027-01-01", 250, 100)], "")?.amount,
    ).toBe(325);
  });

  it("INTEREST_ONLY_THEN's next payment is interest-only during grace", () => {
    const loan = loanOf("INTEREST_ONLY_THEN", { gracePeriods: 2 });
    expect(nextLoanPayment(loan, [], "")?.amount).toBe(100);
    expect(
      nextLoanPayment(
        loan,
        [paid("2027-01-01", 0, 100), paid("2028-01-01", 0, 100)],
        "",
      )?.amount,
    ).toBe(576.19);
  });

  it("BULLET's last payment includes the principal", () => {
    const loan = loanOf("BULLET");
    const payments = [
      paid("2027-01-01", 0, 100),
      paid("2028-01-01", 0, 100),
      paid("2029-01-01", 0, 100),
    ];
    expect(nextLoanPayment(loan, payments, "2029-06-01")).toEqual({
      dueDate: "2030-01-01",
      amount: 1100,
      overdue: false,
    });
  });

  it("flags an unpaid due date before today as overdue", () => {
    expect(nextLoanPayment(base, [], "2027-02-01")).toMatchObject({
      dueDate: "2027-01-01",
      overdue: true,
    });
    expect(nextLoanPayment(base, [], "2027-01-01")?.overdue).toBe(false);
  });

  it("partial payments complete a CONSTANT_PRINCIPAL due date at its own amount", () => {
    const loan = { ...loanOf("CONSTANT_PRINCIPAL"), currentBalance: 750 };
    // First due date is 350 (250 + 100), not some later declining amount
    const payments = [
      paid("2026-12-20", 100, 100, "partial"),
      paid("2026-12-30", 150, 0, "partial"),
    ];
    expect(computeNextPaymentDate(loan, payments)).toBe("2028-01-01");
    expect(
      computeNextPaymentDate(loan, payments.slice(0, 1)),
    ).toBe("2027-01-01");
  });

  it("derives every KPI from the same schedule", () => {
    const loan = { ...base, currentBalance: 784.53 };
    const kpis = loanKpis(loan, [paid("2027-01-01", 215.47, 100)], "2027-01-10");
    expect(kpis).toMatchObject({
      principalRepaid: 215.47,
      totalPaid: 315.47,
      interestPaid: 100,
      remainingPeriods: 3,
      projectedPayoffDate: "2030-01-01",
      remainingMonths: 35,
      nextPayment: { dueDate: "2028-01-01", amount: 315.47, overdue: false },
      regularPayment: 315.47,
      paymentBelowInterest: false,
      finalBalloon: 0,
      historyInconsistent: false,
    });
    expect(kpis.progress).toBeCloseTo(21.547, 3);
    expect(kpis.totalInterest).toBe(
      Math.round((100 + kpis.projectedInterest) * 100) / 100,
    );
  });

  it("never counts a final BULLET settlement as the regular payment", () => {
    const loan = { ...loanOf("BULLET"), annualInterestRate: 0.04 };
    const payments = [
      paid("2027-01-01", 0, 40),
      paid("2028-01-01", 0, 40),
      paid("2029-01-01", 0, 40),
    ];
    const kpis = loanKpis(loan, payments, "2029-06-01");
    expect(kpis.nextPayment?.amount).toBe(1040);
    expect(kpis.regularPayment).toBe(40);
  });

  it("surfaces an annuity payment that no longer covers the interest", () => {
    const loan = { ...base, annualInterestRate: 0.4 };
    expect(loanKpis(loan, [], "2026-01-01").paymentBelowInterest).toBe(true);
  });

  it("surfaces the final balloon of a payment that covers interest but can't amortise", () => {
    // A typed post-grace payment too small to repay 1000 over 2 periods
    const undersized = {
      ...loanOf("INTEREST_ONLY_THEN", { gracePeriods: 2 }),
      scheduledPayment: 320,
    };
    const kpis = loanKpis(undersized, [], "2026-01-01");
    expect(kpis.paymentBelowInterest).toBe(false);
    expect(kpis.finalBalloon).toBe(780);
    expect(loanKpis(loanOf("INTEREST_ONLY_THEN", { gracePeriods: 2 }), [], "2026-01-01").finalBalloon).toBe(0);
  });
});

describe("scheduledPaymentAfterEdit", () => {
  it("keeps a payment the user changed", () => {
    expect(
      scheduledPaymentAfterEdit(base, [], {
        annualInterestRate: 0.4,
        scheduledPayment: 500,
      }),
    ).toBe(500);
  });

  it("re-derives an ANNUITY payment over the remaining periods when the rate changes", () => {
    const payment = scheduledPaymentAfterEdit(base, [], {
      annualInterestRate: 0.4,
      scheduledPayment: base.scheduledPayment,
    });
    expect(payment).toBe(
      initialScheduledPayment({ ...base, annualInterestRate: 0.4 }),
    );
    expect(
      loanKpis({ ...base, annualInterestRate: 0.4, scheduledPayment: payment }, [], "2026-01-01")
        .paymentBelowInterest,
    ).toBe(false);
  });

  it("re-derives the post-grace payment of INTEREST_ONLY_THEN on a balance edit", () => {
    const loan = loanOf("INTEREST_ONLY_THEN", { gracePeriods: 2 });
    expect(
      scheduledPaymentAfterEdit(loan, [], { currentBalance: 500 }),
    ).toBe(288.1);
  });

  it("leaves other loan types and unchanged terms alone", () => {
    const cp = loanOf("CONSTANT_PRINCIPAL");
    expect(scheduledPaymentAfterEdit(cp, [], { annualInterestRate: 0.2 })).toBe(
      cp.scheduledPayment,
    );
    expect(scheduledPaymentAfterEdit(base, [], {})).toBe(base.scheduledPayment);
  });
});

describe("rederiveScheduledPayment", () => {
  it("turns a legacy INTEREST_ONLY_THEN full-term annuity into the post-grace payment", () => {
    // Stored by the old dialog: an annuity over all 4 periods, ignoring grace
    const legacy = {
      ...loanOf("INTEREST_ONLY_THEN", { gracePeriods: 2 }),
      scheduledPayment: 315.47,
    };
    expect(rederiveScheduledPayment(legacy, [])).toBe(576.19);
  });

  it("recognises only the old dialog's computed payment, not a typed one", () => {
    const loan = loanOf("INTEREST_ONLY_THEN", { gracePeriods: 2 });
    expect(
      isLegacyFullTermAnnuityPayment({ ...loan, scheduledPayment: 315.47 }),
    ).toBe(true);
    expect(
      isLegacyFullTermAnnuityPayment({ ...loan, scheduledPayment: 400 }),
    ).toBe(false);
    expect(isLegacyFullTermAnnuityPayment(loan)).toBe(false);
    expect(isLegacyFullTermAnnuityPayment(base)).toBe(false);
  });
});

describe("legacy INTEREST_ONLY_THEN payments", () => {
  const loan = loanOf("INTEREST_ONLY_THEN", { gracePeriods: 2 });
  // Old dialog: full-term annuity; old createLoan fallback: interest only
  const legacyDialog = { ...loan, scheduledPayment: 315.47 };
  const legacyFallback = { ...loan, scheduledPayment: 100 };

  it("recognises both legacy payments, not the post-grace annuity", () => {
    expect(loan.scheduledPayment).toBe(576.19);
    expect(isLegacyInterestOnlyThenPayment(legacyDialog)).toBe(true);
    expect(isLegacyInterestOnlyThenPayment(legacyFallback)).toBe(true);
    expect(isLegacyInterestOnlyThenPayment(loan)).toBe(false);
    expect(
      isLegacyInterestOnlyThenPayment({ ...loan, scheduledPayment: 400 }),
    ).toBe(false);
    expect(
      isLegacyInterestOnlyThenPayment({ ...base, scheduledPayment: 100 }),
    ).toBe(false);
  });

  it("projects a legacy row as if it stored the post-grace annuity", () => {
    const expected = projectLoan(loan, []);
    expect(expected.finalBalloon).toBe(0);
    for (const legacy of [legacyDialog, legacyFallback]) {
      const projection = projectLoan(legacy, []);
      expect(projection.rows.map((r) => r.payment)).toEqual(
        expected.rows.map((r) => r.payment),
      );
      expect(projection.finalBalloon).toBe(0);
      expect(loanKpis(legacy, [], "2026-01-01").regularPayment).toBe(100);
    }
  });

  it("derives the annuity from the current balance once past the grace", () => {
    const pastGrace = (scheduledPayment: number) => ({
      ...loan,
      scheduledPayment,
      currentBalance: 500,
    });
    const interestOnly = (date: string): SchedulePayment => ({
      paymentDate: date,
      amount: 100,
      principalPortion: 0,
      interestPortion: 100,
      paymentType: "scheduled",
    });
    const payments = [interestOnly("2027-01-01"), interestOnly("2028-01-01")];
    // 500 at 10% over the 2 periods left
    expect(
      projectLoan(pastGrace(100), payments).rows.map((r) => r.payment),
    ).toEqual([288.1, 288.09]);
  });
});

describe("paymentSplitBasis", () => {
  it("is the walked balance at the payment date, for back-dated payments", () => {
    const loan = { ...base, currentBalance: 784.53 };
    const payments: SchedulePayment[] = [
      {
        paymentDate: "2027-01-01",
        amount: 315.47,
        principalPortion: 215.47,
        interestPortion: 100,
        paymentType: "scheduled",
      },
    ];
    expect(paymentSplitBasis(loan, payments, "2026-12-01").balance).toBe(1000);
    expect(paymentSplitBasis(loan, payments, "2027-01-01")).toMatchObject({
      balance: 784.53,
      openPeriod: null,
    });
  });

  it("charges a due date's interest once across partial payments", () => {
    // 12,000 at 6% over 12 months: payment 1,032.80, first interest 60.00
    const loan: ScheduleLoan = {
      loanType: "ANNUITY",
      paymentFrequency: "MONTHLY",
      originalPrincipal: 12000,
      currentBalance: 12000,
      annualInterestRate: 0.06,
      termMonths: 12,
      scheduledPayment: 1032.8,
      startDate: "2026-01-01",
      status: "active",
    };
    const payments: SchedulePayment[] = [];
    for (const amount of [500, 532.8]) {
      const split = splitLoanPayment(
        paymentSplitBasis(loan, payments, "2026-02-01"),
        amount,
        "partial",
      );
      payments.push({
        paymentDate: "2026-02-01",
        amount: split.amount,
        principalPortion: split.principalPortion,
        interestPortion: split.interestPortion,
        paymentType: "partial",
        createdAt: payments.length,
      });
      loan.currentBalance -= split.principalPortion;
    }
    expect(payments.map((p) => p.interestPortion)).toEqual([60, 0]);
    expect(payments.reduce((s, p) => s + p.interestPortion, 0)).toBe(60);
    expect(Math.round(loan.currentBalance * 100) / 100).toBe(11027.2);
    // The due date is complete: the next payment charges a full period again
    expect(paymentSplitBasis(loan, payments, "2026-03-01").openPeriod).toBe(
      null,
    );
  });

  it("charges only the interest left when a regular payment completes a partly paid due date", () => {
    const loan = { ...base, currentBalance: 950 };
    const payments: SchedulePayment[] = [
      {
        paymentDate: "2026-12-01",
        amount: 110,
        principalPortion: 50,
        interestPortion: 60,
        paymentType: "partial",
      },
    ];
    expect(
      splitLoanPayment(
        paymentSplitBasis(loan, payments, "2027-01-01"),
        205.47,
        "scheduled",
      ),
    ).toMatchObject({ interestPortion: 40, principalPortion: 165.47 });
  });
});

describe("monthsBetweenISODates", () => {
  it("counts whole calendar months", () => {
    expect(monthsBetweenISODates("2026-11-11", "2027-01-01")).toBe(1);
    expect(monthsBetweenISODates("2026-11-11", "2026-12-11")).toBe(1);
    expect(monthsBetweenISODates("2027-01-01", "2026-01-01")).toBe(0);
  });
});

describe("recurring extras", () => {
  it("maps the legacy single extra to a one-entry list", () => {
    expect(
      resolveRecurringExtras({ extraPerPeriod: 50, extraPerPeriodFrom: "2028-01-01" }),
    ).toEqual([{ amount: 50, from: "2028-01-01" }]);
    expect(resolveRecurringExtras({ extraMonthlyPayment: 25 })).toEqual([
      { amount: 25 },
    ]);
    expect(resolveRecurringExtras({ extraPerPeriod: 0 })).toEqual([]);
    expect(resolveRecurringExtras({})).toEqual([]);
    // A stored list wins over the legacy fields
    expect(
      resolveRecurringExtras({
        recurringExtras: [{ amount: 10 }, { amount: 0 }],
        extraPerPeriod: 50,
      }),
    ).toEqual([{ amount: 10 }]);
  });

  it("sums the extras active on a due date, bounds inclusive", () => {
    const extras = [
      { amount: 50 },
      { amount: 20, from: "2028-01-01" },
      { amount: 30, until: "2027-01-01" },
    ];
    expect(recurringExtraOn(extras, "2027-01-01")).toBe(80);
    expect(recurringExtraOn(extras, "2028-01-01")).toBe(70);
  });

  it("pays every active extra with each regular payment", () => {
    const scenario = projectLoan(base, [], {
      recurringExtras: [
        { amount: 50 },
        { amount: 20, from: "2028-01-01" },
        { amount: 30, until: "2027-01-01" },
      ],
    });
    expect(
      scenario.rows.map((r) => [r.dueDate, r.prepayment, r.closingBalance]),
    ).toEqual([
      ["2027-01-01", 80, 704.53],
      ["2028-01-01", 70, 389.51],
      ["2029-01-01", 70, 42.99],
      ["2030-01-01", 0, 0],
    ]);
  });

  it("caps the sum of the extras by the annual prepayment limit", () => {
    const scenario = projectLoan(
      { ...base, maxAnnualPrepaymentRate: 0.06 },
      [],
      { recurringExtras: [{ amount: 40 }, { amount: 30 }] },
    );
    expect(scenario.rows.map((r) => r.prepayment)).toEqual([60, 60, 60, 0]);
    expect(scenario.prepaymentsCapped).toBe(30);
  });

  it("projects a legacy extra exactly like its one-entry list", () => {
    expect(
      projectLoan(base, [], { extraPerPeriod: 50, extraPerPeriodFrom: "2028-01-01" }),
    ).toEqual(
      projectLoan(base, [], {
        recurringExtras: [{ amount: 50, from: "2028-01-01" }],
      }),
    );
  });
});

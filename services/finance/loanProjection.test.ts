import { describe, it, expect } from "vitest";

import {
  balanceBeforePayment,
  buildLoanSchedule,
  calculateLoanSchedule,
  computeNextPaymentDate,
  initialScheduledPayment,
  loanKpis,
  LOAN_TYPES,
  monthsBetweenISODates,
  nextLoanPayment,
  nextPaymentAmount,
  projectLoan,
  rederiveScheduledPayment,
  resolveGracePeriods,
  scheduledPaymentAfterEdit,
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
    expect(nextPaymentAmount(loan, [paid("2027-01-01", 250, 100)])).toBe(325);
  });

  it("INTEREST_ONLY_THEN's next payment is interest-only during grace", () => {
    const loan = loanOf("INTEREST_ONLY_THEN", { gracePeriods: 2 });
    expect(nextPaymentAmount(loan, [])).toBe(100);
    expect(
      nextPaymentAmount(loan, [
        paid("2027-01-01", 0, 100),
        paid("2028-01-01", 0, 100),
      ]),
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
      paymentBelowInterest: false,
      historyInconsistent: false,
    });
    expect(kpis.progress).toBeCloseTo(21.547, 3);
    expect(kpis.totalInterest).toBe(
      Math.round((100 + kpis.projectedInterest) * 100) / 100,
    );
  });

  it("surfaces an annuity payment that no longer covers the interest", () => {
    const loan = { ...base, annualInterestRate: 0.4 };
    expect(loanKpis(loan, [], "2026-01-01").paymentBelowInterest).toBe(true);
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
});

describe("balanceBeforePayment", () => {
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
    expect(balanceBeforePayment(loan, payments, "2026-12-01")).toBe(1000);
    expect(balanceBeforePayment(loan, payments, "2027-01-01")).toBe(784.53);
  });
});

describe("monthsBetweenISODates", () => {
  it("counts whole calendar months", () => {
    expect(monthsBetweenISODates("2026-11-11", "2027-01-01")).toBe(1);
    expect(monthsBetweenISODates("2026-11-11", "2026-12-11")).toBe(1);
    expect(monthsBetweenISODates("2027-01-01", "2026-01-01")).toBe(0);
  });
});

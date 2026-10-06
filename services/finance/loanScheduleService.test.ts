import { describe, it, expect } from "vitest";

import {
  addMonthsToISODate,
  buildLoanSchedule,
  calculateLoanAnnuityPayment,
  capPrincipalPortion,
  computeNextPaymentDate,
  getDueDate,
  settleLoanBalance,
  splitLoanPayment,
  type ScheduleLoan,
  type SchedulePayment,
} from "./loanScheduleService";

// Real production loan: the 2026-10-06 payment (due 2026-11-01) used to vanish
// from the schedule because it fell outside a ±15-day matching window.
const realLoan: ScheduleLoan = {
  loanType: "ANNUITY",
  paymentFrequency: "ANNUAL",
  originalPrincipal: 10000,
  currentBalance: 7975,
  annualInterestRate: 0.025,
  termMonths: 120,
  scheduledPayment: 1250,
  startDate: "2024-11-01",
  status: "active",
};

const realPayments: SchedulePayment[] = [
  // Newest first, as getLoanWithPayments returns them
  {
    _id: "p2",
    paymentDate: "2026-10-06",
    amount: 1250,
    principalPortion: 1025,
    interestPortion: 225,
    paymentType: "scheduled",
    createdAt: 2,
  },
  {
    _id: "p1",
    paymentDate: "2025-11-01",
    amount: 1250,
    principalPortion: 1000,
    interestPortion: 250,
    paymentType: "scheduled",
    createdAt: 1,
  },
];

const TODAY = "2026-10-06";

function payment(
  paymentDate: string,
  principalPortion: number,
  interestPortion: number,
  paymentType: SchedulePayment["paymentType"] = "scheduled",
): SchedulePayment {
  return {
    paymentDate,
    amount: principalPortion + interestPortion,
    principalPortion,
    interestPortion,
    paymentType,
  };
}

describe("date helpers", () => {
  it("adds months on calendar dates, clamping to month end", () => {
    expect(addMonthsToISODate("2024-11-01", 12)).toBe("2025-11-01");
    expect(addMonthsToISODate("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsToISODate("2023-11-15", 3)).toBe("2024-02-15");
    expect(addMonthsToISODate("2024-11-01T00:00:00.000Z", 1)).toBe(
      "2024-12-01",
    );
  });

  it("anchors due dates to the start date so month ends don't drift", () => {
    const loan = {
      startDate: "2024-01-31",
      paymentFrequency: "MONTHLY" as const,
    };
    expect(getDueDate(loan, 1)).toBe("2024-02-29");
    expect(getDueDate(loan, 2)).toBe("2024-03-31");
  });
});

describe("buildLoanSchedule — real loan", () => {
  const rows = buildLoanSchedule(realLoan, realPayments, TODAY);

  it("shows every recorded payment, covering due dates in order", () => {
    const paid = rows.filter((r) => r.status === "paid");
    expect(paid.map((r) => [r.date, r.dueDate])).toEqual([
      ["2025-11-01", "2025-11-01"],
      ["2026-10-06", "2026-11-01"],
    ]);
  });

  it("walks balances back from the current balance", () => {
    expect(rows[0]).toMatchObject({
      openingBalance: 10000,
      closingBalance: 9000,
      paymentId: "p1",
    });
    expect(rows[1]).toMatchObject({
      openingBalance: 9000,
      closingBalance: realLoan.currentBalance,
      paymentId: "p2",
    });
  });

  it("projects from the current balance starting at the next uncovered due date", () => {
    const projected = rows.filter((r) => r.status === "scheduled");
    expect(projected).toHaveLength(8);
    expect(projected.slice(0, 3)).toMatchObject([
      {
        date: "2027-11-01",
        openingBalance: 7975,
        payment: 1250,
        interest: 199.38,
        principal: 1050.62,
        closingBalance: 6924.38,
        overdue: false,
      },
      {
        date: "2028-11-01",
        interest: 173.11,
        principal: 1076.89,
        closingBalance: 5847.49,
      },
      {
        date: "2029-11-01",
        interest: 146.19,
        principal: 1103.81,
        closingBalance: 4743.68,
      },
    ]);
    expect(projected[projected.length - 1]).toMatchObject({
      date: "2034-11-01",
      payment: 46.63,
      closingBalance: 0,
    });
  });

  it("numbers rows and accumulates interest across paid and projected rows", () => {
    expect(rows.map((r) => r.period)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rows[1].cumulativeInterest).toBe(475);
    expect(rows[rows.length - 1].cumulativeInterest).toBe(1296.63);
  });

  it("reports the first uncovered due date as the next payment date", () => {
    expect(computeNextPaymentDate(realLoan, realPayments)).toBe("2027-11-01");
  });
});

describe("buildLoanSchedule — payment matching", () => {
  const monthly: ScheduleLoan = {
    loanType: "ANNUITY",
    paymentFrequency: "MONTHLY",
    originalPrincipal: 1200,
    currentBalance: 1000,
    annualInterestRate: 0,
    termMonths: 12,
    scheduledPayment: 100,
    startDate: "2026-01-01",
    status: "active",
  };

  it("keeps two payments made in the same window as consecutive periods", () => {
    const payments = [
      payment("2026-02-01", 100, 0),
      payment("2026-02-03", 100, 0),
    ];
    const rows = buildLoanSchedule(monthly, payments, "2026-02-03");
    expect(rows.slice(0, 2).map((r) => r.dueDate)).toEqual([
      "2026-02-01",
      "2026-03-01",
    ]);
    expect(rows[2]).toMatchObject({ status: "scheduled", date: "2026-04-01" });
  });

  it("treats extra payments as extra rows that don't cover a due date", () => {
    const payments = [
      payment("2026-02-01", 100, 0),
      payment("2026-02-15", 100, 0, "additional_principal"),
    ];
    const rows = buildLoanSchedule(monthly, payments, "2026-02-15");
    expect(rows[1]).toMatchObject({
      status: "extra",
      dueDate: undefined,
      openingBalance: 1100,
      closingBalance: 1000,
    });
    expect(rows[2].date).toBe("2026-03-01");
    expect(computeNextPaymentDate(monthly, payments)).toBe("2026-03-01");
  });

  it("lets partial payments share a due date until they add up to a full payment", () => {
    const loan = { ...monthly, currentBalance: 1100 };
    const payments = [
      payment("2026-02-01", 50, 0, "partial"),
      payment("2026-02-10", 50, 0, "partial"),
    ];
    const rows = buildLoanSchedule(loan, payments, "2026-02-10");
    expect(rows.slice(0, 2).map((r) => [r.status, r.dueDate])).toEqual([
      ["paid", "2026-02-01"],
      ["paid", "2026-02-01"],
    ]);
    expect(rows[2]).toMatchObject({ status: "scheduled", date: "2026-03-01" });
    expect(computeNextPaymentDate(loan, payments)).toBe("2026-03-01");
  });

  it("completes a partially paid due date with the next regular payment", () => {
    const loan = { ...monthly, currentBalance: 1100 };
    const payments = [
      payment("2026-02-01", 30, 0, "partial"),
      payment("2026-02-20", 70, 0, "late"),
    ];
    const rows = buildLoanSchedule(loan, payments, "2026-02-20");
    expect(rows.slice(0, 2).map((r) => r.dueDate)).toEqual([
      "2026-02-01",
      "2026-02-01",
    ]);
    expect(computeNextPaymentDate(loan, payments)).toBe("2026-03-01");
  });

  it("leaves a due date open after a single partial payment", () => {
    const loan = { ...monthly, currentBalance: 1150 };
    const payments = [payment("2026-02-01", 50, 0, "partial")];
    const rows = buildLoanSchedule(loan, payments, "2026-02-10");
    expect(rows[1]).toMatchObject({
      status: "scheduled",
      date: "2026-02-01",
      overdue: true,
    });
    expect(computeNextPaymentDate(loan, payments)).toBe("2026-02-01");
  });

  it("flags uncovered due dates before today as overdue", () => {
    const rows = buildLoanSchedule(monthly, [], "2026-03-10");
    expect(rows.slice(0, 3).map((r) => [r.date, r.overdue])).toEqual([
      ["2026-02-01", true],
      ["2026-03-01", true],
      ["2026-04-01", false],
    ]);
  });

  it("shows a final payoff and projects nothing for a paid-off loan", () => {
    const loan = { ...monthly, currentBalance: 0, status: "paid_off" };
    const payments = [
      payment("2026-02-01", 100, 0),
      payment("2026-02-20", 1000, 0, "final"),
    ];
    const rows = buildLoanSchedule(loan, payments, "2026-03-01");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      status: "paid",
      paymentType: "final",
      dueDate: "2026-03-01",
      openingBalance: 1000,
      closingBalance: 0,
    });
    expect(computeNextPaymentDate(loan, payments)).toBeNull();
  });

  it("keeps a payoff prepayment extra, so it never covers a due date", () => {
    const paidOff = { ...monthly, currentBalance: 0, status: "paid_off" };
    const payments = [
      payment("2026-02-01", 100, 0),
      payment("2026-02-20", 1100, 0, "prepayment"),
    ];
    const rows = buildLoanSchedule(paidOff, payments, "2026-03-01");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      status: "extra",
      dueDate: undefined,
      openingBalance: 1100,
      closingBalance: 0,
    });

    // Reopened by deleting the regular payment: its due date is open again
    const reopened = { ...monthly, currentBalance: 100, status: "active" };
    expect(computeNextPaymentDate(reopened, [payments[1]])).toBe("2026-02-01");
  });
});

describe("buildLoanSchedule — loan types", () => {
  const base: ScheduleLoan = {
    loanType: "ANNUITY",
    paymentFrequency: "ANNUAL",
    originalPrincipal: 1000,
    currentBalance: 1000,
    annualInterestRate: 0.1,
    termMonths: 36,
    scheduledPayment: 0,
    startDate: "2026-01-01",
    status: "active",
  };

  it("BULLET pays interest only, then the whole principal at the end", () => {
    const rows = buildLoanSchedule(
      { ...base, loanType: "BULLET" },
      [],
      "2026-01-01",
    );
    expect(rows.map((r) => [r.date, r.principal, r.interest])).toEqual([
      ["2027-01-01", 0, 100],
      ["2028-01-01", 0, 100],
      ["2029-01-01", 1000, 100],
    ]);
  });

  it("CONSTANT_PRINCIPAL repays originalPrincipal / totalPeriods each period", () => {
    const rows = buildLoanSchedule(
      { ...base, loanType: "CONSTANT_PRINCIPAL", currentBalance: 600 },
      [payment("2027-01-01", 400, 100)],
      "2027-01-02",
    );
    // 1000 / 3 per period; the final period settles the rest
    expect(rows.slice(1).map((r) => r.principal)).toEqual([333.33, 266.67]);
    expect(rows[rows.length - 1].closingBalance).toBe(0);
  });

  it("INTEREST_ONLY_THEN pays interest during grace, then amortizes to zero", () => {
    const rows = buildLoanSchedule(
      { ...base, loanType: "INTEREST_ONLY_THEN", gracePeriods: 1 },
      [],
      "2026-01-01",
    );
    expect(rows[0]).toMatchObject({ principal: 0, interest: 100 });
    // Annuity over the remaining 2 periods: 1000 · 0.1 · 1.1² / (1.1² − 1)
    expect(rows[1].payment).toBe(576.19);
    expect(rows[2].closingBalance).toBe(0);
  });

  it("settles a residual balance at the final period of the term", () => {
    const rows = buildLoanSchedule(
      { ...base, scheduledPayment: 200 },
      [],
      "2026-01-01",
    );
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ date: "2029-01-01", closingBalance: 0 });
    expect(rows[2].payment).toBeGreaterThan(200);
  });

  it("past the term, the remaining balance is due one period after the last paid one", () => {
    const loan = { ...base, currentBalance: 50, scheduledPayment: 400 };
    const payments = [
      payment("2027-01-01", 300, 100),
      payment("2028-01-01", 330, 70),
      payment("2029-01-01", 320, 80),
    ];
    const rows = buildLoanSchedule(loan, payments, "2029-06-01");
    expect(rows.slice(3)).toMatchObject([
      {
        date: "2030-01-01",
        openingBalance: 50,
        payment: 55,
        closingBalance: 0,
      },
    ]);
    expect(computeNextPaymentDate(loan, payments)).toBe("2030-01-01");
  });
});

describe("buildLoanSchedule — overpaid final payment", () => {
  const paidOff: ScheduleLoan = {
    ...realLoan,
    currentBalance: 0,
    status: "paid_off",
  };

  // Replays the real loan with the dialog's automatic split, paying the full
  // scheduled 1250 even in the last period where only 45.49 is left
  function replay(amountFor: (scheduledRowPayment: number) => number) {
    let loan: ScheduleLoan = { ...realLoan, currentBalance: 10000 };
    const payments: SchedulePayment[] = [];
    for (let k = 1; k <= 10; k++) {
      const next = buildLoanSchedule(loan, payments, TODAY).find(
        (r) => r.status === "scheduled",
      );
      if (!next) break;
      const amount = amountFor(next.payment);
      const split = splitLoanPayment(loan, amount, "scheduled");
      payments.push({
        paymentDate: next.date,
        amount,
        ...split,
        paymentType: "scheduled",
        createdAt: k,
      });
      loan = {
        ...loan,
        currentBalance: settleLoanBalance(
          loan.currentBalance - split.principalPortion,
        ),
      };
    }
    return { loan, payments };
  }

  it("caps the last period's principal at the remaining balance", () => {
    const { loan, payments } = replay(() => 1250);
    expect(payments).toHaveLength(10);
    expect(payments[9]).toMatchObject({
      principalPortion: 45.49,
      interestPortion: 1.14,
    });
    expect(loan.currentBalance).toBe(0);

    const rows = buildLoanSchedule(loan, payments, "2034-11-02");
    expect(rows[0].openingBalance).toBe(10000);
    expect(rows[rows.length - 1].closingBalance).toBe(0);
    expect(rows[rows.length - 1].cumulativePrincipal).toBe(10000);
  });

  it("settles the balance to exactly 0 when paying what the schedule shows", () => {
    const { loan, payments } = replay((scheduled) => scheduled);
    expect(payments[9].amount).toBe(46.63);
    expect(loan.currentBalance).toBe(0);
    expect(computeNextPaymentDate(loan, payments)).toBeNull();
  });

  it("doesn't inflate the history for an overshooting payment already stored", () => {
    const { payments } = replay(() => 1250);
    // Stored before principal was capped: 1250 − 1.14 interest
    const stored = payments.map((p, i) =>
      i === 9 ? { ...p, principalPortion: 1248.86 } : p,
    );
    const rows = buildLoanSchedule(paidOff, stored, "2034-11-02");
    expect(rows[0].openingBalance).toBe(10000);
    expect(rows[9]).toMatchObject({
      openingBalance: 45.49,
      principal: 45.49,
      closingBalance: 0,
    });
  });
});

describe("settleLoanBalance", () => {
  it("rounds to cents and snaps floating-point leftovers to 0", () => {
    expect(settleLoanBalance(2.34e-13)).toBe(0);
    expect(settleLoanBalance(0.01)).toBe(0);
    expect(settleLoanBalance(-5)).toBe(0);
    expect(settleLoanBalance(3612.2700000000004)).toBe(3612.27);
  });

  it("settles a long monthly annuity to exactly 0", () => {
    const termMonths = 360;
    let loan: ScheduleLoan = {
      loanType: "ANNUITY",
      paymentFrequency: "MONTHLY",
      originalPrincipal: 300000,
      currentBalance: 300000,
      annualInterestRate: 0.035,
      termMonths,
      scheduledPayment: calculateLoanAnnuityPayment(
        300000,
        0.035,
        termMonths,
        "MONTHLY",
      ),
      startDate: "2026-01-01",
      status: "active",
    };
    const projected = buildLoanSchedule(loan, [], "2026-01-01");
    expect(projected).toHaveLength(termMonths);

    for (const row of projected) {
      const split = splitLoanPayment(loan, row.payment, "scheduled");
      loan = {
        ...loan,
        currentBalance: settleLoanBalance(
          loan.currentBalance - split.principalPortion,
        ),
      };
    }
    expect(loan.currentBalance).toBe(0);
  });
});

describe("splitLoanPayment", () => {
  it("charges one period of interest on the current balance", () => {
    expect(splitLoanPayment(realLoan, 1250, "scheduled")).toEqual({
      principalPortion: 1050.62,
      interestPortion: 199.38,
    });
  });

  it("puts extra payments entirely on principal", () => {
    expect(splitLoanPayment(realLoan, 500, "prepayment")).toEqual({
      principalPortion: 500,
      interestPortion: 0,
    });
  });

  it("never splits more interest than was paid", () => {
    expect(splitLoanPayment(realLoan, 100, "partial")).toEqual({
      principalPortion: 0,
      interestPortion: 100,
    });
  });

  it("caps principal at the remaining balance", () => {
    const lastPeriod = { ...realLoan, currentBalance: 45.49 };
    expect(splitLoanPayment(lastPeriod, 1250, "scheduled")).toEqual({
      principalPortion: 45.49,
      interestPortion: 1.14,
    });
    expect(splitLoanPayment(lastPeriod, 500, "prepayment")).toEqual({
      principalPortion: 45.49,
      interestPortion: 0,
    });
  });

  it("keeps an entered portion and puts the rest of the amount in the other", () => {
    expect(
      splitLoanPayment(realLoan, 1250, "scheduled", { principal: 1000 }),
    ).toEqual({ principalPortion: 1000, interestPortion: 250 });
    expect(
      splitLoanPayment(realLoan, 1250, "scheduled", { interest: 100 }),
    ).toEqual({ principalPortion: 1150, interestPortion: 100 });
    expect(
      splitLoanPayment(realLoan, 1250, "scheduled", {
        principal: 1000,
        interest: 200,
      }),
    ).toEqual({ principalPortion: 1000, interestPortion: 200 });
    expect(
      splitLoanPayment(realLoan, 1250, "scheduled", {
        principal: NaN,
        interest: NaN,
      }),
    ).toEqual({ principalPortion: 1050.62, interestPortion: 199.38 });
  });

  it("never lets an entered portion exceed the amount", () => {
    expect(
      splitLoanPayment(realLoan, 1250, "scheduled", { principal: 2000 }),
    ).toEqual({ principalPortion: 1250, interestPortion: 0 });
    expect(
      splitLoanPayment(realLoan, 1250, "scheduled", { interest: 2000 }),
    ).toEqual({ principalPortion: 0, interestPortion: 1250 });
  });
});

describe("capPrincipalPortion", () => {
  it("limits principal to the balance before the payment", () => {
    expect(capPrincipalPortion(45.49, 1248.86)).toBe(45.49);
    expect(capPrincipalPortion(1000, 250)).toBe(250);
    expect(capPrincipalPortion(1000, -5)).toBe(0);
    expect(capPrincipalPortion(-1, 100)).toBe(0);
  });
});

describe("calculateLoanAnnuityPayment", () => {
  it("matches the PMT formula over the whole term", () => {
    // 10000 at 2.5% over 10 annual periods
    expect(calculateLoanAnnuityPayment(10000, 0.025, 120, "ANNUAL")).toBe(
      1142.59,
    );
  });
});

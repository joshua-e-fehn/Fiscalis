import { describe, expect, it } from "vitest";

import { availableSince, replayPool, type PoolCharge } from "./pool";

const charge = (id: string, date: string, startDate: string, amount: number, at = 0): PoolCharge => ({
  id,
  date,
  at,
  startDate,
  amount,
});

describe("replayPool", () => {
  it("keeps positive lots with their dates", () => {
    const state = replayPool(
      [
        { date: "2026-01-02", amount: 100 },
        { date: "2026-01-01", amount: 50 },
      ],
      [],
    );
    expect(state.lots).toEqual([
      { date: "2026-01-01", amount: 50 },
      { date: "2026-01-02", amount: 100 },
    ]);
    expect(state.debt).toBe(0);
  });

  it("only counts lots on or after a goal's start", () => {
    const state = replayPool(
      [
        { date: "2026-01-01", amount: 1000 },
        { date: "2026-03-01", amount: 500 },
      ],
      [],
    );
    expect(availableSince(state, "2026-01-01")).toBe(1500);
    expect(availableSince(state, "2026-02-01")).toBe(500);
    expect(availableSince(state, "2026-03-01")).toBe(500);
    expect(availableSince(state, "2026-03-02")).toBe(0);
  });

  it("takes withdrawals from the newest lots first", () => {
    const state = replayPool(
      [
        { date: "2026-01-01", amount: 1000 },
        { date: "2026-02-01", amount: 300 },
        { date: "2026-03-01", amount: -400 },
      ],
      [],
    );
    expect(state.lots).toEqual([{ date: "2026-01-01", amount: 900 }]);
  });

  it("turns a withdrawal beyond the pool into debt that later lots repay first", () => {
    const state = replayPool(
      [
        { date: "2026-01-01", amount: 100 },
        { date: "2026-01-02", amount: -250 },
        { date: "2026-01-03", amount: 100 },
        { date: "2026-01-04", amount: 80 },
      ],
      [],
    );
    expect(state.lots).toEqual([{ date: "2026-01-04", amount: 30 }]);
    expect(state.debt).toBe(0);
  });

  it("draws a purchase from the oldest eligible lots", () => {
    const state = replayPool(
      [
        { date: "2026-01-01", amount: 1000 }, // before the goal: untouched
        { date: "2026-02-01", amount: 600 },
        { date: "2026-03-01", amount: 600 },
      ],
      [charge("car", "2026-03-05", "2026-01-15", 1000)],
    );
    expect(state.lots).toEqual([
      { date: "2026-01-01", amount: 1000 },
      { date: "2026-03-01", amount: 200 },
    ]);
    expect(state.charges.get("car")).toEqual({ drawn: 1000, shortfall: 0 });
  });

  it("counts a day's lots before that day's purchases", () => {
    const state = replayPool(
      [{ date: "2026-01-05", amount: 500 }],
      [charge("trip", "2026-01-05", "2026-01-05", 500)],
    );
    expect(state.charges.get("trip")).toEqual({ drawn: 500, shortfall: 0 });
  });

  it("orders purchases of one day by time", () => {
    const state = replayPool(
      [{ date: "2026-01-01", amount: 500 }],
      [
        charge("second", "2026-01-02", "2026-01-01", 400, 2),
        charge("first", "2026-01-02", "2026-01-01", 400, 1),
      ],
    );
    expect(state.charges.get("first")).toEqual({ drawn: 400, shortfall: 0 });
    expect(state.charges.get("second")).toEqual({ drawn: 100, shortfall: 300 });
    expect(state.debt).toBe(300);
  });

  it("makes an early purchase's shortfall debt that blocks later goals until repaid", () => {
    const state = replayPool(
      [
        { date: "2026-01-01", amount: 200 },
        { date: "2026-02-01", amount: 500 },
        { date: "2026-03-01", amount: 500 },
      ],
      [charge("early", "2026-01-10", "2026-01-01", 1000)],
    );
    // 200 drawn, 800 owed; February's 500 and 300 of March's repay it
    expect(state.charges.get("early")).toEqual({ drawn: 200, shortfall: 800 });
    expect(state.lots).toEqual([{ date: "2026-03-01", amount: 200 }]);
    expect(state.debt).toBe(0);
  });

  it("lets a loss reduce every open goal's pool", () => {
    const state = replayPool(
      [
        { date: "2026-01-01", amount: 300 },
        { date: "2026-02-01", amount: 300 },
        { date: "2026-02-02", amount: -450 },
      ],
      [],
    );
    expect(availableSince(state, "2026-01-01")).toBe(150);
    expect(availableSince(state, "2026-02-01")).toBe(0);
  });
});

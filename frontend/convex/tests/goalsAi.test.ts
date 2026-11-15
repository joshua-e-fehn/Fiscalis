/**
 * The goal rule assistant (ENG-260): off without configuration, the
 * model's reply validated against the caller's own trackers, one repair
 * round for an invalid reply, and only the rule text and tracker names
 * sent.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { OWNER, newTest, seedUser } from "./setup.helpers";

function reply(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function owner() {
  const t = newTest();
  await seedUser(t, OWNER);
  return t.withIdentity({ subject: OWNER });
}

function configure() {
  vi.stubEnv("GOALS_LLM_BASE_URL", "https://llm.test/");
  vi.stubEnv("GOALS_LLM_API_KEY", "test-key");
  vi.stubEnv("GOALS_LLM_MODEL", "test-model");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("goalsAi", () => {
  it("is unavailable without configuration", async () => {
    const client = await owner();
    expect(await client.action(api.goalsAi.available, {})).toBe(false);
    expect(
      await client.action(api.goalsAi.draftRule, { text: "invest 3x", currency: "EUR", language: "English" }),
    ).toEqual({ ok: false, reason: "unavailable" });
  });

  it("drafts a rule naming the caller's tracker, after one repair", async () => {
    configure();
    const client = await owner();
    const trackerId = (await client.query(api.goals.list, { today: "2026-11-15" }))!.trackers.find(
      (t) => t.name === "Workouts",
    )!._id;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply("Sure, what should I do?"))
      .mockResolvedValueOnce(
        reply(
          JSON.stringify({
            rule: {
              kind: "all",
              children: [
                { kind: "invested", target: { kind: "priceMultiple", multiple: 3 } },
                { kind: "counter", trackerId, count: 150 },
              ],
            },
            summary: "Invest 3x and work out 150 times.",
            newTrackers: [],
            unsupported: [],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.action(api.goalsAi.draftRule, {
      text: "car after investing 3x its price and 150 workouts",
      currency: "EUR",
      language: "English",
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://llm.test/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe("test-model");
    expect(sent.messages[0].content).toContain("Workouts");
    expect(sent.messages[0].content).not.toMatch(/Girokonto|Tagesgeld|netWorth":/);
  });

  it("refuses text that is too short", async () => {
    configure();
    const client = await owner();
    expect(
      await client.action(api.goalsAi.draftRule, { text: " x ", currency: "EUR", language: "English" }),
    ).toEqual({ ok: false, reason: "invalidText" });
  });

  it("gives up after a second invalid reply", async () => {
    configure();
    const client = await owner();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => reply("no")));
    expect(
      await client.action(api.goalsAi.draftRule, { text: "invest a lot", currency: "EUR", language: "English" }),
    ).toEqual({ ok: false, reason: "failed" });
  });
});

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import ai from "../apps/api/dist/ai.js";

test("OpenAI adapter sends a strict schema, validates output and handles provider refusal", async (t) => {
  const fixture = {
    summary: "Practice requested",
    themes: [
      {
        title: "Practice",
        description: "More exercises requested",
        sentiment: "NEUTRAL",
        confidence: null,
        suggestedAction: "Add exercises",
        refs: ["1"],
      },
    ],
  };
  let refuse = false;
  let received;
  const server = createServer(async (req, res) => {
    let json = "";
    for await (const chunk of req) json += chunk;
    received = JSON.parse(json);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: refuse
              ? { role: "assistant", content: null, refusal: "Unavailable" }
              : { role: "assistant", content: JSON.stringify(fixture) },
          },
        ],
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const settings = {
    OPENAI_API_KEY: randomBytes(24).toString("hex"),
    OPENAI_BASE_URL: "http://127.0.0.1:" + server.address().port + "/v1",
    ALLOW_EXTERNAL_AI: "true",
  };
  for (const [key, value] of Object.entries(settings)) {
    const prior = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    });
  }
  const provider = new ai.OpenAIProvider();
  const input = [{ ref: "1", text: "Нужно больше упражнений" }];
  assert.deepEqual(await provider.analyze(input), fixture);
  assert.equal(received.response_format.type, "json_schema");
  assert.equal(received.response_format.json_schema.strict, true);
  assert.equal(received.store, false);
  assert.deepEqual(JSON.parse(received.messages.at(-1).content), input);
  refuse = true;
  await assert.rejects(provider.analyze(input), /Incomplete analysis/);
});

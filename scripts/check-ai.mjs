import { OpenAIProvider } from "../apps/api/dist/ai.js";

if (!process.env.OPENAI_API_KEY || process.env.ALLOW_EXTERNAL_AI !== "true") {
  console.error(
    "Set OPENAI_API_KEY and ALLOW_EXTERNAL_AI=true to run the live provider check.",
  );
  process.exitCode = 1;
} else {
  const synthetic = [
    { ref: "1", text: "More worked exercises before the exam would help." },
    { ref: "2", text: "Перед экзаменом хочется больше практических задач." },
    { ref: "3", text: "The lab Wi-Fi disconnects during evening classes." },
  ];
  try {
    const result = await new OpenAIProvider().analyze(synthetic);
    console.log(
      "Validated live response for three synthetic comments. Themes:",
      result.themes.length,
    );
    for (const theme of result.themes)
      console.log(theme.title, theme.sentiment, theme.refs.join(", "));
  } catch {
    console.error(
      "Live check failed. Verify the configured model, credentials, outbound access and provider quota.",
    );
    process.exitCode = 1;
  }
}

const webhooks: Record<string, string> = JSON.parse(
  process.env.DISCORD_WEBHOOKS || "{}"
);

const APP_URL = "https://pood.nakkipii.lol";

export async function notifyDiscord(
  group: string,
  name: string
): Promise<void> {
  const url = webhooks[group];
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `New photo added in ${APP_URL}/${group} by ${name}`,
      }),
    });
  } catch {
    // Fire-and-forget — don't break the upload if Discord is down
  }
}

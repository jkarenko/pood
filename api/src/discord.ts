const webhooks: Record<string, string> = JSON.parse(
  process.env.DISCORD_WEBHOOKS || "{}"
);

export async function notifyDiscord(
  group: string,
  message: string
): Promise<void> {
  const url = webhooks[group];
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
  } catch {
    // Fire-and-forget — don't break the upload if Discord is down
  }
}

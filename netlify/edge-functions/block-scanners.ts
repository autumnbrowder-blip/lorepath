const blockedUserAgents = [
  // AI training & aggressive crawlers
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "CCBot",
  "Amazonbot",
  "FacebookBot",
  "Meta-ExternalAgent",
  "Google-Extended",
  "GoogleOther",
  "Applebot-Extended",
  "YouBot",
  "Diffbot",
  "cohere-ai",
  "ImagesiftBot",
  "omgili",
  "Omgilibot",
  // Common SEO / scrapers
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "PetalBot",
  "DataForSeoBot",
];

function isBlockedUserAgent(ua: string | null): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return blockedUserAgents.some((bot) => lower.includes(bot.toLowerCase()));
}

export default async (request: Request, context: any) => {
  const ua = request.headers.get("user-agent");

  if (isBlockedUserAgent(ua)) {
    return new Response("Forbidden", { status: 403 });
  }

  return context.next();
};

export const config = {
  path: "/*",
};

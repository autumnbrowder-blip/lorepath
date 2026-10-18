import type { Config, Context } from "@netlify/edge-functions";

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

const blockedPaths = [
  "/*.php",
  "/wp-*",
  "/xmlrpc.php",
  "/autodiscover/*",
  "/.env",
  "/.git/*",
  "/wp-admin/*",
  "/wp-login.php",
  "/administrator/*",
  "/phpmyadmin/*",
];

function isBlockedUserAgent(ua: string | null): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return blockedUserAgents.some((bot) => lower.includes(bot.toLowerCase()));
}

export default async (request: Request, context: Context) => {
  const ua = request.headers.get("user-agent");

  // Block known bots/crawlers by user-agent
  if (isBlockedUserAgent(ua)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Let everything else through
  return context.next();
};

export const config: Config = {
  path: "/*", // run on all paths so we can check user-agent
};

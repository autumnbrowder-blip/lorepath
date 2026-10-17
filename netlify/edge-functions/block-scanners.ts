import type { Config } from "@netlify/edge-functions";

export default async () => {
  return new Response("Not Found", { status: 404 });
};

export const config: Config = {
  path: [
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
  ],
};

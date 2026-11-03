// Pegasus: retired multilingual routes. Return users and crawlers to the
// matching canonical English URL; no dictionary loading, API calls or reporting.
import type { Config } from "https://edge.netlify.com";

export default (request: Request): Response | undefined => {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/(ar|zh|ru|es|fr)(?=\/|$)/i);
  if (!match) return;

  url.pathname = url.pathname.slice(match[0].length) || "/";
  url.searchParams.delete("lang");
  return Response.redirect(url.toString(), 301);
};

export const config: Config = {
  path: ["/ar", "/ar/*", "/zh", "/zh/*", "/ru", "/ru/*", "/es", "/es/*", "/fr", "/fr/*"],
};

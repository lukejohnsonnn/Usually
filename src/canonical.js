// One public address: www and the *.workers.dev address redirect to it, so
// search engines index a single site and players keep one identity.
export const CANONICAL_HOST = "honeydle.com";

/** The permanent redirect for a non-canonical host, or null. */
export function canonicalRedirect(request) {
  const url = new URL(request.url);
  if (url.hostname === `www.${CANONICAL_HOST}` || url.hostname.endsWith(".workers.dev")) {
    url.hostname = CANONICAL_HOST;
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  }
  return null;
}

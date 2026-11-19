// Netlify : robots.txt, sitemap.xml et balises de partage avec l'adresse du site
import { seoFile, absolutize } from "../../lib/seo.js";

export default async (request, context) => {
  const url = new URL(request.url);
  const origin = url.origin;
  const f = seoFile(url.pathname, origin);
  if (f) return new Response(f.body, { headers: { "Content-Type": f.type, "Cache-Control": "public, max-age=3600" } });
  const res = await context.next();
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
  const html = absolutize(await res.text(), origin);
  const headers = new Headers(res.headers); headers.delete("content-length");
  return new Response(html, { status: res.status, headers });
};

export const config = { path: ["/", "/index.html", "/robots.txt", "/sitemap.xml"] };

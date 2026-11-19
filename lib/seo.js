// robots.txt et sitemap.xml générés avec la vraie adresse du site (Netlify ou Vercel)
export function seoFile(path, origin) {
  if (path === "/robots.txt") {
    return { type: "text/plain; charset=utf-8", body: `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n` };
  }
  if (path === "/sitemap.xml") {
    const day = new Date().toISOString().slice(0, 10);
    return { type: "application/xml; charset=utf-8", body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${origin}/</loc><lastmod>${day}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n` };
  }
  return null;
}
// Rend absolues les adresses d'image de partage (WhatsApp, Discord, X… l'exigent) et ajoute l'adresse officielle
export function absolutize(html, origin) {
  return html
    .replace(/content="\/og-image\.png"/g, `content="${origin}/og-image.png"`)
    .replace("</title>", `</title>\n<link rel="canonical" href="${origin}/">\n<meta property="og:url" content="${origin}/">`);
}

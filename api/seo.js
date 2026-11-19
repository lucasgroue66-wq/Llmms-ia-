// Vercel : robots.txt et sitemap.xml (via les réécritures de vercel.json)
import { seoFile } from "../lib/seo.js";

export default function handler(req, res) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const origin = `${proto}://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const f = seoFile(req.query?.f === "robots" ? "/robots.txt" : "/sitemap.xml", origin);
  res.setHeader("Content-Type", f.type);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(f.body);
}

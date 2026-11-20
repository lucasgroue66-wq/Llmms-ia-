// Vercel : /api/avatar — tête du skin Roblox de LLMMS (Llmms99587), utilisée comme icône du modèle « Propria ».
const USERNAME = process.env.ROBLOX_AVATAR_USER || "Llmms99587";
let cache = null, cacheAt = 0;

export default async function handler(req, res) {
  try {
    if (!cache || Date.now() - cacheAt > 6 * 3600e3) {
      const u = await fetch("https://users.roblox.com/v1/usernames/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usernames: [USERNAME], excludeBannedUsers: false }) });
      const id = (await u.json())?.data?.[0]?.id;
      if (!id) throw new Error("joueur introuvable");
      const t = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=420x420&format=Png&isCircular=false`);
      const url = (await t.json())?.data?.[0]?.imageUrl;
      if (!url) throw new Error("image indisponible");
      const img = await fetch(url);
      if (!img.ok) throw new Error("image " + img.status);
      cache = { type: img.headers.get("content-type") || "image/png", body: Buffer.from(await img.arrayBuffer()) };
      cacheAt = Date.now();
    }
    res.setHeader("Content-Type", cache.type);
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).send(cache.body);
  } catch {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.redirect(302, "/favicon.svg");
  }
}

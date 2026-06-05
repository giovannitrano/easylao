const https = require("https");

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000,
    }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { text } = req.query || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Missing text", translated: "" });
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const raw = await fetchRaw(url);
    const json = JSON.parse(raw);
    const translated = json[0].map(part => part[0]).join("");
    return res.status(200).json({ translated });
  } catch (err) {
    return res.status(200).json({ translated: text, error: err.message });
  }
};

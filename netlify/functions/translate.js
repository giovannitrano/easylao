const https = require("https");

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: HEADERS, body: "" };
  }

  const { text } = event.queryStringParameters || {};
  if (!text || !text.trim()) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Missing text", translated: "" }) };
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const raw = await fetchRaw(url);
    const json = JSON.parse(raw);
    // json[0] = array of [translatedChunk, originalChunk, ...]
    const translated = json[0].map(part => part[0]).join("");
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ translated }),
    };
  } catch (err) {
    // Return original text so caller always gets something
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ translated: text, error: err.message }),
    };
  }
};

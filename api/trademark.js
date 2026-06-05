const https = require("https");

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://online.dip.gov.la/",
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHtml(res.headers.location).then(resolve).catch(reject);
      }
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function stripTags(html) {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFields(html) {
  const fields = {};

  const apnaMatch = html.match(/id="apnaDiv"([\s\S]{0,3000}?)(?:id="[^"]*accordion|<\/section|<div id="id2)/);
  if (apnaMatch) {
    const apnaHtml = apnaMatch[1];
    const aMatch = apnaHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    if (aMatch) {
      fields.ownerName = stripTags(aMatch[1]).trim();
    }
    const afterA = apnaHtml.replace(/[\s\S]*?<\/a>/, "");
    const addrRaw = afterA.match(/^([\s\S]*?)(?:<\/div>|<a |<div class="row)/);
    if (addrRaw) {
      const addr = stripTags(addrRaw[1]).trim();
      if (addr.length > 3) fields.ownerAddress = addr;
    }
    if (!fields.ownerName) {
      const allText = stripTags(apnaHtml);
      const firstLine = allText.split(/[,\n]/)[0].trim();
      if (firstLine) fields.ownerName = firstLine;
    }
  }

  const accordionMatch = html.match(/id="accordion-1a"([\s\S]{0,10000}?)(?:id="accordion-2|id="id2|<\/section)/);
  const section = accordionMatch ? accordionMatch[1] : html;

  const rowPattern = /<div[^>]*col-md-3[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*col-(?:xs-7|md-9)[^>]*product-form-details[^>]*>([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = rowPattern.exec(section)) !== null) {
    const label = stripTags(m[1]).trim().toLowerCase().replace(/[:\s]+$/, "");
    const value = stripTags(m[2]).trim();
    if (!label || !value || value.length < 1) continue;

    if (/trademark.name|mark.name|^name$/.test(label)) {
      fields.trademarkName = fields.trademarkName || value;
    } else if (/applicant|owner|holder/.test(label) && !fields.ownerName) {
      fields.ownerName = value;
    } else if (/filing.date|application.date|date.filed/.test(label)) {
      fields.filingDate = fields.filingDate || value;
    } else if (/registr.*date|date.*registr/.test(label)) {
      fields.registrationDate = fields.registrationDate || value;
    } else if (/expir|renewal/.test(label)) {
      fields.expiryDate = fields.expiryDate || value;
    } else if (/^status/.test(label)) {
      fields.status = fields.status || value;
    } else if (/class/.test(label)) {
      fields.classes = fields.classes || value;
    } else if (/goods|services|description/.test(label)) {
      fields.goods = fields.goods || value;
    } else if (/registr.*no|reg.*no|app.*no/.test(label)) {
      fields.registrationNumber = fields.registrationNumber || value;
    } else if (/address|nationality|country/.test(label)) {
      fields.ownerAddress = fields.ownerAddress || value;
    }
  }

  if (!fields.trademarkName) {
    const tmMatch = section.match(/class="[^"]*product-form-details[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (tmMatch) {
      const val = stripTags(tmMatch[1]).trim();
      if (val) fields.trademarkName = val;
    }
  }

  if (!fields.trademarkName) {
    for (const row of section.matchAll(/class="[^"]*product-form-details[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)) {
      const value = stripTags(row[1]).trim();
      if (value && value.length > 1) { fields.trademarkName = value; break; }
    }
  }

  if (!fields.registrationNumber) {
    const rn = html.match(/\bLA\d{4,6}\b/);
    if (rn) fields.registrationNumber = rn[0];
  }

  return fields;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const params = req.query || {};
  const raw = (params.id || "").replace(/\D/g, "");

  if (!raw) {
    return res.status(400).json({ error: "Missing trademark number" });
  }

  const pageUrl = `https://online.dip.gov.la/wopublish-search/public/detail/trademarks?id=LA${raw}`;
  const logoUrl = `https://online.dip.gov.la/wopublish-search/service/trademarks/application/LA${raw}/logo?noLogo=true`;

  try {
    const { status, body } = await fetchHtml(pageUrl);

    if (status === 403 || status === 401) {
      return res.status(200).json({ blocked: true, url: pageUrl, logoUrl });
    }
    if (status === 404 || body.length < 200) {
      return res.status(200).json({ notFound: true, url: pageUrl });
    }

    const visibleText = stripTags(body);
    const notFoundSignals = ["not found", "no record", "ບໍ່ພົບ", "does not exist", "no results"];
    if (notFoundSignals.some(s => visibleText.toLowerCase().includes(s)) && visibleText.length < 500) {
      return res.status(200).json({ notFound: true, url: pageUrl });
    }

    const fields = extractFields(body);
    const apnaDebug = (body.match(/id="apnaDiv"[\s\S]{0,500}/) || ["not found"])[0].substring(0, 500);

    return res.status(200).json({
      success: true,
      url: pageUrl,
      trademarkNumber: "LA" + raw,
      fields,
      logoUrl,
      httpStatus: status,
      apnaDebug,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, url: pageUrl });
  }
};

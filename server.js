const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";
const CACHE_DIR = path.join(__dirname, "preview-cache");
const PUBLIC_BASE_URL = process.env.PREVIEW_PUBLIC_URL || `http://localhost:${PORT}`;

let browserPromise = null;

app.use("/preview-cache", express.static(CACHE_DIR, {
  setHeaders: (res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
  }
}));

const normalizeUrl = (input = "") => {
  const trimmed = String(input).trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    if (/^www\.[^\s"'<>]+$/i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return "";
  }
};

const resolveUrl = (maybeUrl, baseUrl) => {
  if (!maybeUrl) return "";
  try {
    return new URL(maybeUrl, baseUrl).href;
  } catch {
    return "";
  }
};

const readMeta = (document, selectors) => {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const value = el?.getAttribute("content") || el?.getAttribute("value") || el?.textContent || "";
    if (value && value.trim()) return value.trim();
  }
  return "";
};

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
};

const generateScreenshotPreview = async (targetUrl, cacheKey, requestBaseUrl) => {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const fileName = `${cacheKey}.jpg`;
  const filePath = path.join(CACHE_DIR, fileName);
  const baseUrl = requestBaseUrl || PUBLIC_BASE_URL;
  const publicUrl = `${baseUrl}/preview-cache/${fileName}`;

  try {
    await fs.access(filePath);
    return publicUrl;
  } catch {
    // continue and generate
  }

  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    extraHTTPHeaders: {
      "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });

  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: filePath,
      type: "jpeg",
      quality: 78,
      fullPage: false,
      clip: {
        x: 240,
        y: 0,
        width: 800,
        height: 800
      }
    });
    return publicUrl;
  } finally {
    await page.close().catch(() => {});
  }
};

app.get("/api/preview", async (req, res) => {
  const targetUrl = normalizeUrl(req.query.url);
  if (!targetUrl) {
    return res.status(400).json({ status: "error", message: "Invalid url" });
  }

  try {
    const cacheKey = crypto.createHash("sha1").update(targetUrl).digest("hex");
    let title = "";
    let description = "";
    let imageUrl = "";
    let canonicalUrl = "";
    let responseUrl = targetUrl;

    try {
      const response = await fetch(targetUrl, {
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        },
      });

      responseUrl = response.url || targetUrl;
      const html = await response.text();
      const dom = new JSDOM(html);
      const { document } = dom.window;

      title =
        readMeta(document, [
          'meta[property="og:title"]',
          'meta[name="og:title"]',
          'meta[name="twitter:title"]',
        ]) ||
        document.querySelector("title")?.textContent?.trim() ||
        "";

      description = readMeta(document, [
        'meta[property="og:description"]',
        'meta[name="og:description"]',
        'meta[name="twitter:description"]',
      ]);

      const imageCandidate =
        readMeta(document, [
          'meta[property="og:image"]',
          'meta[property="og:image:url"]',
          'meta[name="og:image"]',
          'meta[name="twitter:image"]',
          'meta[name="twitter:image:src"]',
        ]) || "";

      imageUrl = resolveUrl(imageCandidate, responseUrl);
      canonicalUrl = resolveUrl(readMeta(document, ['link[rel="canonical"]']) || "", responseUrl);
    } catch (fetchError) {
      console.warn("Preview HTML fetch failed, will use screenshot fallback:", fetchError?.message || fetchError);
    }

    let resolvedImageUrl = imageUrl;
    let resolvedImageSource = resolvedImageUrl ? "og" : "screenshot";
    if (!resolvedImageUrl) {
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
      const host = req.headers.host;
      const requestBaseUrl = `${protocol}://${host}`;
      resolvedImageUrl = await generateScreenshotPreview(targetUrl, cacheKey, requestBaseUrl);
      resolvedImageSource = "screenshot";
    }
    const resolvedTitle =
      resolvedImageSource === "screenshot"
        ? new Date().toISOString().slice(0, 10)
        : title || "";

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.json({
      status: "success",
      data: {
        title: resolvedTitle,
        description,
        image: { url: resolvedImageUrl },
        screenshot: { url: resolvedImageUrl },
        imageSource: resolvedImageSource,
        url: canonicalUrl || responseUrl,
      },
      source: "self-hosted",
    });
  } catch (error) {
    console.error("Preview fetch failed:", error);
    return res.status(200).json({
      status: "error",
      message: "Failed to fetch preview metadata",
      data: {
        title: "",
        description: "",
        image: { url: "" },
        screenshot: { url: "" },
        url: targetUrl,
      },
    });
  }
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/", (_req, res) => {
  res.status(200).send(`
    <!doctype html>
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Preview API</title>
        <style>
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111; color: #fff; margin: 0; padding: 32px; }
          a { color: #7dd3fc; }
          code { background: #222; padding: 2px 6px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <h1>Preview API is running</h1>
        <p>這個埠口只提供縮圖預覽服務，不是主網站。</p>
        <p>健康檢查：<a href="/healthz">/healthz</a></p>
        <p>預覽端點：<code>/api/preview?url=...</code></p>
      </body>
    </html>
  `);
});

app.listen(PORT, HOST, () => {
  console.log(`Preview API listening on http://${HOST}:${PORT}`);
});

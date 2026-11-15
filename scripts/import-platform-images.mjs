/**
 * Manual one-off importer: vendor editorial platform images locally.
 *
 * - NEVER runs during `next build` or app runtime. Run explicitly:
 *     node scripts/import-platform-images.mjs
 * - Polite Wikimedia usage: identifiable UA, max 2 concurrent requests,
 *   honors Retry-After, exponential backoff, aborts on persistent limits.
 * - Never writes an HTTP error response over a good file (validates the
 *   buffer first; atomic tmp+rename; reuses already-validated files).
 * - Photos (kind=image, raster)  -> width-capped thumbnail -> WebP q82.
 * - Logos keep their original format (SVG stays SVG, PNG stays PNG).
 * - Emits manifest.json with license/author/source/sha256 for every file.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const UA = "SaveState/1.0 (manual platform-image import; 2 concurrent max)";
const CONCURRENCY = Number(process.env.IMPORT_CONCURRENCY ?? 2) || 2;
const MAX_ATTEMPTS = 5;
let onlyRaw = process.env.IMPORT_ONLY ?? process.argv[5] ?? "";
if (onlyRaw.startsWith("@")) {
  try {
    onlyRaw = fs.readFileSync(onlyRaw.slice(1), "utf8");
  } catch {
    onlyRaw = "";
  }
}
const ONLY = onlyRaw
  .split(/[\s,]+/)
  .map((s) => s.trim())
  .filter(Boolean);
const PHOTO_WIDTH = 960;
const WEBP_QUALITY = 82;
const MIN_BYTES = 200;
const CIRCUIT_BREAKER_TRIPS = 8;

const LICENSE_URLS = {
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC BY-SA 2.5": "https://creativecommons.org/licenses/by-sa/2.5/",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
};

/** Oversized SVG originals (>1 MB) are vendored as PNG thumbs instead. */
const SVG_ORIGINAL_BYTE_CAP = 1024 * 1024;

/** Direct-URL overrides (bypass throttled Special:FilePath redirects). */
const URL_OVERRIDES = {
  "sega-dreamcast/logo": [
    "https://upload.wikimedia.org/wikipedia/commons/7/7e/Dreamcast_logo.svg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Dreamcast_logo.svg/640px-Dreamcast_logo.svg.png",
  ],
  "sega-saturn/logo": [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Sega_Saturn_USA_logo.svg/640px-Sega_Saturn_USA_logo.svg.png",
    "https://upload.wikimedia.org/wikipedia/commons/b/b9/Sega_Saturn_USA_logo.svg",
  ],
  "super-nintendo-entertainment-system/logo": [
    "https://upload.wikimedia.org/wikipedia/commons/3/33/Super_Nintendo_Entertainment_System_logo.svg",
  ],
  "wii-u/logo": [
    "https://upload.wikimedia.org/wikipedia/commons/7/7e/WiiU.svg",
  ],
  "wonderswan/logo": [
    "https://upload.wikimedia.org/wikipedia/commons/c/cd/WonderSwan_logo.svg",
  ],
  "xbox/logo": [
    "https://upload.wikimedia.org/wikipedia/commons/e/e5/Xbox_Logo.svg",
  ],
  "xbox-360/logo": [
    "https://upload.wikimedia.org/wikipedia/commons/1/1b/Xbox_360_logo.svg",
  ],
  "xbox-one/logo": [
    "https://upload.wikimedia.org/wikipedia/commons/f/f9/Xbox_one_logo.svg",
  ],
  "xbox-series/logo": [
    "https://upload.wikimedia.org/wikipedia/commons/9/90/Xbox_Series_X_S_color.svg",
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) =>
  crypto.createHash("sha256").update(buf).digest("hex");

function isSvgBytes(buf) {
  const head = buf.subarray(0, 1024).toString("latin1").toLowerCase();
  return head.includes("<svg");
}

function sniffMime(buf, headerMime) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  if (buf.subarray(0, 4).toString() === "GIF8") return "image/gif";
  if (isSvgBytes(buf)) return "image/svg+xml";
  return headerMime ?? "application/octet-stream";
}

async function fetchBuffer(url, attempt) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429 || res.status >= 500) {
    const retryAfter = res.headers.get("retry-after");
    const wait = retryAfter
      ? Math.min(Number(retryAfter) * 1000 + 1000, 60000)
      : Math.min(5000 * 2 ** attempt, 60000);
    await res.arrayBuffer().catch(() => null);
    return { retry: true, wait, status: res.status };
  }
  if (!res.ok) return { fatal: true, status: res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  return { ok: true, buf, contentType: res.headers.get("content-type") };
}

async function downloadValidated(urls, state) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    for (const url of urls) {
      const out = await fetchBuffer(url, attempt);
      if (out.retry) {
        state.consecutiveLimits += 1;
        if (state.consecutiveLimits >= CIRCUIT_BREAKER_TRIPS) {
          return { aborted: true, status: out.status };
        }
        await sleep(Math.min(out.wait, 30000));
        break; // next attempt, first URL again
      }
      if (out.fatal) continue; // try next URL candidate
      if (out.buf.length < MIN_BYTES) continue;
      state.consecutiveLimits = 0;
      return out;
    }
    if (attempt < MAX_ATTEMPTS - 1) await sleep(1500 * (attempt + 1));
  }
  return { failed: true };
}

async function main() {
  const root = process.argv[2] ?? path.join(here, "platform-assets-out");
  const inv = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
  const norm = (s) => String(s ?? "").replace(/_/g, " ").trim().toLowerCase();
  const licenses = new Map();
  for (const e of JSON.parse(fs.readFileSync(process.argv[4], "utf8"))) {
    licenses.set(norm(e.file), e);
    licenses.set(norm(e.title ?? "").replace(/^file:\s*/i, ""), e);
  }
  fs.mkdirSync(root, { recursive: true });
  const manifestPath = path.join(root, "manifest.json");
  const prev = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { files: {} };

  const entries = [];
  for (const f of inv) {
    if (f.host === "igdb") continue; // stays on the IGDB optimizer path
    if (ONLY.length > 0 && !ONLY.includes(`${f.id}/${f.kind}`)) continue;
    const lic = licenses.get(norm(f.file));
    if (!lic) {
      entries.push({ id: f.id, kind: f.kind, status: "pending", reason: "unverified-license" });
      continue;
    }
    const ext = f.kind === "logo"
      ? (/\.svg$/i.test(f.file) ? "svg" : "png")
      : "webp";
    const localRel = `${f.id}/${f.kind === "logo" ? "logo" : "photo"}.${ext}`;
    entries.push({ id: f.id, kind: f.kind, file: f.file, localRel, lic });
  }

  const manifest = { version: 1, generatedAt: new Date().toISOString(), files: { ...prev.files } };
  console.log(`entries=${entries.length} concurrency=${CONCURRENCY}`);
  const state = { consecutiveLimits: 0, imported: 0, reused: 0, pending: [] };
  let cursor = 0;

  async function worker() {
    while (cursor < entries.length) {
      const e = entries[cursor++];
      console.log(`START ${e.id}/${e.kind}`);
      if (e.status === "pending") {
        state.pending.push(e);
        continue;
      }
      let dest = path.join(root, e.localRel);
      const prevEntry = manifest.files[`${e.id}/${e.kind}`];
      if (prevEntry && fs.existsSync(dest)) {
        const cur = fs.readFileSync(dest);
        if (sha256(cur) === prevEntry.sha256) {
          state.reused += 1;
          continue;
        }
      }
      const fileHost = inv.find((x) => x.file === e.file).host;
      const wikiHost = fileHost === "en" ? "en.wikipedia.org" : "commons.wikimedia.org";
      const original = `https://${wikiHost}/wiki/Special:FilePath/${encodeURIComponent(e.file)}`;
      const thumb = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(e.file)}?width=${PHOTO_WIDTH}`;
      const overrides = URL_OVERRIDES[`${e.id}/${e.kind}`] ?? [];
      const candidates = e.kind === "image" && !/\.svg$/i.test(e.file)
        ? [...overrides, thumb, original]
        : [...overrides, original];
      // eslint-disable-next-line no-await-in-loop
      const got = await downloadValidated(candidates, state);
      if (got.aborted) {
        state.pending.push({ ...e, status: "pending", reason: `rate-limited (http ${got.status}); rerun later` });
        for (; cursor < entries.length; cursor += 1) {
          const skipped = entries[cursor];
          if (!skipped.status) {
            state.pending.push({ ...skipped, status: "pending", reason: "skipped after rate-limit abort; rerun later" });
          } else {
            state.pending.push(skipped);
          }
        }
        return;
      }
      if (!got || !got.buf) {
        state.pending.push({ ...e, status: "pending", reason: "download-failed" });
        continue;
      }
      const mime = sniffMime(got.buf, got.contentType);
      const wantSvg = /\.svg$/i.test(e.file);
      // Raster thumbs of SVG originals (oversize or throttled paths) are
      // accepted as PNG: same pixels at display size.
      const svgAsPng = wantSvg && mime !== "image/svg+xml" &&
        (mime === "image/png" || mime === "image/jpeg" || mime === "image/webp");
      if (wantSvg && mime !== "image/svg+xml" && !svgAsPng) {
        state.pending.push({ ...e, status: "pending", reason: `bad-mime (${mime})` });
        continue;
      }
      if (!wantSvg && !(mime === "image/png" || mime === "image/jpeg" || mime === "image/webp" || mime === "image/gif")) {
        state.pending.push({ ...e, status: "pending", reason: `bad-mime (${mime})` });
        continue;
      }
      let finalBuf = got.buf;
      let width;
      let height;
      let finalRel = e.localRel;
      let finalMime = mime;
      if ((wantSvg && !svgAsPng && got.buf.length > SVG_ORIGINAL_BYTE_CAP) || svgAsPng) {
        // Oversized SVG originals (e.g. 44 MB engravings) are vendored as
        // PNG thumbs: same pixels at display size, fraction of the bytes.
        try {
          // eslint-disable-next-line no-await-in-loop
          const pngThumb = await sharp(got.buf, { density: 144 })
            .resize({ width: PHOTO_WIDTH, withoutEnlargement: true })
            .png()
            .toBuffer();
          finalBuf = pngThumb;
          finalRel = e.localRel.replace(/\.svg$/, ".png");
          finalMime = "image/png";
          // eslint-disable-next-line no-await-in-loop
          const meta = await sharp(finalBuf).metadata();
          width = meta.width;
          height = meta.height;
        } catch {
          state.pending.push({ ...e, status: "pending", reason: "transform-failed" });
          continue;
        }
      } else if (!wantSvg && e.kind === "image") {
        try {
          // eslint-disable-next-line no-await-in-loop
          finalBuf = await sharp(got.buf)
            .resize({ width: PHOTO_WIDTH, withoutEnlargement: true })
            .webp({ quality: WEBP_QUALITY })
            .toBuffer();
          // eslint-disable-next-line no-await-in-loop
          const meta = await sharp(finalBuf).metadata();
          width = meta.width;
          height = meta.height;
        } catch {
          state.pending.push({ ...e, status: "pending", reason: "transform-failed" });
          continue;
        }
      } else if (!wantSvg) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const meta = await sharp(got.buf).metadata();
          width = meta.width;
          height = meta.height;
        } catch {
          state.pending.push({ ...e, status: "pending", reason: "transform-failed" });
          continue;
        }
      }
      dest = path.join(root, finalRel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = `${dest}.tmp`;
      fs.writeFileSync(tmp, finalBuf);
      fs.renameSync(tmp, dest);
      manifest.files[`${e.id}/${e.kind}`] = {
        file: finalRel,
        source: original,
        page: e.lic.page ?? null,
        license: e.lic.license ?? "unknown",
        licenseUrl: LICENSE_URLS[e.lic.license] ?? null,
        author: e.lic.artist || e.lic.credit || null,
        mime: wantSvg ? (finalMime === "image/png" ? "image/png" : "image/svg+xml") : e.kind === "image" ? "image/webp" : mime,
        bytes: finalBuf.length,
        sha256: sha256(finalBuf),
        width: width ?? null,
        height: height ?? null,
      };
      state.imported += 1;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  manifest.summary = {
    imported: state.imported,
    reused: state.reused,
    pending: state.pending,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`imported=${state.imported} reused=${state.reused} pending=${state.pending.length}`);
  for (const p of state.pending) console.log("PENDING", p.id, p.kind, p.reason ?? "");
}

main().catch((err) => {
  console.error("import failed:", err);
  process.exit(1);
});

import { meteredGroqJson } from './credits/index.js';

const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
const META_DESC_RE = /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i;
const META_DESC_RE_ALT = /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i;
const OG_SITE_RE = /<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i;
const OG_DESC_RE = /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i;
const OG_DESC_RE_ALT = /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i;
const OG_IMAGE_RE = /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i;
const OG_IMAGE_RE_ALT = /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i;
const H1_RE = /<h1[^>]*>([^<]+)<\/h1>/i;
const THEME_COLOR_RE = /<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i;
const HEX_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const LINK_TAG_RE = /<link\b[^>]*>/gi;
const IMG_SRC_RE = /<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi;

function stripHtml(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWebsiteUrl(input) {
  let url = String(input || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

function hexToHsl(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0, sat = 0;
  const lig = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = lig > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: hue = ((b - r) / d + 2) / 6; break;
      case b: hue = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: hue * 360, s: sat, l: lig };
}

function isBrandColor(hex) {
  // Expand 3-char hex
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  if (full.length !== 7) return false;
  const { s, l } = hexToHsl(full);
  // Reject near-white (l > 0.92), near-black (l < 0.06), and dull grays (s < 0.12)
  if (l > 0.92 || l < 0.06 || s < 0.12) return false;
  return true;
}

function pickBrandColors(hexes, themeColor) {
  const defaults = ['#ff6a00', '#f2790a', '#191613'];
  // Normalize all to 6-char lowercase
  const normalize = (h) => {
    const c = h.toLowerCase();
    return c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c;
  };
  const uniqueHexes = Array.from(new Set(hexes.map(normalize)));
  // Filter to proper brand colors (exclude white, black, near-gray)
  const filtered = uniqueHexes.filter(isBrandColor);

  // Prioritize theme-color if it's a real brand color
  if (themeColor && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(themeColor)) {
    const norm = normalize(themeColor);
    if (isBrandColor(norm)) filtered.unshift(norm);
    else filtered.unshift(norm); // keep theme color even if borderline
  }

  const result = Array.from(new Set(filtered)).slice(0, 3);
  while (result.length < 3) {
    result.push(defaults[result.length]);
  }
  return result;
}

function stripCdnResize(url) {
  return String(url || '').replace(/\/:\/rs=[^/?#]*/gi, '');
}

function attr(tag, name) {
  const m = String(tag || '').match(new RegExp(`${name}=["']([^"']+)["']`, 'i'));
  return m ? m[1] : '';
}

function scoreLogoCandidate(href, rel = '', sizes = '') {
  const u = decodeURIComponent(String(href || '')).toLowerCase();
  let score = 0;
  if (/logo/i.test(u)) score += 140;
  if (/\.svg(\b|$)/i.test(u)) score += 90;
  if (/apple-touch/i.test(rel)) score += 35;
  if (/shortcut icon|^icon$/i.test(rel)) score += 10;
  const size = parseInt(String(sizes).split(/[x×]/i)[0], 10);
  if (Number.isFinite(size)) score += Math.min(size, 256);
  if (/favicon/i.test(u)) score -= 25;
  if (/blob-|og-image|opengraph|social/i.test(u) && !/logo/i.test(u)) score -= 80;
  return score;
}

function pickBestLogoUrl(html, baseUrl, ogImage) {
  const candidates = [];
  const tags = String(html || '').match(LINK_TAG_RE) || [];
  for (const tag of tags) {
    const rel = attr(tag, 'rel');
    if (!/icon/i.test(rel)) continue;
    const href = attr(tag, 'href');
    if (!href) continue;
    candidates.push({ href, rel, sizes: attr(tag, 'sizes') });
  }
  let imgMatch;
  const imgRe = new RegExp(IMG_SRC_RE.source, 'gi');
  while ((imgMatch = imgRe.exec(html || ''))) {
    const href = imgMatch[1];
    if (/logo/i.test(decodeURIComponent(href))) {
      candidates.push({ href, rel: 'img-logo', sizes: '256x256' });
    }
  }
  const resolved = candidates
    .map((c) => {
      const raw = stripCdnResize(c.href);
      let href = raw;
      try {
        href = new URL(raw, baseUrl).href;
      } catch {
        href = raw.startsWith('http') ? raw : '';
      }
      return href ? { ...c, href, score: scoreLogoCandidate(href, c.rel, c.sizes) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  if (resolved[0]?.score >= 40) return resolved[0].href;
  if (ogImage) return stripCdnResize(ogImage);
  return resolved[0]?.href || '';
}

function extractFonts(html) {
  const fontMatches = html.match(/font-family:[^;}"']+/gi) || [];
  const fonts = new Set();
  fontMatches.forEach(m => {
    const name = m
      .replace(/font-family:/i, '')
      .split(',')[0]
      .replace(/["']/g, '')
      .replace(/!important/gi, '')
      .trim();
    if (
      name &&
      !['inherit', 'initial', 'unset', 'sans-serif', 'serif', 'monospace', 'system-ui'].includes(name.toLowerCase()) &&
      !/important|var\(/i.test(name)
    ) {
      fonts.add(name);
    }
  });
  // Google Fonts stylesheet hints
  const gf = html.match(/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/i);
  if (gf?.[1]) {
    decodeURIComponent(gf[1])
      .split('|')
      .forEach((part) => {
        const family = part.split(':')[0].replace(/\+/g, ' ').trim();
        if (family) fonts.add(family);
      });
  }
  const list = Array.from(fonts).slice(0, 2);
  return list.length > 0 ? `${list.join(', ')}` : 'Archivo, Inter';
}

export async function scrapeBrandSignals(websiteUrl) {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) {
    return {
      websiteUrl: '',
      title: '',
      description: '',
      ogDescription: '',
      ogImage: '',
      siteName: '',
      h1: '',
      pageTagline: '',
      colors: ['#ff6a00', '#f2790a', '#191613'],
      fonts: 'Archivo · headings & body',
      logoUrl: '',
    };
  }

  try {
    const controller = new AbortController();
    // GoDaddy / Wix-style sites can exceed 6s; keep head parseable within 20s.
    const timeout = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(normalized, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    }).catch(() => null);
    clearTimeout(timeout);

    if (!resp || !resp.ok) throw new Error('Fetch failed');

    // Only need the document head + early body for brand signals.
    const html = (await resp.text()).slice(0, 350_000);
    const title = stripHtml((html.match(TITLE_RE) || [])[1] || '');
    const description = stripHtml((html.match(META_DESC_RE) || html.match(META_DESC_RE_ALT) || [])[1] || '');
    const ogDescription = stripHtml((html.match(OG_DESC_RE) || html.match(OG_DESC_RE_ALT) || [])[1] || '');
    const ogImageRaw = (html.match(OG_IMAGE_RE) || html.match(OG_IMAGE_RE_ALT) || [])[1] || '';
    const siteName = stripHtml((html.match(OG_SITE_RE) || [])[1] || '');
    const h1 = stripHtml((html.match(H1_RE) || [])[1] || '');
    const themeColor = (html.match(THEME_COLOR_RE) || [])[1] || null;
    const hexes = html.match(HEX_RE) || [];

    // Prefer short on-page / OG taglines (Elevate: "Strategy Meets Execution")
    let pageTagline = '';
    if (ogDescription && ogDescription.split(/\s+/).length <= 10) {
      pageTagline = ogDescription;
    }
    const taglineMatch = html.match(/Strategy\s+Meets\s+Execution/i);
    if (taglineMatch) pageTagline = 'Strategy Meets Execution';
    if (!pageTagline) {
      const shortPhrases = html.match(/>\s*([A-Z][^<]{8,48})\s*</g) || [];
      for (const raw of shortPhrases.slice(0, 40)) {
        const t = stripHtml(raw.replace(/^>/, '').replace(/<$/, ''));
        if (/meets|grow|execute|transform|partner/i.test(t) && t.split(/\s+/).length <= 8) {
          pageTagline = t;
          break;
        }
      }
    }

    const colors = pickBrandColors(hexes, themeColor);
    const fonts = extractFonts(html);

    let ogImage = '';
    if (ogImageRaw) {
      try {
        ogImage = new URL(ogImageRaw, normalized).href;
      } catch {
        ogImage = ogImageRaw.startsWith('http') ? ogImageRaw : '';
      }
    }
    let logoUrl = pickBestLogoUrl(html, normalized, ogImage);
    if (!logoUrl) {
      try { logoUrl = new URL('/favicon.ico', normalized).href; } catch { logoUrl = ''; }
    }

    return {
      websiteUrl: normalized,
      title,
      description,
      ogDescription,
      ogImage,
      siteName,
      h1,
      pageTagline,
      colors,
      fonts,
      logoUrl,
    };
  } catch (err) {
    return {
      websiteUrl: normalized,
      title: '',
      description: '',
      ogDescription: '',
      ogImage: '',
      siteName: '',
      h1: '',
      pageTagline: '',
      colors: ['#ff6a00', '#f2790a', '#191613'],
      fonts: 'Archivo · headings & body',
      logoUrl: '',
    };
  }
}

export async function synthesizeBrandDnaWithAi({ companyName, websiteUrl, industry, icp, signals, workspaceId = 'marqq-ws-1' }) {
  const apiKey = process.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY;
  const compName = companyName || signals?.siteName || signals?.title || 'Your Company';
  const descriptionSignal = signals?.description || signals?.ogDescription || '';
  const summaryFallback = descriptionSignal || `${compName} empowers target accounts in ${industry || 'their industry'} with innovative solutions.`;
  const defaultPillars = ['GROWTH ENABLEMENT', 'DIGITAL TRANSFORMATION', 'INDUSTRY EXPERTISE'];
  const defaultColors = signals?.colors || ['#ff6a00', '#f2790a', '#191613'];
  const defaultFonts = signals?.fonts || 'Archivo, Inter';
  const defaultTagline = signals?.pageTagline || signals?.ogDescription || `Grow faster. Operate smarter.`;
  const defaultTone = `Professional yet conversational. Data-driven and direct — no fluff. Uses active voice and outcome-first language targeted at ${icp || 'decision-makers'}.`;
  const defaultBusinessSummary = summaryFallback;

  if (!apiKey) {
    return {
      companyName: compName,
      brandSummary: summaryFallback,
      businessSummary: defaultBusinessSummary,
      brandTagline: defaultTagline,
      toneOfVoice: defaultTone,
      positioningTags: defaultPillars,
      colors: defaultColors,
      fonts: defaultFonts,
    };
  }

  try {
    const scrapedColors = (signals?.colors || []).join(', ');
    const scrapedFonts = signals?.fonts || 'unknown';
    const prompt = `
Generate complete Brand DNA for a B2B company from these scraped signals:
Company Name: ${compName}
Website: ${websiteUrl}
Industry: ${industry || 'B2B Software & Services'}
ICP (who BUYS from them): ${icp || 'Mid-market businesses'}
Page Title: ${signals?.title || ''}
Meta Description: ${descriptionSignal}
OG Description / tagline hint: ${signals?.ogDescription || signals?.pageTagline || ''}
H1 Headline: ${signals?.h1 || ''}
Scraped brand colors: ${scrapedColors || 'none found'}
Scraped fonts: ${scrapedFonts}

Rules:
- brandSummary: 1 crisp sentence — what THEY SELL and who BUYS. Never "The ${compName}". Grammar: use "${compName}" not "The ${compName}".
- businessSummary: 2-3 sentences on value, buyer, differentiator. Meta description + H1 are primary sources. Do not invent funding or market surges.
- brandTagline: Prefer an exact short phrase from H1/title/og:description/page if it looks like a tagline (e.g. "Strategy Meets Execution"). Otherwise invent a 4-8 word promise consistent with scraped copy.
- toneOfVoice: 2-3 sentences — formality, style, vocabulary — tailored to the ICP buyers.
- positioningTags: 3 SHORT CAPITALIZED pillars (2-4 words each).
- colors: Use scraped brand colors. Exactly 3 valid hex strings.
- fonts: Font name(s) as comma-separated string.

Return JSON matching this EXACT structure (no extra keys):
{
  "brandSummary": "...",
  "businessSummary": "...",
  "brandTagline": "...",
  "toneOfVoice": "...",
  "positioningTags": ["...", "...", "..."],
  "colors": ["#hex1", "#hex2", "#hex3"],
  "fonts": "..."
}
`;

    const result = await meteredGroqJson({
      workspaceId,
      feature: 'brand_dna',
      temperature: 0.25,
      messages: [
        {
          role: 'system',
          content:
            "You are a Brand DNA extractor. Prefer scraped site wording for taglines. Never confuse the company's industry peers with its buyers. Return valid JSON only.",
        },
        { role: 'user', content: prompt },
      ],
      meta: { companyName: compName, websiteUrl },
      looseJson: true,
    });
    if (result.insufficientCredits || !result.ok || !result.json) {
      throw new Error(result.error || 'brand_dna_unavailable');
    }
    const parsed = result.json;

    // Prefer a short on-page tagline if AI drifted
    const pageHint = `${signals?.pageTagline || ''} ${signals?.ogDescription || ''} ${signals?.h1 || ''} ${signals?.title || ''} ${descriptionSignal}`;
    let tagline = String(signals?.pageTagline || parsed.brandTagline || defaultTagline).trim();
    if (/strategy meets execution/i.test(pageHint)) {
      tagline = 'Strategy Meets Execution';
    }
    // Reject taglines that are just a truncated industry list
    if (/^management,?\s*strategy/i.test(tagline) && tagline.split(/\s+/).length <= 6) {
      tagline = signals?.pageTagline || 'Strategy Meets Execution';
    }

    const cleanName = (s) => String(s || '').replace(/\bThe Elevate\b/g, 'Elevate').trim();

    return {
      companyName: compName,
      brandSummary: cleanName(parsed.brandSummary || summaryFallback),
      businessSummary: cleanName(parsed.businessSummary || summaryFallback),
      brandTagline: tagline,
      toneOfVoice: parsed.toneOfVoice || defaultTone,
      positioningTags: Array.isArray(parsed.positioningTags) && parsed.positioningTags.length ? parsed.positioningTags : defaultPillars,
      colors: Array.isArray(parsed.colors) && parsed.colors.length >= 3 ? parsed.colors : defaultColors,
      fonts: parsed.fonts || defaultFonts,
    };
  } catch (err) {
    console.warn('[brand-dna] AI synthesis fallback:', err.message);
    return {
      companyName: compName,
      brandSummary: summaryFallback,
      businessSummary: defaultBusinessSummary,
      brandTagline: defaultTagline,
      toneOfVoice: defaultTone,
      positioningTags: defaultPillars,
      colors: defaultColors,
      fonts: defaultFonts,
    };
  }
}

#!/usr/bin/env node
/**
 * Generates a single sitemap.xml with all URLs (static pages, products, categories, blog).
 * Run during client build (prebuild). Outputs to client public/ folder.
 *
 * Usage: node scripts/generate-sitemap.js
 * Env: BASE_URL, OUTPUT_DIR, MONGO_URL
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const BASE_URL = (process.env.BASE_URL || 'https://maison.com').replace(/\/$/, '');
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, '../../client/public');

const LOCALES = [
  { urlCode: 'us', hreflang: 'en-US' },
  { urlCode: 'uk', hreflang: 'en-GB' },
  { urlCode: 'fr', hreflang: 'fr-FR' },
  { urlCode: 'es', hreflang: 'es-ES' },
  { urlCode: 'de', hreflang: 'de-DE' },
  { urlCode: 'it', hreflang: 'it-IT' },
  { urlCode: 'pt', hreflang: 'pt-PT' },
  { urlCode: 'nl', hreflang: 'nl-NL' },
];
const DEFAULT_URL_CODE = 'us';

const STATIC_ROUTES = [
  { path: '/', priority: 1.0, changefreq: 'daily' },
  { path: '/shop', priority: 0.9, changefreq: 'daily' },
  { path: '/categories', priority: 0.9, changefreq: 'daily' },
  { path: '/new', priority: 0.9, changefreq: 'daily' },
  { path: '/sale', priority: 0.8, changefreq: 'daily' },
  { path: '/about', priority: 0.7, changefreq: 'monthly' },
  { path: '/contact', priority: 0.6, changefreq: 'monthly' },
  { path: '/faq', priority: 0.6, changefreq: 'monthly' },
  { path: '/shipping', priority: 0.5, changefreq: 'monthly' },
  { path: '/privacy', priority: 0.5, changefreq: 'monthly' },
  { path: '/terms', priority: 0.5, changefreq: 'monthly' },
  { path: '/size-guide', priority: 0.5, changefreq: 'monthly' },
  { path: '/blog', priority: 0.6, changefreq: 'weekly' },
];

function toUrl(pathSeg, urlCode) {
  const p = pathSeg.startsWith('/') ? pathSeg : `/${pathSeg}`;
  if (urlCode === DEFAULT_URL_CODE) return `${BASE_URL}${p}`;
  return `${BASE_URL}/${urlCode}${p}`;
}

function buildAlternates(pathSeg, allPaths) {
  return allPaths.map(({ hreflang, url }) =>
    `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${url}" />`
  ).join('\n    ') + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${allPaths[0].url}" />`;
}

function urlEntry(loc, lastmod, changefreq, priority, alternates) {
  return `  <url>
    <loc>${loc}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
    ${alternates}
  </url>`;
}

async function main() {
  if (!process.env.MONGO_URL) {
    console.error('MONGO_URL is required for sitemap generation.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URL);
  const Product = require('../models/Product');
  const Category = require('../models/Category');
  const BlogPost = require('../models/BlogPost');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const allEntries = [];

  // Static pages (with locale translations)
  for (const route of STATIC_ROUTES) {
    const allPaths = LOCALES.map(l => ({
      urlCode: l.urlCode,
      hreflang: l.hreflang,
      url: toUrl(route.path, l.urlCode),
    }));
    for (const { url } of allPaths) {
      allEntries.push({
        loc: url,
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: route.changefreq,
        priority: route.priority,
        alternates: buildAlternates(route.path, allPaths),
      });
    }
  }

  // Products
  const products = await Product.find({
    isInStore: true,
    status: 'active',
    visibility: 'public',
    isAvailable: true,
  })
    .select('slug _id updatedAt')
    .lean();

  for (const p of products) {
    const ident = p.slug || p._id.toString();
    const pathSeg = `/product/${ident}`;
    const lastmod = p.updatedAt ? new Date(p.updatedAt).toISOString().split('T')[0] : null;
    const allPaths = LOCALES.map(l => ({
      urlCode: l.urlCode,
      hreflang: l.hreflang,
      url: toUrl(pathSeg, l.urlCode),
    }));
    for (const { url } of allPaths) {
      allEntries.push({
        loc: url,
        lastmod,
        changefreq: 'weekly',
        priority: 0.8,
        alternates: buildAlternates(pathSeg, allPaths),
      });
    }
  }

  // Categories
  const categories = await Category.find({ isActive: true })
    .select('slug _id updatedAt')
    .lean();

  for (const c of categories) {
    const ident = c.slug || c._id.toString();
    const pathSeg = `/category/${ident}`;
    const lastmod = c.updatedAt ? new Date(c.updatedAt).toISOString().split('T')[0] : null;
    const allPaths = LOCALES.map(l => ({
      urlCode: l.urlCode,
      hreflang: l.hreflang,
      url: toUrl(pathSeg, l.urlCode),
    }));
    for (const { url } of allPaths) {
      allEntries.push({
        loc: url,
        lastmod,
        changefreq: 'daily',
        priority: 0.8,
        alternates: buildAlternates(pathSeg, allPaths),
      });
    }
  }

  // Blog posts
  const posts = await BlogPost.find({ status: 'published' })
    .select('slug _id updatedAt publishedAt')
    .lean();

  for (const post of posts) {
    const ident = post.slug || post._id.toString();
    const pathSeg = `/blog/${ident}`;
    const lastmod = (post.updatedAt || post.publishedAt)
      ? new Date(post.updatedAt || post.publishedAt).toISOString().split('T')[0]
      : null;
    const allPaths = LOCALES.map(l => ({
      urlCode: l.urlCode,
      hreflang: l.hreflang,
      url: toUrl(pathSeg, l.urlCode),
    }));
    for (const { url } of allPaths) {
      allEntries.push({
        loc: url,
        lastmod,
        changefreq: 'weekly',
        priority: 0.6,
        alternates: buildAlternates(pathSeg, allPaths),
      });
    }
  }

  const urlEntries = allEntries.map(e =>
    urlEntry(e.loc, e.lastmod, e.changefreq, e.priority, e.alternates)
  ).join('\n');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlEntries}
</urlset>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.xml'), sitemapXml, 'utf8');

  // Remove old split sitemaps if they exist
  ['sitemap-pages.xml', 'sitemap-products.xml', 'sitemap-categories.xml', 'sitemap-blog.xml'].forEach((f) => {
    const p = path.join(OUTPUT_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  await mongoose.disconnect();
  console.log(`Generated sitemap.xml with ${allEntries.length} URLs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

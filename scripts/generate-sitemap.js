#!/usr/bin/env node
/**
 * Multilingual Sitemap Generation Script
 *
 * Generates sitemap.xml (index) and split sitemaps for products, categories, blog, and static pages.
 * Run during client build or manually. Outputs to client public/ folder.
 *
 * Usage:
 *   node scripts/generate-sitemap.js
 *   BASE_URL=https://example.com OUTPUT_DIR=../opulent-style-co.-main/public node scripts/generate-sitemap.js
 *
 * Env vars:
 *   BASE_URL - Site base URL (default: https://maison.com)
 *   OUTPUT_DIR - Output directory (default: ../client/public)
 *   MONGO_URL - MongoDB connection (required, from .env)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'https://maison.com';
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, '../../client/public');

// Locales: align with client/admin SUPPORTED_LOCALES
// code = URL segment (e.g. 'en-us'), hreflang = full locale (e.g. 'en-US')
const LOCALES = [
  { code: 'en-us', hreflang: 'en-US' },
  { code: 'en-gb', hreflang: 'en-GB' },
  { code: 'fr-fr', hreflang: 'fr-FR' },
  { code: 'es-es', hreflang: 'es-ES' },
  { code: 'de-de', hreflang: 'de-DE' },
  { code: 'it-it', hreflang: 'it-IT' },
  { code: 'pt-pt', hreflang: 'pt-PT' },
  { code: 'nl-nl', hreflang: 'nl-NL' },
];

// Default locale uses no URL prefix (matches client routing)
const DEFAULT_LOCALE = 'en-us';

// Static routes (no locale prefix for default; locale prefix for others)
// These paths must match client routes in App.js
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

function toUrl(pathSeg, locale) {
  const p = pathSeg.startsWith('/') ? pathSeg : `/${pathSeg}`;
  if (locale === DEFAULT_LOCALE) return `${BASE_URL}${p}`;
  return `${BASE_URL}/${locale}${p}`;
}

function buildAlternates(pathSeg, allLocalesWithPaths) {
  return allLocalesWithPaths.map(({ locale, hreflang, url }) =>
    `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${url}" />`
  ).join('\n    ') + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${allLocalesWithPaths[0].url}" />`;
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

function generateSitemapXml(entries) {
  const urlEntries = entries.map(e => urlEntry(e.loc, e.lastmod, e.changefreq, e.priority, e.alternates)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlEntries}
</urlset>`;
}

function generateSitemapIndex(sitemapUrls) {
  const entries = sitemapUrls.map(u => `  <sitemap>
    <loc>${u}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;
}

async function main() {
  if (!process.env.MONGO_URL) {
    console.error('MONGO_URL is required. Set it in .env or environment.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URL);
  const Product = require('../models/Product');
  const Category = require('../models/Category');
  const BlogPost = require('../models/BlogPost');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const baseUrl = BASE_URL.replace(/\/$/, '');

  // ---- Static pages ----
  const staticEntries = [];
  for (const route of STATIC_ROUTES) {
    const allPaths = LOCALES.map(l => ({
      locale: l.code,
      hreflang: l.hreflang,
      url: toUrl(route.path, l.code),
    }));
    for (const { locale, hreflang, url } of allPaths) {
      staticEntries.push({
        loc: url,
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: route.changefreq,
        priority: route.priority,
        alternates: buildAlternates(route.path, allPaths),
      });
    }
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'sitemap-pages.xml'),
    generateSitemapXml(staticEntries),
    'utf8'
  );
  console.log('Generated sitemap-pages.xml:', staticEntries.length, 'entries');

  // ---- Products ----
  const products = await Product.find({
    isInStore: true,
    status: 'active',
    visibility: 'public',
    isAvailable: true,
  })
    .select('slug _id translations updatedAt')
    .lean();

  const productEntries = [];
  for (const p of products) {
    const ident = p.slug || p._id.toString();
    const pathSeg = `/product/${ident}`;
    const lastmod = p.updatedAt ? new Date(p.updatedAt).toISOString().split('T')[0] : null;
    const allPaths = LOCALES.map(l => ({
      locale: l.code,
      hreflang: l.hreflang,
      url: toUrl(pathSeg, l.code),
    }));
    for (const { url } of allPaths) {
      productEntries.push({
        loc: url,
        lastmod,
        changefreq: 'weekly',
        priority: 0.8,
        alternates: buildAlternates(pathSeg, allPaths),
      });
    }
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'sitemap-products.xml'),
    generateSitemapXml(productEntries),
    'utf8'
  );
  console.log('Generated sitemap-products.xml:', productEntries.length, 'entries');

  // ---- Categories ----
  const categories = await Category.find({ isActive: true })
    .select('slug _id translations updatedAt')
    .lean();

  const categoryEntries = [];
  for (const c of categories) {
    const ident = c.slug || c._id.toString();
    const pathSeg = `/category/${ident}`;
    const lastmod = c.updatedAt ? new Date(c.updatedAt).toISOString().split('T')[0] : null;
    const allPaths = LOCALES.map(l => ({
      locale: l.code,
      hreflang: l.hreflang,
      url: toUrl(pathSeg, l.code),
    }));
    for (const { url } of allPaths) {
      categoryEntries.push({
        loc: url,
        lastmod,
        changefreq: 'daily',
        priority: 0.8,
        alternates: buildAlternates(pathSeg, allPaths),
      });
    }
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'sitemap-categories.xml'),
    generateSitemapXml(categoryEntries),
    'utf8'
  );
  console.log('Generated sitemap-categories.xml:', categoryEntries.length, 'entries');

  // ---- Blog ----
  const posts = await BlogPost.find({ status: 'published' })
    .select('slug _id translations updatedAt publishedAt')
    .lean();

  const blogEntries = [];
  for (const post of posts) {
    const ident = post.slug || post._id.toString();
    const pathSeg = `/blog/${ident}`;
    const lastmod = (post.updatedAt || post.publishedAt)
      ? new Date(post.updatedAt || post.publishedAt).toISOString().split('T')[0]
      : null;
    const allPaths = LOCALES.map(l => ({
      locale: l.code,
      hreflang: l.hreflang,
      url: toUrl(pathSeg, l.code),
    }));
    for (const { url } of allPaths) {
      blogEntries.push({
        loc: url,
        lastmod,
        changefreq: 'weekly',
        priority: 0.6,
        alternates: buildAlternates(pathSeg, allPaths),
      });
    }
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'sitemap-blog.xml'),
    generateSitemapXml(blogEntries),
    'utf8'
  );
  console.log('Generated sitemap-blog.xml:', blogEntries.length, 'entries');

  // ---- Sitemap index ----
  const sitemapIndexUrl = `${baseUrl}/sitemap.xml`;
  const sitemapUrls = [
    `${baseUrl}/sitemap-pages.xml`,
    `${baseUrl}/sitemap-products.xml`,
    `${baseUrl}/sitemap-categories.xml`,
    `${baseUrl}/sitemap-blog.xml`,
  ];

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'sitemap.xml'),
    generateSitemapIndex(sitemapUrls),
    'utf8'
  );
  console.log('Generated sitemap.xml (index)');

  await mongoose.disconnect();
  console.log('Sitemap generation complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Store = require('../models/Store');
const BlogPost = require('../models/BlogPost');

dotenv.config();

const seedBlogPosts = async () => {
  try {
    if (!process.env.MONGO_URL) {
      console.error('MONGO_URL is required in environment to seed blog posts.');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Use default store (or first active store as fallback)
    let store = await Store.getDefaultStore().catch(() => null);
    if (!store) {
      store = await Store.findOne({ isActive: true });
    }

    if (!store) {
      console.error('No store found. Please create a store before seeding blog posts.');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`Using store: ${store.name} (${store._id})`);

    const now = new Date();

    const posts = [
      {
        title: 'How to Style a Black Blazer for Any Occasion',
        slug: 'style-black-blazer-any-occasion',
        excerpt:
          'Learn how to dress up or down a classic black blazer for work, weekends, and nights out.',
        content:
          '<p>The black blazer is the quiet hero of every modern wardrobe. In this guide, we show you three ways to wear it...</p>',
        tags: ['style', 'blazers', 'wardrobe-basics'],
        metaTitle: 'How to Style a Black Blazer for Any Occasion',
        metaDescription:
          'Three effortless ways to style a black blazer for work, weekends, and evenings out.',
        translations: [
          {
            locale: 'fr-FR',
            title: 'Comment porter un blazer noir en toute occasion',
            slug: 'comment-porter-blazer-noir-toute-occasion',
            excerpt:
              'Découvrez comment porter un blazer noir, au bureau comme le week-end.',
            content:
              '<p>Le blazer noir est le héros silencieux de toute garde‑robe moderne. Dans ce guide, nous vous montrons trois façons de le porter...</p>',
            metaTitle: 'Comment porter un blazer noir en toute occasion',
            metaDescription:
              'Trois façons simples de porter un blazer noir pour le travail, le week‑end et le soir.',
          },
          {
            locale: 'de-DE',
            title: 'So stylst du einen schwarzen Blazer zu jedem Anlass',
            slug: 'schwarzen-blazer-jeder-anlass-stylen',
            excerpt:
              'So kombinierst du einen schwarzen Blazer fürs Büro, Wochenende und Abend.',
            content:
              '<p>Der schwarze Blazer ist ein unscheinbarer Held jeder Garderobe. In diesem Guide zeigen wir dir drei Looks...</p>',
            metaTitle: 'So stylst du einen schwarzen Blazer zu jedem Anlass',
            metaDescription:
              'Drei einfache Styling‑Ideen für deinen schwarzen Blazer – vom Büro bis zum Dinner.',
          },
        ],
      },
      {
        title: 'The Capsule Wardrobe: 10 Pieces, Endless Outfits',
        slug: 'capsule-wardrobe-10-pieces-endless-outfits',
        excerpt:
          'Build a refined capsule wardrobe with 10 essential pieces that mix and match effortlessly.',
        content:
          '<p>A capsule wardrobe reduces decision fatigue and keeps your style consistent. Start with these ten essentials...</p>',
        tags: ['capsule-wardrobe', 'essentials', 'minimalism'],
        metaTitle: 'Capsule Wardrobe Guide: 10 Pieces, Endless Outfits',
        metaDescription:
          'Our capsule wardrobe checklist: ten timeless pieces that create dozens of outfits.',
        translations: [
          {
            locale: 'fr-FR',
            title: 'Garde‑robe capsule : 10 pièces, une infinité de looks',
            slug: 'garde-robe-capsule-10-pieces',
            excerpt:
              'Construisez une garde‑robe capsule élégante avec 10 pièces essentielles.',
            content:
              '<p>Une garde‑robe capsule réduit la charge mentale et garde votre style cohérent. Commencez avec ces dix essentiels...</p>',
            metaTitle: 'Garde‑robe capsule : 10 pièces, une infinité de looks',
            metaDescription:
              'Notre checklist garde‑robe capsule : dix pièces intemporelles pour une multitude de tenues.',
          },
        ],
      },
      {
        title: 'Occasion Dressing: What to Wear to Weddings in 2026',
        slug: 'what-to-wear-to-weddings-2026',
        excerpt:
          'From city ceremonies to seaside celebrations, here’s how to dress as a guest this season.',
        content:
          '<p>Wedding season is back in full swing. Whether the invite says black‑tie or beach formal, here are our styling rules...</p>',
        tags: ['weddings', 'occasion-wear', 'dresses'],
        metaTitle: 'What to Wear to Weddings in 2026',
        metaDescription:
          'Guest outfit ideas for every type of wedding in 2026: city, country and seaside.',
        translations: [
          {
            locale: 'en-GB',
            title: 'What to Wear to Weddings in 2026 (UK Edition)',
            slug: 'what-to-wear-to-weddings-2026-uk',
            excerpt:
              'From country manors to city town halls, here’s how to dress as a guest in the UK.',
            content:
              '<p>Wedding season in the UK means unpredictable weather and beautiful venues. Here is how to plan your outfit...</p>',
            metaTitle:
              'What to Wear to Weddings in 2026 – UK Guest Outfit Guide',
            metaDescription:
              'UK wedding guest outfit ideas for 2026, from black‑tie to relaxed garden parties.',
          },
        ],
      },
    ];

    for (const raw of posts) {
      const existing = await BlogPost.findOne({
        storeId: store._id,
        slug: raw.slug,
      });

      if (existing) {
        console.log(`Skipping existing post: ${raw.slug}`);
        continue;
      }

      const created = await BlogPost.create({
        storeId: store._id,
        title: raw.title,
        slug: raw.slug,
        excerpt: raw.excerpt,
        content: raw.content,
        featuredImage: null,
        tags: raw.tags,
        status: 'published',
        publishedAt: now,
        metaTitle: raw.metaTitle,
        metaDescription: raw.metaDescription,
        translations: raw.translations,
      });

      console.log(`✓ Created blog post: ${created.title} (${created.slug})`);
    }

    console.log('\n✅ Blog posts seeded successfully.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error seeding blog posts:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedBlogPosts();


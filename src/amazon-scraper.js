import { load } from 'cheerio';
import logger from './logger.js';
import { createHttpClient } from './utils.js';

const http = createHttpClient();
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY;
const SCRAPERAPI_ENDPOINT = 'https://api.scraperapi.com/';

function buildAmazonSearchUrl (keywords, options = {}) {
  const params = new URLSearchParams();

  if (options.minPrice || options.maxPrice) {
    const min = options.minPrice ? Math.max(0, Number(options.minPrice)) : null;
    const max = options.maxPrice ? Math.max(0, Number(options.maxPrice)) : null;

    if (min && max) {
      params.set('rh', `p_36:${Math.floor(min * 100)}-${Math.floor(max * 100)}`);
    } else if (min) {
      params.set('rh', `p_36:${Math.floor(min * 100)}-`);
    } else if (max) {
      params.set('rh', `p_36:-${Math.floor(max * 100)}`);
    }
  }

  if (options.primeOnly) {
    const existing = params.get('rh');
    const primeFilter = 'p_85:2470955011';
    params.set('rh', existing ? `${existing},${primeFilter}` : primeFilter);
  }

  if (options.sort) {
    switch (options.sort) {
      case 'price-low':
        params.set('s', 'price-asc-rank');
        break;
      case 'price-high':
        params.set('s', 'price-desc-rank');
        break;
      case 'reviews':
      default:
        params.set('s', 'review-count-rank');
        break;
    }
  }

  params.set('k', keywords);

  return `https://www.amazon.com/s?${params.toString()}`;
}

function parsePrice ($el) {
  const priceText = $el.find('.a-price .a-offscreen').first().text()
    || `${$el.find('.a-price-whole').first().text()}.${$el.find('.a-price-fraction').first().text()}`;

  if (!priceText) return null;

  const normalized = priceText.replace(/[^\d.,]/g, '').replace(/,/g, '');
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value) || value <= 0) return null;
  return Number(value.toFixed(2));
}

function parseRating ($el) {
  const ratingText = $el.find('[data-cy="reviews-ratings"] span[aria-label]').first().attr('aria-label')
    || $el.find('.a-icon-alt').first().text();
  if (!ratingText) return null;
  const match = ratingText.match(/(\d+\.?\d*)\s*out of/);
  if (!match) return null;
  const rating = Number.parseFloat(match[1]);
  return Number.isNaN(rating) ? null : rating;
}

function parseReviewCount ($el) {
  const text = $el.find('[data-cy="reviews-ratings"] a span').first().text()
    || $el.find('.a-size-base.s-underline-text').first().text();
  if (!text) return 0;
  const normalized = text.replace(/[^\d]/g, '');
  const value = Number.parseInt(normalized, 10);
  return Number.isNaN(value) ? 0 : value;
}

export async function fetchAmazonProducts ({ keywords, options = {} }) {
  const searchUrl = buildAmazonSearchUrl(keywords, options);
  let finalUrl = searchUrl;

  if (SCRAPERAPI_KEY) {
    const scraperUrl = new URL(SCRAPERAPI_ENDPOINT);
    scraperUrl.searchParams.set('api_key', SCRAPERAPI_KEY);
    scraperUrl.searchParams.set('url', searchUrl);
    scraperUrl.searchParams.set('keep_headers', 'true');
    scraperUrl.searchParams.set('country_code', options.countryCode || 'us');
    finalUrl = scraperUrl.toString();
  } else {
    logger.warn('SCRAPERAPI_KEY not set. Attempting direct Amazon scraping (may fail).');
  }

  const { data: html } = await http.get(finalUrl);
  const $ = load(html);

  const items = [];
  $('.s-result-item[data-asin]').each((_, element) => {
    const $el = $(element);
    const asin = $el.attr('data-asin') || $el.attr('data-csa-c-item-id');
    if (!asin || asin.length !== 10) return;

    const title = $el.find('h2 a span').first().text().trim()
      || $el.find('[data-cy="title-recipe"] a span').first().text().trim()
      || '';
    if (!title) return;

    const price = parsePrice($el);
    if (!price) return;

    const image = $el.find('img.s-image').attr('src') || '';

    const rating = parseRating($el);
    const reviewCount = parseReviewCount($el);

    const isSponsored = Boolean(
      $el.text().toLowerCase().includes('sponsored') ||
      $el.find('[data-cy*="sponsored"]').length > 0
    );

    items.push({
      asin,
      title,
      price,
      image,
      rating,
      reviewCount,
      isSponsored,
      amazonUrl: `https://www.amazon.com/dp/${asin}`,
      fetchedAt: new Date().toISOString()
    });
  });

  return {
    keywords,
    options,
    totalFound: items.length,
    items
  };
}


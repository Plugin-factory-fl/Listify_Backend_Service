import { load } from 'cheerio';
import logger from './logger.js';
import { createHttpClient } from './utils.js';

const http = createHttpClient();
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY;
const SCRAPERAPI_ENDPOINT = 'https://api.scraperapi.com/';

export async function fetchSellerSales ({ seller, timeframeDays = 7 }) {
  const safeSeller = String(seller || '').trim();
  const days = Math.max(Number(timeframeDays) || 7, 1);

  logger.info({ seller: safeSeller, timeframeDays: days }, 'Fetching seller sales');

  const targetUrl = buildSellerUrl(safeSeller);
  const html = await fetchSellerHtml(targetUrl);
  const sales = parseSales(html, days);

  logger.info({ seller: safeSeller, found: sales.length }, 'Parsed seller sales');

  return {
    seller: safeSeller,
    timeframeDays: days,
    totalFound: sales.length,
    sales,
    source: SCRAPERAPI_KEY ? 'scraperapi' : 'direct-ebay'
  };
}

async function fetchSellerHtml (url) {
  try {
    if (SCRAPERAPI_KEY) {
      const scraperUrl = new URL(SCRAPERAPI_ENDPOINT);
      scraperUrl.searchParams.set('api_key', SCRAPERAPI_KEY);
      scraperUrl.searchParams.set('url', url);
      scraperUrl.searchParams.set('keep_headers', 'true');
      scraperUrl.searchParams.set('country_code', 'us');

      const { data } = await http.get(scraperUrl.toString());
      return data;
    }

    const { data } = await http.get(url);
    return data;
  } catch (error) {
    logger.error({ error, url }, 'Failed to fetch seller HTML');
    throw error;
  }
}

function buildSellerUrl (seller) {
  const params = new URLSearchParams({
    _ssn: seller,
    LH_Sold: '1',
    LH_Complete: '1'
  });

  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

function parseSales (html, timeframeDays) {
  const $ = load(html);

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (timeframeDays - 1));

  const sales = [];
  const seen = new Set();

  $('.s-item').each((_, element) => {
    const $el = $(element);
    const title = cleanText($el.find('.s-item__title').first().text());
    if (!title || title.toLowerCase().includes('shop on ebay')) return;

    const priceInfo = extractPriceInfo($el);
    if (!priceInfo) return;

    const soldDate = extractSoldDate($el);
    if (!soldDate) return;

    soldDate.setHours(0, 0, 0, 0);
    if (soldDate < cutoff) return;

    const listingUrl = $el.find('.s-item__link').attr('href') || null;
    const dedupeKey = `${title}|${priceInfo.price}|${soldDate.toISOString()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    sales.push({
      title,
      price: priceInfo.price,
      currency: priceInfo.currency,
      dateSold: soldDate.toISOString().split('T')[0],
      listingUrl
    });
  });

  return sales;
}

function extractPriceInfo ($el) {
  const priceText = cleanText(
    $el.find('.s-item__price').first().text() ||
    $el.find('.s-item__detail--primary').first().text()
  );

  if (!priceText) return null;

  const currencySymbol = detectCurrencySymbol(priceText);
  let numeric = priceText.replace(/[^0-9.,-]/g, '');
  if (!numeric) return null;

  // If there is a comma but no dot, treat comma as decimal separator.
  if (numeric.includes(',') && !numeric.includes('.')) {
    numeric = numeric.replace(',', '.');
  }

  const value = parseFloat(numeric.replace(/,/g, ''));
  if (Number.isNaN(value)) return null;

  return {
    price: Number(value.toFixed(2)),
    currency: normalizeCurrency(currencySymbol)
  };
}

function detectCurrencySymbol (text) {
  const match = text.match(/(USD|CAD|AUD|GBP|EUR|US\s*\$|CA\s*\$|AU\s*\$|C\s*\$|A\s*\$|£|€|¥|\$)/i);
  if (!match) return '$';
  return match[0].toUpperCase().replace(/\s+/g, '');
}

function normalizeCurrency (symbol) {
  const map = {
    '$': 'USD',
    'US$': 'USD',
    'USD': 'USD',
    '£': 'GBP',
    'GBP': 'GBP',
    '€': 'EUR',
    'EUR': 'EUR',
    '¥': 'JPY',
    'C$': 'CAD',
    'CA$': 'CAD',
    'CAD': 'CAD',
    'A$': 'AUD',
    'AU$': 'AUD',
    'AUD': 'AUD'
  };
  return map[symbol] || 'USD';
}

function extractSoldDate ($el) {
  const currentYear = new Date().getFullYear();
  const candidates = [
    $el.find('.s-item__title--tagblock').text(),
    $el.find('.s-item__subtitle').text(),
    $el.find('.s-item__details').text(),
    $el.text()
  ];

  for (const candidate of candidates) {
    const parsed = parseSoldDate(candidate, currentYear);
    if (parsed) return parsed;
  }

  return null;
}

function parseSoldDate (text, currentYear) {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ');

  let match = normalized.match(/Sold\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})/i);
  if (match) return adjustYear(safeDate(match[1]));

  match = normalized.match(/Sold\s+([A-Za-z]+\s+\d{1,2}\s+\d{4})/i);
  if (match) return adjustYear(safeDate(match[1]));

  match = normalized.match(/Sold\s+([A-Za-z]+\s+\d{1,2})/i);
  if (match) return adjustYear(safeDate(`${match[1]} ${currentYear}`));

  match = normalized.match(/Sold\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (match) {
    let year = match[3];
    year = year.length === 2 ? 2000 + Number(year) : Number(year);
    const month = Number(match[1]) - 1;
    const day = Number(match[2]);
    return adjustYear(new Date(year, month, day));
  }

  match = normalized.match(/Sold\s+([A-Za-z]{3})-(\d{1,2})-(\d{2,4})/i);
  if (match) {
    let year = match[3];
    year = year.length === 2 ? 2000 + Number(year) : Number(year);
    const month = match[1];
    const day = match[2].padStart(2, '0');
    return adjustYear(safeDate(`${month} ${day} ${year}`));
  }

  return null;
}

function safeDate (value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function adjustYear (date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  const now = new Date();
  // If the parsed date is far in the future, assume it belongs to last year.
  if (date.getTime() - now.getTime() > 15 * 24 * 60 * 60 * 1000) {
    date.setFullYear(date.getFullYear() - 1);
  }
  return date;
}

function cleanText (value) {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}


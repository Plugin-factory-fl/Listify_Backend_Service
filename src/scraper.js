import { load } from 'cheerio';
import logger from './logger.js';
import { createHttpClient } from './utils.js';

const http = createHttpClient();

/**
 * Temporary stub that returns mocked sales so the API works end-to-end.
 * Replace with real scraping logic as soon as the infrastructure is ready.
 */
export async function fetchSellerSales ({ seller, timeframeDays = 7 }) {
  logger.info({ seller, timeframeDays }, 'fetchSellerSales called (stubbed)');

  const now = new Date();
  const fakeSales = Array.from({ length: 5 }).map((_, idx) => {
    const soldDate = new Date(now.getTime() - idx * 24 * 60 * 60 * 1000);
    return {
      title: `Mocked Item ${idx + 1} for ${seller}`,
      price: Number((Math.random() * 80 + 20).toFixed(2)),
      currency: 'USD',
      dateSold: soldDate.toISOString().split('T')[0],
      listingUrl: 'https://www.ebay.com/itm/1234567890'
    };
  });

  return {
    seller,
    timeframeDays,
    totalFound: fakeSales.length,
    sales: fakeSales,
    source: 'listify-backend-stub'
  };
}

/**
 * Example real scraping entry. Keep as a reference when wiring up production scraping.
 */
export async function scrapeEbaySoldItems (seller) {
  const targetUrl = `https://www.ebay.com/sch/i.html?_ssn=${encodeURIComponent(seller)}&LH_Sold=1&LH_Complete=1`;
  logger.debug({ targetUrl }, 'Fetching seller page');

  const { data: html } = await http.get(targetUrl);
  const $ = load(html);

  const sales = [];
  $('.s-item').each((_, el) => {
    const $el = $(el);
    const title = $el.find('.s-item__title').text().trim();
    const priceText = $el.find('.s-item__price').text();
    const statusText = $el.find('.s-item__title--tagblock .POSITIVE').text() || $el.find('.s-item__title--tagblock').text();
    const dateMatch = statusText.match(/Sold\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);

    if (title && priceText && dateMatch) {
      const sanitized = priceText.replace(/[^\d.,-]/g, '').replace(',', '');
      const price = Number(parseFloat(sanitized).toFixed(2));
      const dateSold = new Date(dateMatch[1]).toISOString().split('T')[0];

      if (!Number.isNaN(price)) {
        sales.push({
          title,
          price,
          currency: priceText.includes('$') ? 'USD' : 'UNKNOWN',
          dateSold,
          listingUrl: $el.find('.s-item__link').attr('href')
        });
      }
    }
  });

  return sales;
}


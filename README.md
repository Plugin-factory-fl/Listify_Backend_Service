# Listify Backend

Backend service for the Listify Chrome extension. Provides an authenticated API that will scrape eBay seller sales data (currently stubbed) so the extension can fetch results without being blocked.

## Requirements

- Node.js 18+
- Environment variables (see `.env.example`)
- Proxy provider (recommended for production scraping)

## Setup

1. Copy `.env.example` to `.env` and fill in the secrets.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Test the endpoint:
   ```bash
   curl -X POST http://localhost:4000/seller-sales \
     -H "Authorization: Bearer super-secure-shared-token" \
     -H "Content-Type: application/json" \
     -d '{"seller":"guaranteecellular","timeframeDays":7}'
   ```

## Deployment (Render)

1. Push this repository to GitHub.
2. Create a Render “Web Service” pointing to the repo.
3. Set env vars in Render (same as `.env`).
4. Render will run `npm install` and `npm start` by default.

## TODO

- Replace the mocked sales in `fetchSellerSales` with real scraping (`scrapeEbaySoldItems`).
- Add caching, retry logic, and proxy rotation.
- Integrate OpenAI server-side if desired later.


import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * Build an axios instance with optional proxy & random user-agent.
 */
export function createHttpClient () {
  const headers = {
    'User-Agent': randomUserAgent(),
    'Accept-Language': 'en-US,en;q=0.9'
  };

  const proxyUrl = process.env.SCRAPE_PROXY_URL;
  const proxyUser = process.env.SCRAPE_PROXY_USER;
  const proxyPass = process.env.SCRAPE_PROXY_PASS;

  let agent;
  if (proxyUrl) {
    try {
      const proxy = new URL(proxyUrl);

      const isPlaceholderProxy = proxy.hostname.includes('example.com') || proxy.hostname === 'proxy.example.com';
      if (!isPlaceholderProxy) {
        if (proxyUser && proxyPass) {
          proxy.username = proxyUser;
          proxy.password = proxyPass;
        }
        agent = new HttpsProxyAgent(proxy);
      }
    } catch (error) {
      console.warn('Invalid proxy URL provided, skipping proxy configuration:', proxyUrl, error?.message);
    }
  }

  return axios.create({
    timeout: Number(process.env.REQUEST_TIMEOUT_MS || 20000),
    headers,
    httpAgent: agent,
    httpsAgent: agent
  });
}

function randomUserAgent () {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}


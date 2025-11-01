export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { from, to, countries, importance } = req.query;

    const dateFrom = from || new Date().toISOString().split('T')[0];
    const dateTo = to || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const countriesParam = countries || '32,37,25,72,6,22,17,39,14';
    const importanceParam = importance || '1,2,3';

    const params = new URLSearchParams({
      format: 'json',
      from: dateFrom,
      to: dateTo,
      countries: countriesParam,
      importance: importanceParam
    });

    const apiUrl = `https://calendar.gt.tc/index.php?${params.toString()}`;

    console.log('[Proxy] Fetching:', apiUrl);

    // Headers que simulan un navegador Chrome real
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'sec-ch-ua': '"Chromium";v="120", "Google Chrome";v="120", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
    });

    console.log('[Proxy] Response status:', response.status);
    console.log('[Proxy] Content-Type:', response.headers.get('content-type'));

    if (!response.ok) {
      const text = await response.text();
      console.error('[Proxy] Error response:', text.substring(0, 500));
      return res.status(response.status).json({
        error: `Calendar API returned ${response.status}`,
        details: text.substring(0, 200)
      });
    }

    const text = await response.text();
    
    console.log('[Proxy] Response preview:', text.substring(0, 100));

    // Verificar si es HTML (antibot)
    if (text.includes('<html') || text.includes('<script') || text.includes('<!DOCTYPE')) {
      console.error('[Proxy] Anti-bot challenge detected');
      
      // Intentar extraer más información del error
      const isCloudflare = text.includes('cloudflare') || text.includes('cf-');
      const isInfinityFree = text.includes('infinityfree') || text.includes('aes.js');
      
      return res.status(503).json({
        error: 'Server returned HTML instead of JSON',
        details: isCloudflare ? 'Cloudflare challenge' : isInfinityFree ? 'InfinityFree anti-bot' : 'Unknown protection',
        preview: text.substring(0, 300)
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error('[Proxy] JSON parse error');
      return res.status(500).json({
        error: 'Invalid JSON from calendar API',
        details: text.substring(0, 200)
      });
    }

    console.log('[Proxy] ✅ Success! Events:', data.metadata?.total_events || 'unknown');

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);

  } catch (error) {
    console.error('[Proxy] Exception:', error.message);
    res.status(500).json({
      error: 'Proxy internal error',
      details: error.message
    });
  }
}

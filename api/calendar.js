export default async function handler(req, res) {
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

    console.log('[Vercel] Proxying to InfinityFree index.php');

    // ✅ USAR tu index.php en InfinityFree que YA FUNCIONA
    const proxyUrl = `https://calendar.gt.tc/index.php?format=json&from=${dateFrom}&to=${dateTo}&countries=${countriesParam}&importance=${importanceParam}`;

    console.log('[Vercel] Calling:', proxyUrl);

    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    console.log('[Vercel] Response status:', response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error('[Vercel] Error:', text.substring(0, 200));
      return res.status(response.status).json({
        error: `Calendar API returned ${response.status}`,
        details: text.substring(0, 200)
      });
    }

    const data = await response.json();

    console.log('[Vercel] ✅ Success!');

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);

  } catch (error) {
    console.error('[Vercel] Error:', error.message);
    res.status(500).json({
      error: 'Proxy error',
      details: error.message
    });
  }
}

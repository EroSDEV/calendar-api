export default async function handler(req, res) {
  // Manejar preflight CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Obtener parámetros de la query string
    const { from, to, countries, importance } = req.query;

    // Valores por defecto
    const dateFrom = from || new Date().toISOString().split('T')[0];
    const dateTo = to || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const countriesParam = countries || '32,37,25,72,6,22,17,39,14';
    const importanceParam = importance || '1,2,3';

    // Construir URL de calendar.gt.tc
    const params = new URLSearchParams({
      format: 'json',
      from: dateFrom,
      to: dateTo,
      countries: countriesParam,
      importance: importanceParam
    });

    const apiUrl = `https://calendar.gt.tc/index.php?${params.toString()}`;

    console.log('[Proxy] Fetching:', apiUrl);

    // Llamar a calendar.gt.tc
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://calendar.gt.tc/',
      },
    });

    console.log('[Proxy] Status:', response.status);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Calendar API returned ${response.status}`,
        details: await response.text()
      });
    }

    const text = await response.text();

    // Verificar que sea JSON válido
    if (text.includes('<html') || text.includes('<script')) {
      return res.status(503).json({
        error: 'Server returned HTML instead of JSON',
        details: 'Anti-bot protection may be active'
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      return res.status(500).json({
        error: 'Invalid JSON from calendar API',
        details: text.substring(0, 200)
      });
    }

    console.log('[Proxy] Success! Returning data');

    // Devolver datos con headers CORS
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);

  } catch (error) {
    console.error('[Proxy] Error:', error.message);
    res.status(500).json({
      error: 'Proxy internal error',
      details: error.message
    });
  }
}
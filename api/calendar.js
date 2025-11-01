export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Lazy import
    const { kv } = await import('@vercel/kv');

    console.log('[Calendar] Buscando en KV...');

    // Obtener desde KV
    let data = await kv.get('calendar-data');

    if (data) {
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }
      console.log('[Calendar] ✅ Desde KV');
    } else {
      console.log('[Calendar] KV vacío, intentando InfinityFree...');

      const calendarUrl = 'https://calendar.gt.tc/index.php?format=json&from=2025-11-01&to=2025-12-31&countries=32,37,25,72,6,22,17,39,14&importance=1,2,3';

      const response = await fetch(calendarUrl);

      if (response.ok) {
        data = await response.json();
        console.log('[Calendar] ✅ Desde InfinityFree');

        // Guardar en KV para próxima vez
        try {
          await kv.set('calendar-data', JSON.stringify(data), { ex: 3600 });
        } catch (e) {
          console.log('[Calendar] No se pudo guardar en KV');
        }
      } else {
        console.error('[Calendar] InfinityFree error:', response.status);
      }
    }

    if (!data) {
      return res.status(503).json({
        error: 'Calendar data not available',
        details: 'No cached data and direct fetch failed'
      });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);

  } catch (error) {
    console.error('[Calendar] Error:', error.message);
    res.status(500).json({
      error: 'Calendar error',
      details: error.message
    });
  }
}

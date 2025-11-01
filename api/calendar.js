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

    console.log('[Calendar] Obteniendo datos...');

    // Importar KV
    const { kv } = await import('@vercel/kv');

    // Leer desde cache de Vercel KV
    let cachedData = await kv.get('calendar-data');

    if (!cachedData) {
      console.log('[Calendar] No hay cache, intentando sincronizar...');
      
      // Si no hay cache, intentar obtener directamente
      try {
        const response = await fetch(
          `https://calendar.gt.tc/index.php?format=json&from=${from || new Date().toISOString().split('T')[0]}&to=${to || new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0]}&countries=${countries || '32,37,25'}&importance=${importance || '1,2,3'}`,
          { method: 'GET', headers: { 'Accept': 'application/json' } }
        );

        if (response.ok) {
          cachedData = await response.json();
          // Guardar en cache para próximas peticiones
          await kv.set('calendar-data', JSON.stringify(cachedData), { ex: 3600 });
          console.log('[Calendar] ✅ Datos obtenidos directamente');
        }
      } catch (e) {
        console.error('[Calendar] No se pudo obtener datos:', e.message);
      }
    } else {
      console.log('[Calendar] ✅ Usando datos cacheados');
      cachedData = JSON.parse(cachedData);
    }

    if (!cachedData) {
      return res.status(503).json({
        error: 'Calendar data not available',
        details: 'Cache is empty and direct fetch failed'
      });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json(cachedData);

  } catch (error) {
    console.error('[Calendar] Error:', error.message);
    res.status(500).json({
      error: 'Calendar error',
      details: error.message
    });
  }
}

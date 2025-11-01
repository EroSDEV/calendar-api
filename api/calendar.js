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

    console.log('[Vercel] Intentando obtener datos...');

    // Intentar primero desde calendar.gt.tc
    let data = null;
    let source = '';

    try {
      console.log('[Vercel] Intentando: calendar.gt.tc/index.php');
      const response = await fetch(
        `https://calendar.gt.tc/index.php?format=json&from=${dateFrom}&to=${dateTo}&countries=${countriesParam}&importance=${importanceParam}`,
        { method: 'GET', headers: { 'Accept': 'application/json' } }
      );

      if (response.ok) {
        data = await response.json();
        source = 'calendar.gt.tc';
        console.log('[Vercel] ✅ Datos obtenidos desde calendar.gt.tc');
      }
    } catch (error) {
      console.log('[Vercel] calendar.gt.tc falló:', error.message);
    }

    // Si falló, usar datos mock (último recurso)
    if (!data) {
      console.log('[Vercel] Usando datos mock como fallback');
      data = {
        status: 'success',
        metadata: {
          source: 'mock-data',
          generated_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
          total_events: 0,
          warning: 'Calendar service temporarily unavailable, showing cached data'
        },
        data: {
          events_by_date: {},
          summary: { total: 0 }
        }
      };
      source = 'mock';
    }

    // Asegurar estructura correcta
    if (!data.metadata) {
      data.metadata = {
        source: source,
        generated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      };
    }

    console.log('[Vercel] ✅ Devolviendo datos desde:', source);

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

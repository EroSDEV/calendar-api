// Este endpoint se ejecuta periodicamente desde Vercel Cron

export default async function handler(req, res) {
  // Validar que es una petición del cron de Vercel
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[Sync] Iniciando sincronización de datos...');

    // Obtener datos de InfinityFree
    const calendarUrl = 'https://calendar.gt.tc/index.php?format=json&from=2025-11-01&to=2025-12-31&countries=32,37,25,72,6,22,17,39,14&importance=1,2,3';

    const response = await fetch(calendarUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      console.error('[Sync] InfinityFree responded with:', response.status);
      return res.status(500).json({ error: 'Failed to fetch from calendar.gt.tc' });
    }

    const data = await response.json();

    // Guardar en Vercel KV
    // (Necesitas haber conectado KV en el dashboard de Vercel)
    const { kv } = await import('@vercel/kv');
    await kv.set('calendar-data', JSON.stringify(data), { ex: 3600 }); // 1 hora de TTL

    console.log('[Sync] ✅ Datos sincronizados y guardados en KV');

    res.status(200).json({
      status: 'success',
      message: 'Calendar data synced',
      timestamp: new Date().toISOString(),
      events: Object.keys(data.data?.events_by_date || {}).length
    });

  } catch (error) {
    console.error('[Sync] Error:', error.message);
    res.status(500).json({
      error: 'Sync failed',
      details: error.message
    });
  }
}

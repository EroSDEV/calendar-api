export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[Sync] Sincronizando...');

    const { kv } = await import('@vercel/kv');

    const calendarUrl = 'https://calendar.gt.tc/index.php?format=json&from=2025-11-01&to=2025-12-31&countries=32,37,25,72,6,22,17,39,14&importance=1,2,3';

    const response = await fetch(calendarUrl);

    if (!response.ok) {
      console.error('[Sync] Error:', response.status);
      return res.status(500).json({ error: 'InfinityFree error' });
    }

    const data = await response.json();

    // Guardar en KV con 1 hora de expiración
    await kv.set('calendar-data', JSON.stringify(data), { ex: 3600 });

    const eventCount = Object.keys(data.data?.events_by_date || {}).reduce(
      (sum, date) => sum + data.data.events_by_date[date].length, 0
    );

    console.log('[Sync] ✅ Guardado en KV');

    res.status(200).json({
      status: 'success',
      timestamp: new Date().toISOString(),
      total_events: eventCount
    });

  } catch (error) {
    console.error('[Sync] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

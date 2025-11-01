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

    console.log('[Proxy] Calling investing.com directly');
    console.log('[Proxy] Date range:', dateFrom, 'to', dateTo);

    // Llamar directamente a investing.com (bypass InfinityFree)
    const postData = new URLSearchParams({
      'dateFrom': dateFrom,
      'dateTo': dateTo,
      'country': countriesParam,
      'importance': importanceParam,
      'timeZone': '8',
      'timeFilter': 'timeRemain',
      'currentTab': 'custom'
    });

    const investingUrl = 'https://www.investing.com/economic-calendar/Service/getCalendarFilteredData';

    const response = await fetch(investingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://www.investing.com',
        'Referer': 'https://www.investing.com/economic-calendar/',
        'X-Requested-With': 'XMLHttpRequest',
        'sec-ch-ua': '"Chromium";v="120", "Google Chrome";v="120", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
      body: postData.toString()
    });

    console.log('[Proxy] Investing.com response status:', response.status);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Investing.com returned ${response.status}`
      });
    }

    const data = await response.json();
    
    if (!data.data) {
      console.error('[Proxy] Invalid response structure');
      return res.status(500).json({
        error: 'Invalid response from investing.com',
        details: 'Missing data field'
      });
    }

    console.log('[Proxy] ✅ Success! Raw HTML received, processing...');

    // Parsear el HTML y extraer eventos (simplificado)
    const events = parseInvestingHTML(data.data);

    const result = {
      status: 'success',
      metadata: {
        source: 'investing.com',
        generated_at: new Date().toISOString(),
        generated_timestamp: Date.now(),
        timezone: 'UTC',
        query_parameters: {
          date_from: dateFrom,
          date_to: dateTo,
          countries: countriesParam.split(','),
          importance_filter: importanceParam.split(',')
        }
      },
      data: {
        events_by_date: events,
        summary: {
          total: Object.values(events).reduce((acc, arr) => acc + arr.length, 0)
        }
      }
    };

    console.log('[Proxy] Total events:', result.data.summary.total);

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json(result);

  } catch (error) {
    console.error('[Proxy] Error:', error.message);
    res.status(500).json({
      error: 'Proxy error',
      details: error.message
    });
  }
}

// Parser básico del HTML de investing.com
function parseInvestingHTML(html) {
  const events = {};
  
  try {
    // Usar regex simple para extraer eventos del HTML
    // Este es un parser básico - puede mejorarse
    
    const dateMatches = html.matchAll(/<td colspan="9" class="theDay"[^>]*>([^<]+)<\/td>/g);
    const rowMatches = html.matchAll(/id="eventRowId_(\d+)"[^>]*>([\s\S]*?)<\/tr>/g);
    
    let currentDate = '';
    
    for (const match of dateMatches) {
      currentDate = match[1].trim();
      if (!events[currentDate]) {
        events[currentDate] = [];
      }
    }
    
    for (const match of rowMatches) {
      const eventId = match[1];
      const rowHtml = match[2];
      
      // Extraer datos básicos con regex
      const timeMatch = rowHtml.match(/<td[^>]*class="[^"]*time[^"]*"[^>]*>([^<]+)<\/td>/);
      const currencyMatch = rowHtml.match(/<span[^>]*title="[^"]*"[^>]*>([A-Z]{3})<\/span>/);
      const eventMatch = rowHtml.match(/<a[^>]*>([^<]+)<\/a>|<span[^>]*>([^<]+)<\/span>/);
      const importanceMatch = rowHtml.match(/grayFullBullishIcon/g);
      
      const event = {
        id: eventId,
        time: timeMatch ? timeMatch[1].trim() : 'All Day',
        currency: currencyMatch ? currencyMatch[1] : '',
        event_name: eventMatch ? (eventMatch[1] || eventMatch[2] || '').trim() : '',
        importance: importanceMatch ? importanceMatch.length : 1,
        actual: '',
        forecast: '',
        previous: ''
      };
      
      // Solo agregar si tiene nombre
      if (event.event_name && currentDate) {
        if (!events[currentDate]) {
          events[currentDate] = [];
        }
        events[currentDate].push(event);
      }
    }
    
  } catch (error) {
    console.error('[Parser] Error:', error.message);
  }
  
  return events;
}

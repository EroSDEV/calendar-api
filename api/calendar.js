export default async function handler(req, res) {
  // CORS
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

    console.log('[Vercel Proxy] Fetching data...');
    console.log('[Vercel Proxy] Date range:', dateFrom, 'to', dateTo);

    // Construir el POST body igual que tu PHP
    const postData = new URLSearchParams({
      'dateFrom': dateFrom,
      'dateTo': dateTo,
      'country': countriesParam,
      'importance': importanceParam,
      'timeZone': '8',
      'timeFilter': 'timeRemain',
      'currentTab': 'custom'
    }).toString();

    const investingUrl = 'https://www.investing.com/economic-calendar/Service/getCalendarFilteredData';

    // Llamar a investing.com con los MISMOS headers que tu PHP
    const response = await fetch(investingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Origin': 'https://www.investing.com',
        'Referer': 'https://www.investing.com/economic-calendar/',
        'X-Requested-With': 'XMLHttpRequest',
        'Connection': 'keep-alive',
        'sec-ch-ua': '"Chromium";v="120", "Google Chrome";v="120", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: postData
    });

    console.log('[Vercel Proxy] Investing.com status:', response.status);

    if (!response.ok) {
      console.error('[Vercel Proxy] Investing.com error:', response.status);
      return res.status(response.status).json({
        error: `Investing.com returned ${response.status}`,
        details: 'Server may be blocking requests'
      });
    }

    const jsonData = await response.json();

    if (!jsonData.data) {
      console.error('[Vercel Proxy] Invalid response structure');
      return res.status(500).json({
        error: 'Invalid response from investing.com',
        received: Object.keys(jsonData)
      });
    }

    console.log('[Vercel Proxy] ✅ HTML received, parsing...');

    // Usar el mismo parser que tu PHP (adaptado a JS)
    const groupedEvents = parseInvestingHTML(jsonData.data);

    // Calcular estadísticas
    let totalEvents = 0;
    let highCount = 0, mediumCount = 0, lowCount = 0, holidayCount = 0;
    const currencies = new Set();

    for (const [date, events] of Object.entries(groupedEvents)) {
      totalEvents += events.length;
      for (const event of events) {
        if (event.importance === 3) highCount++;
        else if (event.importance === 2) mediumCount++;
        else if (event.importance === 1) lowCount++;
        else if (event.importance === 0) holidayCount++;
        
        if (event.currency) currencies.add(event.currency);
      }
    }

    const result = {
      status: 'success',
      metadata: {
        source: 'investing.com',
        generated_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
        generated_timestamp: Math.floor(Date.now() / 1000),
        timezone: 'UTC',
        total_events: totalEvents,
        total_days: Object.keys(groupedEvents).length,
        pagination: 'Automatic chunking for ranges > 7 days',
        query_parameters: {
          date_from: dateFrom,
          date_to: dateTo,
          countries: countriesParam.split(','),
          importance_filter: importanceParam.split(',')
        },
        donate: {
          eth: '0x8a12552036459ea2d83d12017fd52a1643f95166'
        }
      },
      data: {
        events_by_date: groupedEvents,
        summary: {
          total: totalEvents,
          by_importance: {
            high: highCount,
            medium: mediumCount,
            low: lowCount,
            holidays: holidayCount
          },
          currencies: Array.from(currencies)
        }
      }
    };

    console.log('[Vercel Proxy] ✅ Success! Total events:', totalEvents);

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json(result);

  } catch (error) {
    console.error('[Vercel Proxy] Exception:', error.message);
    res.status(500).json({
      error: 'Proxy internal error',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Parser del HTML de investing.com (igual que tu PHP pero en JS)
function parseInvestingHTML(html) {
  const groupedEvents = {};
  let currentDate = '';

  try {
    // Split por filas
    const rows = html.split('<tr');

    for (const row of rows) {
      // Detectar fecha (theDay)
      const dayMatch = row.match(/colspan="9"[^>]*class="theDay"[^>]*>([^<]+)</i);
      if (dayMatch) {
        currentDate = dayMatch[1].trim();
        if (!groupedEvents[currentDate]) {
          groupedEvents[currentDate] = [];
        }
        continue;
      }

      // Detectar evento (eventRowId)
      const eventIdMatch = row.match(/id="eventRowId[_]?(\d+)"/);
      if (!eventIdMatch) continue;

      const eventId = eventIdMatch[1];

      // Extraer time
      const timeMatch = row.match(/class="[^"]*time[^"]*">([^<]+)</);
      const time = timeMatch ? timeMatch[1].trim() : 'All Day';

      // Extraer currency
      const currencyMatch = row.match(/title="[^"]*">([A-Z]{3})</);
      const currency = currencyMatch ? currencyMatch[1] : '';

      // Detectar holiday
      const isHoliday = row.includes('<span class="bold">Holiday</span>');

      // Extraer importance (número de iconos grayFullBullishIcon)
      const importanceIcons = (row.match(/grayFullBullishIcon/g) || []).length;
      const importance = isHoliday ? 0 : (importanceIcons > 0 ? importanceIcons : 1);

      // Extraer event name
      let eventName = '';
      if (isHoliday) {
        const holidayMatch = row.match(/colspan="6"[^>]*class="[^"]*event[^>]*>([^<]+)</);
        eventName = holidayMatch ? holidayMatch[1].trim() : '';
      } else {
        const nameMatch = row.match(/class="[^"]*event[^"]*><a[^>]*>([^<]+)<\/a>/) || 
                         row.match(/class="[^"]*event[^"]*>([^<]+)</);
        eventName = nameMatch ? nameMatch[1].trim() : '';
      }

      // Extraer actual, forecast, previous
      let actual = '', forecast = '', previous = '';
      if (!isHoliday && eventId) {
        const actMatch = row.match(new RegExp(`id="eventAct_${eventId}"[^>]*>(?:<span[^>]*>)?([^<]+)`));
        const foreMatch = row.match(new RegExp(`id="eventFore_${eventId}"[^>]*>(?:<span[^>]*>)?([^<]+)`));
        const prevMatch = row.match(new RegExp(`id="eventPrev_${eventId}"[^>]*>(?:<span[^>]*>)?([^<]+)`));

        actual = actMatch ? actMatch[1].trim().replace(/&nbsp;/g, '') : '';
        forecast = foreMatch ? foreMatch[1].trim().replace(/&nbsp;/g, '') : '';
        previous = prevMatch ? prevMatch[1].trim().replace(/&nbsp;/g, '') : '';
      }

      // Crear evento
      if (eventName && currentDate) {
        groupedEvents[currentDate].push({
          id: eventId,
          time,
          currency,
          importance,
          is_holiday: isHoliday,
          event_name: eventName,
          actual,
          forecast,
          previous
        });
      }
    }

  } catch (error) {
    console.error('[Parser] Error:', error.message);
  }

  return groupedEvents;
}

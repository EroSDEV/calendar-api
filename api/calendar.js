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

    console.log('[Vercel] Fetching economic calendar data');
    console.log('[Vercel] Date range:', dateFrom, 'to', dateTo);

    // POST body - EXACTO como tu PHP
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

    // MÉTODO POST - como tu PHP hace con cURL
    const response = await fetch(investingUrl, {
      method: 'POST',  // ← IMPORTANTE: POST, no GET
      headers: {
        'authority': 'www.investing.com',
        'accept': 'application/json, text/javascript, */*; q=0.01',
        'content-type': 'application/x-www-form-urlencoded',  // ← Content-Type correcto
        'origin': 'https://www.investing.com',
        'referer': 'https://www.investing.com/economic-calendar/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'x-requested-with': 'XMLHttpRequest'
      },
      body: postData  // ← Body con URLSearchParams
    });

    console.log('[Vercel] Response status:', response.status);

    if (!response.ok) {
      console.error('[Vercel] HTTP error:', response.status);
      const text = await response.text();
      return res.status(response.status).json({
        error: `HTTP ${response.status}`,
        details: text.substring(0, 200)
      });
    }

    const jsonData = await response.json();

    if (!jsonData.data) {
      console.error('[Vercel] Missing data field');
      return res.status(500).json({
        error: 'Invalid response from investing.com',
        received: Object.keys(jsonData)
      });
    }

    console.log('[Vercel] ✅ Data received, parsing...');

    const groupedEvents = parseInvestingHTML(jsonData.data);

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
        query_parameters: {
          date_from: dateFrom,
          date_to: dateTo,
          countries: countriesParam.split(','),
          importance_filter: importanceParam.split(',')
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

    console.log('[Vercel] ✅ Success! Total events:', totalEvents);

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json(result);

  } catch (error) {
    console.error('[Vercel] Exception:', error.message);
    res.status(500).json({
      error: 'Proxy error',
      details: error.message
    });
  }
}

function parseInvestingHTML(html) {
  const groupedEvents = {};
  let currentDate = '';

  try {
    const rows = html.split('<tr');

    for (const row of rows) {
      const dayMatch = row.match(/colspan="9"[^>]*class="theDay"[^>]*>([^<]+)</i);
      if (dayMatch) {
        currentDate = dayMatch[1].trim();
        if (!groupedEvents[currentDate]) {
          groupedEvents[currentDate] = [];
        }
        continue;
      }

      const eventIdMatch = row.match(/id="eventRowId[_]?(\d+)"/);
      if (!eventIdMatch) continue;

      const eventId = eventIdMatch[1];
      const timeMatch = row.match(/class="[^"]*time[^"]*">([^<]+)</);
      const time = timeMatch ? timeMatch[1].trim() : 'All Day';
      const currencyMatch = row.match(/title="[^"]*">([A-Z]{3})</);
      const currency = currencyMatch ? currencyMatch[1] : '';
      const isHoliday = row.includes('<span class="bold">Holiday</span>');
      const importanceIcons = (row.match(/grayFullBullishIcon/g) || []).length;
      const importance = isHoliday ? 0 : (importanceIcons > 0 ? importanceIcons : 1);

      let eventName = '';
      if (isHoliday) {
        const holidayMatch = row.match(/colspan="6"[^>]*class="[^"]*event[^>]*>([^<]+)</);
        eventName = holidayMatch ? holidayMatch[1].trim() : '';
      } else {
        const nameMatch = row.match(/class="[^"]*event[^"]*><a[^>]*>([^<]+)<\/a>/) || 
                         row.match(/class="[^"]*event[^"]*>([^<]+)</);
        eventName = nameMatch ? nameMatch[1].trim() : '';
      }

      let actual = '', forecast = '', previous = '';
      if (!isHoliday && eventId) {
        const actMatch = row.match(new RegExp(`id="eventAct_${eventId}"[^>]*>(?:<span[^>]*>)?([^<]+)`));
        const foreMatch = row.match(new RegExp(`id="eventFore_${eventId}"[^>]*>(?:<span[^>]*>)?([^<]+)`));
        const prevMatch = row.match(new RegExp(`id="eventPrev_${eventId}"[^>]*>(?:<span[^>]*>)?([^<]+)`));

        actual = actMatch ? actMatch[1].trim().replace(/&nbsp;/g, '') : '';
        forecast = foreMatch ? foreMatch[1].trim().replace(/&nbsp;/g, '') : '';
        previous = prevMatch ? prevMatch[1].trim().replace(/&nbsp;/g, '') : '';
      }

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

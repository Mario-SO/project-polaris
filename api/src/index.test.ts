import { describe, expect, it } from 'bun:test'
import app from './index' // Assuming your app is exported from index.ts

describe('Renfe Timetables API Tests', () => {
  it('should return 200 OK for the root path with greeting', async () => {
    const req = new Request('http://localhost/')
    const res = await app.fetch(req)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('Hello from Renfe Timetables API!')
  })

  // Tests for /stations
  it('should return a list of stations for /stations', async () => {
    const req = new Request('http://localhost/stations')
    const res = await app.fetch(req)
    expect(res.status).toBe(200)
    const data = await res.json() as any;
    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
        expect(data[0]).toHaveProperty('stop_id')
        expect(data[0]).toHaveProperty('stop_name')
    }
  })

  it('should return a filtered list of stations for /stations?q=query', async () => {
    // Assuming 'MADRID' will return some results. Adjust if your test DB is different.
    const req = new Request('http://localhost/stations?q=MADRID') 
    const res = await app.fetch(req)
    expect(res.status).toBe(200)
    const data = await res.json() as any;
    expect(Array.isArray(data)).toBe(true)
    // Check if all returned stations contain 'MADRID' (case-insensitive)
    if (data.length > 0) {
        data.forEach((station: any) => {
            expect(station.stop_name.toLowerCase()).toContain('madrid')
        })
    }
  })

  it('should return an empty list for /stations?q=nonexistentquery', async () => {
    const req = new Request('http://localhost/stations?q=NonExistentStationQuery123XYZ')
    const res = await app.fetch(req)
    expect(res.status).toBe(200) // API returns 200 with empty array
    const data = await res.json() as any;
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(0)
  })

  // Tests for /stations/:stationId
  it('should return station details for /stations/:stationId with a valid ID', async () => {
    // You'll need a valid stop_id from your gtfs.sqlite for this test to pass.
    // Let's assume 'Atocha-Cercanias' is a valid stop_id. Replace if needed.
    // First, fetch all stations to get a valid ID, or use a known one.
    const stationsRes = await app.fetch(new Request('http://localhost/stations'))
    const stations = await stationsRes.json() as any[];
    if (stations.length === 0) {
        console.warn('Skipping /stations/:stationId test as no stations found to pick an ID from.');
        return; // Cannot proceed if no stations
    }
    const validStationId = stations[0].stop_id;

    const req = new Request(`http://localhost/stations/${validStationId}`)
    const res = await app.fetch(req)
    expect(res.status).toBe(200)
    const data = await res.json() as any;
    expect(data).toHaveProperty('stop_id')
    expect(data.stop_id).toBe(validStationId)
    expect(data).toHaveProperty('stop_name')
  })

  it('should return 404 for /stations/:stationId with an invalid ID', async () => {
    const req = new Request('http://localhost/stations/invalidStationId123')
    const res = await app.fetch(req)
    expect(res.status).toBe(404)
    const data = await res.json() as any;
    expect(data).toHaveProperty('error')
  })

  // Tests for /:departureStation/:arrivalStation
  it('should return timetable for /:departureStation/:arrivalStation (defaulting to today)', async () => {
    const depStation = 'MADRID'; 
    const arrStation = 'BARCELONA';
    const req = new Request(`http://localhost/${depStation}/${arrStation}`);
    const res = await app.fetch(req);
    
    expect([200, 404]).toContain(res.status);
    const data = await res.json() as any;

    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    const todaysDateFormatted = `${year}-${month}-${day}`;

    if (res.status === 200) {
        expect(data).toHaveProperty('timetable');
        expect(Array.isArray(data.timetable)).toBe(true);
        expect(data.departure_station_found).toBeDefined();
        expect(data.arrival_station_found).toBeDefined();
        expect(data.date_queried).toBe(todaysDateFormatted); // Check if it defaulted to today
    } else { // 404
        expect(data).toHaveProperty('message');
        expect(data.date_queried).toBe(todaysDateFormatted);
    }
  })

  it('should return timetable for /:departureStation/:arrivalStation with a valid provided date', async () => {
    const depStation = 'MADRID';
    const arrStation = 'BARCELONA';
    const date = '2024-07-30'; // Use a date likely to have service, adjust if needed
    const req = new Request(`http://localhost/${depStation}/${arrStation}?date=${date}`)
    const res = await app.fetch(req)
    // console.log(`Test /${depStation}/${arrStation}?date=${date} response:`, res.status, await res.clone().text());
    expect([200, 404]).toContain(res.status)
    const data = await res.json() as any;
    if (res.status === 200) {
        expect(data).toHaveProperty('timetable')
        expect(data.date_queried).toBe(date)
    } else {
        expect(data).toHaveProperty('message')
    }
  })

  it('should return 400 for /:departureStation/:arrivalStation with an invalid date format', async () => {
    const req = new Request('http://localhost/MADRID/BARCELONA?date=invalid-date-format')
    const res = await app.fetch(req)
    expect(res.status).toBe(400)
    const data = await res.json() as any;
    expect(data).toHaveProperty('error')
    expect(data.error).toBe('Invalid date format. Please use YYYY-MM-DD.')
  })

  it('should return 404 if departure station is not found', async () => {
    const req = new Request('http://localhost/NonExistentStation123/BARCELONA')
    const res = await app.fetch(req)
    expect(res.status).toBe(404)
    const data = await res.json() as any;
    expect(data).toHaveProperty('error')
    expect(data.error).toContain('Departure station')
  })

  it('should return 404 if arrival station is not found', async () => {
    const req = new Request('http://localhost/MADRID/NonExistentStation456')
    const res = await app.fetch(req)
    expect(res.status).toBe(404)
    const data = await res.json() as any;
    expect(data).toHaveProperty('error')
    expect(data.error).toContain('Arrival station')
  })

  // Test for timetable endpoint when no services are found on a specific date
  it('should return 404 with specific message when no services operate on a given date', async () => {
    const depStation = 'MADRID'; 
    const arrStation = 'BARCELONA';
    const date = '1900-01-01'; 
    const req = new Request(`http://localhost/${depStation}/${arrStation}?date=${date}`);
    const res = await app.fetch(req);
    expect(res.status).toBe(404);
    const data = await res.json() as any; 
    expect(data).toHaveProperty('message');
    expect(data.message).toContain('No services found operating on');
    expect(data.date_queried).toBe(date);
  });

  // Test for the /next endpoint
  it('should return the next train for /:departureStation/:arrivalStation/next', async () => {
    const depStation = 'MADRID'; // Use stations likely to have frequent service
    const arrStation = 'BARCELONA';
    const req = new Request(`http://localhost/${depStation}/${arrStation}/next`);
    const res = await app.fetch(req);

    expect([200, 404]).toContain(res.status);
    const data = await res.json() as any;

    // Get current Spanish date for comparison (helper for test logic)
    const now = new Date();
    const optionsDateTime: Intl.DateTimeFormatOptions = {
        timeZone: 'Europe/Madrid',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour12: false // Ensure consistent formatting with API
    };
    const formatter = new Intl.DateTimeFormat('en-CA', optionsDateTime);
    const parts = formatter.formatToParts(now).reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
    }, {} as Record<Intl.DateTimeFormatPartTypes, string>);
    const todaysDateSpain = `${parts.year}-${parts.month}-${parts.day}`;

    expect(data).toHaveProperty('date_queried');
    expect(data.date_queried).toBe(todaysDateSpain);
    expect(data).toHaveProperty('time_queried'); // Time the API processed the request

    if (res.status === 200) {
        expect(data).toHaveProperty('next_train');
        expect(data.next_train).toHaveProperty('departure_station_departure_time');
        // Ensure the returned train is indeed in the future compared to when the API processed it
        expect(data.next_train.departure_station_departure_time > data.time_queried).toBe(true);
        expect(data.departure_station_found).toBeDefined();
        expect(data.arrival_station_found).toBeDefined();
    } else { // 404
        expect(data).toHaveProperty('message');
        expect(data.message).toContain('No further trains found');
    }
  });

  // Tests for /stations/:stationId/departures
  it('should return departures for /stations/:stationId/departures (defaulting to today)', async () => {
    const stationsRes = await app.fetch(new Request('http://localhost/stations'));
    const stations = await stationsRes.json() as any[];
    if (stations.length === 0) {
      console.warn('Skipping departures test as no stations found to pick an ID from.');
      return;
    }
    const stationId = stations[0].stop_id;
    const res = await app.fetch(new Request(`http://localhost/stations/${stationId}/departures`));
    expect([200, 404]).toContain(res.status);
    const data = await res.json() as any;
    if (res.status === 200) {
      expect(data).toHaveProperty('station_found');
      expect(data).toHaveProperty('station_id', stationId);
      expect(data).toHaveProperty('date_queried');
      expect(data).toHaveProperty('time_queried');
      expect(Array.isArray(data.departures)).toBe(true);
    } else {
      expect(data).toHaveProperty('message');
    }
  });

  it('should return departures for /stations/:stationId/departures with provided date and time', async () => {
    const stationsRes = await app.fetch(new Request('http://localhost/stations'));
    const stations = await stationsRes.json() as any[];
    if (stations.length === 0) {
      console.warn('Skipping departures test as no stations found to pick an ID from.');
      return;
    }
    const stationId = stations[0].stop_id;
    const date = '1900-01-01';
    const time = '00:00';
    const res = await app.fetch(new Request(`http://localhost/stations/${stationId}/departures?date=${date}&time=${time}`));
    expect(res.status).toBe(404);
    const data = await res.json() as any;
    expect(data).toHaveProperty('message');
  });

  // Tests for /routes
  it('should return a list of routes for /routes', async () => {
    const req = new Request('http://localhost/routes');
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('route_id');
      expect(data[0]).toHaveProperty('route_short_name');
      expect(data[0]).toHaveProperty('route_long_name');
    }
  });

  it('should return route details for /routes/:routeId', async () => {
    const routesRes = await app.fetch(new Request('http://localhost/routes'));
    const routes = await routesRes.json() as any[];
    if (routes.length === 0) {
      console.warn('Skipping /routes/:routeId test as no routes found to pick an ID from.');
      return;
    }
    const routeId = routes[0].route_id;
    const req = new Request(`http://localhost/routes/${routeId}`);
    const res = await app.fetch(req);
    expect([200, 404]).toContain(res.status);
    const data = await res.json() as any;
    if (res.status === 200) {
      expect(data).toHaveProperty('route_id', routeId);
      expect(data).toHaveProperty('route_short_name');
      expect(data).toHaveProperty('route_long_name');
      expect(Array.isArray(data.stops)).toBe(true);
    } else {
      expect(data).toHaveProperty('error');
    }
  });

}) 
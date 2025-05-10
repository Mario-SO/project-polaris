import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import path from 'path'

const app = new Hono()

// Determine the correct path to the data directory from api/src
// import.meta.dir is the directory of the current file (api/src)
const DB_PATH = path.resolve(import.meta.dir, '../../data/gtfs.sqlite')

console.log(`API attempting to use DB at: ${DB_PATH}`)

app.get('/', (c) => {
  return c.text('Hello from Renfe Timetables API!')
})

// Helper function to get day of the week (0=Sunday, 1=Monday, ..., 6=Saturday)
// GTFS calendar often uses 0/1 for service days, so we'll map to day names for query
const getDayOfWeekName = (date: Date): string => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
};

app.get('/stations', async (c) => {
    const queryParam = c.req.query('q');
    let db;
    try {
        db = new Database(DB_PATH, { readonly: true });
        let sql = "SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops ORDER BY stop_name";
        const params: string[] = [];
        if (queryParam) {
            sql = "SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE LOWER(stop_name) LIKE LOWER(?) ORDER BY stop_name LIMIT 50";
            params.push(`%${queryParam}%`);
        }
        const stmt = db.prepare(sql);
        const stations = stmt.all(...params);
        db.close();
        return c.json(stations);
    } catch (error: any) {
        console.error('API Error (/stations):', error);
        if (db) db.close();
        return c.json({ error: 'Failed to fetch stations', details: error.message }, 500);
    }
});

app.get('/stations/:stationId', async (c) => {
    const stationId = c.req.param('stationId');
    let db;
    try {
        db = new Database(DB_PATH, { readonly: true });
        const stmt = db.prepare(
            "SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_id = ?"
        );
        const station = stmt.get(stationId);
        db.close();

        if (!station) {
            return c.json({ error: `Station with ID '${stationId}' not found.` }, 404);
        }
        return c.json(station);
    } catch (error: any) {
        console.error(`API Error (/stations/${stationId}):`, error);
        if (db) db.close();
        return c.json({ error: 'Failed to fetch station details', details: error.message }, 500);
    }
});

app.get('/:departureStation/:arrivalStation', async (c) => {
  const departureStationName = c.req.param('departureStation')
  const arrivalStationName = c.req.param('arrivalStation')
  const queryDateInput = c.req.query('date') // Expects YYYY-MM-DD
  let db

  try {
    db = new Database(DB_PATH, { readonly: true })

    let effectiveQueryDate: string;
    let dateObj: Date;

    if (queryDateInput) {
        dateObj = new Date(queryDateInput);
        if (isNaN(dateObj.getTime())) {
            return c.json({ error: 'Invalid date format. Please use YYYY-MM-DD.' }, 400);
        }
        effectiveQueryDate = queryDateInput; // Use the provided date
    } else {
        // Default to today's date if no date is provided
        dateObj = new Date();
        const year = dateObj.getFullYear();
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
        const day = dateObj.getDate().toString().padStart(2, '0');
        effectiveQueryDate = `${year}-${month}-${day}`;
        console.log(`No date provided, defaulting to today: ${effectiveQueryDate}`);
    }

    console.log(`Querying for ${departureStationName} to ${arrivalStationName} on date ${effectiveQueryDate}`)

    // Step 1: Find stop_id for departure station (case-insensitive, partial match)
    const depStmt = db.prepare("SELECT stop_id, stop_name FROM stops WHERE LOWER(stop_name) LIKE LOWER(?) LIMIT 5")
    const depStopCandidates = depStmt.all(`%${departureStationName}%`)

    // Step 2: Find stop_id for arrival station (case-insensitive, partial match)
    const arrStmt = db.prepare("SELECT stop_id, stop_name FROM stops WHERE LOWER(stop_name) LIKE LOWER(?) LIMIT 5")
    const arrStopCandidates = arrStmt.all(`%${arrivalStationName}%`)

    if (!depStopCandidates || depStopCandidates.length === 0) {
      return c.json({ error: `Departure station '${departureStationName}' not found. Candidates: ${JSON.stringify(depStopCandidates)}` }, 404)
    }
    if (!arrStopCandidates || arrStopCandidates.length === 0) {
      return c.json({ error: `Arrival station '${arrivalStationName}' not found. Candidates: ${JSON.stringify(arrStopCandidates)}` }, 404)
    }

    // For MVP, we'll take the first candidate. A real app might let the user choose or have better matching.
    const departureStopId = (depStopCandidates[0] as { stop_id: string }).stop_id
    const actualDepartureStationName = (depStopCandidates[0] as { stop_name: string }).stop_name
    const arrivalStopId = (arrStopCandidates[0] as { stop_id: string }).stop_id
    const actualArrivalStationName = (arrStopCandidates[0] as { stop_name: string }).stop_name
    
    console.log(`Found departure ID: ${departureStopId} (${actualDepartureStationName}), arrival ID: ${arrivalStopId} (${actualArrivalStationName})`)

    // Always filter by date (either provided or today's date by default)
    const dayName = getDayOfWeekName(dateObj);
    const formattedQueryDate = effectiveQueryDate.replace(/-/g, ''); // GTFS uses YYYYMMDD

    // Subquery to get service IDs active on that date
    const calendarStmt = db.prepare(`
        SELECT service_id 
        FROM calendar 
        WHERE ${dayName} = '1' 
          AND start_date <= ? 
          AND end_date >= ?
    `);
    let serviceIdsSet = new Set(
        (calendarStmt.all(formattedQueryDate, formattedQueryDate) as { service_id: string }[]).map(s => s.service_id)
    );
    
    if (serviceIdsSet.size === 0) {
        return c.json({
            message: `No services found operating on ${effectiveQueryDate} according to the schedule.`,
            departure_station_used: actualDepartureStationName,
            arrival_station_used: actualArrivalStationName,
            date_queried: effectiveQueryDate
        }, 404)
    }
    const serviceIds = Array.from(serviceIdsSet);
    const serviceIdSubQuery = `AND t.service_id IN (${serviceIds.map(() => '?').join(',')}) `;
    const queryParams: (string | number)[] = [departureStopId, arrivalStopId, ...serviceIds];

    const baseQuery = `
      SELECT 
        r.route_short_name,
        r.route_long_name,
        MIN(t.trip_id) AS trip_id,      -- Pick one representative trip_id
        t.trip_headsign,                -- Assuming this is consistent for the group
        MIN(t.service_id) AS service_id, -- Pick one representative service_id
        st_dep.departure_time AS departure_station_departure_time,
        st_arr.arrival_time AS arrival_station_arrival_time
      FROM trips t
      JOIN routes r ON t.route_id = r.route_id
      JOIN stop_times st_dep ON t.trip_id = st_dep.trip_id
      JOIN stop_times st_arr ON t.trip_id = st_arr.trip_id
      WHERE st_dep.stop_id = ? 
        AND st_arr.stop_id = ? 
        AND st_dep.stop_sequence < st_arr.stop_sequence 
        ${serviceIdSubQuery} -- This will now always be populated based on effectiveQueryDate
      GROUP BY
        r.route_short_name,
        r.route_long_name,
        t.trip_headsign,
        st_dep.departure_time,
        st_arr.arrival_time
      ORDER BY st_dep.departure_time
      LIMIT 50; // Keep the limit for now, can be adjusted
    `

    const timetableStmt = db.prepare(baseQuery)
    const results = timetableStmt.all(...queryParams)

    db.close()

    if (results.length === 0) {
        return c.json({
            message: 'No direct trips found matching your criteria for the specified date.',
            departure_station_used: actualDepartureStationName,
            arrival_station_used: actualArrivalStationName,
            date_queried: effectiveQueryDate,
            info: "No trips found for the specified date."
        }, 404)
    }

    return c.json({
        departure_station_name_query: departureStationName,
        arrival_station_name_query: arrivalStationName,
        departure_station_found: actualDepartureStationName,
        arrival_station_found: actualArrivalStationName,
        date_queried: effectiveQueryDate, // Reflect the date used for the query
        timetable: results
    })

  } catch (error: any) {
    console.error('API Error (/:dep/:arr):', error)
    if (db) db.close()
    return c.json({ error: 'Failed to process request', details: error.message }, 500)
  }
})

app.get('/:departureStation/:arrivalStation/next', async (c) => {
    const departureStationName = c.req.param('departureStation');
    const arrivalStationName = c.req.param('arrivalStation');
    let db;

    try {
        db = new Database(DB_PATH, { readonly: true });

        // Get current date and time in Spain ('Europe/Madrid')
        const now = new Date();
        const optionsDateTime: Intl.DateTimeFormatOptions = {
            timeZone: 'Europe/Madrid',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        };
        const formatter = new Intl.DateTimeFormat('en-CA', optionsDateTime); // en-CA for YYYY-MM-DD
        const parts = formatter.formatToParts(now).reduce((acc, part) => {
            if (part.type !== 'literal') acc[part.type] = part.value;
            return acc;
        }, {} as Record<Intl.DateTimeFormatPartTypes, string>); 

        const today_YYYY_MM_DD_Spain = `${parts.year}-${parts.month}-${parts.day}`;
        const today_YYYYMMDD_Spain = `${parts.year}${parts.month}${parts.day}`;
        const currentTime_HHMMSS_Spain = `${parts.hour}:${parts.minute}:${parts.second}`;
        
        // Create a Date object representing the current moment in Spain for getDayOfWeekName
        // This is a bit tricky due to local parsing, but Intl parts give us Spanish wall time parts.
        // const dateObjSpain = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 
        //                                   Number(parts.hour), Number(parts.minute), Number(parts.second)));
        // Adjust for the fact that the above created a UTC date. We need a Date object that, when getDay() is called,
        // reflects the day in Spain. Simpler: use the parts directly for year/month/day to create a new Date then get the day from that.
        // However, the `now` object with toLocaleString for day name is simpler if `getDayOfWeekName` is robust.
        // For `getDayOfWeekName`, we need a Date instance whose local day corresponds to Spain's current day.
        // A simpler way is to create a new Date object from the Spanish date string components.
        // e.g. new Date("2024-05-10T12:00:00") is parsed as local. For GTFS, we need day of week in Spain.
        const tempDateForDay = new Date(Number(parts.year), Number(parts.month) -1, Number(parts.day)); // Corrected to use Number()
        // const dayNameSpain = getDayOfWeekName(tempDateForDay); // This uses server's local interpretation of date parts from Spain.
                                                                // Let's ensure getDayOfWeekName uses a date correctly reflecting Spain's date.
        // Best: Create a new Date object based on current UTC, then getDay() for Spain day.
        // This requires knowing the offset or using a library. Sticking to simpler for now:
        // Use `now` and let `getDayOfWeekName` interpret it. If server is UTC, it will be UTC day. Needs care.
        // Correct approach for dayNameSpain:
        // Construct a date that accurately represents the current *date* in Spain to get the correct day of the week.
        const currentSpanishDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
        const dayNameSpainCorrect = getDayOfWeekName(currentSpanishDate);

        console.log(`Finding next train for ${departureStationName} to ${arrivalStationName}. Current Spanish time: ${today_YYYY_MM_DD_Spain} ${currentTime_HHMMSS_Spain}, Day: ${dayNameSpainCorrect}`);

        const depStmt = db.prepare("SELECT stop_id, stop_name FROM stops WHERE LOWER(stop_name) LIKE LOWER(?) LIMIT 1");
        const depStopCandidate = depStmt.get(`%${departureStationName}%`) as { stop_id: string, stop_name: string } | undefined;
        const arrStmt = db.prepare("SELECT stop_id, stop_name FROM stops WHERE LOWER(stop_name) LIKE LOWER(?) LIMIT 1");
        const arrStopCandidate = arrStmt.get(`%${arrivalStationName}%`) as { stop_id: string, stop_name: string } | undefined;

        if (!depStopCandidate) return c.json({ error: `Departure station '${departureStationName}' not found.` }, 404);
        if (!arrStopCandidate) return c.json({ error: `Arrival station '${arrivalStationName}' not found.` }, 404);

        const departureStopId = depStopCandidate.stop_id;
        const actualDepartureStationName = depStopCandidate.stop_name;
        const arrivalStopId = arrStopCandidate.stop_id;
        const actualArrivalStationName = arrStopCandidate.stop_name;

        const calendarStmt = db.prepare(
            `SELECT service_id FROM calendar WHERE ${dayNameSpainCorrect} = '1' AND start_date <= ? AND end_date >= ?`
        );
        const serviceIdsSet = new Set(
            (calendarStmt.all(today_YYYYMMDD_Spain, today_YYYYMMDD_Spain) as { service_id: string }[]).map(s => s.service_id)
        );

        if (serviceIdsSet.size === 0) {
            return c.json({
                message: `No services found operating today (${today_YYYY_MM_DD_Spain}) for the route.`,
                departure_station_used: actualDepartureStationName,
                arrival_station_used: actualArrivalStationName,
                date_queried: today_YYYY_MM_DD_Spain
            }, 404);
        }
        const serviceIds = Array.from(serviceIdsSet);

        const queryParams: (string | number)[] = [
            departureStopId, 
            arrivalStopId, 
            ...serviceIds, 
            currentTime_HHMMSS_Spain
        ];

        const nextTrainQuery = `
            SELECT 
                r.route_short_name,
                r.route_long_name,
                MIN(t.trip_id) AS trip_id,
                t.trip_headsign,
                MIN(t.service_id) AS service_id,
                st_dep.departure_time AS departure_station_departure_time,
                st_arr.arrival_time AS arrival_station_arrival_time
            FROM trips t
            JOIN routes r ON t.route_id = r.route_id
            JOIN stop_times st_dep ON t.trip_id = st_dep.trip_id
            JOIN stop_times st_arr ON t.trip_id = st_arr.trip_id
            WHERE st_dep.stop_id = ? 
              AND st_arr.stop_id = ? 
              AND st_dep.stop_sequence < st_arr.stop_sequence 
              AND t.service_id IN (${serviceIds.map(() => '?').join(',')})
              AND st_dep.departure_time > ? 
            GROUP BY 
                r.route_short_name, r.route_long_name, t.trip_headsign, 
                st_dep.departure_time, st_arr.arrival_time
            ORDER BY st_dep.departure_time ASC
            LIMIT 1;
        `;

        const timetableStmt = db.prepare(nextTrainQuery);
        const nextTrain = timetableStmt.get(...queryParams);

        db.close();

        if (!nextTrain) {
            return c.json({
                message: `No further trains found for ${actualDepartureStationName} to ${actualArrivalStationName} today, ${today_YYYY_MM_DD_Spain}, after ${currentTime_HHMMSS_Spain}.`,
                departure_station_used: actualDepartureStationName,
                arrival_station_used: actualArrivalStationName,
                date_queried: today_YYYY_MM_DD_Spain,
                time_queried: currentTime_HHMMSS_Spain
            }, 404);
        }

        return c.json({
            departure_station_name_query: departureStationName,
            arrival_station_name_query: arrivalStationName,
            departure_station_found: actualDepartureStationName,
            arrival_station_found: actualArrivalStationName,
            date_queried: today_YYYY_MM_DD_Spain,
            time_queried: currentTime_HHMMSS_Spain,
            next_train: nextTrain
        });

    } catch (error: any) {
        console.error(`API Error (/:dep/:arr/next):`, error);
        if (db) db.close();
        return c.json({ error: 'Failed to process /next request', details: error.message }, 500);
    }
});

export default {
    port: 3000, // Default Hono/Bun port
    fetch: app.fetch,
    error: (err: Error) => {
        console.error("Unhandled error in Hono server:", err)
        return new Response("Internal Server Error", { status: 500 })
    }
}

console.log("Hono API server configured. Run with 'bun run api/src/index.ts'")

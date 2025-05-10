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

app.get('/:departureStation/:arrivalStation', async (c) => {
  const departureStationName = c.req.param('departureStation')
  const arrivalStationName = c.req.param('arrivalStation')
  let db

  try {
    db = new Database(DB_PATH, { readonly: true }) // Open in read-only mode
    console.log(`Querying for ${departureStationName} to ${arrivalStationName}`)

    // Step 1: Find stop_id for departure station (case-insensitive, partial match)
    const depStmt = db.prepare("SELECT stop_id, stop_name FROM stops WHERE LOWER(stop_name) LIKE LOWER(?) LIMIT 5")
    const depStopCandidates = depStmt.all(`%${departureStationName}%`)

    // Step 2: Find stop_id for arrival station (case-insensitive, partial match)
    const arrStmt = db.prepare("SELECT stop_id, stop_name FROM stops WHERE LOWER(stop_name) LIKE LOWER(?) LIMIT 5")
    const arrStopCandidates = arrStmt.all(`%${arrivalStationName}%`)

    if (!depStopCandidates || depStopCandidates.length === 0) {
      return c.json({ error: `Departure station '${departureStationName}' not found or too ambiguous. Candidates: ${JSON.stringify(depStopCandidates)}` }, 404)
    }
    if (!arrStopCandidates || arrStopCandidates.length === 0) {
      return c.json({ error: `Arrival station '${arrivalStationName}' not found or too ambiguous. Candidates: ${JSON.stringify(arrStopCandidates)}` }, 404)
    }

    // For MVP, we'll take the first candidate. A real app might let the user choose or have better matching.
    const departureStopId = (depStopCandidates[0] as { stop_id: string }).stop_id
    const actualDepartureStationName = (depStopCandidates[0] as { stop_name: string }).stop_name
    const arrivalStopId = (arrStopCandidates[0] as { stop_id: string }).stop_id
    const actualArrivalStationName = (arrStopCandidates[0] as { stop_name: string }).stop_name
    
    console.log(`Found departure ID: ${departureStopId} (${actualDepartureStationName}), arrival ID: ${arrivalStopId} (${actualArrivalStationName})`)

    // Step 3: Find trips and times
    // This query finds trips that have both stops, with departure before arrival,
    // and joins to get route info and times.
    const query = `
      SELECT 
        r.route_short_name,
        r.route_long_name,
        t.trip_id,
        t.trip_headsign,
        st_dep.departure_time AS departure_station_departure_time,
        st_arr.arrival_time AS arrival_station_arrival_time
      FROM trips t
      JOIN routes r ON t.route_id = r.route_id
      JOIN stop_times st_dep ON t.trip_id = st_dep.trip_id
      JOIN stop_times st_arr ON t.trip_id = st_arr.trip_id
      WHERE st_dep.stop_id = ? 
        AND st_arr.stop_id = ? 
        AND st_dep.stop_sequence < st_arr.stop_sequence
      ORDER BY st_dep.departure_time
      LIMIT 50; -- Limit results for MVP
    `

    const timetableStmt = db.prepare(query)
    const results = timetableStmt.all(departureStopId, arrivalStopId)

    db.close() // Close DB after query

    if (results.length === 0) {
        return c.json({
            message: 'No direct trips found for the specified stations.',
            departure_station_used: actualDepartureStationName,
            arrival_station_used: actualArrivalStationName,
            departure_id: departureStopId,
            arrival_id: arrivalStopId,
            info: "This MVP checks for direct trips based on the first matching station names. Date/day specific services (from calendar.txt) are not yet considered."
        }, 404)
    }

    return c.json({
        departure_station_name_query: departureStationName,
        arrival_station_name_query: arrivalStationName,
        departure_station_found: actualDepartureStationName,
        arrival_station_found: actualArrivalStationName,
        timetable: results
    })

  } catch (error: any) {
    console.error('API Error:', error)
    if (db) db.close()
    return c.json({ error: 'Failed to process request', details: error.message }, 500)
  }
})

export default {
    port: 3000, // Default Hono/Bun port
    fetch: app.fetch,
    error: (err: Error) => {
        console.error("Unhandled error in Hono server:", err)
        return new Response("Internal Server Error", { status: 500 })
    }
}

console.log("Hono API server configured. Run with 'bun run api/src/index.ts'")

import { Database } from 'bun:sqlite';
import { DB_PATH } from '../config/database';

// Type definitions for clarity, can be expanded
export interface Station {
    stop_id: string;
    stop_name: string;
    stop_lat: number;
    stop_lon: number;
}

export interface Trip {
    route_short_name: string;
    route_long_name: string;
    trip_id: string;
    trip_headsign: string;
    service_id: string;
    departure_station_departure_time: string;
    arrival_station_arrival_time: string;
}

export interface StopCandidate {
    stop_id: string;
    stop_name: string;
}

export interface Departure {
    route_short_name: string;
    route_long_name: string;
    trip_id: string;
    trip_headsign: string;
    departure_time: string;
}

export interface Route {
    route_id: string;
    route_short_name: string;
    route_long_name: string;
}

export interface StopDetail {
    stop_id: string;
    stop_name: string;
    stop_sequence: number;
}

export interface RouteDetail extends Route {
    stops: StopDetail[];
}

export const findStations = (queryParam?: string): Station[] => {
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
        const stations = stmt.all(...params) as Station[];
        return stations;
    } finally {
        if (db) db.close();
    }
};

export const findStationById = (stationId: string): Station | null => {
    let db;
    try {
        db = new Database(DB_PATH, { readonly: true });
        const stmt = db.prepare(
            "SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_id = ?"
        );
        const station = stmt.get(stationId) as Station | null;
        return station;
    } finally {
        if (db) db.close();
    }
};

export const findStopCandidates = (db: Database, stationName: string): StopCandidate[] => {
    const stmt = db.prepare("SELECT stop_id, stop_name FROM stops WHERE LOWER(stop_name) LIKE LOWER(?) LIMIT 5");
    return stmt.all(`%${stationName}%`) as StopCandidate[];
};

export const getActiveServiceIds = (db: Database, dayName: string, formattedQueryDate: string): string[] => {
    const calendarStmt = db.prepare(`
        SELECT service_id 
        FROM calendar 
        WHERE ${dayName} = '1' 
          AND start_date <= ? 
          AND end_date >= ?
    `);
    const serviceIdsSet = new Set(
        (calendarStmt.all(formattedQueryDate, formattedQueryDate) as { service_id: string }[]).map(s => s.service_id)
    );
    return Array.from(serviceIdsSet);
};

export const findTrips = (departureStopId: string, arrivalStopId: string, serviceIds: string[]): Trip[] => {
    if (serviceIds.length === 0) return [];
    let db;
    try {
        db = new Database(DB_PATH, { readonly: true });
        const serviceIdSubQuery = `AND t.service_id IN (${serviceIds.map(() => '?').join(',')}) `;
        const queryParams: (string | number)[] = [departureStopId, arrivalStopId, ...serviceIds];

        const baseQuery = `
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
            ${serviceIdSubQuery}
          GROUP BY
            r.route_short_name,
            r.route_long_name,
            t.trip_headsign,
            st_dep.departure_time,
            st_arr.arrival_time
          ORDER BY st_dep.departure_time
          LIMIT 50;
        `;
        const timetableStmt = db.prepare(baseQuery);
        return timetableStmt.all(...queryParams) as Trip[];
    } finally {
        if (db) db.close();
    }
};

export const findNextTrip = (departureStopId: string, arrivalStopId: string, serviceIds: string[], currentTimeHHMMSS: string): Trip | null => {
    if (serviceIds.length === 0) return null;
    let db;
    try {
        db = new Database(DB_PATH, { readonly: true });
        const queryParams: (string | number)[] = [
            departureStopId, 
            arrivalStopId, 
            ...serviceIds, 
            currentTimeHHMMSS
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
        return timetableStmt.get(...queryParams) as Trip | null;
    } finally {
        if (db) db.close();
    }
};

export const findDepartures = (departureStopId: string, serviceIds: string[], currentTimeHHMMSS: string): Departure[] => {
    if (serviceIds.length === 0) return [];
    let db;
    try {
        db = new Database(DB_PATH, { readonly: true });
        const placeholders = serviceIds.map(() => '?').join(',');
        const sql = `
            SELECT
                r.route_short_name,
                r.route_long_name,
                t.trip_id,
                t.trip_headsign,
                st_dep.departure_time AS departure_time
            FROM trips t
            JOIN stop_times st_dep ON t.trip_id = st_dep.trip_id
            JOIN routes r ON t.route_id = r.route_id
            WHERE st_dep.stop_id = ?
              AND t.service_id IN (${placeholders})
              AND st_dep.departure_time >= ?
            ORDER BY st_dep.departure_time
        `;
        const stmt = db.prepare(sql);
        return stmt.all(departureStopId, ...serviceIds, currentTimeHHMMSS) as Departure[];
    } finally {
        if (db) db.close();
    }
};

export const findRoutes = (): Route[] => {
    let db;
    try {
        db = new Database(DB_PATH, { readonly: true });
        const stmt = db.prepare("SELECT route_id, route_short_name, route_long_name FROM routes ORDER BY route_short_name");
        return stmt.all() as Route[];
    } finally {
        if (db) db.close();
    }
};

export const findRouteById = (routeId: string): RouteDetail | null => {
    let db;
    try {
        db = new Database(DB_PATH, { readonly: true });
        const routeStmt = db.prepare("SELECT route_id, route_short_name, route_long_name FROM routes WHERE route_id = ?");
        const route = routeStmt.get(routeId) as RouteDetail | null;
        if (!route) return null;
        const stopsStmt = db.prepare(`
            SELECT DISTINCT
                st.stop_id,
                s.stop_name,
                st.stop_sequence
            FROM stop_times st
            JOIN trips t ON st.trip_id = t.trip_id
            JOIN stops s ON st.stop_id = s.stop_id
            WHERE t.route_id = ?
            ORDER BY st.stop_sequence
        `);
        const stops = stopsStmt.all(routeId) as StopDetail[];
        return { ...route, stops };
    } finally {
        if (db) db.close();
    }
}; 
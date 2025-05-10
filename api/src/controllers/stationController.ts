import { Context } from 'hono';
import { client as posthogClient } from '../config/posthog';
import { findStations, findStationById, Station } from '../services/gtfsService';
import { getClientIp, getUserAgent } from '../utils/requestUtils';
import { findStopCandidates, getActiveServiceIds, findDepartures, Departure } from '../services/gtfsService';
import { Database } from 'bun:sqlite';
import { DB_PATH } from '../config/database';
import { getDayOfWeekName } from '../utils/dateTimeUtils';

export const getAllStations = async (c: Context) => {
    const startTime = Date.now();
    const queryParam = c.req.query('q');
    const clientIp = getClientIp(c);
    const userAgent = getUserAgent(c);
    const distinct_id = clientIp || 'unknown_ip'; // Use IP as distinct_id for anonymous users

    try {
        const stations = findStations(queryParam);
        const processing_time_ms = Date.now() - startTime;
        posthogClient.capture({
            distinctId: distinct_id,
            event: 'stations_fetched',
            properties: {
                $ip: clientIp, // For GeoIP processing by PostHog
                user_agent: userAgent,
                query: queryParam || 'all',
                station_count: stations.length,
                processing_time_ms
            }
        });
        return c.json(stations);
    } catch (error: any) {
        const processing_time_ms = Date.now() - startTime;
        console.error('API Error (/stations):', error);
        posthogClient.capture({
            distinctId: distinct_id,
            event: 'api_error',
            properties: {
                $ip: clientIp,
                user_agent: userAgent,
                endpoint: '/stations',
                query: queryParam,
                error_message: error.message,
                error_stack: error.stack,
                error_type: 'Database',
                processing_time_ms
            }
        });
        return c.json({ error: 'Failed to fetch stations', details: error.message }, 500);
    }
};

export const getStationById = async (c: Context) => {
    const startTime = Date.now();
    const stationId = c.req.param('stationId');
    const clientIp = getClientIp(c);
    const userAgent = getUserAgent(c);
    const distinct_id = clientIp || 'unknown_ip';

    try {
        const station = findStationById(stationId);
        const processing_time_ms = Date.now() - startTime;

        if (!station) {
            posthogClient.capture({
                distinctId: distinct_id,
                event: 'station_not_found',
                properties: {
                    $ip: clientIp,
                    user_agent: userAgent,
                    endpoint: `/stations/${stationId}`,
                    station_id_query: stationId,
                    error_type: 'NotFound',
                    processing_time_ms
                }
            });
            return c.json({ error: `Station with ID '${stationId}' not found.` }, 404);
        }
        
        posthogClient.capture({
            distinctId: distinct_id,
            event: 'station_details_fetched',
            properties: {
                $ip: clientIp,
                user_agent: userAgent,
                station_id: stationId,
                station_name: station.stop_name,
                processing_time_ms
            }
        });
        return c.json(station);
    } catch (error: any) {
        const processing_time_ms = Date.now() - startTime;
        console.error(`API Error (/stations/${stationId}):`, error);
        posthogClient.capture({
            distinctId: distinct_id,
            event: 'api_error',
            properties: {
                $ip: clientIp,
                user_agent: userAgent,
                endpoint: `/stations/${stationId}`,
                station_id_query: stationId,
                error_message: error.message,
                error_stack: error.stack,
                error_type: 'Database',
                processing_time_ms
            }
        });
        return c.json({ error: 'Failed to fetch station details', details: error.message }, 500);
    }
};

export const getStationDepartures = async (c: Context) => {
    const startTime = Date.now();
    const stationParam = c.req.param('stationId');
    const dateInput = c.req.query('date');
    const timeInput = c.req.query('time');
    const clientIp = getClientIp(c);
    const userAgent = getUserAgent(c);
    const distinct_id = clientIp || 'unknown_ip';

    let db: Database | undefined;
    try {
        db = new Database(DB_PATH, { readonly: true });
        // First try exact match by stop_id
        const exactStation = findStationById(stationParam);
        let departureStop;
        if (exactStation) {
            departureStop = { stop_id: exactStation.stop_id, stop_name: exactStation.stop_name };
        } else {
            const stopCandidates = findStopCandidates(db, stationParam);
            if (!stopCandidates || stopCandidates.length === 0) {
                posthogClient.capture({
                    distinctId: distinct_id,
                    event: 'station_departures_station_not_found',
                    properties: {
                        $ip: clientIp,
                        user_agent: userAgent,
                        endpoint: `/stations/${stationParam}/departures`,
                        station_query: stationParam,
                        error_type: 'NotFound',
                        processing_time_ms: Date.now() - startTime
                    }
                });
                return c.json({ message: `Station '${stationParam}' not found.` }, 404);
            }
            departureStop = stopCandidates[0];
        }

        // Determine date
        let effectiveQueryDate: string;
        let dateObj: Date;

        if (dateInput) {
            dateObj = new Date(dateInput);
            if (isNaN(dateObj.getTime())) {
                return c.json({ error: 'Invalid date format. Please use YYYY-MM-DD.' }, 400);
            }
            effectiveQueryDate = dateInput;
        } else {
            dateObj = new Date();
            const year = dateObj.getFullYear();
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
            const day = dateObj.getDate().toString().padStart(2, '0');
            effectiveQueryDate = `${year}-${month}-${day}`;
        }

        // Determine time
        let effectiveQueryTime: string;
        if (timeInput) {
            const timeRegex = /^\d{2}:\d{2}$/;
            if (!timeRegex.test(timeInput)) {
                return c.json({ error: 'Invalid time format. Please use HH:MM.' }, 400);
            }
            effectiveQueryTime = `${timeInput}:00`;
        } else {
            const now = new Date();
            const optionsDateTime: Intl.DateTimeFormatOptions = {
                timeZone: 'Europe/Madrid',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            };
            const formatter = new Intl.DateTimeFormat('en-CA', optionsDateTime);
            const parts = formatter.formatToParts(now).reduce((acc, part) => {
                if (part.type !== 'literal') acc[part.type] = part.value;
                return acc;
            }, {} as Record<Intl.DateTimeFormatPartTypes, string>);
            effectiveQueryTime = `${parts.hour}:${parts.minute}:${parts.second}`;
        }

        const dayName = getDayOfWeekName(dateObj);
        const formattedQueryDate = effectiveQueryDate.replace(/-/g, '');
        const serviceIds = getActiveServiceIds(db, dayName, formattedQueryDate);

        if (serviceIds.length === 0) {
            return c.json({ message: `No services found operating on ${effectiveQueryDate}.` }, 404);
        }

        // Close DB before calling service
        db.close();
        db = undefined;

        const departures = findDepartures(departureStop.stop_id, serviceIds, effectiveQueryTime);

        posthogClient.capture({
            distinctId: distinct_id,
            event: 'station_departures_fetched',
            properties: {
                $ip: clientIp,
                user_agent: userAgent,
                station_found: departureStop.stop_name,
                date_queried: effectiveQueryDate,
                time_queried: effectiveQueryTime,
                departures_count: departures.length,
                processing_time_ms: Date.now() - startTime
            }
        });

        return c.json({
            station_found: departureStop.stop_name,
            station_id: departureStop.stop_id,
            date_queried: effectiveQueryDate,
            time_queried: effectiveQueryTime,
            departures
        });
    } catch (error: any) {
        console.error(`API Error (/stations/${stationParam}/departures):`, error);
        return c.json({ error: 'Failed to fetch departures', details: error.message }, 500);
    } finally {
        if (db) db.close();
    }
}; 
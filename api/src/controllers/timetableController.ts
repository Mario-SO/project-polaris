import { Context } from 'hono';
import { Database } from 'bun:sqlite';
import { DB_PATH } from '../config/database';
import { client as posthogClient } from '../config/posthog';
import { getDayOfWeekName } from '../utils/dateTimeUtils';
import { getClientIp, getUserAgent } from '../utils/requestUtils';
import {
    findStopCandidates,
    getActiveServiceIds,
    findTrips,
    findNextTrip,
    StopCandidate,
    Trip
} from '../services/gtfsService';

export const getTimetable = async (c: Context) => {
    const startTime = Date.now();
    const departureStationName = c.req.param('departureStation');
    const arrivalStationName = c.req.param('arrivalStation');
    const queryDateInput = c.req.query('date');
    let db: Database | undefined = undefined;

    const clientIp = getClientIp(c);
    const userAgent = getUserAgent(c);
    const distinct_id = clientIp || 'unknown_ip';

    try {
        db = new Database(DB_PATH, { readonly: true });
        let effectiveQueryDate: string;
        let dateObj: Date;

        if (queryDateInput) {
            dateObj = new Date(queryDateInput);
            if (isNaN(dateObj.getTime())) {
                const processing_time_ms = Date.now() - startTime;
                posthogClient.capture({
                    distinctId: distinct_id,
                    event: 'invalid_date_format', 
                    properties: {
                        $ip: clientIp,
                        user_agent: userAgent,
                        endpoint: `/${departureStationName}/${arrivalStationName}`,
                        date_input: queryDateInput,
                        departure_station_query: departureStationName,
                        arrival_station_query: arrivalStationName,
                        error_type: 'Validation',
                        processing_time_ms
                    }
                });
                return c.json({ error: 'Invalid date format. Please use YYYY-MM-DD.' }, 400);
            }
            effectiveQueryDate = queryDateInput;
        } else {
            dateObj = new Date();
            const year = dateObj.getFullYear();
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
            const day = dateObj.getDate().toString().padStart(2, '0');
            effectiveQueryDate = `${year}-${month}-${day}`;
            console.log(`No date provided, defaulting to today: ${effectiveQueryDate}`);
        }

        console.log(`Querying for ${departureStationName} to ${arrivalStationName} on date ${effectiveQueryDate}`);

        const depStopCandidates = findStopCandidates(db, departureStationName);
        const arrStopCandidates = findStopCandidates(db, arrivalStationName);

        if (!depStopCandidates || depStopCandidates.length === 0) {
            const processing_time_ms = Date.now() - startTime;
            posthogClient.capture({
                distinctId: distinct_id,
                event: 'departure_station_not_found',
                properties: {
                    $ip: clientIp,
                    user_agent: userAgent,
                    endpoint: `/${departureStationName}/${arrivalStationName}`,
                    departure_station_query: departureStationName,
                    arrival_station_query: arrivalStationName,
                    date_query: effectiveQueryDate,
                    departure_station_candidate_count: depStopCandidates?.length || 0,
                    error_type: 'NotFound',
                    processing_time_ms
                }
            });
            return c.json({ error: `Departure station '${departureStationName}' not found. Candidates: ${JSON.stringify(depStopCandidates)}` }, 404);
        }
        if (!arrStopCandidates || arrStopCandidates.length === 0) {
            const processing_time_ms = Date.now() - startTime;
            posthogClient.capture({
                distinctId: distinct_id,
                event: 'arrival_station_not_found',
                properties: {
                    $ip: clientIp,
                    user_agent: userAgent,
                    endpoint: `/${departureStationName}/${arrivalStationName}`,
                    departure_station_query: departureStationName,
                    arrival_station_query: arrivalStationName,
                    date_query: effectiveQueryDate,
                    departure_station_candidate_count: depStopCandidates.length,
                    arrival_station_candidate_count: arrStopCandidates?.length || 0,
                    departure_station_candidates: depStopCandidates.map(s => s.stop_name),
                    error_type: 'NotFound',
                    processing_time_ms
                }
            });
            return c.json({ error: `Arrival station '${arrivalStationName}' not found. Candidates: ${JSON.stringify(arrStopCandidates)}` }, 404);
        }

        const departureStop = depStopCandidates[0];
        const arrivalStop = arrStopCandidates[0];
        console.log(`Found departure ID: ${departureStop.stop_id} (${departureStop.stop_name}), arrival ID: ${arrivalStop.stop_id} (${arrivalStop.stop_name})`);

        const dayName = getDayOfWeekName(dateObj);
        const formattedQueryDate = effectiveQueryDate.replace(/-/g, '');
        const serviceIds = getActiveServiceIds(db, dayName, formattedQueryDate);

        if (serviceIds.length === 0) {
            const processing_time_ms = Date.now() - startTime;
            posthogClient.capture({
                distinctId: distinct_id,
                event: 'no_services_on_date',
                properties: {
                    $ip: clientIp,
                    user_agent: userAgent,
                    endpoint: `/${departureStationName}/${arrivalStationName}`,
                    departure_station_used: departureStop.stop_name,
                    arrival_station_used: arrivalStop.stop_name,
                    date_queried: effectiveQueryDate,
                    day_name: dayName,
                    departure_station_candidate_count: depStopCandidates.length,
                    arrival_station_candidate_count: arrStopCandidates.length,
                    service_ids_count: serviceIds.length,
                    error_type: 'NotFound',
                    processing_time_ms 
                }
            });
            return c.json({
                message: `No services found operating on ${effectiveQueryDate} for this route.`,
                departure_station_used: departureStop.stop_name,
                arrival_station_used: arrivalStop.stop_name,
                date_queried: effectiveQueryDate
            }, 404);
        }
        
        if (db) {
            db.close();
            db = undefined; 
        }

        const trips = findTrips(departureStop.stop_id, arrivalStop.stop_id, serviceIds);
        const processing_time_ms_final = Date.now() - startTime;

        if (trips.length === 0) {
            posthogClient.capture({
                distinctId: distinct_id,
                event: 'no_direct_trips_found',
                properties: {
                    $ip: clientIp,
                    user_agent: userAgent,
                    endpoint: `/${departureStationName}/${arrivalStationName}`,
                    departure_station_query: departureStationName,
                    arrival_station_query: arrivalStationName,
                    departure_station_used: departureStop.stop_name,
                    arrival_station_used: arrivalStop.stop_name,
                    date_queried: effectiveQueryDate,
                    departure_station_candidate_count: depStopCandidates.length,
                    arrival_station_candidate_count: arrStopCandidates.length,
                    service_ids_count: serviceIds.length,
                    error_type: 'NotFound',
                    processing_time_ms: processing_time_ms_final
                }
            });
            return c.json({
                message: 'No direct trips found matching your criteria for the specified date.',
                departure_station_used: departureStop.stop_name,
                arrival_station_used: arrivalStop.stop_name,
                date_queried: effectiveQueryDate,
                info: "No trips found for the specified date."
            }, 404);
        }

        posthogClient.capture({
            distinctId: distinct_id,
            event: 'timetable_fetched',
            properties: {
                $ip: clientIp,
                user_agent: userAgent,
                endpoint: `/${departureStationName}/${arrivalStationName}`,
                departure_station_query: departureStationName,
                arrival_station_query: arrivalStationName,
                departure_station_found: departureStop.stop_name,
                arrival_station_found: arrivalStop.stop_name,
                date_queried: effectiveQueryDate,
                departure_station_candidate_count: depStopCandidates.length,
                arrival_station_candidate_count: arrStopCandidates.length,
                service_ids_count: serviceIds.length,
                results_count: trips.length,
                processing_time_ms: processing_time_ms_final
            }
        });
        return c.json({
            departure_station_name_query: departureStationName,
            arrival_station_name_query: arrivalStationName,
            departure_station_found: departureStop.stop_name,
            arrival_station_found: arrivalStop.stop_name,
            date_queried: effectiveQueryDate,
            timetable: trips
        });

    } catch (error: any) {
        const processing_time_ms = Date.now() - startTime;
        console.error('API Error (/:dep/:arr):', error);
        posthogClient.capture({
            distinctId: distinct_id,
            event: 'api_error',
            properties: {
                $ip: clientIp,
                user_agent: userAgent,
                endpoint: `/${departureStationName}/${arrivalStationName}`,
                departure_station_query: departureStationName,
                arrival_station_query: arrivalStationName,
                date_input: queryDateInput,
                error_message: error.message,
                error_stack: error.stack,
                error_type: 'Unknown',
                processing_time_ms
            }
        });
        return c.json({ error: 'Failed to process request', details: error.message }, 500);
    } finally {
        if (db) {
            db.close();
        }
    }
};

export const getNextTrain = async (c: Context) => {
    const startTime = Date.now();
    const departureStationName = c.req.param('departureStation');
    const arrivalStationName = c.req.param('arrivalStation');
    let db: Database | undefined = undefined;

    const clientIp = getClientIp(c);
    const userAgent = getUserAgent(c);
    const distinct_id = clientIp || 'unknown_ip';

    try {
        db = new Database(DB_PATH, { readonly: true });
        const now = new Date();
        const optionsDateTime: Intl.DateTimeFormatOptions = {
            timeZone: 'Europe/Madrid',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        };
        const formatter = new Intl.DateTimeFormat('en-CA', optionsDateTime);
        const parts = formatter.formatToParts(now).reduce((acc, part) => {
            if (part.type !== 'literal') acc[part.type] = part.value;
            return acc;
        }, {} as Record<Intl.DateTimeFormatPartTypes, string>); 

        const today_YYYY_MM_DD_Spain = `${parts.year}-${parts.month}-${parts.day}`;
        const today_YYYYMMDD_Spain = `${parts.year}${parts.month}${parts.day}`;
        const currentTime_HHMMSS_Spain = `${parts.hour}:${parts.minute}:${parts.second}`;
        
        const currentSpanishDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
        const dayNameSpainCorrect = getDayOfWeekName(currentSpanishDate);

        console.log(`Finding next train for ${departureStationName} to ${arrivalStationName}. Current Spanish time: ${today_YYYY_MM_DD_Spain} ${currentTime_HHMMSS_Spain}, Day: ${dayNameSpainCorrect}`);

        const depStopCandidates = findStopCandidates(db, departureStationName);
        const arrStopCandidates = findStopCandidates(db, arrivalStationName);

        if (!depStopCandidates || depStopCandidates.length === 0) {
            const processing_time_ms = Date.now() - startTime;
            posthogClient.capture({
                distinctId: distinct_id,
                event: 'next_train_departure_station_not_found',
                properties: {
                    $ip: clientIp,
                    user_agent: userAgent,
                    endpoint: `/${departureStationName}/${arrivalStationName}/next`,
                    departure_station_query: departureStationName,
                    arrival_station_query: arrivalStationName,
                    departure_station_candidate_count: depStopCandidates?.length || 0,
                    error_type: 'NotFound',
                    processing_time_ms
                }
            });
            return c.json({ error: `Departure station '${departureStationName}' not found.` }, 404);
        }
        if (!arrStopCandidates || arrStopCandidates.length === 0) {
            const processing_time_ms = Date.now() - startTime;
            posthogClient.capture({
                distinctId: distinct_id,
                event: 'next_train_arrival_station_not_found',
                properties: {
                    $ip: clientIp,
                    user_agent: userAgent,
                    endpoint: `/${departureStationName}/${arrivalStationName}/next`,
                    departure_station_query: departureStationName,
                    departure_station_found: depStopCandidates[0].stop_name,
                    arrival_station_query: arrivalStationName,
                    departure_station_candidate_count: depStopCandidates.length,
                    arrival_station_candidate_count: arrStopCandidates?.length || 0,
                    error_type: 'NotFound',
                    processing_time_ms
                }
            });
            return c.json({ error: `Arrival station '${arrivalStationName}' not found.` }, 404);
        }
        
        const departureStop = depStopCandidates[0];
        const arrivalStop = arrStopCandidates[0];

        const serviceIds = getActiveServiceIds(db, dayNameSpainCorrect, today_YYYYMMDD_Spain);

        if (serviceIds.length === 0) {
            const processing_time_ms = Date.now() - startTime;
            posthogClient.capture({
                distinctId: distinct_id,
                event: 'next_train_no_services_today',
                properties: {
                    $ip: clientIp,
                    user_agent: userAgent,
                    endpoint: `/${departureStationName}/${arrivalStationName}/next`,
                    departure_station_used: departureStop.stop_name,
                    arrival_station_used: arrivalStop.stop_name,
                    date_queried: today_YYYY_MM_DD_Spain,
                    day_name: dayNameSpainCorrect,
                    departure_station_candidate_count: depStopCandidates.length,
                    arrival_station_candidate_count: arrStopCandidates.length,
                    service_ids_count: serviceIds.length,
                    error_type: 'NotFound',
                    processing_time_ms
                }
            });
            return c.json({
                message: `No services found operating today (${today_YYYY_MM_DD_Spain}) for the route.`,
                departure_station_used: departureStop.stop_name,
                arrival_station_used: arrivalStop.stop_name,
                date_queried: today_YYYY_MM_DD_Spain
            }, 404);
        }

        if (db) {
            db.close();
            db = undefined;
        }

        const nextTrain = findNextTrip(departureStop.stop_id, arrivalStop.stop_id, serviceIds, currentTime_HHMMSS_Spain);
        const processing_time_ms_final = Date.now() - startTime;

        if (!nextTrain) {
            posthogClient.capture({
                distinctId: distinct_id,
                event: 'no_further_trains_today',
                properties: {
                    $ip: clientIp,
                    user_agent: userAgent,
                    endpoint: `/${departureStationName}/${arrivalStationName}/next`,
                    departure_station_used: departureStop.stop_name,
                    arrival_station_used: arrivalStop.stop_name,
                    date_queried: today_YYYY_MM_DD_Spain,
                    time_queried: currentTime_HHMMSS_Spain,
                    departure_station_candidate_count: depStopCandidates.length,
                    arrival_station_candidate_count: arrStopCandidates.length,
                    service_ids_count: serviceIds.length,
                    error_type: 'NotFound',
                    processing_time_ms: processing_time_ms_final
                }
            });
            return c.json({
                message: `No further trains found for ${departureStop.stop_name} to ${arrivalStop.stop_name} today, ${today_YYYY_MM_DD_Spain}, after ${currentTime_HHMMSS_Spain}.`,
                departure_station_used: departureStop.stop_name,
                arrival_station_used: arrivalStop.stop_name,
                date_queried: today_YYYY_MM_DD_Spain,
                time_queried: currentTime_HHMMSS_Spain
            }, 404);
        }

        posthogClient.capture({
            distinctId: distinct_id,
            event: 'next_train_fetched',
            properties: {
                $ip: clientIp,
                user_agent: userAgent,
                endpoint: `/${departureStationName}/${arrivalStationName}/next`,
                departure_station_query: departureStationName,
                arrival_station_query: arrivalStationName,
                departure_station_found: departureStop.stop_name,
                arrival_station_found: arrivalStop.stop_name,
                date_queried: today_YYYY_MM_DD_Spain,
                time_queried: currentTime_HHMMSS_Spain,
                departure_station_candidate_count: depStopCandidates.length,
                arrival_station_candidate_count: arrStopCandidates.length,
                service_ids_count: serviceIds.length,
                next_train_departure_time: (nextTrain as any).departure_station_departure_time,
                processing_time_ms: processing_time_ms_final
            }
        });
        return c.json({
            departure_station_name_query: departureStationName,
            arrival_station_name_query: arrivalStationName,
            departure_station_found: departureStop.stop_name,
            arrival_station_found: arrivalStop.stop_name,
            date_queried: today_YYYY_MM_DD_Spain,
            time_queried: currentTime_HHMMSS_Spain,
            next_train: nextTrain
        });

    } catch (error: any) {
        const processing_time_ms = Date.now() - startTime;
        console.error(`API Error (/:dep/:arr/next):`, error);
        posthogClient.capture({
            distinctId: distinct_id,
            event: 'api_error',
            properties: {
                $ip: clientIp,
                user_agent: userAgent,
                endpoint: `/${departureStationName}/${arrivalStationName}/next`,
                departure_station_query: departureStationName,
                arrival_station_query: arrivalStationName,
                error_message: error.message,
                error_stack: error.stack,
                error_type: 'Unknown',
                processing_time_ms
            }
        });
        return c.json({ error: 'Failed to process /next request', details: error.message }, 500);
    } finally {
        if (db) {
            db.close();
        }
    }
}; 
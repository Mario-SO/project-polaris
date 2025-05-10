import { Context } from 'hono';
import { client as posthogClient } from '../config/posthog';
import { findStations, findStationById, Station } from '../services/gtfsService';
import { getClientIp, getUserAgent } from '../utils/requestUtils';

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
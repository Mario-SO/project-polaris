import { Context } from 'hono';
import { client as posthogClient } from '../config/posthog';
import { getClientIp, getUserAgent } from '../utils/requestUtils';
import { findRoutes, findRouteById } from '../services/gtfsService';

export const getAllRoutes = async (c: Context) => {
    const startTime = Date.now();
    const clientIp = getClientIp(c);
    const userAgent = getUserAgent(c);
    const distinct_id = clientIp || 'unknown_ip';

    try {
        const routes = findRoutes();
        const processing_time_ms = Date.now() - startTime;

        posthogClient.capture({
            distinctId: distinct_id,
            event: 'routes_fetched',
            properties: {
                $ip: clientIp,
                user_agent: userAgent,
                routes_count: routes.length,
                processing_time_ms
            }
        });

        return c.json(routes);
    } catch (error: any) {
        const processing_time_ms = Date.now() - startTime;
        console.error('API Error (/routes):', error);
        posthogClient.capture({
            distinctId: distinct_id,
            event: 'api_error',
            properties: {
                $ip: clientIp,
                user_agent: userAgent,
                endpoint: '/routes',
                error_message: error.message,
                error_stack: error.stack,
                error_type: 'Database',
                processing_time_ms
            }
        });
        return c.json({ error: 'Failed to fetch routes', details: error.message }, 500);
    }
};

export const getRouteById = async (c: Context) => {
    const startTime = Date.now();
    const routeId = c.req.param('routeId');
    const clientIp = getClientIp(c);
    const userAgent = getUserAgent(c);
    const distinct_id = clientIp || 'unknown_ip';

    try {
        const route = findRouteById(routeId);
        const processing_time_ms = Date.now() - startTime;

        if (!route) {
            posthogClient.capture({
                distinctId: distinct_id,
                event: 'route_not_found',
                properties: {
                    $ip: clientIp,
                    user_agent: userAgent,
                    endpoint: `/routes/${routeId}`,
                    route_id_query: routeId,
                    error_type: 'NotFound',
                    processing_time_ms
                }
            });
            return c.json({ error: `Route with ID '${routeId}' not found.` }, 404);
        }

        posthogClient.capture({
            distinctId: distinct_id,
            event: 'route_details_fetched',
            properties: {
                $ip: clientIp,
                user_agent: userAgent,
                route_id: routeId,
                processing_time_ms
            }
        });

        return c.json(route);
    } catch (error: any) {
        const processing_time_ms = Date.now() - startTime;
        console.error(`API Error (/routes/${routeId}):`, error);
        posthogClient.capture({
            distinctId: distinct_id,
            event: 'api_error',
            properties: {
                $ip: clientIp,
                user_agent: userAgent,
                endpoint: `/routes/${routeId}`,
                route_id_query: routeId,
                error_message: error.message,
                error_stack: error.stack,
                error_type: 'Database',
                processing_time_ms
            }
        });
        return c.json({ error: 'Failed to fetch route details', details: error.message }, 500);
    }
}; 
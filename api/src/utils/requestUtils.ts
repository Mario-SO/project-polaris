import { Context } from 'hono';

export const getClientIp = (c: Context): string | undefined => {
    // Standard headers for client IP, in order of preference
    const headers = [
        'x-forwarded-for', // Standard for proxies
        'x-real-ip',       // Common alternative
        'cf-connecting-ip',// Cloudflare
        'fastly-client-ip',// Fastly
        'x-client-ip',
        'x-cluster-client-ip',
        'forwarded-for',
        'forwarded'
    ];

    for (const header of headers) {
        const value = c.req.header(header);
        if (value) {
            // X-Forwarded-For can be a comma-separated list of IPs (client, proxy1, proxy2)
            // The first one is usually the client IP.
            return value.split(',')[0].trim();
        }
    }
    // If Bun/Hono exposes direct socket info (might need to check specific Hono adapter for Bun)
    // This is a common pattern but might vary.
    // For Bun's standalone HTTP server, `request.remoteAddress` is available on the native request.
    // Hono's `c.req.raw` might provide access to the underlying native request.
    // As a fallback, this might be undefined if no header is found.
    return undefined; 
};

export const getUserAgent = (c: Context): string | undefined => {
    return c.req.header('user-agent');
}; 
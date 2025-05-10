import { PostHog } from 'posthog-node';

const POSTHOG_API_KEY = process.env.POSTHOG_PROJECT_API_KEY;

if (!POSTHOG_API_KEY) {
    console.warn('PostHog API Key not found. Please set POSTHOG_PROJECT_API_KEY environment variable. PostHog tracking will be disabled.');
}

export const client = new PostHog(
    POSTHOG_API_KEY || 'LOCAL_DEV_KEY_PLACEHOLDER', // Fallback for local dev if you don't want to set env var, but not for production
    {
        host: 'https://eu.i.posthog.com',
        disableGeoip: false,
        // Conditionally disable the client if the API key is not provided
        disabled: !POSTHOG_API_KEY 
    }
);

// Ensure clean shutdown
process.on('SIGINT', async () => {
    await client.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await client.shutdown();
    process.exit(0);
}); 
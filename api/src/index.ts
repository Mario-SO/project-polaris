import { Hono } from 'hono'
import { client as posthogClient } from './config/posthog'
import stationRoutes from './routes/stationRoutes'
import timetableRoutes from './routes/timetableRoutes'

console.log(`API server starting...`)

const app = new Hono()

// Root endpoint (health check or basic info)
app.get('/', (c) => {
  posthogClient.capture({
    distinctId: 'test-id',
    event: 'health_check',
    properties: {
      message: 'Hello from Renfe Timetables API!'
    }
  })
  return c.text('Hello from Renfe Timetables API! Health check event sent.')
})

// Mount the routers
app.route('/', stationRoutes)
app.route('/', timetableRoutes)

export default {
    port: 3000,
    fetch: app.fetch,
    error: (err: Error) => {
        console.error("Unhandled error in Hono server:", err)
        posthogClient.capture({
            distinctId: 'system',
            event: 'hono_server_unhandled_error',
            properties: {
                error_message: err.message,
                error_stack: err.stack
            }
        })
        return new Response("Internal Server Error", { status: 500 })
    }
}

console.log('Renfe Timetables API initialized and routes configured.')
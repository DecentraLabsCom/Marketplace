import { defineConfig } from "cypress";
import codeCoverageTask from "@cypress/code-coverage/task";

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.{js,ts}",
    supportFile: "cypress/support/e2e.js",
    fixturesFolder: "cypress/fixtures",
    videosFolder: "cypress/videos",
    screenshotsFolder: "cypress/screenshots",
    viewportWidth: 1280,
    viewportHeight: 720,
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    retries: { runMode: 2, openMode: 0 },
    env: {
      liveIntegration: process.env.CYPRESS_LIVE_INTEGRATION === 'true',
      liveSessionId: process.env.CYPRESS_LIVE_SESSION_ID || '',
      liveBooking: process.env.CYPRESS_LIVE_BOOKING === 'true',
      liveBookingLabId: process.env.CYPRESS_LIVE_BOOKING_LAB_ID || '',
      liveBookingStart: process.env.CYPRESS_LIVE_BOOKING_START || '',
      liveBookingEnd: process.env.CYPRESS_LIVE_BOOKING_END || '',
      liveBookingTimeslot: process.env.CYPRESS_LIVE_BOOKING_TIMESLOT || '',
      liveBookingRpId: process.env.CYPRESS_LIVE_BOOKING_RP_ID || '',
      liveBookingCredentialId: process.env.CYPRESS_LIVE_BOOKING_CREDENTIAL_ID || '',
      liveBookingCredentialPrivateKey: process.env.CYPRESS_LIVE_BOOKING_CREDENTIAL_PRIVATE_KEY || '',
      liveAccess: process.env.CYPRESS_LIVE_ACCESS === 'true',
      liveAccessLabId: process.env.CYPRESS_LIVE_ACCESS_LAB_ID || '',
      liveAccessReservationKey: process.env.CYPRESS_LIVE_ACCESS_RESERVATION_KEY || '',
      demoLive: process.env.CYPRESS_DEMO_LIVE === 'true',
      demoGatewayUrl: process.env.CYPRESS_DEMO_GATEWAY_URL || '',
      demoLabId: process.env.CYPRESS_DEMO_LAB_ID || '',
      demoConnectionId: process.env.CYPRESS_DEMO_CONNECTION_ID || '',
      releaseGate: process.env.CYPRESS_RELEASE_GATE === 'true',
      releaseGateConsumerUrl: process.env.CYPRESS_RELEASE_GATE_CONSUMER_URL || '',
      releaseGateProviderUrl: process.env.CYPRESS_RELEASE_GATE_PROVIDER_URL || '',
      releaseGateGatewayUrl: process.env.CYPRESS_RELEASE_GATE_GATEWAY_URL || '',
      releaseGateRedisRestUrl: process.env.CYPRESS_RELEASE_GATE_REDIS_REST_URL || '',
      releaseGateRedisRestToken: process.env.CYPRESS_RELEASE_GATE_REDIS_REST_TOKEN || '',
    },
    setupNodeEvents(on, config) {
      codeCoverageTask(on, config);
      return config;
    },
  },
});

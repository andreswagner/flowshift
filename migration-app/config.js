// The UI talks to the Flask gateway at BASE_URL. Upstream details live in Settings.
export const config = {
  USE_MOCK: false,           // the Flask gateway has its own mock mode (Settings)
  BASE_URL: '/api',            // e.g. 'https://migrations.example.com/api'
  POLL_INTERVAL_MS: 1500,      // status polling while translating
  // Called before every request; return extra headers (auth token, tenant, etc.)
  getAuthHeaders: () => ({ /* Authorization: `Bearer ${token}` */ }),
};

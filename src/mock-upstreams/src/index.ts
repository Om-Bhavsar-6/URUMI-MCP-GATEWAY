import { startWeatherServer } from './weather-server.js';
import { startNotesServer } from './notes-server.js';

const SERVICE_TYPE = process.env.SERVICE_TYPE || 'all';
const INTERNAL_TOKEN = process.env.INTERNAL_MCP_TOKEN || 'urumi_internal_mcp_secure_token_123';

console.log(`[Mock Upstreams] Starting upstream services. Mode: ${SERVICE_TYPE}`);

if (SERVICE_TYPE === 'weather' || SERVICE_TYPE === 'all') {
  const weatherPort = parseInt(process.env.WEATHER_PORT || process.env.PORT || '3001', 10);
  startWeatherServer(weatherPort, INTERNAL_TOKEN);
}

if (SERVICE_TYPE === 'notes' || SERVICE_TYPE === 'all') {
  const notesPort = parseInt(process.env.NOTES_PORT || (SERVICE_TYPE === 'notes' ? process.env.PORT || '3002' : '3002'), 10);
  startNotesServer(notesPort, INTERNAL_TOKEN);
}

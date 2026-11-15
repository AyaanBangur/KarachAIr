import { defineConfig } from 'vitest/config';

// Automated tests for the logic that matters: the volunteer guide, the mission generator, the air-alert checker, the map extents,
// the voice cleaner, the certificate PDF and the report. Run with `npm test`.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], environment: 'node' } });

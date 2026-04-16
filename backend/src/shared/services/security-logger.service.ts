import pino from 'pino';
import path from 'path';

const logFilePath = path.join(__dirname, '../../../logs/security');

let logger: pino.Logger;

// We only initialize the pino-roll transport if we are in an environment that supports it
// and security logging is enabled.
const isEnabled = process.env.SECURITY_LOGGING !== 'false';

if (isEnabled) {
  const transport = pino.transport({
    target: 'pino-roll',
    options: {
      file: logFilePath,
      size: '10m',
      limit: { count: 5 },
      extension: '.log',
      mkdir: true
    }
  });
  logger = pino(transport);
} else {
  // Fallback / Disabled logger
  logger = pino({ level: 'silent' });
}

export class SecurityLoggerService {
  // Method to allow tests to override the logger instance
  setTestLogger(testLogger: pino.Logger) {
    logger = testLogger;
  }

  logEvent(event: string, details: Record<string, unknown>) {
    if (process.env.SECURITY_LOGGING === 'false') return;

    const safeDetails = { ...details };
    
    // Explicitly sanitize sensitive fields
    delete safeDetails.password;
    delete safeDetails.newPassword;
    delete safeDetails.recoveryKey;
    
    logger.info({ event, details: safeDetails }, `SECURITY: ${event}`);
  }
}

export const securityLogger = new SecurityLoggerService();

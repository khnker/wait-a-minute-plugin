import fs from 'node:fs';
import path from 'node:path';

const LOG_FILE = '/home/nicolas/dev/comparador-precios/.wam/plugin.log';

/**
 * Simple diagnostic logger for wait-a-minute-plugin.
 * Prefixes: [ISO-Timestamp] [LEVEL] [category] Message
 */
export const logger = {
  _log(level, category, message) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] [${category}] ${message}\n`;
    
    try {
      const logDir = path.dirname(LOG_FILE);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(LOG_FILE, formattedMessage, 'utf8');
    } catch (err) {
      console.error(`[LOGGER-ERROR] Failed to write to log file: ${err.message}`);
    }
  },

  info(category, message) {
    this._log('INFO', category, message);
  },

  warn(category, message) {
    this._log('WARN', category, message);
  },

  error(category, message) {
    this._log('ERROR', category, message);
  }
};



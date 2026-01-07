// Simple logger module for Cafe POS
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'data', 'logs');
const logFile = path.join(logDir, 'app.log');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

function formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const formattedMessage = typeof message === 'string' ? message : JSON.stringify(message);
    const additionalArgs = args.length > 0 ? ' ' + args.map(arg =>
        typeof arg === 'string' ? arg : JSON.stringify(arg)
    ).join(' ') : '';

    return `[${timestamp}] ${level.toUpperCase()}: ${formattedMessage}${additionalArgs}`;
}

function writeToFile(message) {
    try {
        fs.appendFileSync(logFile, message + '\n');
    } catch (error) {
        console.error('Failed to write to log file:', error);
    }
}

const logger = {
    info: (message, ...args) => {
        const formatted = formatMessage('info', message, ...args);
        console.log(formatted);
        writeToFile(formatted);
    },

    warn: (message, ...args) => {
        const formatted = formatMessage('warn', message, ...args);
        console.warn(formatted);
        writeToFile(formatted);
    },

    error: (message, ...args) => {
        const formatted = formatMessage('error', message, ...args);
        console.error(formatted);
        writeToFile(formatted);
    },

    debug: (message, ...args) => {
        const formatted = formatMessage('debug', message, ...args);
        if (process.env.NODE_ENV === 'development') {
            console.log(formatted);
        }
        writeToFile(formatted);
    }
};

module.exports = logger;
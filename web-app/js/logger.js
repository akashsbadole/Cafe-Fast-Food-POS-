const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    try {
        fs.mkdirSync(logDir);
    } catch (e) {
        console.error('Could not create logs directory', e);
    }
}

const logFile = path.join(logDir, 'server.log');

const getTimestamp = () => new Date().toISOString();

const logToFile = (level, message, error = null) => {
    const timestamp = getTimestamp();
    const errorStack = error ? `\nStack: ${error.stack}` : '';
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message} ${errorStack}\n`;
    
    try {
        fs.appendFileSync(logFile, logEntry);
    } catch (e) {
        console.error('Failed to write to log file', e);
    }
};

const logger = {
    info: (message) => {
        console.log(message);
        logToFile('info', message);
    },
    warn: (message) => {
        console.warn(message);
        logToFile('warn', message);
    },
    error: (message, error = null) => {
        console.error(message, error);
        logToFile('error', message, error);
    }
};

module.exports = logger;

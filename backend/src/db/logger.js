const winston = require('winston');

const transports = [new winston.transports.Console()];

// 로컬 개발 환경에서만 파일 로그 저장
if (process.env.NODE_ENV !== 'production') {
  const fs = require('fs');
  if (!fs.existsSync('logs')) fs.mkdirSync('logs');
  transports.push(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
  transports.push(new winston.transports.File({ filename: 'logs/combined.log' }));
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level}: ${message}${metaStr}`;
    })
  ),
  transports,
});

module.exports = logger;

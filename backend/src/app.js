/**
 * Express 앱 (서버 실행 없이 앱만 export)
 * - Vercel 서버리스 및 로컬 개발 공용
 */
require('dotenv').config();
const express = require('express');
const logger = require('./db/logger');
const apiRoutes = require('./api/routes');

const app = express();
app.use(express.json());
app.use('/api', apiRoutes);

module.exports = app;

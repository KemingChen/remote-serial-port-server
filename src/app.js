const AppModules = require('app-module-path');

AppModules.addPath('src');
//
require('dotenv').config();

const Koa = require('koa');
const logger = require('core/logger');
//
const app = new Koa();
const http = require('http');
const https = require('https');
const webserver = require('lib/webserver');

require('core/init/middleware')({ app });
app.use(webserver({ mode: "http" }).routes());

http.createServer(app.callback()).listen(process.env.PORT, '0.0.0.0');
logger.info(`Server listening on ${process.env.PORT} with http`);

const express = require('express');
const logger = require('morgan');

const config = {
    spm: {},
    port: 5147,
    mode: "http",
    prefix: "/api/v1",
};

//Initialize express
const app = express();
app.use(logger('dev'));

//Register REST API
const webserver = require('./lib/webserver.js');
app.use(config.prefix, webserver(config));

//Catch 404 and forward to error handler
app.use(function (__req, __res, next) {
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
});

//Error handler
app.use(function (err, __req, res) {
    if (config.verbose) {
        console.error(err);
    }
    res.status(err.status || 500);
    return res.end();
});

//Start the HTTP server
const server = app.listen(config.port, function () {
    console.log('HTTP on port ' + server.address().port);
});
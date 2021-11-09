module.exports = function (config) {
    const express = require('express');
    const bodyParser = require('body-parser');
    const SerialPort = require("serialport");
    const semaphore = require("semaphore");

    if (!config) {
        config = {};
    }

    if (!config.spm) {
        config.spm = {};
    }

    //Helper functions
    const util = require("./util.js");
    util.setConfig(config);
    util.addEventEmitter(config.spm);
    const getPortName = util.getPortName;
    const verbose = util.verbose;

    const app = express();
    app.use(bodyParser.json());
    app.use(bodyParser.raw({ type: '*/*' }));

    //Extend app
    const spm = app.spm = config.spm;

    //List available serial ports
    app.get("/port", function (__req, res, next) {
        SerialPort.list(function (err, ports) {
            if (err) return next(err);
            const list = [];
            ports.forEach(function (p) {
                try {
                    //Check if open
                    const port = spm[p.comName];
                    if (!port) {
                        p.status = 'closed';
                    } else {
                        p.status = port.serialport.isOpen ? "open" : "closed";
                    }

                    //Get configuration if open
                    if (port && port.config) {
                        p.config = port.config;
                    }
                }
                catch (e) {
                    p.error = e.message;
                    verbose(p.comName + " " + e.message);
                }

                list.push(p);
            });
            res.json(list);
        });
    });

    //Get a specific port status
    app.get("/port/:name", function (req, res, next) {
        const name = getPortName(req.params.name);
        SerialPort.list(function (err, ports) {
            if (err) return next(err);
            let result = null;
            ports.forEach(function (p) {
                if (p.comName == name) {
                    result = p;
                    try {
                        //Check if open
                        const port = spm[p.comName];
                        if (!port) {
                            p.status = "closed";
                        } else {
                            p.status = port.serialport.isOpen ? "open" : "closed";
                        }

                        //Get configuration if open
                        if (port && port.config) {
                            p.config = port.config;
                        }
                    }
                    catch (e) {
                        p.error = e.message;
                        verbose(p.comName + " " + e.message);
                    }
                }
            });
            if (!result) {
                return next(new Error("Serial port not found: " + name));
            }
            res.json(result);
        });
    });

    //Opens a serial port
    app.post("/port/:name/open", function (req, res, next) {
        try {
            const name = getPortName(req.params.name);
            const options = req.body || {};
            options.autoOpen = false;

            const sp = new SerialPort(name, options);
            sp.open(function (err) {
                if (err) return next(new Error("Error opening serial port: ", err.message));
                console.log('opened, test', sp.isOpen)
            });
            sp.on('open', function () {
                const port = {};
                port.serialport = sp;
                port.config = options;
                port.rxcapacity = 65535;
                port.rxoverflow = false;
                port.rxbuffer = new Buffer(port.rxcapacity);
                port.rxindex = 0;
                port.sem_write = semaphore(1);
                port.sem_read = semaphore(1);
                spm[name] = port;
                verbose(name + " ready");
                res.json({ name: name, status: "open" });
            });
            sp.on('data', function (data) {
                try {
                    const port = spm[name];

                    //verbose(name + " incoming: " + data.toString('hex'));
                    verbose(name + " incoming " + data.length + " bytes");

                    port.sem_read.take(function () {
                        //Append data to the rxbuffer
                        const position = port.rxindex;
                        const overflow = position >= port.rxcapacity;
                        if (!overflow) {
                            const available = port.rxcapacity - position;
                            const length = data.length;
                            overflow = length > available;
                            verbose(name + " available: " + available + ", length: " + length + ", rxindex: " + port.rxindex);
                            length = overflow ? available : length;
                            data.copy(port.rxbuffer, position, 0, length);
                            port.rxindex += length;
                        }
                        port.rxoverflow = overflow;

                        port.sem_read.leave();

                        //Send to all connected clients
                        spm.emit("received", { port: name, data: data });
                    });
                }
                catch (e) {
                    verbose(name + " on data received: " + e.message);
                }
            });
        }
        catch (e) {
            next(e);
        }
    });

    //Closes the serial port
    app.post("/port/:name/close", function (req, res, next) {
        try {
            const name = getPortName(req.params.name);
            const port = spm[name];
            if (!port) {
                return next(new Error("Serial port is not open!"));
            }
            port.serialport.close(function (err) {
                if (err) return next(new Error("Error closing serial port: ", err.message));
                res.json({ name: name, status: "closed" });
            });
            delete spm[name];
        }
        catch (e) {
            next(e);
        }
    });

    //Writes data to a serial port
    app.post("/port/:name/write", function (req, res, next) {
        try {
            const name = getPortName(req.params.name);
            const port = spm[name];
            if (!port) {
                return next(new Error("Serial port is not open!"));
            }

            const buffer = req.body || new Buffer(0);
            const length = buffer.length;

            console.log(buffer)
            port.sem_write.take(function () {
                verbose(name + " write: " + req.body);
                port.serialport.write(buffer, function (err) {
                    port.sem_write.leave();
                    if (err) return next(new Error("Error writing data: ", err.message));
                    res.json({ name: name, length: length });
                });
            });
        }
        catch (e) {
            next(e);
        }
    });

    //Reads data from a serial port
    app.get("/port/:name/read", function (req, res, next) {
        try {
            const name = getPortName(req.params.name);
            const port = spm[name];
            if (!port) {
                return next(new Error("Serial port is not open!"));
            }

            port.sem_read.take(function () {
                //Optional 'take' query string defined number of bytes to read
                let take = req.query.take || port.rxcapacity;
                if (take > port.rxindex) {
                    take = port.rxindex;
                }

                //Send just the filled part of the rxbuffer
                const data = new Buffer(take);
                port.rxbuffer.copy(data, 0, 0, take);
                port.rxbuffer.fill(0x00); //Clear the buffer
                port.rxoverflow = false;
                port.rxindex = 0;

                port.sem_read.leave();

                //Detect content type: binary or ascii
                let contentType = "application/octet-stream";
                const accept = req.headers["accept"] || "";
                if (accept.indexOf("text/html") != -1 || accept.indexOf("text/plain") != -1) {
                    contentType = "text/plain";
                }

                res.header("X-Read-Length", take); //Number of bytes read or returned
                res.header("X-Read-Available", port.rxindex);
                res.contentType(contentType);
                res.end(data);
            });
        }
        catch (e) {
            next(e);
        }
    });

    //Clears read buffer
    app.delete("/port/:name/read", function (req, res, next) {
        try {
            const name = getPortName(req.params.name);
            const port = spm[name];
            if (!port) {
                return next(new Error("Serial port is not open!"));
            }

            port.sem_read.take(function () {
                port.rxoverflow = false;
                port.rxbuffer.fill(0x00);
                port.rxindex = 0;
                port.sem_read.leave();
                res.end();
            });
        }
        catch (e) {
            next(e);
        }
    });

    //Gets a number of available bytes to read
    app.get("/port/:name/available", function (req, res, next) {
        try {
            const name = getPortName(req.params.name);
            const port = spm[name];
            if (!port) {
                return next(new Error("Serial port is not open!"));
            }

            port.sem_read.take(function () {
                const length = port.rxindex;
                const capacity = port.rxcapacity;
                const overflow = port.rxoverflow;
                port.sem_read.leave();
                res.json({ name: name, length: length, capacity: capacity, overflow: overflow });
            });
        }
        catch (e) {
            next(e);
        }
    });

    //Catch 404 and forward to error handler
    app.use(function (__req, __res, next) {
        const error = new Error('Not Found');
        error.status = 404;
        next(error);
    });

    //Error handler
    app.use(function (error, __req, res) {
        verbose(error);
        res.status(error.status || 500);
        return res.json({ error: error.message });
    });

    return app;
}
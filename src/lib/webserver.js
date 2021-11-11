const _ = require('lodash');
const Router = require('koa-router');
const SerialPort = require("serialport");
const semaphore = require("semaphore");

module.exports = function (config) {
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

    const router = Router({
        prefix: '/api/v1',
    });

    //Extend router
    const spm = config.spm;
    function transformPort(data) {
        try {
            //Check if open
            const port = spm[data.comName];
            if (!port) {
                data.status = 'closed';
            } else {
                data.status = port.serialport.isOpen ? "open" : "closed";
            }

            //Get configuration if open
            if (port && port.config) {
                data.config = port.config;
            }
        }
        catch (e) {
            data.error = e.message;
        }
        return data;
    }

    //List available serial ports
    router.get("/port", async (ctx) => {
        const ports = await SerialPort.list();
        const list = _.map(ports, transformPort);
        ctx.body = list;
    });

    //Get a specific port status
    router.get("/port/:name", async (ctx) => {
        const name = getPortName(ctx.params.name);
        const ports = await SerialPort.list();
        const data = _.find(ports, ['comName', name]);
        if (!data) {
            throw new Error("Serial port not found: " + name);
        }
        ctx.body = transformPort(data);
    });

    //Opens a serial port
    router.post("/port/:name/open", async (ctx) => {
        const name = getPortName(ctx.params.name);
        const options = _.defaults(ctx.request.body, {
            autoOpen: false,
        });
        ctx.body = await new Promise((resolve, reject) => {
            const sp = new SerialPort(name, options);
            sp.open((err) => {
                if (err) {
                    reject("Error opening serial port: " + err.message);
                }
            });
            sp.on('open', () => {
                const port = {};
                port.serialport = sp;
                port.config = options;
                port.rxcapacity = 65535;
                port.rxoverflow = false;
                port.rxbuffer = Buffer.alloc(port.rxcapacity);
                port.rxindex = 0;
                port.sem_write = semaphore(1);
                port.sem_read = semaphore(1);
                spm[name] = port;
                resolve({ name: name, status: "open" });
            });
            sp.on('data', (data) => {
                try {
                    const port = spm[name];
                    port.sem_read.take(() => {
                        //Append data to the rxbuffer
                        const position = port.rxindex;
                        const overflow = position >= port.rxcapacity;
                        if (!overflow) {
                            const available = port.rxcapacity - position;
                            const length = data.length;
                            overflow = length > available;
                            length = overflow ? available : length;
                            data.copy(port.rxbuffer, position, 0, length);
                            port.rxindex += length;
                        }
                        port.rxoverflow = overflow;
                        port.sem_read.leave();

                        //Send to all connected clients
                        spm.emit("received", { port: name, data: data });
                    });
                } finally { }
            });
        });
    });

    //Closes the serial port
    router.post("/port/:name/close", async (ctx) => {
        const name = getPortName(ctx.params.name);
        const port = spm[name];
        if (!port) {
            throw new Error("Serial port is not open!");
        }
        try {
            await port.serialport.close();
        } catch (e) {
            throw new Error("Error closing serial port: ", e.message);
        }
        delete spm[name];
        ctx.body = { name: name, status: "closed" };
    });

    //Writes data to a serial port
    router.post("/port/:name/write", async (ctx) => {
        const name = getPortName(ctx.params.name);
        const port = spm[name];
        if (!port) {
            throw new Error("Serial port is not open!");
        }
        const buffer = ctx.rawBody || Buffer.alloc(0);
        const length = buffer.length;
        //
        ctx.body = await new Promise((resolve, reject) => {
            port.sem_write.take(() => {
                port.serialport.write(buffer, (err) => {
                    port.sem_write.leave();
                    if (err) {
                        reject("Error writing data: " + err.message);
                    };
                    resolve({ name: name, length: length });
                });
            });
        });
    });

    //Reads data from a serial port
    router.get("/port/:name/read", async (ctx) => {
        const name = getPortName(ctx.params.name);
        const port = spm[name];
        if (!port) {
            throw new Error("Serial port is not open!");
        }
        //
        ctx.body = await new Promise((resolve) => {
            port.sem_read.take(() => {
                //Optional 'take' query string defined number of bytes to read
                let take = req.query.take || port.rxcapacity;
                if (take > port.rxindex) {
                    take = port.rxindex;
                }

                //Send just the filled part of the rxbuffer
                const data = Buffer.alloc(take);
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

                ctx.set("X-Read-Length", take); //Number of bytes read or returned
                ctx.set("X-Read-Available", port.rxindex);
                ctx.type = contentType;
                resolve(data);
            });
        });
    });

    //Clears read buffer
    router.delete("/port/:name/read", async (ctx) => {
        const name = getPortName(ctx.params.name);
        const port = spm[name];
        if (!port) {
            throw new Error("Serial port is not open!");
        }
        //
        ctx.body = await new Promise((resolve) => {
            port.sem_read.take(() => {
                port.rxoverflow = false;
                port.rxbuffer.fill(0x00);
                port.rxindex = 0;
                port.sem_read.leave();
                resolve({});
            });
        });
    });

    //Gets a number of available bytes to read
    router.get("/port/:name/available", async (ctx) => {
        const name = getPortName(ctx.params.name);
        const port = spm[name];
        if (!port) {
            throw new Error("Serial port is not open!");
        }
        //
        ctx.body = await new Promise((resolve) => {
            port.sem_read.take(function () {
                const length = port.rxindex;
                const capacity = port.rxcapacity;
                const overflow = port.rxoverflow;
                port.sem_read.leave();
                resolve({ name: name, length: length, capacity: capacity, overflow: overflow });
            });
        });
    });
    return router;
}
const os = require('os');

//Verifies serial port name
function getPortName(name) {
    if (!name) {
        throw new Error("Serial port name is missing!");
    }

    //Windows
    if (os.platform() == "win32") {
        if (!/^COM\d+$/gi.test(name)) {
            throw new Error("Expected port to be named as 'COMx' on Windows!");
        }
        return name;
    }

    //Linux and Mac
    if (!/^[\w\d\-\._]+$/gi.test(name)) { //Do not allow slash in name
        throw new Error("Expected port to be named without '/dev/' on Unix system!");
    }
    return "/dev/" + name;
}

//Simple event emitter
function addEventEmitter(obj) {
    if (!obj.events) {
        obj.events = {};
        obj.emit = function (event, data) {
            const callback = obj.events[event];
            if (callback) {
                callback(data);
            }
        };
        obj.on = function (event, callback) {
            obj.events[event] = callback;
        };
    }
}

//Console output if verbose mode
function verbose(message) {
    if (config.verbose) {
        console.log(message);
    }
}

module.exports = {
    setConfig: function (options) {
        config = options;
    },
    getPortName: getPortName,
    addEventEmitter: addEventEmitter,
    verbose: verbose
};
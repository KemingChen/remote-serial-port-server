require('colors');
const split = require('split');
const _ = require('lodash');

const logger = require('tracer').console({
    format: [
        `${'{{timestamp}} '.green + '[{{title}}]'.cyan.bold} {{message}}${' (in {{file}}:{{line}})'.gray}`,
    ],
    dateformat: 'yyyy-mm-dd HH:MM:ss.L',
});

module.exports = logger;
module.exports.stream = split().on('data', message => {
    logger.info(message);
});
module.exports.kvp = (...args) => _.flatMap(args, obj => _.map(obj, (v, k) => `[${k}]=${v}`)).join(', ');

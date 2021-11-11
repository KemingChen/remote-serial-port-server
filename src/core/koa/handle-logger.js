const logger = require('core/logger');

module.exports = require('koa-logger')((str, args) => {
    const method = args[1];
    const status = args[3];
    if (status && method.match(/(GET|POST|PUT|DELETE|PATCH)/i)) {
        if (!/(\/static\/|noLogger)/.test(str)) {
            logger.info(method, str.replace(/^.*?(GET|POST|PUT|DELETE|PATCH)/, ''));
        }
    }
});

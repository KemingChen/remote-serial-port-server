const HandleLogger = require('core/koa/handle-logger');
const HandleError = require('core/koa/handle-error');
const KoaCores = require('@koa/cors');
const KoaBody = require('koa-body');
const compress = require('koa-compress');
const getRawBody = require('raw-body');
const zlib = require('zlib');
const util = require('util');
//
const getRawBodySync = util.promisify(getRawBody);

module.exports = ({ app }) => {
    // eslint-disable-next-line no-param-reassign
    app.proxy = true;
    app.use(compress({
        threshold: 2048,
        gzip: {
            flush: zlib.constants.Z_SYNC_FLUSH,
        },
        deflate: {
            flush: zlib.constants.Z_SYNC_FLUSH,
        },
        br: false,
    }));
    app.use(HandleLogger);
    app.use(KoaCores());
    app.use(async (ctx, next) => {
        if (/application\/octet-stream/.test(ctx.req.headers['content-type'])) {
            const buffer = await getRawBodySync(ctx.req);
            ctx.rawBody = buffer;
        }
        await next();
    });
    app.use(KoaBody({
        multipart: true,
        formidable: {
            multipart: false,
            hash: 'md5',
            keepExtensions: true,
        },
        formLimit: '1024kb',
    }));
    app.use(HandleError);
};

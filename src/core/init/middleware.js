const HandleLogger = require('core/koa/handle-logger');
const HandleError = require('core/koa/handle-error');
const KoaCores = require('@koa/cors');
const KoaBody = require('koa-body');
const compress = require('koa-compress');
const getRawBody = require('raw-body');
const zlib = require('zlib');

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
            getRawBody(ctx.req, {
                length: ctx.req.headers['content-length'],
            }, (err, buffer) => {
                if (err) {
                    next(err);
                } else {
                    ctx.rawBody = buffer;
                    next();
                }
            })
        } else {
            next();
        }
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

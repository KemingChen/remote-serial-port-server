/* eslint-disable no-console */
const logger = require('core/logger');

module.exports = async (ctx, next) => {
    try {
        await next();
    } catch (e) {
        if (process.env.DEBUG === 'true') {
            console.log(e);
        }
        let errorMessage = '';
        if (e.name === 'MongoError') {
            errorMessage = {
                11000: '資料重複建立',
            }[e.code] || e.message;
        } else if ([401].includes(e.status)) {
            const error = e.originalError ? e.originalError.message : e.message;
            errorMessage = {
                'jwt expired': '登入失效 (您已被登出)',
                'invalid signature': '驗證失敗 (非系統金鑰)',
                'Authentication Error': '驗證失敗 (請先登入)',
            }[error] || error;
        } else {
            errorMessage = e.message || e.toString();
        }
        ctx.status = e.status || 400;
        ctx.body = {
            success: false,
            message: errorMessage,
        };
        logger.info('[ResError]', errorMessage);
    }
};

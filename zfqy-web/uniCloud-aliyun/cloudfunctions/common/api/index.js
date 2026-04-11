'use strict';
const uniCloud = require('uni-cloud-router');
const router = uniCloud.router();

// 品牌管理相关路由
router.post('/brand/add', async (ctx) => {
	const result = await uniCloud.callFunction({
		name: 'brand',
		data: {
			action: 'add',
			data: ctx.request.body
		}
	});
	ctx.body = result.result;
});

router.get('/brand/list', async (ctx) => {
	const result = await uniCloud.callFunction({
		name: 'brand',
		data: {
			action: 'list',
			data: ctx.query
		}
	});
	ctx.body = result.result;
});

router.post('/brand/update', async (ctx) => {
	const result = await uniCloud.callFunction({
		name: 'brand',
		data: {
			action: 'update',
			data: ctx.request.body
		}
	});
	ctx.body = result.result;
});

router.post('/brand/delete', async (ctx) => {
	const result = await uniCloud.callFunction({
		name: 'brand',
		data: {
			action: 'delete',
			data: ctx.request.body
		}
	});
	ctx.body = result.result;
});

router.get('/brand/get', async (ctx) => {
	const result = await uniCloud.callFunction({
		name: 'brand',
		data: {
			action: 'get',
			data: ctx.query
		}
	});
	ctx.body = result.result;
});

router.post('/brand/updateStatus', async (ctx) => {
	const result = await uniCloud.callFunction({
		name: 'brand',
		data: {
			action: 'updateStatus',
			data: ctx.request.body
		}
	});
	ctx.body = result.result;
});

// 微信支付回调（支付成功）
router.post('/pay/wechat/notify', async (ctx) => {
	const result = await uniCloud.callFunction({
		name: 'merchant',
		data: {
			action: 'h5WxPayNotify',
			data: {
				headers: ctx.request.header || {},
				rawBody: ctx.request.rawBody || '',
				body: ctx.request.body || {}
			}
		}
	});
	const body = result?.result?.data?.ack || { code: 'FAIL', message: '处理失败' };
	ctx.status = body.code === 'SUCCESS' ? 200 : 500;
	ctx.body = body;
});

// 微信支付回调（退款成功）
router.post('/pay/wechat/refund-notify', async (ctx) => {
	const result = await uniCloud.callFunction({
		name: 'merchant',
		data: {
			action: 'h5WxRefundNotify',
			data: {
				headers: ctx.request.header || {},
				rawBody: ctx.request.rawBody || '',
				body: ctx.request.body || {}
			}
		}
	});
	const body = result?.result?.data?.ack || { code: 'FAIL', message: '处理失败' };
	ctx.status = body.code === 'SUCCESS' ? 200 : 500;
	ctx.body = body;
});

module.exports = router;
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

module.exports = router;
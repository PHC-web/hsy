const path = require('path');
const fs = require('fs');
const { duplicateBuildToAdmin } = require('./scripts/duplicate-h5-to-admin.cjs');

const ignored = ['**/uni_modules/**/*.md', '**/uni_modules/**/package.json', '**/uni_modules/*/uniCloud/**/*', '**/.git'];

/** H5 发行结束后把构建目录再复制一份到同级的 admin/，根目录与 /admin 一次上传即可 */
class AfterH5BuildDuplicateAdminPlugin {
	apply(compiler) {
		compiler.hooks.done.tap('AfterH5BuildDuplicateAdmin', (stats) => {
			if (process.env.SKIP_ADMIN_DUPLICATE === '1') return;
			if (stats.hasErrors()) return;
			const mode = compiler.options.mode || process.env.NODE_ENV;
			if (mode === 'development') return;
			const out = compiler.options.output && compiler.options.output.path;
			if (!out) return;
			const indexHtml = path.join(out, 'index.html');
			if (!fs.existsSync(indexHtml)) return;
			try {
				duplicateBuildToAdmin(out);
				console.log('[duplicate-h5-admin] 已生成:', path.join(out, 'admin'));
			} catch (e) {
				console.warn('[duplicate-h5-admin]', e.message);
			}
		});
	}
}

module.exports = {
	chainWebpack: (config) => {
		// 发行或运行时启用了压缩时会生效
		config.optimization.minimizer('terser').tap((args) => {
			const compress = args[0].terserOptions.compress
			// 非 App 平台移除 console 代码(包含所有 console 方法，如 log,debug,info...)
			compress.drop_console = true
			compress.pure_funcs = [
				'__f__', // App 平台 vue 移除日志代码
				// 'console.debug' // 可移除指定的 console 方法
			]
			return args
		})
	},
	configureWebpack() {
		return {
			plugins: [new AfterH5BuildDuplicateAdminPlugin()],
			watchOptions: {
				ignored
			},
			devServer: {
				watchOptions: {
					ignored
				}
			}
		};
	}
};

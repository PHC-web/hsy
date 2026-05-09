/**
 * 将 H5 构建产物完整复制一份到同目录下的 admin/，便于网站根目录与 /admin 共用一套静态资源，一次上传即可。
 *
 * 手动执行（路径可通过环境变量覆盖）：
 *   node scripts/duplicate-h5-to-admin.cjs
 *   H5_BUILD_DIR=/path/to/dist/build/web node scripts/duplicate-h5-to-admin.cjs
 */

const fs = require('fs');
const path = require('path');

function cpRecursive(src, dest) {
	if (fs.cpSync) {
		fs.cpSync(src, dest, { recursive: true });
		return;
	}
	const stat = fs.statSync(src);
	if (stat.isDirectory()) {
		fs.mkdirSync(dest, { recursive: true });
		for (const name of fs.readdirSync(src)) {
			cpRecursive(path.join(src, name), path.join(dest, name));
		}
	} else {
		fs.copyFileSync(src, dest);
	}
}

/**
 * @param {string} buildDir H5 构建输出根目录（内含 index.html、static、assets 等）
 */
function duplicateBuildToAdmin(buildDir) {
	const root = path.resolve(buildDir);
	if (!fs.existsSync(root)) {
		throw new Error(`[duplicate-h5-to-admin] 目录不存在: ${root}`);
	}
	const adminDir = path.join(root, 'admin');
	if (fs.existsSync(adminDir)) {
		fs.rmSync(adminDir, { recursive: true, force: true });
	}
	fs.mkdirSync(adminDir, { recursive: true });

	const entries = fs.readdirSync(root, { withFileTypes: true });
	for (const ent of entries) {
		if (ent.name === 'admin') continue;
		const from = path.join(root, ent.name);
		const to = path.join(adminDir, ent.name);
		cpRecursive(from, to);
	}
}

function resolveDefaultBuildDir() {
	const cwd = path.resolve(__dirname, '..');
	const envDir = process.env.H5_BUILD_DIR && String(process.env.H5_BUILD_DIR).trim();
	if (envDir) return path.resolve(envDir);

	const candidates = [
		path.join(cwd, 'dist', 'build', 'web'),
		path.join(cwd, 'dist', 'build', 'h5'),
		path.join(cwd, 'unpackage', 'dist', 'build', 'web'),
		path.join(cwd, 'unpackage', 'dist', 'build', 'h5')
	];
	for (const p of candidates) {
		if (fs.existsSync(path.join(p, 'index.html'))) return p;
	}
	return candidates[0];
}

function main() {
	if (process.env.SKIP_ADMIN_DUPLICATE === '1') {
		console.log('[duplicate-h5-to-admin] 已跳过（SKIP_ADMIN_DUPLICATE=1）');
		return;
	}
	const buildDir = resolveDefaultBuildDir();
	duplicateBuildToAdmin(buildDir);
	console.log('[duplicate-h5-to-admin] 已复制到:', path.join(buildDir, 'admin'));
}

module.exports = { duplicateBuildToAdmin, resolveDefaultBuildDir };

if (require.main === module) {
	main();
}

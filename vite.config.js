import { defineConfig } from 'vite';
import {createHash} from 'node:crypto';
import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export default defineConfig({
	plugins: [{
		name: 'offline',
		apply: 'build',
		writeBundle() {
			const files = readdirSync('dist', {recursive: true, withFileTypes: true})
				.filter(file => file.isFile() && !file.name.startsWith('_') && file.name !== 'sw.js')
				.map(file => `${file.parentPath}/${file.name}`.slice('dist'.length));
			const template = readFileSync('dist/sw.js', 'utf8');
			const hash = createHash('sha256').update(template);
			for (const file of files) {
				hash.update(file).update(readFileSync(`dist${file}`));
			}

			// Cache HTML at the clean URLs Cloudflare serves.
			const urls = files.map(file => file === '/index.html' ? '/' : file.replace(/\.html$/, ''));
			const worker = template
				.replace('__VERSION__', hash.digest('hex').slice(0, 16))
				.replace('__FILES__', JSON.stringify(urls));
			writeFileSync('dist/sw.js', worker);
		},
	}],
	root: 'src',
	base: './',
	server: {host: '0.0.0.0', port: 5173, strictPort: true},
	build: {
		outDir: '../dist',
		emptyOutDir: true,
		rolldownOptions: {
			input: [
				fileURLToPath(new URL('./src/index.html', import.meta.url)),
				fileURLToPath(new URL('./src/privacy.html', import.meta.url)),
				fileURLToPath(new URL('./src/support.html', import.meta.url)),
			],
		},
	},
});

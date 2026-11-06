import { defineConfig } from 'vite';

export default defineConfig({
	root: 'src',
	base: './',
	server: {host: '0.0.0.0', port: 5173, strictPort: true},
	build: {outDir: '../dist', emptyOutDir: true},
});

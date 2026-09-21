// Local dev server: serves public/ and the same /api routes that run as Vercel functions in production.
const http = require('http');
const fs = require('fs');
const path = require('path');

try {
	process.loadEnvFile(path.join(__dirname, '.env'));
} catch (err) {
	if (err.code !== 'ENOENT') throw err;
}

const { countryPath, taxonPath, iucnFetch, respond, notFound } = require('./lib/iucn');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon'
};

function serveStatic(pathname, res) {
	const filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
	// keep requests inside public/ and out of dotfiles
	const relative = path.relative(PUBLIC_DIR, filePath);
	const blocked = relative.startsWith('..') || relative.split(path.sep).some(p => p.startsWith('.'));
	if (blocked) return notFound(res);
	fs.readFile(filePath, (err, data) => {
		if (err) return notFound(res);
		res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
		res.end(data);
	});
}

http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://${req.headers.host}`);
	const countryMatch = url.pathname.match(/^\/api\/countries\/([A-Za-z]{2})$/);
	const taxaMatch = url.pathname.match(/^\/api\/taxa\/(\d+)$/);
	if (countryMatch) {
		respond(res, await iucnFetch(countryPath(countryMatch[1].toUpperCase(), url.searchParams.get('page'))));
	} else if (taxaMatch) {
		respond(res, await iucnFetch(taxonPath(taxaMatch[1])));
	} else {
		serveStatic(decodeURIComponent(url.pathname), res);
	}
}).listen(PORT, () => {
	console.log(`Endangered species map running at http://localhost:${PORT}`);
});

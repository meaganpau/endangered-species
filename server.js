// Local dev server: serves the static site and proxies IUCN Red List v4 requests
// so the API token stays server-side (the v4 API also doesn't allow browser CORS).
const http = require('http');
const fs = require('fs');
const path = require('path');

try {
	process.loadEnvFile(path.join(__dirname, '.env'));
} catch (err) {
	if (err.code !== 'ENOENT') throw err;
}

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.IUCN_API_TOKEN;
const IUCN_BASE = 'https://api.iucnredlist.org/api/v4';

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

async function proxyIucn(upstreamPath, res) {
	if (!TOKEN) {
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'IUCN_API_TOKEN is not set. Copy .env.example to .env and add your token.' }));
		return;
	}
	try {
		const upstream = await fetch(`${IUCN_BASE}${upstreamPath}`, {
			headers: { Authorization: `Bearer ${TOKEN}` }
		});
		const headers = { 'Content-Type': 'application/json' };
		const totalPages = upstream.headers.get('total-pages');
		if (totalPages) headers['total-pages'] = totalPages;
		res.writeHead(upstream.status, headers);
		res.end(await upstream.text());
	} catch (err) {
		res.writeHead(502, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Could not reach the IUCN API.' }));
	}
}

function proxyCountry(code, query, res) {
	const params = new URLSearchParams({ latest: 'true', scope_code: '1' });
	const page = parseInt(query.get('page'), 10);
	params.set('page', Number.isInteger(page) && page > 0 ? page : 1);
	return proxyIucn(`/countries/${code}?${params}`, res);
}

function serveStatic(pathname, res) {
	const filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
	// keep requests inside the project, and out of dotfiles/server code
	const relative = path.relative(__dirname, filePath);
	const blocked = relative.startsWith('..') || relative.split(path.sep).some(p => p.startsWith('.') || p === 'node_modules') || relative === 'server.js';
	if (blocked) {
		res.writeHead(404);
		res.end('Not found');
		return;
	}
	fs.readFile(filePath, (err, data) => {
		if (err) {
			res.writeHead(404);
			res.end('Not found');
			return;
		}
		res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
		res.end(data);
	});
}

http.createServer((req, res) => {
	const url = new URL(req.url, `http://${req.headers.host}`);
	const match = url.pathname.match(/^\/api\/countries\/([A-Za-z]{2})$/);
	const taxaMatch = url.pathname.match(/^\/api\/taxa\/(\d+)$/);
	if (match) {
		proxyCountry(match[1].toUpperCase(), url.searchParams, res);
	} else if (taxaMatch) {
		proxyIucn(`/taxa/sis/${taxaMatch[1]}`, res);
	} else {
		serveStatic(decodeURIComponent(url.pathname), res);
	}
}).listen(PORT, () => {
	console.log(`Endangered species map running at http://localhost:${PORT}`);
});

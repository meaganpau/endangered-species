// Shared by the local dev server (server.js) and the Vercel functions (api/).
// Proxies IUCN Red List v4 so the API token stays server-side (v4 also sends no CORS headers).
const IUCN_BASE = 'https://api.iucnredlist.org/api/v4';

function countryPath(code, page) {
	const params = new URLSearchParams({ latest: 'true', scope_code: '1' });
	const pageNumber = parseInt(page, 10);
	params.set('page', Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1);
	return `/countries/${code}?${params}`;
}

function taxonPath(sisId) {
	return `/taxa/sis/${sisId}`;
}

// Never throws; resolves to { status, body, totalPages }.
async function iucnFetch(upstreamPath) {
	const token = process.env.IUCN_API_TOKEN;
	if (!token) {
		return { status: 500, body: JSON.stringify({ error: 'IUCN_API_TOKEN is not set. Copy .env.example to .env and add your token.' }) };
	}
	try {
		const upstream = await fetch(`${IUCN_BASE}${upstreamPath}`, {
			headers: { Authorization: `Bearer ${token}` }
		});
		return {
			status: upstream.status,
			body: await upstream.text(),
			totalPages: upstream.headers.get('total-pages')
		};
	} catch (err) {
		return { status: 502, body: JSON.stringify({ error: 'Could not reach the IUCN API.' }) };
	}
}

// Works with both Node's http.ServerResponse and Vercel's response object.
function respond(res, result) {
	res.statusCode = result.status;
	res.setHeader('Content-Type', 'application/json');
	if (result.totalPages) res.setHeader('total-pages', result.totalPages);
	// IUCN data changes rarely, so let Vercel's CDN absorb repeat requests
	if (result.status === 200) res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
	res.end(result.body);
}

function notFound(res) {
	respond(res, { status: 404, body: JSON.stringify({ error: 'Not found' }) });
}

module.exports = { countryPath, taxonPath, iucnFetch, respond, notFound };

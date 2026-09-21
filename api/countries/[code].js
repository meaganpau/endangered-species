const { countryPath, iucnFetch, respond, notFound } = require('../../lib/iucn');

module.exports = async (req, res) => {
	const { code, page } = req.query;
	if (!/^[A-Za-z]{2}$/.test(code)) return notFound(res);
	respond(res, await iucnFetch(countryPath(code.toUpperCase(), page)));
};

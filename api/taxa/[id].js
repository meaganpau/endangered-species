const { taxonPath, iucnFetch, respond, notFound } = require('../../lib/iucn');

module.exports = async (req, res) => {
	const { id } = req.query;
	if (!/^\d+$/.test(id)) return notFound(res);
	respond(res, await iucnFetch(taxonPath(id)));
};

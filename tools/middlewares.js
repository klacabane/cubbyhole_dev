var Utils = require('../tools/utils');

module.exports = {
	checkAuth: function (req, res, next) {
		if (req.path != '/' && req.path != '/auth/signin' && req.path != '/auth/signup') {
			var token = req.get('X-Cub-AuthToken');
			if (token === undefined || !Utils.isTokenValid(token)) return res.send(401);
			
			req.user = Utils.getTokenUser(token);
		}
		next();
	},
	validateId: function (req, res, next) {
		var id = req.params.id;

		if (!id.match(/^[0-9a-fA-F]{24}$/))
			return res.send(400, {
				success: false,
				error: 'Invalid parameter.'
			});
		next();
	}
}
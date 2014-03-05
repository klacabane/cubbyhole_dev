var Utils = require('../tools/utils');

module.exports = {
	checkAuth: function (req, res, next) {
        var token = req.get('X-Cub-AuthToken') || req.params.token;

        if (token === undefined || !Utils.isTokenValid(token)) return res.send(401);

        req.user = Utils.getTokenUser(token);
		next();
	},
	validateId: function (req, res, next) {
		var id = req.params.id || req.body.id;

		if (!id.match(/^[0-9a-fA-F]{24}$/))
			return res.send(400, {
				success: false,
				error: 'Invalid parameter.'
			});
		next();
	},
    setHeaders: function (req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "X-Requested-With, X-Cub-AuthToken, Content-Type");
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

        next();
    }
}
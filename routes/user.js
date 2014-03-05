var User = require('../models/User'),
	Item = require('../models/Item'),
	async = require('async'),
	mw = require('../tools/middlewares');

module.exports = function (app) {
	// GET
	app.get('/user/:id', mw.checkAuth, mw.validateId, function (req, res) {
		User.findOne({ _id: req.params.id }, '_id mail registrationDate currentPlan', function (err, user) {
			if (err) return res.send(500);
			if (!user) return res.send(404);
			
			res.send(200, {
				success: true,
				data: user
			});
		});
	});

	// PUT

	// DELETE
};
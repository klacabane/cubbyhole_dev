var Plan = require('../models/Plan'),
	mw = require('../tools/middlewares');

module.exports = function (app) {
	// POST

	// GET
	app.get('/plan/:id', function (req, res) {
		Plan.findOne({ _id: id }, function (err, plan) {
			if (err) return res.send(500);
			if (!plan)
				res.send(404);
			else
				res.send(200, {
					success: true,
					result: plan
				});
		});
	});

	// PUT
	app.put('/plan/:id', function (req, res) {
		
	});

	// DELETE
};
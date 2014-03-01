var Plan = require('../models/Plan'),
	mw = require('../tools/middlewares');

module.exports = function (app) {
	// POST
    app.post('/plan', mw.checkAuth, function (req, res) {

    });

    // Process PayPal payment
    app.post('/plan/subscribe', mw.checkAuth, mw.validateId, function (req, res) {

    });

	// GET
	app.get('/plan/:id', mw.checkAuth, mw.validateId, function (req, res) {
		Plan.findOne({ _id: id }, function (err, plan) {
			if (err) return res.send(500);
			if (!plan) return res.send(404);
			
			res.send(200, {
				success: true,
				result: plan
			});
		});
	});

	// PUT
	app.put('/plan/:id', mw.checkAuth, mw.validateId, function (req, res) {
		
	});

	// DELETE
    app.delete('/plan/:id', mw.checkAuth, mw.validateId, function (req, res) {

    });
};
var Plan = require('../models/Plan'),
	mw = require('../tools/middlewares'),
    cache = require('../tools/cache');

module.exports = function (app) {
	// POST
    app.post('/plan', mw.checkAuth, function (req, res) {

    });

    // Process PayPal payment
    app.post('/plan/subscribe', mw.checkAuth, mw.validateId, function (req, res) {

    });

	// GET
	app.get('/plan/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var planId = req.params.id;
        var plan = cache.getPlan(planId);

        if (!plan) return res.send(404);

        res.send(200, {
            data: plan
        });
	});

    app.get('/plan', function (req, res) {
        res.send(200, {
            data: cache.store.Plans
        });
    });

	// PUT
	app.put('/plan/:id', mw.checkAuth, mw.validateId, function (req, res) {
		
	});

	// DELETE
    app.delete('/plan/:id', mw.checkAuth, mw.validateId, function (req, res) {

    });
};
var Plan = require('../models/Plan'),
	mw = require('../tools/middlewares'),
    cache = require('../tools/cache');

module.exports = function (app) {
    /**
     *  POST
     */
    app.post('/plan', mw.checkAuth, mw.isAdmin, function (req, res) {
        var attrs = req.body.plan;

        new Plan(attrs)
            .save(function (err, plan) {
                if (err) return res.send(500);

                var planObj = plan.toObject();
                planObj.bandwidth = cache.getBandwidth(plan.bandwidth);

                res.send(200, {
                    data: planObj
                });

                cache.init();
            });

    });

    // Process PayPal payment
    app.post('/plan/subscribe', mw.checkAuth, mw.validateId, function (req, res) {

    });

    /**
     *  GET
     *  Return single plan
     */
	app.get('/plan/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var planId = req.params.id;
        var plan = cache.getPlan(planId);

        if (!plan) return res.send(404);

        res.send(200, {
            data: plan
        });
	});

    /**
     *  GET
     *  Return all plans
     */
    app.get('/plan', function (req, res) {
        res.send(200, {
            data: cache.store.Plans
        });
    });

    /**
     *  GET
     *  Return all bandwidths
     */
    app.get('/bandwidth', /*mw.checkAuth, mw.isAdmin,*/ function (req, res) {
        res.send(200, {
            data: cache.store.Bandwidths
        });
    });

    /**
     *  PUT
     */
	app.put('/plan/:id', mw.checkAuth, mw.isAdmin, mw.validateId, function (req, res) {
        var update = req.body.plan;
        Plan.findOneAndUpdate({_id: req.params.id}, update, function (err, plan) {
            if (err) return res.send(500);

            var planObj = plan.toObject();
            planObj.bandwidth = cache.getBandwidth(plan.bandwidth);

            res.send(200, {
                data: planObj
            });

            cache.init();
        });
	});

    /**
     *  DELETE
     */
    app.delete('/plan/:id', mw.checkAuth, mw.isAdmin, mw.validateId, function (req, res) {
        Plan.findOne({_id: req.params.id}, function (err, plan) {
            if (err) return res.send(500);
            if (!plan) return res.send(404);

            plan.remove(function (err) {
                if (err) return res.send(500);
                res.send(200);

                cache.init();
            });
        });
    });
};
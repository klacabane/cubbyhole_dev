var Plan = require('../models/Plan'),
    User = require('../models/User'),
    mw = require('../tools/middlewares'),
    cache = require('../tools/cache'),
    cfg = require('../config'),
    paypal = require('paypal-rest-sdk');

module.exports = function (app) {
    /** init paypal with id&secret */
    paypal.configure(cfg.paypal);

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

    /**
     * Paypal
     * Payment process
     */
    app.get('/plan/:id/subscribe/:token', mw.checkAuth, mw.validateId, function (req, res) {
        var plan = cache.getPlan(req.params.id);

        if (!plan) return res.send(404);

        var payment = {
            "intent": "sale",
            "payer": {
                "payment_method": "paypal"
            },
            "redirect_urls": {
                "return_url": cfg.api.address + "/payment/execute",
                "cancel_url": cfg.api.address + "/payment/cancel"
            },
            "transactions": [{
                "amount": {
                    "total": plan.price,
                    "currency": "EUR"
                },
                "description": "Cubbyhole " + plan.name + " Plan subscription."
            }]
        };

        paypal.payment.create(payment, function (err, payment) {
            if (err) return res.send(500);

            req.session.paymentId = payment.id;
            req.session.paymentArgs = {user: req.user, plan: plan};
            var redirectUrl;
            for(var i = 0, length = payment.links.length; i < length; i++) {
                var link = payment.links[i];
                if (link.method === 'REDIRECT') {
                    redirectUrl = link.href;
                }
            }
            res.redirect(redirectUrl);
        });
    });

    /** Payment was successful */
    app.get('/payment/execute', function (req, res) {
        var userId = req.session.paymentArgs.user,
            plan = req.session.paymentArgs.plan;

        User.findOne({_id: userId}, function (err, user) {
            if (err) return res.send(500);

            user.updatePlan(plan, function (err) {
                if (err) return res.send(500);

                res.redirect(cfg.webclient.address + "/webapp.html#/user?paid=" + plan.name);
            });
        });
    });

    /** Payment was cancelled */
    app.get('/payment/cancel', function (req, res) {
        res.redirect(cfg.webclient.address + "/webapp.html#/user");
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
            if (!plan.isMutable) return res.send(403);

            plan.remove(function (err) {
                if (err) return res.send(500);
                res.send(200);

                cache.init();
            });
        });
    });
};
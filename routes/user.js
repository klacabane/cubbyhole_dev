var User = require('../models/User'),
	Item = require('../models/Item'),
    UserPlan = require('../models/UserPlan'),
    Plan = require('../models/Plan'),
	mw = require('../tools/middlewares'),
    cache = require('../tools/cache');

module.exports = function (app) {
	/*
	 *  GET
	 */
	app.get('/user/:id', mw.checkAuth, mw.validateId, function (req, res) {
		User.findOne({_id: req.params.id, isAdmin: {$exists: false}}, 'id email registrationDate currentPlan')
            .populate('currentPlan')
            .exec(function (err, user) {
                if (err) return res.send(500);
                if (!user) return res.send(404);

                var obj = user.format(),
                    planId = user.currentPlan.plan;

                obj.currentPlan.plan = cache.getPlan(planId);

                res.send(200, {
                    data: obj
                });
		    });
	});

    app.get('/user/email/:email', mw.checkAuth, function (req, res) {
        User.findOne({email: req.params.email, isAdmin: {$exists: false}}, 'id email registrationDate currentPlan verified isAllowed')
            .populate('currentPlan')
            .exec(function (err, user) {
                if (err) return res.send(500);
                if (!user) return res.send(404);

                var obj = user.format(),
                    planId = user.currentPlan.plan;

                obj.currentPlan.plan = cache.getPlan(planId);

                res.send(200, {
                    data: obj
                });
            });
    });

    app.get('/user/:start/:limit', mw.checkAuth, mw.isAdmin, function (req, res) {
        var startIndex = req.params.start || 0,
            limit = parseInt(req.params.limit) || 0;

        if (limit > 0) ++limit;

        User.find({isAdmin: {$exists: false}})
            .select('_id email registrationDate currentPlan verified isAllowed')
            .sort({email: 1})
            .skip(startIndex)
            .limit(limit)
            .populate('currentPlan')
            .exec(function (err, users) {
                if (err) return res.send(500);

                var results = [],
                    hasMore = false;
                if (users.length === limit) {
                    users.pop();
                    hasMore = true;
                }
                users.forEach(function (user) {
                    var userObj = user.format(),
                        planId = user.currentPlan.plan;

                    userObj.currentPlan.plan = cache.getPlan(planId);
                    results.push(userObj);
                });

                res.send(200, {
                    data: results,
                    hasMore: hasMore
                });
            });
    });

	// PUT
    app.put('/user/:id', mw.checkAuth, mw.isAdmin, mw.validateId, function (req, res) {
        var isAllowed = req.body.isAllowed == 0 ? false : true;

        User.findOne({_id: req.params.id}, function (err, user) {
            if (err) return res.send(500);
            if (!user) return res.send(404);

            user.isAllowed = isAllowed;
            user.save(function (err) {
                if (err) return res.send(500);

                res.send(200);
            });
        });
    });


	// DELETE
};
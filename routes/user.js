var User = require('../models/User'),
	Item = require('../models/Item'),
    UserPlan = require('../models/UserPlan'),
    Plan = require('../models/Plan'),
	mw = require('../tools/middlewares'),
    cache = require('../tools/cache');

module.exports = function (app) {
	// GET
	app.get('/user/:id', mw.checkAuth, mw.validateId, function (req, res) {
        //if (req.user !== req.params.id) return res.send(403);

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

    app.get('/user', mw.checkAuth, mw.isAdmin, function (req, res) {
        User.find({isAdmin: {$exists: false}}, '_id email registrationDate currentPlan verified isAllowed')
            .populate('currentPlan')
            .exec(function (err, users) {
                if (err) return res.send(500);

                var results = [];
                users.forEach(function (user) {
                    var userObj = user.format(),
                        planId = user.currentPlan.plan;

                    userObj.currentPlan.plan = cache.getPlan(planId);
                    results.push(userObj);
                });

                res.send(200, {
                    data: results
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
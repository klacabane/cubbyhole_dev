var User = require('../models/User'),
	Item = require('../models/Item'),
    UserPlan = require('../models/UserPlan'),
    Plan = require('../models/Plan'),
	mw = require('../tools/middlewares'),
    cache = require('../tools/cache'),
    Utils = require('../tools/utils');

module.exports = function (app) {
	/**
	 *  GET
     *  Return user matching id param
	 */
	app.get('/user/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var query = {
            _id: req.params.id,
            isAdmin: {$exists: false},
            deleted: false
        };
		User.findOne(query, 'id email registrationDate currentPlan')
            .populate('currentPlan')
            .exec(function (err, user) {
                if (err) return res.send(500);
                if (!user) return res.send(404);

                var obj = user.format(),
                    planId = user.currentPlan.plan;

                obj.currentPlan.plan = cache.getPlan(planId);
                user.getPlanUsage(function (err, usage) {
                    if (err) return res.send(500);

                    obj.currentPlan.usage.storage = usage.storage;
                    obj.currentPlan.usage.share = usage.share;
                    obj.currentPlan.usage.bandwidth = usage.bandwidth;

                    res.send(200, {
                        data: obj
                    });
                });
		    });
	});

    /**
     *  GET
     *  Return user matching email param
     */
    app.get('/user/email/:email', mw.checkAuth, function (req, res) {
        var query = {
            _id: req.params.id,
            isAdmin: {$exists: false},
            deleted: false
        };
        User.findOne(query, 'id email registrationDate currentPlan verified isAllowed')
            .populate('currentPlan')
            .exec(function (err, user) {
                if (err) return res.send(500);
                if (!user) return res.send(404);

                var obj = user.format(),
                    planId = user.currentPlan.plan;

                obj.currentPlan.plan = cache.getPlan(planId);
                user.getPlanUsage(function (err, usage) {
                    if (err) return res.send(500);

                    obj.currentPlan.usage.storage = usage.storage;
                    obj.currentPlan.usage.share = usage.share;
                    obj.currentPlan.usage.bandwidth = usage.bandwidth;

                    res.send(200, {
                        data: obj
                    });
                });
            });
    });

    /**
     *  GET
     *  Return all users with pagination
     */
    app.get('/user/:start/:limit', mw.checkAuth, mw.isAdmin, function (req, res) {
        var startIndex = parseInt(req.params.start) || 0,
            limit = parseInt(req.params.limit) || 0;

        if (limit > 0) ++limit;

        var query = {isAdmin: {$exists: false}, deleted: false};

        User.count(query, function (err, rowsCount) {
            User.find(query)
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
                        hasMore: hasMore,
                        total: rowsCount
                    });
                });
        });
    });

    /**
     *  PUT
     *  Disable/Enable user account
     */
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


    /**
     *  DELETE
     */
    function deleteUser(id, callback) {
        User.findOne({_id: id, deleted: false}, function (err, user) {
            if (err || !user) return callback(true);

            user.deleted = true;
            user.save(callback);
        });
    };

    app.delete('/user', mw.checkAuth, function (req, res) {
        deleteUser(req.user, function (err) {
            if (err) return res.send(500);
            res.send(200);
        });
    });

    app.delete('/user/:id', mw.checkAuth, mw.isAdmin, mw.validateId, function (req, res) {
        deleteUser(req.params.id, function (err) {
            if (err) return res.send(500);
            res.send(200);
        });
    });
};
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

		User.findOne({ _id: req.params.id }, 'id email registrationDate currentPlan')
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

	// PUT

	// DELETE
};
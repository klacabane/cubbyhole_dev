/*
 * Runnin test drops database
 */
var DB = require('../tools/DB'),
	User = require('../models/User'),
	UserPlan = require('../models/UserPlan'),
	async = require('async');

var db = new DB(null, null, '@localhost/Cubbyhole', true);

module.exports = {
	setUp: function (callback) {
		db.connect( function () {
			db.dropDatabase(callback);
		});
	},
	tearDown: function (callback) {
		db.disconnect(callback);
	},
	saveMiddlewareTest: function (test) {
		var user = new User({ mail: 'testmail', password: 'testpassword' });
		user.save( function (err) {
			test.ok(user.currentPlan);
			UserPlan.find({}, function (error, userplans) {
				test.equal(1, userplans.length);
				test.ok(user._id.equals(userplans[0].user));
				test.done();
			});
		});
	},
	updatePlanTest: function (test) {
		var user = new User({ mail: 'testmail', password: 'testpassword' });
		user.save( function (err) {
			var oldPlanId = user.currentPlan;
			user.updatePlan(3, function (err) {
				test.ok(oldPlanId != user.currentPlan);
				UserPlan.find({ user: user._id }, function (err, userplans) {
					test.equal(2, userplans.length);
					test.strictEqual(false, userplans[0].active);
					test.done();
				});
			});
		});
	}
};

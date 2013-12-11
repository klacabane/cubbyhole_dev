/*
 * Runnin test drops database
 */
var DB = require('../tools/DB'),
	User = require('../models/User'),
	UserPlan = require('../models/UserPlan'),
	async = require('async');

var db = new DB(null, null, '@localhost/Cubbyhole', true);
var newuser = { mail: 'testnewmail', password: 'testnewpassword' };

module.exports = {
	setUp: function (callback) {
		db.connect( function (err) {
			db.dropDatabase( function () {
				var user = new User({ mail: 'testmail', password: 'testpassword' });
				var up = new UserPlan({ user: user._id, plan: 0, active: true });
				user.currentPlan = up._id;
				async.parallel([
					function (cb) {
						user.save(cb);
					},
					function (cb) {
						up.save(cb);	
					}],
				callback);
			});
		});
	},
	tearDown: function (callback) {
		db.disconnect(callback);
	},
	addTest: function (test) {
		// test new user
		User.add(newuser, function (err, created, user) {
			test.ok(created);
			test.equal('testnewmail', user.mail, 'should be testnewname');
			test.equal('testnewpassword', user.password, 'should be testnewpassword');
			UserPlan.find({}, function (err, userplans) {
				test.equal(2, userplans.length);
				test.ok(user._id.equals(userplans[1].user));
				
				// tests mail taken
				User.add({ mail: 'testmail' }, function (e, ncreated, nuser) {
					test.strictEqual(false, ncreated);
					test.equal(null, nuser);
					test.done();
				});
			});
		});
	},
	updateInfosTest: function (test) {
		User.findOne({ mail: 'testmail' }, function (err, user) {
			user.updateInfos({ mail: 'zzz' }, function (err, updated) {
				test.ok(updated);
				test.equal('zzz', user.mail);
				test.done();
			});
		});
	},
	updatePlanTest: function (test) {
		User.findOne({ mail: 'testmail' }, function (err, user) {
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

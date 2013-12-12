var mongoose = require('mongoose'),
	UserPlan = require('../models/UserPlan'),
	async = require('async');

/* Properties */
var userSchema = new mongoose.Schema({
	mail: String,
	password: String,
	registrationDate: { type: Date, default: Date.now },
	currentPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'UserPlan' }
});

/*
 * 	[ Middlewares ]
 */
 	// creates a free userPlan if new user
 	userSchema.pre('save', function (next) {
 		if (!this.isNew) return next();

 		var that = this;
		UserPlan.create({ user: that._id, plan: 0 }, function (err, up) {
			if (err) return next(err);
			that.currentPlan = up._id;
			next();
		});
 	});

/*
*	[ Methods ]
*/	
	// updatePlan
	// @param planId: number
	// callback(error)
	userSchema.methods.updatePlan = function (planId, callback) {
		var that = this;
		
		async.parallel([
			function (cb) {
				UserPlan.create({ user: that._id, plan: planId }, cb);
			},
			function (cb) {
				UserPlan.findByIdAndUpdate(that.currentPlan, { active: false }, cb);
			}],
			function (err, results) {
				if (err) return callback(err);
				that.currentPlan = results[0]._id;
				that.save(callback);
		});
	};

module.exports = mongoose.model('User', userSchema);
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
 * 	[ Middleware ]
 */
 	userSchema.pre('save', function (next) {
 		if (this.isModified('password')) {
	 		// hash pw
	 	}
 	});
/*
*	[ Statics ]
*/
	// add
	// persist user with free plan
	// @param args: { mail: string, password: string }
	// callback(error, success, user)
	// success @false: mail taken, @true: account created
	// TODO: hash password
	userSchema.methods.add = function (callback) {
		var self = this;
		this.model('User').findOne({ mail: self.mail }, function (err, u) {
			if (err) callback(err);

			if (u != null) {
				callback(null, false);
			} else {
				var userPlan = new UserPlan({ user: self._id, plan: 0, active: true });
				self.currentPlan = userPlan._id;
				async.parallel([
					function (cb) {
						self.save(cb);
					},
					function (cb) {
						userPlan.save(cb);	
					}],
					function (err) {
						if (err) callback(err);
						self.populate('currentPlan', function (err) {
							if (err) callback(err);
							callback(null, true);
						});
				});
			}
		});	
	};
	
/*
 * [ Methods ]
 */
	// updateInfos
	// @param args: { mail: string } | { password: string }
	// callback(error, success)
	// success @false: mail taken, @true: account updated
	// TODO: hash new password
	userSchema.methods.updateInfos = function (newParam, callback) {
		var self = this;
		if (newParam.hasOwnProperty('password')) {
			this.password = newParam.password;
			this.save( function (err) {
				if (err) callback(err);
				callback(null, true);
			});
		} else if (newParam.hasOwnProperty('mail')) {
			this.model('User').findOne(newParam, function (err, user) {
				if (err) callback(err);
				if (user != null) {
					callback(null, false);
				} else {
					self.mail = newParam.mail;
					self.save( function (err) {
						if (err) callback(err);
						callback(null, true);
					});
				}
			});
		}
	};
	
	// updatePlan
	// @param planId: number
	// callback(error)
	userSchema.methods.updatePlan = function (planId, callback) {
		var self = this;
		var userPlan = new UserPlan({ user: self._id, plan: planId, active: true });
		
		async.parallel([
			function (cb) {
				userPlan.save(cb);
			},
			function (cb) {
				UserPlan.findByIdAndUpdate(self.currentPlan, { active: false }, cb);
			}],
			function (err) {
				if (err) callback(err);
				self.currentPlan = userPlan._id;
				self.save( function (err) {
					if (err) callback(err);
					callback();
				});
		});
	};

module.exports = mongoose.model('User', userSchema);
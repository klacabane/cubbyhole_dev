var mongoose = require('mongoose'),
	UserPlan = require('../models/UserPlan'),
	cfg = require('../config'),
	async = require('async'),
	bcrypt = require('bcrypt'),
	fs = require('fs');

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
 	// create a free userPlan and mkdir if new user & hash pw on update/insert
 	userSchema.pre('save', function (next) {
 		var that = this;
 		if (!this.isNew) {
 			if (!this.isModified('password'))
 				next();
 			else
 				this.hashPw(next);
 		} else {
	 		async.parallel([
 				function (cb) {
 					UserPlan.create({ user: that._id, plan: 0 }, function (err, up) {
						if (err) return cb(err);
						that.currentPlan = up._id;
						cb();
					});
 				},
 				function (cb) {
 					that.hashPw(cb);
 				},
 				function (cb) {
 					fs.mkdir(cfg.storage.dir + '/' + that._id, cb);
 				}], next);
 		}
 	});

/*
*	[ Methods ]
*/	
	// updatePlan
	// @param planId: number
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

	// hashPw
	userSchema.methods.hashPw = function (callback) {
		var that = this;
		bcrypt.hash(this.password, 12, function (err, hash) {
			if (err) return callback(err);
			that.password = hash;
			callback();
		});
	};

	// comparePw
	userSchema.methods.comparePw = function (pw, cb) {
		bcrypt.compare(pw, this.password, function (err, match) {
			if (err) return cb(err);
			cb(null, match);
		});
	};

module.exports = mongoose.model('User', userSchema);
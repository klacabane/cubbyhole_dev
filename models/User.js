var mongoose = require('mongoose'),
    Plan = require('../models/Plan'),
	UserPlan = require('../models/UserPlan'),
    Item = require('../models/Item'),
    ItemShare = require('../models/ItemShare'),
	async = require('async'),
	bcrypt = require('bcrypt');

/* Properties */
var userSchema = new mongoose.Schema({
	email: String,
	password: String,
	registrationDate: { type: Date, default: Date.now },
	currentPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'UserPlan' },
	verified: Boolean
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
                    Plan.findOne({price: 0}, function (err, plan) {
                        if (err) return cb(err);

                        UserPlan.create({ user: that._id, plan: plan._id }, function (err, up) {
                            if (err) return cb(err);
                            that.currentPlan = up._id;
                            cb();
                        });
                    });
 				},
 				function (cb) {
 					that.hashPw(cb);
 				},
 				function (cb) {
                    new Item({isRoot: true, name: that._id, type: 'folder', owner: that._id})
                        .save(cb);
 				}], next);
 		}
 	});

/*
*	[ Methods ]
*/

userSchema.methods.format = function () {
    var obj = this.toObject();

    delete obj.currentPlan.user;
    delete obj.currentPlan._id;
    delete obj.currentPlan.__v;

    return obj;
};

	// updatePlan
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

    /*
     *  [ Statics ]
     */
    userSchema.statics.hasPermissions = function (args, callback) {
        var user = args.user,
            item = args.item,
            permissions = args.permissions || 0;

        if (user === item.owner.toString())
            callback(null, true);
        else
            ItemShare.getItemShare(item, function (err, ishare) {
                if (err || !ishare) return callback(err, false);

                callback(null, ishare.getMembership(user).permissions >= permissions);
            });
    };

module.exports = mongoose.model('User', userSchema);
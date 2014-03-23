var mongoose = require('mongoose'),
    Plan = require('../models/Plan'),
	UserPlan = require('../models/UserPlan'),
    Item = require('../models/Item'),
    ItemShare = require('../models/ItemShare'),
    DailyTransfer = require('../models/UserDailyTransfer'),
	async = require('async'),
	bcrypt = require('bcrypt'),
    Utils = require('../tools/Utils');

/* Properties */
var userSchema = new mongoose.Schema({
	email: {type: String, lowercase: true, trim: true},
	password: String,
	registrationDate: { type: Date, default: Date.now },
	currentPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'UserPlan' },
	verified: {type: Boolean, default: false},
    isAdmin: Boolean,
    isAllowed: {type: Boolean, default: true}
});

/*
 * 	[ Middlewares ]
 */
 	// create a free userPlan and mkdir if new user & hash pw on update/insert
 	userSchema.pre('save', function (next) {
 		var that = this;

 		if (!this.isNew || this.isAdmin) {
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

userSchema.methods.getPlanUsage = function (callback) {
    var that = this;

    async.parallel({
        storage: function (next) {
            Item.findOne({owner: that._id, isRoot: true}, function (err, rootFolder) {
                if (err) return next(err);

                rootFolder.getSize(function (err, size) {
                    if (err) return next(err);

                    next(null, Utils.bytesToMb(size));
                });
            });
        },
        share: function (next) {
            that.getTodayTransfer(function (err, dailyTransfer) {
                if (err) return next(err);

                next(null, Utils.bytesToMb(dailyTransfer.dataShared));
            });
        },
        bandwidth: function (next) {
            UserPlan.findOne({_id: that.currentPlan}, function (err, currentPlan) {
                if (err) return next(err);

                var bwUsage = currentPlan.usage.bandwidth;
                next(null, {
                    download: Utils.bytesToMb(bwUsage.download),
                    upload: Utils.bytesToMb(bwUsage.upload)
                });
            });
        }
    },
    callback);
};

userSchema.methods.getTodayTransfer = function (callback) {
    var query = {
        user: this._id,
        date: new Date().setHours(0,0,0,0)
    };
    DailyTransfer.findOne(query, function (err, dailyTransfer) {
        if (err || dailyTransfer) return callback(err, dailyTransfer);

        new DailyTransfer(query).save(function (err, newDailyTransfer) {
            callback(err, newDailyTransfer);
        });
    });
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
            owner = item.owner._id ? item.owner._id.toString() : item.owner.toString(),
            permissions = args.permissions || 0;

        if (user === owner)
            callback(null, true);
        else
            ItemShare.getItemShare(item, function (err, ishare) {
                if (err || !ishare) return callback(err, false);

                callback(null, ishare.getMembership(user).permissions >= permissions);
            });
    };

module.exports = mongoose.model('User', userSchema);
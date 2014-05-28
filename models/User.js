var mongoose = require('mongoose'),
    Plan = require('../models/Plan'),
    UserPlan = require('../models/UserPlan'),
    Item = require('../models/Item'),
    ItemShare = require('../models/ItemShare'),
    DailyTransfer = require('../models/UserDailyTransfer'),
    async = require('async'),
    bcrypt = require('bcrypt'),
    Utils = require('../tools/utils');

var userSchema = new mongoose.Schema({
    email: {type: String, lowercase: true, trim: true},
    password: String,
    registrationDate: { type: Date, default: Date.now },
    currentPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'UserPlan' },
    verified: {type: Boolean, default: false},
    deleted: {type: Boolean, default: false},
    isAdmin: Boolean,
    isAllowed: {type: Boolean, default: true},
    location: mongoose.Schema.Types.Mixed
});

/**
 * Middlewares
 */
/** save
 * create a free userPlan and mkdir if new user &
 * hash pw on update/insert
 */
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

                    UserPlan.create({user: that._id, plan: plan._id, isFree: true}, function (err, userPlan) {
                        if (userPlan) {
                            that.currentPlan = userPlan._id;
                        }
                        cb(err);
                    });
                });
            },
            function (cb) {
                that.hashPw(cb);
            },
            function (cb) {
                new Item({isRoot: true, name: that._id, type: 'folder', owner: that._id})
                    .save(cb);
            }],
            next);
    }
});

/**
 * Methods
 */

/**
 * format
 * @returns {Object}
 */
userSchema.methods.format = function () {
    var obj = this.toObject();

    delete obj.currentPlan.user;
    delete obj.currentPlan._id;
    delete obj.currentPlan.__v;

    return obj;
};

/**
 * getStorageUsage
 * @param callback
 * @returns total usage @int
 */
userSchema.methods.getStorageUsage = function (callback) {
    Item.findOne({isRoot: true, owner: this._id}, function (err, rootFolder) {
        if (err) return callback(err);
        rootFolder.getSize(callback);
    });
};

/**
 * getPlanUsage
 * @param callback
 * @returns @Object {storage: int, share: int, bandwidth: {upload: int, download: int}}
 */
userSchema.methods.getPlanUsage = function (callback) {
    var that = this;

    async.parallel({
        storage: function (next) {
            that.getStorageUsage(function (err, size) {
                next(err, Utils.bytesToMb(size));
            });
        },
        share: function (next) {
            that.getTodayTransfer(function (err, dailyTransfer) {
                next(err, Utils.bytesToMb(dailyTransfer.dataShared));
            });
        },
        bandwidth: function (next) {
            UserPlan.findOne({_id: that.currentPlan}, function (err, currentPlan) {
                if (err) return next(err);

                var planUsage = currentPlan.usage;
                next(null, {
                    bandwidth: {
                        download: Utils.bytesToMb(planUsage.bandwidth.download),
                        upload: Utils.bytesToMb(planUsage.bandwidth.upload)
                    }
                });
            });
        }
    },
    callback);
};

/**
 * getTodayTransfer
 * @param callback
 * @returns current @DailyTransfer
 */
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

/**
 * updatePlan
 * @param planId    @id new plan Id
 * @param callback
 */
userSchema.methods.updatePlan = function (plan, callback) {
    var that = this,
        isFree = plan.price === 0;

    async.parallel({
        newPlan: function (cb) {
            UserPlan.create({user: that._id, plan: plan._id, isFree: isFree}, cb);
        },
        oldPlan: function (cb) {
            UserPlan.findByIdAndUpdate(that.currentPlan, {active: false}, cb);
        }
    }, function (err, results) {
        if (err) return callback(err);
        that.currentPlan = results.newPlan._id;
        that.save(callback);
    });
};

/**
 * hashPw
 * @param callback
 */
userSchema.methods.hashPw = function (callback) {
    var that = this;
    bcrypt.hash(this.password, 12, function (err, hash) {
        if (hash) {
            that.password = hash;
        }
        callback(err);
    });
};

/**
 * comparePw
 * @param pw
 * @param callback
 * @returns match @bool
 */
userSchema.methods.comparePw = function (pw, callback) {
    bcrypt.compare(pw, this.password, callback);
};

/**
 * Statics
 */

/**
 * hasPermissions
 * @param args  @Object {user: id, item: Item [, permissions: @1]}
 * @param callback
 * @returns @bool
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

            var membership = ishare.getMembership(user);
            if (!membership)
                callback(null, false);
            else
                callback(null, membership.permissions >= permissions);
        });
};

module.exports = mongoose.model('User', userSchema);
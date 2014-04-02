var mongoose = require('mongoose'),
    Item = require('../models/Item'),
    Utils = require('../tools/utils'),
    async = require('async'),
    path = require('path');

var memberSchema = new mongoose.Schema({
    email: String,
    accepted: Boolean,
    permissions: Number,
    custom: {
        name: String,
        parent: {type: mongoose.Schema.Types.ObjectId},
        rootRef: {type: mongoose.Schema.Types.ObjectId}
    }
});

var itemShareSchema = new mongoose.Schema({
    owner: {
        _id: {type: mongoose.Schema.Types.ObjectId},
        email: String
    },
    members: [memberSchema],
    item: {type: mongoose.Schema.Types.ObjectId, ref: 'Item'}
});

/**
 * Middlewares
 */
/** remove */
itemShareSchema.pre('remove', function (next) {
    Item.findOne({_id: this.item}, function (err, item) {
        if (err) return next(err);

        item.setShared(false, next);
    });
});

/**
 * Methods
 */

/**
 * format
 * @returns {Object}
 */
itemShareSchema.methods.format = function () {
    var obj = this.toObject();
    obj._id = obj.item._id;
    obj.name = obj.item.name;
    obj.path = 'My Cubbyhole,' + obj.item.name;
    obj.lastModified = obj.item.lastModified;

    delete obj.item;

    return obj;
};

/**
 * formatWithPath
 * @param user
 * @param callback
 * @returns {Object}
 */
itemShareSchema.methods.formatWithPath = function (user, callback) {
    var obj = this.toObject();

    obj._id = obj.item._id;
    obj.name = obj.item.name;
    obj.lastModified = obj.item.lastModified;

    delete obj.item;

    if (user === this.owner._id.toString()) {
        this.item.getDirPath(function (err, dirPath) {
            if (err) return callback(err);

            var p = dirPath.split(path.sep);
            p.splice(0, 2, 'My Cubbyhole');
            obj.path = p.join(',');

            callback(null, obj);
        });
    } else {
        var membership = this.getMembership(user);

        Item.findOne({_id: membership.custom.parent}, function (err, customParent) {
            if (err) return callback(err);

            obj.name = membership.custom.name || obj.name;

            customParent.getDirPath(function (err, dirPath) {
                if (err) return callback(err);

                var p = dirPath.split(path.sep);
                p.splice(0, 2, 'My Cubbyhole');
                obj.path = p.join(',') + ',' + obj.name;
                callback(null, obj);
            });
        });
    }
};

/**
 * removeMember
 * @param id @id Member to remove
 */
itemShareSchema.methods.removeMember = function (id) {
    for (var i = 0, length = this.members.length; i < length; i++) {
        if (this.members[i]._id == id) {
            this.members.splice(i, 1);
            break;
        }
    }
};

/**
 * isMember
 * @param id @id User to check
 * @returns @bool
 */
itemShareSchema.methods.isMember = function (id) {
    return Utils.isMember(id, this.members);
};

/**
 * getMembership
 * @param id @id User to check
 * @returns User's membership @{Object|null}
 */
itemShareSchema.methods.getMembership = function (id) {
    var members = this.members,
        userId = (typeof id === 'string') ? id : id.toString(),
        membership;
    for (var i = 0, length = members.length; i < length; i++) {
        if (members[i]._id.toString() === userId) {
            membership = members[i];
            break;
        }
    }
    return membership;
};

/**
 * getItemShare
 * @param item
 * @param callback
 * @returns @ItemShare
 */
itemShareSchema.statics.getItemShare = function (item, callback) {
    var that = this;

    this.findOne({item: item._id}, function (err, ishare) {
        if (err || ishare) return callback(err, ishare);

        item.getAncestors(function (err, ancestors) {
            if (err) return callback(err);

            var fn = [];
            ancestors.forEach(function (anc) {
                fn.push(function (cb) {
                    that.findOne({item: anc._id}, cb);
                });
            });

            async.parallel(fn, function (err, results) {
                callback(err, Utils.cleanArray(results)[0]);
            });
        });
    });
};

module.exports = mongoose.model('ItemShare', itemShareSchema);
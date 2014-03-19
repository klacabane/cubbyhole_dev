var mongoose = require('mongoose'),
    Item = require('../models/Item'),
    Utils = require('../tools/Utils'),
    async = require('async');

var memberSchema = new mongoose.Schema({
    email: String,
    accepted: Boolean,
    permissions: Number
});

var itemShareSchema = new mongoose.Schema({
    owner: {
        _id: {type: mongoose.Schema.Types.ObjectId},
        email: String
    },
    members: [memberSchema],
    item: {type: mongoose.Schema.Types.ObjectId, ref: 'Item'}
});


itemShareSchema.pre('remove', function (next) {
    Item.findOne({_id: this.item}, function (err, item) {
        if (err) return next(err);

        item.setShared(false, next);
    });
});


itemShareSchema.methods.format = function () {
    var obj = this.toObject();
    obj._id = obj.item._id;
    obj.name = obj.item.name;
    obj.path = 'My Cubbyhole,' + obj.item.name;
    obj.lastModified = obj.item.lastModified;

    delete obj.item;

    return obj;
};

itemShareSchema.methods.removeMember = function (id) {
    for (var i = 0, length = this.members.length; i < length; i++) {
        if (this.members[i]._id == id) {
            this.members.splice(i, 1);
            break;
        }
    }
};


itemShareSchema.methods.isMember = function (id) {
    return Utils.isMember(id, this.members);
};

itemShareSchema.methods.getMembership = function (id) {
    var members = this.members,
        membership = {};
    for (var i = 0, length = members.length; i < length; i++) {
        if (members[i]._id == id)
            membership = members[i];
    }
    return membership;
};

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
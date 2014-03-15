var mongoose = require('mongoose'),
    Item = require('../models/Item');

var memberSchema = new mongoose.Schema({
    email: String,
    accepted: {type: Boolean, default: true},
    permissions: Number
});

var itemShareSchema = new mongoose.Schema({
    owner: {
        _id: {type: mongoose.Schema.Types.ObjectId},
        email: String
    },
    members: [memberSchema],
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item'},
    public: {type: Boolean, default: false}
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
    var lookup = {},
        members = this.members;
    for (var i = 0, length = members.length; i < length; i++) {
        lookup[members[i]._id.toString()] = members[i];
    }

    return lookup[id] !== undefined;
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

module.exports = mongoose.model('ItemShare', itemShareSchema);
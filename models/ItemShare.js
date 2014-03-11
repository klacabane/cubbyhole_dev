var mongoose = require('mongoose');

var itemShareSchema = new mongoose.Schema({
    owner: {
        _id: {type: mongoose.Schema.Types.ObjectId},
        email: String
    },
    with: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item'},
    accepted: {type: Boolean, default: true},
    permissions: {type: Number, default: 0},    // @0 or 1
    public: {type: Boolean, default: false}
});

itemShareSchema.methods.formatWithMembers = function (callback) {
    var that = this;

    this.model('ItemShare').find({item: this.item})
        .lean()
        .populate('with item')
        .exec(function (err, ishares) {
            if (err) return callback(err);

            var members = [];
            ishares.forEach(function (ishare) {
                var obj = {
                    _id: ishare.with._id,
                    email: ishare.with.mail,
                    accepted: ishare.accepted,
                    permissions: ishare.permissions
                };
                members.push(obj);
            });

            callback(null,{
                _id: ishares[0].item._id,
                name: ishares[0].item.name,
                size: 'not yet',
                lastModified: that.item.lastModified,
                path: 'My Cubbyhole,' + ishares[0].item.name,
                owner: that.owner,
                members: members
            });
        });
};

module.exports = mongoose.model('ItemShare', itemShareSchema);
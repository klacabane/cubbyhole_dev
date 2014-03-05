var mongoose = require('mongoose');

var itemShareSchema = new mongoose.Schema({
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    with: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item'},
    accepted: Boolean,
    public: Boolean
});

module.exports = mongoose.model('ItemShare', itemShareSchema);
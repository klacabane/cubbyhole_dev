var mongoose = require('mongoose');

var itemShareSchema = new mongoose.Schema({
    with: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item'},
    accepted: Boolean
});

module.exports = mongoose.model('ItemShare', itemShareSchema);
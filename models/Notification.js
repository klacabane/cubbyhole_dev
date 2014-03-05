var mongoose = require('mongoose');

var notificationSchema = new mongoose.Schema({
    type: {type: String, enum: ['S', 'D']},
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    from: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    date: {type: Date, default: Date.now},
    share: {type: mongoose.Schema.Types.ObjectId, ref: 'ItemShare'},
    item: {
        name: String,
        type: {type: String}
    }
});

module.exports = mongoose.model('Notification', notificationSchema);
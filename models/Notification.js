var mongoose = require('mongoose');

var notificationSchema = new mongoose.Schema({
    type: {type: String, enum: ['S', 'D']},
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    from: {
        _id: mongoose.Schema.Types.ObjectId,
        email: String
    },
    date: {type: Date, default: Date.now},
    share: {type: mongoose.Schema.Types.ObjectId, ref: 'Item'},
    item: {
        _id: mongoose.Schema.Types.ObjectId,
        name: String,
        type: {type: String}
    },
    message: String
});

/**
 * Methods
 */

/**
 * createMessage
 */
notificationSchema.methods.createMessage = function () {
    switch (this.type) {
        case 'S':
            this.message = this.from.email + ' wants to share the folder ' + this.item.name + ' with you.';
            break;
        case 'D':
            this.message = this.from.email + ' deleted the shared folder ' + this.item.name + '.';
            break;
    }
};

module.exports = mongoose.model('Notification', notificationSchema);
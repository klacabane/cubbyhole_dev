var mongoose = require('mongoose');

var userDailyTransferSchema = new mongoose.Schema({
	date: { type: Date, default: Date.now },
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
	dataShared: Number
});

module.exports = mongoose.model('UserDailyTransfer', userDailyTransferSchema);
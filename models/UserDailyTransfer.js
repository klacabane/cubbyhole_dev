var mongoose = require('mongoose');

var userDailyTransferSchema = new mongoose.Schema({
	date: { type: Date, default: new Date().setHours(0,0,0,0) },
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
	dataShared: Number
});

module.exports = mongoose.model('UserDailyTransfer', userDailyTransferSchema);
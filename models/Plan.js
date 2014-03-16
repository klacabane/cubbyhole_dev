var mongoose = require('mongoose'),
	Bandwidth = require('../models/Bandwidth');

var planSchema = new mongoose.Schema({
	name : String,
	price : Number,
	duration : Number,
	storage : Number,
	sharedQuota : Number,
	bandwidth : { type: mongoose.Schema.Types.ObjectId, ref: 'Bandwidth' }
});

/*
*	[ Statics ]
*/
planSchema.statics.removeAll = function (callback) {
	this.model('Plan').remove({}, function (err) {
		if (err) callback(err);
		Bandwidth.remove({}, function (err) {
			if (err) callback(err);
			callback();
		});
	 });
};

/*
*	[ Methods ]
*/


module.exports = mongoose.model('Plan', planSchema);
var mongoose = require('mongoose'),
	Bandwidth = require('../models/Bandwidth');

var planSchema = new mongoose.Schema({
	_id: Number,
	name : String,
	price : Number,
	duration : Number,
	storage : Number,
	sharedQuota : Number,
	bandwidth : { type: Number, ref: 'Bandwidth' }
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
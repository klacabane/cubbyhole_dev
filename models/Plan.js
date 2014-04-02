var mongoose = require('mongoose'),
	Bandwidth = require('../models/Bandwidth');

var planSchema = new mongoose.Schema({
	name : String,
	price : Number,
	duration : Number,
	storage : Number,
	sharedQuota : Number,
	bandwidth : { type: mongoose.Schema.Types.ObjectId, ref: 'Bandwidth' },
    isMutable: {type: Boolean, default: true}
});

/**
 * Statics
 */

/**
 * removeAll
 * @param callback
 */
planSchema.statics.removeAll = function (callback) {
	this.model('Plan').remove({}, function (err) {
		Bandwidth.remove({}, callback);
	 });
};


module.exports = mongoose.model('Plan', planSchema);
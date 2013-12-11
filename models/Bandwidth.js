var mongoose = require('mongoose');

var bandwidthSchema = new mongoose.Schema({
	_id: Number,
	upload: Number,
	download: Number,
});

module.exports = mongoose.model('Bandwidth', bandwidthSchema);
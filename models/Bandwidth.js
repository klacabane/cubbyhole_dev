var mongoose = require('mongoose');

var bandwidthSchema = new mongoose.Schema({
	upload: Number,
	download: Number
});

module.exports = mongoose.model('Bandwidth', bandwidthSchema);
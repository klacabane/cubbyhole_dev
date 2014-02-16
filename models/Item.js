var mongoose = require('mongoose'),
	tree = require('mongoose-path-tree'),
	cfg = require('../config'),
	fs = require('fs'),
	Q = require('q'),
	async = require('async'),
	Utils = require('../tools/utils');

var itemSchema = new mongoose.Schema({
	name: 		String,
	type: 		String,
	url: 		String,
	owner: 		{ type: mongoose.Schema.ObjectId, ref: 'User' },
	meta: 		mongoose.Schema.Types.Mixed
});

itemSchema.plugin(tree);

/*
 *	Middlewares
 */
itemSchema.pre('save', function (next) {
	var that = this;

	if (this.isNew) {
		this.getDirPath()
		.then(function (path) {
			var p = cfg.storage.dir + '/' + that.owner + '/' + path;
			if (that.type == 'folder')
				fs.mkdir(p, function (e) {
					if (e) return next(e);
					next();
				});
			else
				fs.readFile(that.meta.tmp, function (err, data) {
					if (err) return next(err);
				  	fs.writeFile(p, data, function (err) {
				  		if (err) return next(err);
				  		
				  		that.meta.tmp = undefined;
				  		next();
			  		});
				});
		});
	} else {
		next();
	}
});

/*
 *	Methods
 */
itemSchema.methods.getDirPath = function () {
	var defer = Q.defer(),
		that = this;

	if (this.parent) 
		this.getAncestors(function (err, items) {
			if (err) return defer.reject(err);
			var fullPath = '';
			items.forEach(function (i) {
				fullPath += i.name + '/';
			});
			defer.resolve(fullPath + that.name);
		});
	else
		defer.resolve(this.name);

	return defer.promise;
};

/*
 *	Statics
 */
itemSchema.statics.parentExists = function (id, cb) {
	if (!id) return cb(null, true);
	if (!id.match(/^[0-9a-fA-F]{24}$/)) return cb(null, false);

	this.findOne({_id: id}, function (err, item) {
		if (err) return cb(err);
		cb(null, item !== null);
	});
};

module.exports = mongoose.model('Item', itemSchema);
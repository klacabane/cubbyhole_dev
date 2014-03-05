var mongoose = require('mongoose'),
	tree = require('mongoose-path-tree'),
	cfg = require('../config'),
	fs = require('fs'),
	Q = require('q'),
    path = require('path');

var itemSchema = new mongoose.Schema({
	name: 		    String,
	type: 		    String,
	url: 		    String,
	owner: 		    {type: mongoose.Schema.ObjectId, ref: 'User'},
	meta: 		    mongoose.Schema.Types.Mixed,
    lastModified:   {type: Date, default: Date.now}
});

itemSchema.plugin(tree);

/*
 *	Middlewares
 */
itemSchema.pre('save', function (next) {
	var that = this;

	if (!this.isNew) return next();

    // new Item, make dir or write file
    this.getDirPath(function (err, path) {
        if (err) return next(err);

        if (that.type == 'folder')
            fs.mkdir(path, function (e) {
                if (e) return next(e);
                next();
            });
        else
            fs.readFile(that.meta.tmp, function (err, data) {
                if (err) return next(err);
                fs.writeFile(path, data, function (err) {
                    if (err) return next(err);

                    that.meta.tmp = undefined;
                    next();
                });
            });
    });
});

/*
 *	Methods
 */
itemSchema.methods.getDirPath = function (callback) {
    var that = this,
        fullPath = path.join(cfg.storage.dir, that.owner.toString());

    if (!this.parent)
        return callback(null, path.join(fullPath, this.name));

    this.getAncestors(function (err, items) {
        if (err) return callback(err);

        items.forEach(function (i) {
            fullPath = path.join(fullPath, i.name);
        });
        callback(null, path.join(fullPath, that.name));
    });
};

/*
 *	Statics
 */
itemSchema.statics.parentExists = function (id, cb) {
	if (!id || id === '-1') return cb(null, true);
	if (!id.match(/^[0-9a-fA-F]{24}$/)) return cb(null, false);

	this.findOne({_id: id}, function (err, item) {
		if (err) return cb(err);
		cb(null, item !== null);
	});
};

module.exports = mongoose.model('Item', itemSchema);
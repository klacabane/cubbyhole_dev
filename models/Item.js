var mongoose = require('mongoose'),
	tree = require('mongoose-path-tree'),
	cfg = require('../config'),
	fs = require('fs-extra'),
    path = require('path'),
    async = require('async');

var itemSchema = new mongoose.Schema({
	name: 		    String,
	type: 		    String,
	url: 		    String,
	owner: 		    {type: mongoose.Schema.ObjectId, ref: 'User'},
	meta: 		    mongoose.Schema.Types.Mixed,                    // @type, @size
    lastModified:   {type: Date, default: Date.now},
    root:           Boolean,
    isCopy:         Boolean
});

itemSchema.plugin(tree);

/*
 *	Middlewares
 */
itemSchema.pre('save', function (next) {
	var that = this;

	if (!this.isNew || this.isCopy) return next();

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

itemSchema.pre('remove', function (next) {
    this.getDirPath(function (err, path) {
        if (err) return next(err);
        fs.remove(path, next);
    });
});

/*
 *	Methods
 */
itemSchema.methods.getDirPath = function (callback) {
    var that = this,
        fullPath = cfg.storage.dir;

    if (this.root)
        return callback(null, path.join(cfg.storage.dir, that.owner.toString()));

    this.getAncestors(function (err, items) {
        if (err) return callback(err);

        items.forEach(function (i) {
            fullPath = path.join(fullPath, i.name);
        });
        callback(null, path.join(fullPath, that.name));
    });
};

itemSchema.statics.duplicateTree = function (args, callback) {
    duplicate({original: args.original, newParent: args.newParent}, function (err, dupParent) {
        args.original.getChildrenTree(function (err, childrens) {
            if (err) return callback(err);

            if (!childrens.length) return callback();

            var cArgs = [];
            childrens.forEach(function (c) {
                cArgs.push({original: new itemSchema(c), newParent: dupParent._id});
            });

            async.map(cArgs, duplicateTree, function (err) {
                if (err) return callback(err);
                callback(null, dupParent);
            });
        });
    });
};

var duplicateTree = itemSchema.statics.duplicateTree;

/*
 *	Statics
 */
itemSchema.statics.parentExists = function (id, cb) {
	if (!id || id === '-1') return cb(null, true);  // remove
	if (!id.match(/^[0-9a-fA-F]{24}$/)) return cb(null, false);

	this.findOne({_id: id}, function (err, item) {
		if (err) return cb(err);
		cb(null, item !== null);
	});
};

module.exports = mongoose.model('Item', itemSchema);
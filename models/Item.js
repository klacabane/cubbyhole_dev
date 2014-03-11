var mongoose = require('mongoose'),
	tree = require('mongoose-path-tree'),
	cfg = require('../config'),
	fs = require('fs-extra'),
    path = require('path'),
    async = require('async'),
    Utils = require('../tools/utils');

var itemSchema = new mongoose.Schema({
	name: 		    String,
	type: 		    String,
	url: 		    String,
	owner: 		    {type: mongoose.Schema.ObjectId, ref: 'User'},
	meta: 		    mongoose.Schema.Types.Mixed,                    // @type, @size
    lastModified:   {type: Date, default: Date.now},
    isRoot:         Boolean,
    isCopy:         Boolean,
    isShared:       {type: Boolean, default: false}
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

    if (this.isRoot)
        return callback(null, path.join(cfg.storage.dir, that.owner.toString()));

    this.getAncestors(function (err, items) {
        if (err) return callback(err);

        items.forEach(function (i) {
            fullPath = path.join(fullPath, i.name);
        });
        callback(null, path.join(fullPath, that.name));
    });
};

itemSchema.methods.duplicate = function (parent, callback) {
    var that = this;
    this.model('Item').findOne({name: this.name, parent: parent, type: this.type, owner: this.owner}, function (err, existing) {
        if (err) return callback(err);
        var name = (existing) ? Utils.rename(that.name) : that.name;

        new that.constructor({
            name: name,
            owner: that.owner,
            isCopy: true,
            type: that.type,
            parent: parent,
            meta: that.meta
        }).save(callback);
    });
};

itemSchema.methods.duplicateTree = function (parent, callback) {
    var that = this;

    this.duplicate(parent, function (err, dupl) {
        if (err) return callback(err);
        if (that.type === 'file') return callback(null, dupl);

        that.getChildrenTree(function (err, childrens) {
            if (err) return callback(err);
            if (!childrens.length) return callback(null, dupl);

            var fn = [];
            childrens.forEach(function (c) {
                fn.push(function (cb) {
                    new that.constructor(c)
                        .duplicateTree(dupl._id, cb);
                });
            });

            async.parallel(fn, function (err) {
                if (err) return callback(err);

                callback(null, dupl);
            });
        });
    });
};

/*
 *	Statics
 */
itemSchema.statics.parentExists = function (id, cb) {
	if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) return cb(null, false);

	this.findOne({_id: id}, function (err, item) {
		if (err) return cb(err);
		cb(null, item !== null);
	});
};

module.exports = mongoose.model('Item', itemSchema);
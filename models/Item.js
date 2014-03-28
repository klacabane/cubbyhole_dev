var mongoose = require('mongoose'),
	tree = require('mongoose-path-tree'),
	cfg = require('../config'),
	fs = require('fs-extra'),
    path = require('path'),
    async = require('async'),
    Utils = require('../tools/utils'),
    User = require('../models/User');

var itemSchema = new mongoose.Schema({
	name: 		    String,
	type: 		    String,
	url: 		    String,
	owner: 		    {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
	meta: 		    mongoose.Schema.Types.Mixed,                    // @type, @size
    lastModified:   {type: Date, default: Date.now},
    isRoot:         Boolean,
    isCopy:         Boolean,
    isShared:       Boolean,
    isPublic:       Boolean,
    link: {
        url:            String,
        creationDate:   Date,
        recipients: [{
            _id:        {type: mongoose.Schema.Types.ObjectId},
            email:      String
        }]
    }
});

itemSchema.plugin(tree);

/**
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

/**
 *	Methods
 */
itemSchema.methods.getDirPath = function (callback) {
    var that = this,
        fullPath = cfg.storage.dir;

    if (this.isRoot)
        return callback(null, path.join(cfg.storage.dir, that.owner.toString()));

    this.getAncestors(function (err, ancestors) {
        if (err) return callback(err);

        ancestors.sort(function (a, b) {
            if (a.level < b.level) return -1;
            else return 1;
        });

        ancestors.forEach(function (ancestor) {
            fullPath = path.join(fullPath, ancestor.name);
        });
        callback(null, path.join(fullPath, that.name));
    });
};

itemSchema.methods.duplicate = function (args, callback) {
    var that = this,
        parent = args.parent,
        owner = args.owner;
    this.model('Item').findOne({name: this.name, parent: parent, type: this.type, owner: owner}, function (err, existing) {
        if (err) return callback(err);
        var name = (existing) ? Utils.rename(that.name) : that.name;

        new that.constructor({
            name: name,
            owner: owner,
            isCopy: true,
            type: that.type,
            parent: parent,
            meta: that.meta
        }).save(callback);
    });
};

itemSchema.methods.duplicateTree = function (args, callback) {
    var that = this;
    this.duplicate(args, function (err, dupl) {
        if (err) return callback(err);
        if (that.type === 'file') return callback(null, dupl);

        that.getChildrenTree(function (err, childrens) {
            if (err) return callback(err);
            if (!childrens.length) return callback(null, dupl);

            var fn = [];
            childrens.forEach(function (c) {
                fn.push(function (cb) {
                    new that.constructor(c)
                        .duplicateTree({parent: dupl._id, owner: args.owner}, cb);
                });
            });

            async.parallel(fn, function (err) {
                if (err) return callback(err);

                callback(null, dupl);
            });
        });
    });
};

itemSchema.methods.setShared = function (value, callback) {
    var that = this;

    this.getChildren(true, function (err, childrens) {
        if (err) return callback(err);

        async.each(
            childrens,
            function (child, cb) {
                child.isShared = value;
                child.save(cb);
            },
            function (err) {
                if (err) return callback(err);
                that.isShared = value;
                that.save(function (err, updated) {
                    callback(err, updated);
                });
            });
    });
};

itemSchema.methods.removeLinkRecipient = function (id) {
    for (var i = 0, length = this.link.recipients.length; i < length; i++) {
        if (this.link.recipients[i]._id == id) {
            this.link.recipients.splice(i, 1);
            break;
        }
    }
};

itemSchema.methods.getSize = function (callback) {
    var that = this;
    this.getDirPath(function (err, dirPath) {
        if (err) return callback(err);

        fs.stat(dirPath, function (err, stats) {
            var total = stats.isDirectory() ? 0 : stats.size;
            that.getChildren(function (err, childrens) {
                if (err) return callback(err);

                async.each(
                    childrens,
                    function (child, cb) {
                        child.getSize(function (err, size) {
                            total += size;
                            cb(err);
                        });
                    },
                function (err) {
                    callback(err, total);
                });
            });
        });
    });
};

itemSchema.methods.formatWithSize = function (callback) {
    var obj = this.toObject(),
        that = this;
    // Files already have their size from upload
    if (this.type === 'file') return callback(null, obj);

    // Get folder total size
    this.getSize(function (err, size) {
        if (err) return callback(err);

        obj.meta = {size: size};

        var formattedChilds = [];
        that.getChildren(function (err, childrens) {
            if (err) return callback(err);

            async.each(
                childrens,
                function (child, cb) {
                    child.formatWithSize(function (err, childObj) {
                        if (err) return cb(err);

                        formattedChilds.push(childObj);
                        cb();
                    });
                },
            function (err) {
                obj.children = formattedChilds;
                callback(err, obj);
            });
        });
    });
};

/**
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
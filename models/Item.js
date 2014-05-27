var mongoose = require('mongoose'),
    tree = require('mongoose-path-tree'),
    cfg = require('../config'),
    fs = require('fs-extra'),
    path = require('path'),
    async = require('async'),
    Utils = require('../tools/utils'),
    User = require('../models/User');

var itemSchema = new mongoose.Schema({
    name:               String,
    type:               String,
    url:                String,
    owner:              {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    meta:               mongoose.Schema.Types.Mixed,                    // @type, @size
    lastModified:       {type: Date, default: Date.now},
    isRoot:             Boolean,
    isCopy:             Boolean,
    isShared:           Boolean,
    isPublic:           Boolean,
    isRemoved:          Boolean,
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

/** save */
itemSchema.pre('save', function (next) {
    var that = this;

    if (!this.isNew || this.isCopy) return next();

    // new Item,
    // make dir or move file from tmp to user dir
    this.getDirPath(function (err, path) {
        if (err) return next(err);

        if (that.type == 'folder')
            fs.mkdir(path, next);
        else
            fs.rename(that.meta.tmp, path, function (err) {
                that.meta.tmp = undefined;
                next(err);
            });
    });
});

/** remove */
itemSchema.pre('remove', function (next) {
    this.removeDir(next);
});

/**
 *	Methods
 */
itemSchema.methods.removeDir = function (next) {
    this.getDirPath(function (err, path) {
        if (err) return next(err);
        fs.remove(path, next);
    });
};

itemSchema.methods.removeChildrens = function (next) {
    this.model('Item')
        .find({parent: this._id}, function (err, childrens) {
            if (err || !childrens.length) return next(err);

            async.each(
                childrens,
                function (child, done) {
                    child.remove(done);
                }, next);
        });
};

/**
 * getDirPath
 * @param callback
 * @returns dirPath @string
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

	    for (var i = 0, len = ancestors.length; i < len; i++) {
		    fullPath = path.join(fullPath, ancestors[i].name);
	    }

        callback(null, path.join(fullPath, that.name));
    });
};

/**
 * duplicate
 * @param args  @object {parent: id, owner: id}
 * @param callback
 * @returns duplicatedItem @Item
 */
itemSchema.methods.duplicate = function (args, callback) {
    var that = this,
        parent = args.parent,
        owner = args.owner;

    this.model('Item').findOne({name: this.name, parent: parent, type: this.type, owner: owner}, function (err, existing) {
        if (err) return callback(err);
        var name = existing
            ? Utils.rename(that.name)
            : that.name;

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

/**
 * duplicateTree
 * @param args  @object {parent: id, owner: id}
 * @param callback
 * @returns duplicated Item with tree @Item
 */
itemSchema.methods.duplicateTree = function (args, callback) {
    var that = this;
    this.duplicate(args, function (err, dupl) {
        if (err || that.type === 'file') return callback(err, dupl);

        that.getChildrenTree(function (err, childrens) {
            if (err || !childrens.length) return callback(err, dupl);

            var fn = childrens.map(function (c) {
                return function (done) {
                    new that.constructor(c)
                        .duplicateTree({parent: dupl._id, owner: args.owner}, done);
                };
            });

            async.parallel(fn, function (err) {
                callback(err, dupl);
            });
        });
    });
};

/**
 * setShared
 * Update isShared property to the item and his childs
 * @param value @bool
 * @param callback
 * @returns updatedItem @Item
 */
itemSchema.methods.setShared = function (value, callback) {
    var that = this;

    this.getChildren(true, function (err, childrens) {
        if (err) return callback(err);

        async.each(
            childrens,
            function (child, next) {
                child.isShared = value;
                child.save(next);
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

/**
 * removeLinkRecipient
 * @param id @id user to remove
 */
itemSchema.methods.removeLinkRecipient = function (id) {
    for (var i = 0, length = this.link.recipients.length; i < length; i++) {
        if (this.link.recipients[i]._id == id) {
            this.link.recipients.splice(i, 1);
            break;
        }
    }
};

/**
 * getSize
 * @param callback
 * @returns size @int
 */
itemSchema.methods.getSize = function (callback) {
    var that = this;
    this.getDirPath(function (err, dirPath) {
        if (err) return callback(err);

        fs.stat(dirPath, function (err, stats) {
            if (err) return callback(err);

            var total = stats.isDirectory()
                ? 0
                : stats.size;
            that.getChildren(function (err, childrens) {
                if (err) return callback(err);

                async.each(
                    childrens,
                    function (child, next) {
                        child.getSize(function (err, size) {
                            total += size;
                            next(err);
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
                function (child, next) {
                    child.formatWithSize(function (err, childObj) {
                        if (err) return next(err);

                        formattedChilds.push(childObj);
                        next();
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
        cb(err, item !== null);
    });
};

module.exports = mongoose.model('Item', itemSchema);
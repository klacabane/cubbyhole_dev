var admZip = require('adm-zip'),
    async = require('async'),
    easyZip = require('easy-zip').EasyZip,
    fs = require('fs-extra'),
    streamifier = require('streamifier'),
    Throttle = require('throttle'),
    Utils = require('../tools/utils'),
    mw = require('../tools/middlewares'),
    cache = require('../tools/cache'),
    Item = require('../models/Item'),
    ItemShare = require('../models/ItemShare'),
    Notification = require('../models/Notification'),
    User = require('../models/User'),
    UserPlan = require('../models/UserPlan'),
    cfg = require('../config');

module.exports = function (app) {
    /**
     *  POST
     *  Create new Item(s)
     */
    app.post('/item', mw.checkAuth, mw.handleMultipart, function (req, res) {
        var parentId = req.body.parent || req.parentId,
            type = req.body.type || 'file',
            userId = req.user,
            items = [];

        Item.findOne({_id: parentId}, function (err, parent) {
            if (err) return res.send(500);
            if (!parent) return res.send(422);

            User.hasPermissions({item: parent, user: userId, permissions: 1}, function (err, ok) {
                if (err) return res.send(500);
                if (!ok) return res.send(403);

                async.waterfall([
                    function (next) {
                        // Check if user is the parent's owner,
                        // if so we'll only need him for the next func,
                        // else we'll also need the owner
                        User.findOne({_id: userId})
                            .populate('currentPlan')
                            .exec(function (err, user) {
                                if (err || !user) return next(true);

                                if (user._id.toString() === parent.owner.toString())
                                    next(null, user, null);
                                else
                                    User.findOne({_id: parent.owner})
                                        .populate('currentPlan')
                                        .exec(function (err, parentOwner) {
                                            next(err, user, parentOwner);
                                        });
                            });
                    },
                    function (user, parentOwner, next) {
                        var itemArgs = {
                            name: '',
                            type: type,
                            parent: parent._id,
                            owner: parent.owner,
                            meta: {},
                            isShared: parent.isShared
                        };

                        // Process folder creation
                        if (type === 'folder') {
                            itemArgs.name = req.body.name;
                            Item.findOne({name: itemArgs.name, type: 'folder', parent: parent._id, owner: parent.owner}, function (err, item) {
                                if (err) return next(err);
                                if (item) itemArgs.name = Utils.rename(itemArgs.name);

                                itemArgs.meta.size = 0;
                                items.push(new Item(itemArgs));

                                next();
                            });
                        } else {
                            // Verify owner's storage capacity for each file and
                            // update user's currentPlan upload
                            var owner = parentOwner || user;
                            var ownerPlan = owner.currentPlan,
                                totalUpload = 0;

                            async.eachSeries(
                                req.files,
                                function (file, callback) {
                                    itemArgs.name = file.originalFilename;
                                    owner.getStorageUsage(function (err, usedStorage) {
                                        if (Utils.bytesToMb(usedStorage + (totalUpload + file.size)) > /*cache.getPlan(ownerPlan.plan).storage*/ 10000000)
                                            return callback();

                                        totalUpload += file.size;
                                        Item.findOne({name: itemArgs.name, type: 'file', parent: parent._id, owner: parent.owner}, function (err, item) {
                                            if (err) return callback(err);
                                            if (item) itemArgs.name = Utils.rename(itemArgs.name);

                                            itemArgs.meta = Utils.getFileMeta(file);
                                            items.push(new Item(itemArgs));

                                            callback();
                                        });
                                    });
                                },
                                function (err) {
                                    if (err) return next(err);

                                    var query = {
                                        $inc: {
                                            'usage.bandwidth.upload': totalUpload
                                        }};
                                    UserPlan.findByIdAndUpdate(user.currentPlan._id, query, next);
                                });
                        }
                    }],
                    function (err) {
                        if (err) return res.send(500);
                        if (!items.length) return res.send(403);

                        var itemsFn = items.map(function (it) {
                            return function (done) {
                                it.save(function (err, newItem) {
                                    done(err, newItem);
                                });
                            };
                        });

                        async.parallel(itemsFn, function (err, newItems) {
                            if (err) return res.send(500);
                            res.send(201, {
                                data: newItems
                            });
                        });
                    });
            });
        });
    });

    /**
     *	POST
     *  Create copy of an item
     */
    app.post('/item/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var parentId = req.body.parent,
            itemId = req.params.id;

        async.waterfall([
            function (next) {
                Item.findOne({_id: parentId}, next);
            },
            function (parent, next) {
                if (!parent) return next(new Error('Parent not found'), 422);

                Item.findOne({_id: itemId}, function (err, original) {
                    if (err) return next(err);
                    if (!original) return next(new Error('Item not found'), 404);

                    original.duplicateTree({parent: parent._id, owner: parent.owner}, function (err, dupl) {
                        next(err, original, dupl);
                    });
                });
            },
            function (original, dupl, next) {
                original.getDirPath(function (err, originPath) {
                    dupl.getDirPath(function (err, duplPath) {
                        next(err, {
                            dupl: dupl,
                            originPath: originPath,
                            duplPath: duplPath
                        });
                    });
                });
            }
        ],
        function (err, results) {
            if (err) return res.send(results || 500);

            results.dupl
                .getChildrenTree(function (err, childrens) {
                    if (err) return res.send(500);

                    var dupObj = results.dupl.toObject();
                    dupObj.children = childrens;

                    fs.copy(results.originPath, results.duplPath, function (err) {
                        if (err) return res.send(500);

                        res.send(201, {
                            data: dupObj
                        });
                    });
                });
        });
    });

    /**
     *  GET
     *  Return single item
     */
    app.get('/item/:id', mw.validateId, function (req, res) {
        Item.findOne({_id: req.params.id})
            .populate('owner')
            .exec(function (err, item) {
                if (err) return res.send(500);
                if (!item) return res.send(404);

                async.waterfall([
                    // check if the request is authorized
                    function (next) {
                        if (item.isPublic) return next();

                        mw.checkAuth(req, res, function () {
                            User.hasPermissions({user: req.user, item: item}, function (err, ok) {
                                if (!ok) return next(new Error('User doesnt have permissions'), 403);
                                next(err);
                            });
                        });
                    },
                    function (next) {
                        if (item.type === 'file') return next(null, item);

                        // Get folder childrens
                        item.getChildrenTree(function (err, childrens) {
                            if (err) return next(err);

                            var obj = item.toObject();
                            Utils.sortRecv(childrens);
                            obj.children = childrens;
                            obj.owner = {_id: item.owner._id, email: item.owner.email};

                            next(null, obj);
                        });
                    }],
                    function (err, result) {
                        if (err) return res.send(500);

                        res.send(200, {
                            data: result
                        });
                    });
            });
    });

    /**
     *	GET
     *  Return all items of authenticated user
     */
    app.get('/item', mw.checkAuth, function (req, res) {
        var userId = req.user;

        async.parallel({
            root: function (next) {
                Item.findOne({owner: userId, isRoot: true}, function (err, rootFolder) {
                    if (err) return next(err);

                    rootFolder.formatWithSize(next);
                });
            },
            shares: function (next) {
                ItemShare.find({'members._id': userId})
                    .select('item members')
                    .populate('item')
                    .exec(function (err, shares) {
                        if (err) return next(err);

                        for (var i = 0, fn = [], len = shares.length; i < len; i++) {
                            var share = shares[i],
                                membership = share.getMembership(userId);

                            if (membership.accepted)
                                fn.push(function (done) {
                                    share.item
                                        .formatWithSize(function (err, itemObj) {
                                            if (err) return done(err);

                                            Utils.setChildrensPerms(itemObj.children, membership.permissions);
                                            itemObj.parent = membership.custom.parent;
                                            itemObj.permissions = membership.permissions;
                                            itemObj.root = true;

                                            done(null, itemObj);
                                        });
                                });
                        }

                        async.parallel(fn, next);
                    });
            },
            removed: function (next) {
                Item.find({
                    owner: userId,
                    isRemoved: true
                }, next);
            }
        },
        function (err, results) {
            if (err) return res.send(500);

            for (var i = 0, len = results.shares; i < len; i++) {
                var sh = results.shares[i];
                Utils.insertAtParentPath([results.root], sh);
            }

            var childrens = results.root.children;
            Utils.sortRecv(childrens);

            var rootDir = {
                _id: results.root._id,
                type: 'folder',
                name: 'My Cubbyhole',
                children: childrens
            };
            res.send(200, {
                data: [rootDir],
                removed: results.removed
            });
        });
	});

    /**
     *  GET
     *  Download
     *  Returns resource ( file or folder.zip ) buffer
     */
    app.get('/item/:id/download/:token?', mw.validateId, function (req, res) {
        Item.findOne({_id: req.params.id}, function (err, item) {
            if (err) return res.send(500);
            if (!item) return res.send(404);

            // Download func
            function download(dlLimit) {
                item.getDirPath(function (err, dirPath) {
                    if (err) return res.send(500);

                    var limit = dlLimit || 10000,
                        filename = (item.type === 'file') ? item.name : item.name + '.zip';
                    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');

                    if (item.type === 'file') {
                        fs.createReadStream(dirPath)
                            .pipe(new Throttle(limit * 1024))
                            .pipe(res);
                    } else {
                        item.getChildren(function (err, childs) {
                            if (!childs.length) {
                                // adm-zip doesn't support empty folders
                                var zip = new easyZip();

                                zip.zipFolder(dirPath, function () {
                                    zip.writeToResponse(res, item.name);
                                });
                            } else {
                                var zip = new admZip();
                                zip.addLocalFolder(dirPath);

                                zip.toBuffer(function (buffer) {
                                    streamifier.createReadStream(buffer)
                                        .pipe(new Throttle(limit * 1024))
                                        .pipe(res);
                                });
                            }
                        });
                    }
                });
            };

            // We don't throttle the bandwidth on public downloads
            if (item.isPublic) {
                // Updates user's dataShared property
                // returns 403 as second param if sharedQuota Limit is reached
                function updateDailyTransfer(callback) {
                    User.findOne({_id: item.owner})
                        .populate('currentPlan')
                        .exec(function (err, user) {
                            var userPlan = cache.getPlan(user.currentPlan.plan);

                            user.getTodayTransfer(function (err, dailyTransfer) {
                                item.getSize(function (err, size) {
                                    if (err) return callback(err);
                                    if (Utils.bytesToMb(dailyTransfer.dataShared + size) > userPlan.sharedQuota)
                                        return callback(new Error('Shared quota reached'), 403);

                                    dailyTransfer.dataShared += size;
                                    dailyTransfer.save(callback);
                                });
                            });
                        });
                };

                var token = req.get('X-Cub-AuthToken') || req.params.token;

                // We need to identify the requester
                // to increase or not the owner's sharedData

                // Anonymous
                if (!token) {
                    // Update item's owner daily transfer
                    updateDailyTransfer(function (err, code) {
                        if (err) return res.send(code || 500);

                        download();
                    });
                } else {
                    // user is authenticated,
                    // if item is shared and user is a member,
                    // don't count this download as sharedData
                    mw.checkAuth(req, res, function () {
                        if (req.user === item.owner.toString()) {
                            download();
                        } else if (!item.isShared) {
                            updateDailyTransfer(function (err, code) {
                                if (err) return res.send(code || 500);

                                download();
                            });
                        } else {
                            ItemShare.getItemShare(item, function (err, ishare) {
                                if (err) return res.send(500);

                                if (ishare.getMembership(req.user))
                                    download();
                                else
                                    updateDailyTransfer(function (err, code) {
                                        if (err) return res.send(code || 500);

                                        download();
                                    });

                            });
                        }
                    });
                }
            } else {
                // Item is not public,
                // proceed to user authorization
                mw.checkAuth(req, res, function () {
                    // User is authenticated
                    // now check if he is authorized
                    User.findOne({_id: req.user})
                        .populate('currentPlan')
                        .exec(function (err, user) {
                            if (err) return res.send(500);

                            User.hasPermissions({user: req.user, item: item}, function (err, ok) {
                                if (err) return res.send(500);
                                if (!ok) return res.send(403);

                                item.getSize(function (err, size) {
                                    if (err) return res.send(500);

                                    var currentPlan = user.currentPlan,
                                        dlLimit = cache.getPlan(user.currentPlan.plan).bandwidth.download;

                                    // Update current plan usage
                                    currentPlan.usage.bandwidth.download += size;
                                    currentPlan.save(function (err) {
                                        if (err) return res.send(500);

                                        download(dlLimit);
                                    });
                                });
                            });
                        });
                });
            }
        });
    });

    /**
     *  DELETE
     *  Removes resources and childrens if any
     */
    app.delete('/item/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var user = req.user;

        Item.findOne({_id: req.params.id}, function (err, item) {
            if (err) return res.send(500);
            if (!item) return res.send(404);

            var isOwner = user === item.owner.toString();

            async.parallel([
                // Item is not shared,
                // make sure user is the owner
                function (next) {
	                if (item.isShared) return next();

                    if (!isOwner) {
                        next(new Error('Not authorized'), 403);
                    } else {
                        async.parallel([
                            // Check if any of items' children is shared,
                            // and delete shares if any
                            function (callback) {
                                // Delete his owners' shares
                                item.getChildrenTree(function (err, childrens) {
                                    if (err) return callback(err);

                                    var sharedChilds = Utils.getSharedChilds(childrens);
                                    async.each(
                                        sharedChilds,
                                        function (sharedChild, cb) {
                                            ItemShare.findOne({item: sharedChild}, function (err, ishare) {
                                                if (err) return cb(err);
                                                if (!ishare) return cb(new Error('ItemShare not found'));

                                                ishare.remove(cb);
                                            });
                                        }, callback);
                                });
                            },
                            function (callback) {
                                // And his memberships' shares
                                ItemShare.find({$or: [{'owner._id': user}, {'members._id': user}], 'members.custom.parent': item._id})
                                    .exec(function (err, ishares) {
                                        if (err) return callback(err);

                                        async.each(
                                            ishares,
                                            function (ishare, cb) {
                                                ishare.removeMember(user);
                                                ishare.save(cb);
                                            },
                                            callback);
                                    });
                            }],
                            function (err) {
                                if (err) return next(err);

                                // If request comes from web client
                                // we keep a reference of the deleted item to notify sync client
                                if (req.headers['origin'] !== cfg.webclient.address)
                                    item.remove(next);
                                else
                                    async.series([
                                        function (done) {
                                            item.removeChildrens(done);
                                        },
                                        function (done) {
                                            item.removeDir(done);
                                        }
                                    ],
                                    function (err) {
                                        if (err) return next(err);

                                        item.isRemoved = true;
                                        item.getDirPath(function (err, oldPath) {
                                            if (err) return next(err);

                                            item.meta.oldPath = oldPath;
                                            item.parent = undefined;
                                            item.markModified('meta');

                                            item.save(next);
                                        });
                                    });
                            });
                    }
	            },
                // Item is shared,
                // find the user relationship
                function (next) {
                    if (!item.isShared) return next();

                    ItemShare.getItemShare(item, function (err, ishare) {
                        if (err || !ishare) return next(true);

                        var membership = ishare.getMembership(user);

                        if (ishare.item.toString() === item._id.toString()) {
                            // Item is the root of the sharing
                            // delete the sharing if owner else remove membership
                            if (isOwner) {
                                ishare.remove(function (err) {
                                    if (err) return next(err);
                                    item.remove(next);
                                });
                            } else if (membership) {
                                ishare.removeMember(user);
                                ishare.save(next);
                            } else {
                                next(new Error('User has no rights on this item'), 403);
                            }
                        } else {
                            // Item is a child of a shared folder
                            // delete if user has rw permissions
                            if (isOwner || (membership && membership.permissions === 1)) {
                                item.remove(next);
                            } else {
                                next(new Error('User has no rights on this item'), 403);
                            }
                        }
                    });
                }],
                function (err, codes) {
                    if (err) return res.send(codes[0] || 500);
                    res.send(200);
                });
		});
	});

    /**
     *  DELETE
     *  Remove resource reference
     */
    app.delete('/item/:id/confirm', mw.checkAuth, mw.validateId, function (req, res) {
        Item.findOneAndRemove({_id: req.params.id, isRemoved: true}, function (err) {
            if (err) return res.send(500);

            res.send(200);
        });
    });

    /**
     *  PUT
     *  Update resource name or parent
     */
    app.put('/item/:id', mw.checkAuth, mw.validateId, function (req, res) {
        Item.findOne({_id: req.params.id})
            .populate('parent')
            .exec(function (err, item) {
                if (err) return res.send(500);
                if (!item) return res.send(404);

                var name = req.body.name || item.name;
                var parent = req.body.parent || item.parent._id.toString();

                async.waterfall([
                    function (next) {
                        // Check if an item with same parent and name exists,
                        // rename if needed
                        Item.findOne({name: name, parent: parent, type: item.type, owner: item.owner}, function (err, i) {
                            if (err) return next(err);
                            if (i) name = Utils.rename(name);

                            next();
                        });
                    },
                    function (next) {
                        var oldParent = item.parent;
                        // Retrieve new parent
                        Item.findOne({_id: parent}, function (err, newParent) {
                            if (!newParent) return next(true, 400);

                            item.getDirPath(function (err, oldPath) {
                                if (err) return next(err);

                                item.name = name;
                                item.parent = newParent._id;
                                item.lastModified = Date.now();
                                // We're moving a non shared folder to a shared parent,
                                // or a embed shared folder to a non shared parent
                                // update property
                                if (oldParent.isShared && !newParent.isShared ||
                                    !oldParent.isShared && newParent.isShared)
                                    item.setShared(newParent.isShared, function (err, uitem) {
                                        next(err, oldPath, uitem);
                                    });
                                else
                                    item.save(function (err, uitem) {
                                        next(err, oldPath, uitem);
                                    })
                            });
                        });
                    }
                ], function (err, oldPath, uitem) {
                    if (err) return res.send(oldPath || 500);

                    uitem.getDirPath(function (err, newPath) {
                        if (err) return res.send(500);

                        fs.rename(oldPath, newPath, function (err) {
                            if (err) return res.send(500);

                            res.send(200, {
                                data: uitem
                            });
                        });
                    });
                });
            });
    });

};
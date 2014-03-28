var Item = require('../models/Item'),
    ItemShare = require('../models/ItemShare'),
    User = require('../models/User'),
    Notification = require('../models/Notification'),
    DailyTransfer = require('../models/UserDailyTransfer'),
    UserPlan = require('../models/UserPlan'),
	async = require('async'),
	Utils = require('../tools/utils'),
	mw = require('../tools/middlewares'),
    easyZip = require('easy-zip').EasyZip,
    cache = require('../tools/cache'),
    fs = require('fs-extra'),
    Throttle = require('throttle'),
    streamifier = require('streamifier'),
    admZip = require('adm-zip');

module.exports = function (app) {
	/**
	 *	POST
	 *  Create new Item
	 */
	app.post('/item', mw.checkAuth, function (req, res) {
		var type = req.body.type,
			parentId = req.body.parent,
			userId = req.user,
			meta = {},
			name;

		if (type != 'folder' && type != 'file' || !parentId) return res.send(400);

		Item.findOne({_id: parentId}, function (err, parent) {
			if (err) return res.send(500);
			if (!parent) return res.send(422);

            // Check if user has Write permissions on parent
            User.hasPermissions({item: parent, user: userId, permissions: 1}, function (err, ok) {
                if (err) return res.send(500);
                if (!ok) return res.send(403);

                if (type == 'folder') {
                    name = req.body.name;
                    meta = {size: 0};
                } else {
                    var f = req.files[Object.keys(req.files)[0]];
                    name = f.name;
                    meta = Utils.getFileMeta(f);
                }

                async.waterfall([
                    function (next) {
                        // Check if user is the owner,
                        // if so we'll only need him for the next func,
                        // else we'll need owner of the parent too
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
                        // Update currentPlan(s) storage and upload
                        // based on user relationship with parent
                        var owner = parentOwner || user;

                        var ownerPlan = owner.currentPlan;
                        // Verify owner's storage capacity
                        if (Utils.bytesToMb(ownerPlan.usage.storage + meta.size) > cache.getPlan(ownerPlan.plan).storage)
                            return res.send(true, 403);

                        if (owner._id.toString() === user._id.toString()) {
                            // User uploads an item in one of his folders
                            var query = {
                                $inc: {
                                    'usage.storage': meta.size,
                                    'usage.bandwidth.upload': meta.size
                                }};
                            UserPlan.findByIdAndUpdate(ownerPlan._id, query, function (err) {
                                next(err, user);
                            });
                        } else {
                            // User uploads an item in a shared folder
                            // update parentOwner's storage and user's upload
                            UserPlan.findByIdAndUpdate(parentOwner.currentPlan._id, {$inc: {'usage.storage': meta.size}},
                                function (err) {
                                    if (err) return next(err);

                                    UserPlan.findByIdAndUpdate(user.currentPlan._id, {$inc: {'usage.bandwidth.upload': meta.size}},
                                        function (err) {
                                            next(err, parentOwner);
                                        });
                                });
                        }

                    },
                    function (owner, next) {
                        // Rename item if needed
                        // and create it
                        Item.findOne({name: name, type: type, parent: parent._id, owner: owner._id}, function (err, item) {
                            if (err) return res.send(500);
                            if (item) name = Utils.rename(name);

                            new Item({name: name, type: type, owner: owner._id, parent: parent._id, meta: meta, isShared: parent.isShared})
                                .save(next);
                        });
                    }
                ], function (err, newItem) {
                    if (err) return res.send(500);

                    res.send(200, {
                        data: newItem
                    });
                });
            });
		});
	});

    /**
     *	POST
     *  Create copy of an item
     *  Needs ownership validation
     */
    app.post('/item/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var parentId = req.body.parent,
            itemId = req.params.id;

        async.waterfall([
            function (next) {
                Item.findOne({_id: parentId}, next);
            },
            function (parent, next) {
                if (!parent) return next(true, 422);

                Item.findOne({_id: itemId}, function (err, original) {
                    if (err) return next(err);
                    if (!original) return next(true, 404);

                    original.duplicateTree({parent: parent._id, owner: parent.owner}, function (err, dupl) {
                        next(err, original, dupl);
                    });
                });
            },
            function (original, dupl, cb) {
                original.getDirPath(function (err, originPath) {
                    if (err) return cb(err);
                    dupl.getDirPath(function (err, duplPath) {
                        if (err) return cb(err);
                        cb(null, {dupl: dupl, originPath: originPath, duplPath: duplPath});
                    });
                });
            }
        ],
        function (err, results) {
            if (err) return res.send(results || 500);

            results.dupl
                .getChildrenTree(function (err, childrens) {
                    if (err) return res.send(500);

                    var dupTree;
                    if (!childrens.length) {
                        dupTree = results.dupl;
                    } else {
                        dupTree = {
                            _id: results.dupl._id,
                            name: results.dupl.name,
                            type: results.dupl.type,
                            parent: results.dupl.parent,
                            children: childrens
                        }
                    }

                    fs.copy(results.originPath, results.duplPath, function (err) {
                        if (err) return res.send(500);

                        results.dupl.getSize(function (err, size) {
                            UserPlan.findOneAndUpdate({user: results.dupl.owner, active: true}, {$inc: {'usage.storage': size}},
                                function (err) {
                                    if (err) return res.send(500);

                                    res.send(201, {
                                        data: dupTree
                                    });
                                });
                        });
                    });
                });
        });
    });

	/**
	 * 	GET
	 * 	Return single item
	 */
	app.get('/item/:id', mw.validateId, function (req, res) {
		Item.findOne({_id: req.params.id})
            .populate('owner')
            .exec(function (err, item) {
                if (err) return res.send(500);
                if (!item) return res.send(404);

                async.waterfall([
                    // check if the request is authorized
                    function (cb) {
                        if (item.isPublic) return cb();

                        mw.checkAuth(req, res, function () {
                            User.hasPermissions({user: req.user, item: item}, function (err, ok) {
                                if (err) return cb(err);
                                if (!ok) return cb(true, 403);
                                cb();
                            });
                        });
                    },
                    function (cb) {
                        if (item.type === 'file') return cb(null, item);

                        // Get folder childrens
                        item.getChildrenTree(function (err, childrens) {
                            if (err) return cb(err);

                            var obj = item.toObject();
                            Utils.sortRecv(childrens);
                            obj.children = childrens;
                            obj.owner = {_id: item.owner._id, email: item.owner.email};

                            cb(null, obj);
                        });
                    }
                ], function (err, result) {
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
        var user = req.user;
        async.parallel({
            root: function (cb) {
                Item.findOne({owner: user, isRoot: true}, function (err, rootFolder) {
                    if (err) return cb(err);

                    rootFolder.formatWithSize(function (err, rootObj) {
                        cb(null, rootObj);
                    });
                });
            },
            shares: function (cb) {
                ItemShare.find({'members._id': user})
                    .select('item members')
                    .populate('item')
                    .exec(function (err, shares) {
                        if (err) return cb(err);

                        var fn = [];
                        shares.forEach(function (share) {
                            var membership = share.getMembership(user);

                            if (membership.accepted)
                                fn.push(function (cb) {
                                    share.item
                                        .formatWithSize(function (err, itemObj) {
                                            if (err) return cb(err);

                                            Utils.setChildrensPerms(itemObj.children, membership.permissions);
                                            itemObj.parent = membership.custom.parent;
                                            itemObj.permissions = membership.permissions;
                                            itemObj.root = true;

                                            cb(null, itemObj);
                                        });
                                });
                        });

                        async.parallel(fn, cb);
                    });
            }
        },
        function (err, results) {
            if (err) return res.send(500);

            results.shares.forEach(function (share) {
                Utils.insertAtParentPath([results.root], share);
            });

            var childrens = results.root.children;
            Utils.sortRecv(childrens);

            var rootDir = {
                _id: results.root._id,
                type: 'folder',
                name: 'My Cubbyhole',
                children: childrens
            };
            res.send(200, {
                data: [rootDir]
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
                                    if (Utils.bytesToMb(dailyTransfer.dataShared + size) > userPlan.sharedQuota) return callback(true, 403);

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
                    // if item is shared and user is a member, don't count this download as sharedData
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
	 * 	DELETE
	 * 	Removes resources and childrens if any
	 */
	app.delete('/item/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var user = req.user;

		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(500);
			if (!item) return res.send(404);

            function updateOwnerStorage(callback) {
                item.getSize(function (err, size) {
                    UserPlan.findOneAndUpdate(
                        {user: item.owner, active: true},
                        {$inc: {'usage.storage': -size}},
                        callback);
                });
            }

            var isOwner = user === item.owner.toString();

            async.parallel([
                // Item is not shared,
                // make sure user is the owner
                function (next) {
                    if (item.isShared) return next();

                    if (!isOwner)
                        next(true, 403);
                    else
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
                                                if (err || !ishare) return cb(true);

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

                            // update user's storage and remove item
                            updateOwnerStorage(function (err) {
                                item.remove(next);
                            });
                        });
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

                                    updateOwnerStorage(function (err) {
                                        item.remove(next);
                                    });
                                });
                            } else if (membership) {
                                ishare.removeMember(user);
                                ishare.save(next);
                            } else {
                                next(true, 403);
                            }
                        } else {
                            // Item is a child of a shared folder
                            // delete if user has rw permissions
                            if (isOwner || (membership && membership.permissions === 1)) {
                                updateOwnerStorage(function (err) {
                                    item.remove(next);
                                });
                            } else {
                                next(true, 403);
                            }
                        }
                    });
                }
            ], function (err, codes) {
                if (err) return res.send(codes[0] || 500);
                res.send(200);
            });
		});
	});

	/**
	 *	PUT
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
                                        if (err) return next(err);
                                        next(null, oldPath, uitem);
                                    });
                                else
                                    item.save(function (err, uitem) {
                                        if (err) return next(err);
                                        next(null, oldPath, uitem);
                                    })
                            });
                        });
                    }
                ], function (err, oldPath, uitem) {
                    if (err) return res.send(oldPath || 500);

                    uitem.getDirPath(function (err, newPath) {
                        if (err) return res.send(500);
                        fs.copy(oldPath, newPath, function (err) {
                            if (err) return res.send(500);

                            fs.remove(oldPath, function (err) {
                                if (err) return res.send(500);

                                res.send(200, {
                                    data: uitem
                                });
                            });
                        });
                    });
                });
            });
    });

};
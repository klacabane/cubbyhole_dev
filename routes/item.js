var Item = require('../models/Item'),
    ItemShare = require('../models/ItemShare'),
    User = require('../models/User'),
    Notification = require('../models/Notification'),
	async = require('async'),
	Utils = require('../tools/utils'),
	mw = require('../tools/middlewares'),
    admZip = require('adm-zip'),
    fs = require('fs-extra');

module.exports = function (app) {
	/*
	 *	POST
	 *  Create new Item
	 */
	app.post('/item', mw.checkAuth, function (req, res) {
		var type = req.body.type,
			parent = req.body.parent,
			u = req.user,
			meta = {},
			name;

		if (type != 'folder' && type != 'file' || !parent) return res.send(400);

		Item.findOne({_id: parent}, function (err, par) {
			if (err) return res.send(500);
			if (!par) return res.send(422);

			if (type == 'folder') {
				name = req.body.name;
			} else {
				var f = req.files[Object.keys(req.files)[0]];
				name = f.name;
				meta = Utils.getFileMeta(f);
			}

			Item.findOne({name: name, type: type, parent: parent, owner: u}, function (err, item) {
				if (err) return res.send(500);
				if (item) name = Utils.rename(name);

				new Item({name: name, type: type, owner: u, parent: parent, meta: meta, isShared: par.isShared})
                    .save(function (err, newItem) {
					if (err) return res.send(500);

                    var itemObj = newItem.toObject();
                    itemObj.meta = meta.size ? meta : {size: 0};

                    res.send(201, {
						data: itemObj
					});
				});
			});
		});
	});

    /*
     *	POST
     *  Create copy of an item
     *  Needs ownership validation
     */
    app.post('/item/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var parent = req.body.parent,
            itemId = req.params.id;

        async.waterfall([
            function (cb) {
                Item.parentExists(parent, cb);
            },
            function (exists, cb) {
                if (!exists) return cb(true, 422);

                Item.findOne({_id: itemId}, function (err, original) {
                    if (err) return cb(err);
                    if (!original) return cb(true, 404);

                    original.duplicateTree(parent, function (err, dupl) {
                        if (err) return cb(err);
                        cb(null, original, dupl);
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
            if (err) return res.send(originPath || 500);

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
                        res.send(201, {
                            data: dupTree
                        });
                    });
                });
        });
    });

	/*
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
                                if (err || !ok) return cb(err, 403);
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

    /*
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

    /*
     *  GET
     *  Returns resource ( file or folder.zip ) buffer
     */
	app.get('/item/:id/download/:token?', mw.validateId, function (req, res) {
		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(500);
			if (!item) return res.send(404);

            function download() {
                item.getDirPath(function (err, dirPath) {
                    if (err) return res.send(500);

                    if (item.type == 'file') {
                        res.download(dirPath);
                    } else {
                        item.getChildren(function (err, childrens) {
                            if (err) return res.send(500);
                            if (childrens.length === 0) return res.send(405);

                            var zip = new admZip();
                            zip.addLocalFolder(dirPath, item.name);

                            zip.toBuffer(function (buffer) {
                                res.writeHead(200, {
                                    'Content-Type': 'application/octet-stream',
                                    'Content-Length': buffer.length,
                                    'Content-Disposition': 'attachment; filename=' + [item.name, '.zip'].join('')
                                });
                                res.write(buffer);
                            }, function () {
                                res.send(500);
                            });
                        });
                    }
                });
            };

            if (item.isPublic)
                download();
            else
                mw.checkAuth(req, res, function () {
                    // User is authenticated
                    // now check if he is authorized
                    User.hasPermissions({user: req.user, item: item}, function (err, ok) {
                        if (err) return res.send(500);
                        if (!ok) return res.send(403);

                        download();
                    });
                });
		});
	});

	/* 
	 * 	DELETE
	 * 	Removes resources and childrens if any
	 */
	app.delete('/item/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var user = req.user;
		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(500);
			if (!item) return res.send(404);

            var isOwner = user === item.owner.toString();

            async.parallel([
                function (next) {
                    if (item.isShared) return next();
                    // Item is not shared,
                    // make sure user is the owner
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

                            item.remove(next);
                        });
                },
                function (next) {
                    if (!item.isShared) return next();
                    // Item is shared,
                    // find the user relationship
                    ItemShare.getItemShare(item, function (err, ishare) {
                        if (err || !ishare) return next(true);

                        var membership = ishare.getMembership(user);

                        if (ishare.item.toString() === item._id.toString()) {
                            // Item is the root of the sharing
                            if (isOwner) {
                                ishare.remove(function (err) {
                                    if (err) return next(err);
                                    item.remove(next);
                                });
                            } else if (membership) {
                                ishare.removeMember(user);
                                ishare.save(next);
                            } else {
                                next(true, 403);
                            }
                        } else {
                            // Item is a child of a shared folder
                            if (isOwner || (membership && membership.permissions === 1)) {
                                item.remove(next);
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

	/*
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
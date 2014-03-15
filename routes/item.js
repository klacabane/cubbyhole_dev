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

		Item.parentExists(parent, function (err, exists) {
			if (err) return res.send(500);
			if (!exists) return res.send(422);

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

				new Item({name: name, type: type, owner: u, parent: parent, meta: meta})
                    .save(function (err, newItem) {
					if (err) return res.send(500);

					res.send(201, {
						data: newItem
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
	app.get('/item/:id', mw.checkAuth, mw.validateId, function (req, res) {
		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(500);
			if (!item) return res.send(404);

			res.send(200, {
				data: item
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
                    rootFolder.getChildrenTree(function (err, childrens) {
                        if (err) return cb(err);

                        cb(null, {id: rootFolder._id, childrens: childrens});
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
                        shares.forEach(function (s) {
                            var membership = s.getMembership(user);

                            if (membership.accepted)
                                fn.push(function (cb) {
                                    s.item
                                        .getChildrenTree(function (err, childrens) {
                                            if (err) return cb(err);

                                            Utils.setChildrensPerms(childrens, membership.permissions);

                                            var obj = s.item.toObject();
                                            obj.children = childrens;
                                            obj.permissions = membership.permissions;
                                            cb(null, obj);
                                        });
                                });
                        });

                        async.parallel(fn, cb);
                    });
            }
        },
        function (err, results) {
            if (err) return res.send(500);

            var childrens = results.root.childrens
                .concat(results.shares);

            Utils.sortRecv(childrens);
            var rootDir = {
                _id: results.root.id,
                type: 'folder',
                name: 'My Cubbyhole',
                children: childrens
            };
            res.json({
                success: true,
                data: [rootDir]
            });
        });
	});

    /*
     *  GET
     *  Returns resource ( file or folder.zip ) buffer
     */
	app.get('/item/:id/download/:token', mw.checkAuth, mw.validateId, function (req, res) {
		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(500);
			if (!item) return res.send(404);

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
		});
	});

	/* 
	 * 	DELETE
	 * 	Removes resources and childrens if any
	 */
	app.delete('/item/:id', mw.checkAuth, mw.validateId, function (req, res) {
		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(500);
			if (!item) return res.send(404);

            item.remove(function (err) {
                if (err) return res.send(500);

                res.send(200);
            });
		});
	});

	/*
	 *	PUT
	 *  Update resource name or parent
	 */
	app.put('/item/:id', mw.checkAuth, mw.validateId, function (req, res) {
		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(500);
			if (!item) return res.send(404);
			// if (req.user != item.owner) return res.send(401);

            var name = req.body.name || item.name;
            var parent = req.body.parent || item.parent.toString();

            async.waterfall([
                function (cb) {
                    Item.parentExists(parent, cb);
                },
                function (exists, cb) {
                    if (!exists) return cb(true, 422); //hm
                    Item.findOne({name: name, parent: parent, type: item.type, owner: item.owner}, cb);
                },
                function (i, cb) {
                    if (i) name = Utils.rename(name);
                    item.getDirPath(function (err, oldPath) {
                        if (err) return cb(err);
                        item.name = name;
                        item.parent = parent;
                        item.lastModified = Date.now();
                        item.save(function (err, uitem) {
                            if (err) return cb(err);
                            cb(null, oldPath, uitem);
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
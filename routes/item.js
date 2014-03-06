var Item = require('../models/Item'),
    ItemShare = require('../models/ItemShare'),
    User = require('../models/User'),
    Notification = require('../models/Notification'),
	async = require('async'),
	Utils = require('../tools/utils'),
	mw = require('../tools/middlewares'),
    admZip = require('adm-zip'),
    fs = require('fs-extra'),
    ObjectId = require('mongoose').Types.ObjectId;

module.exports = function (app) {
	/*
	 *	POST
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

    var duplicate = function (args, callback) {
        var name = args.original.name;
        Item.findOne({name: args.original.name, type: args.original.type, parent: args.newParent}, function (err, exists) {
            if (exists) name = Utils.rename(name);

            new Item({
                name: name,
                owner: args.original.owner,
                isCopy: true,
                type: args.original.type,
                parent: args.newParent,
                meta: args.original.meta
            }).save(callback);
        });
    };

    var duplicateTree = function (args, callback) {
        args.original.getChildrenTree(function (err, childrens) {
            duplicate({original: args.original, newParent: args.newParent}, function (err, dupParent) {
                if (err) return callback(err);
                if (!childrens.length) return callback(null, dupParent);

                var cArgs = [];
                childrens.forEach(function (c) {
                    cArgs.push({original: new Item(c), newParent: dupParent._id});
                });

                async.map(cArgs, duplicateTree, function (err) {
                    if (err) return callback(err);

                    callback(null, dupParent);
                });
            });
        });
    };

    // PASTE
    app.post('/item/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var parent = req.body.parent;

        Item.parentExists(parent, function (err, exists) {
            if (err) return res.send(500);
            if (!exists) return res.send(422);

            Item.findOne({_id: req.params.id}, function (err, original) {
                if (err) return res.send(500);
                if (!original) return res.send(404);

                duplicateTree({original: original, newParent: parent}, function (err, dup) {
                    if (err) return res.send(500);

                    original.getDirPath(function (err, originPath) {
                        if (err) return res.send(500);
                        dup.getDirPath(function (err, dupPath) {
                            if (err) return res.send(500);

                            dup.getChildrenTree(function (err, childrens) {
                                if (err) return res.send(500);

                                var dupTree;
                                if (!childrens.length) {
                                    dupTree = dup;
                                } else {
                                    dupTree = {
                                        _id: dup._id,
                                        name: dup.name,
                                        type: dup.type,
                                        parent: dup.parent,
                                        children: childrens
                                    }
                                }

                                fs.copy(originPath, dupPath, function (err) {
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
        });
    });

	/*
	 * 	GET
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

	app.get('/item', mw.checkAuth, function (req, res) {
		Item.findOne({owner: req.user, root: true}, function (err, rootFolder) {
            if (err) return res.send(500);
            rootFolder.getChildrenTree({fields: 'id type name meta lastModified owner'}, function (err, childrens) {
                if (err) res.send(500);

                Utils.sortRecv(childrens);
                var rootDir = {
                    _id: rootFolder._id,
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
	});

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
	 */
	app.delete('/item/:id', mw.checkAuth, mw.validateId, function (req, res) {
		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(500);
			if (!item) return res.send(404);
			// if (req.user != item.owner) return res.send(401); -- Shared folders can have rw

            item.remove(function (err) {
                if (err) return res.send(500);

                res.send(200);
            });
		});
	});

	/*
	 *	PUT
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
                    Item.findOne({name: name, parent: parent, owner: item.owner}, cb);
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
                })
            });
        });
	});


    /*
     *  Utils
     */

};
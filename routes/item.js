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
	 */
	app.post('/item', mw.checkAuth, function (req, res) {
		var type = req.body.type,
			parent = (req.body.parent === '-1') ? undefined : req.body.parent,
			u = req.user,
			meta = {},
			name;

		if (type != 'folder' && type != 'file') return res.send(400);

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
		Item.find({owner: req.user, parent: { $exists: false }}, function (err, items) {
			var fn = [];
			items.forEach( function (it) {
				fn.push(function (callback) {
					it.getChildrenTree({fields: 'id type name meta lastModified owner'}, function (err, childrens) {
						if (err) return callback(err);

						var dir = {
							_id: it._id,
							name: it.name,
							type: it.type,
							meta: it.meta,
                            lastModified: it.lastModified,
                            owner: it.owner,
							children: childrens
						}
						callback(null, dir);
					})
				});
			});

			async.parallel(fn, function (err, results) {
				if (err) return res.send(500);

                Utils.sortRecv(results);
				var rootDir = {
					_id: '-1',
					type: 'folder',
					name: 'My Cubbyhole',
					children: results
				}
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
            var parent = function () {
                if (!req.body.parent && item.parent) return item.parent.toString();
                else if (req.body.parent === '-1' || (!req.body.parent && !item.parent)) return undefined;

                return req.body.parent;
            }();

            async.waterfall([
                function (cb) {
                    if (!parent) return cb(null, true);
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
};
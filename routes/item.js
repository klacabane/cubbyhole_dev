var Item = require('../models/Item'),
	async = require('async'),
	Utils = require('../tools/utils'),
	mw = require('../tools/middlewares'),
    admZip = require('adm-zip');

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

		if (type != 'folder' && type != 'file')
			return res.send(400);

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

				var newItem = new Item({name: name, type: type, owner: u, parent: parent, meta: meta});

				newItem.save(function (err) {
					if (err) return res.send(500);

					res.send(201, {
						data: {
							_id: newItem._id,
							name: newItem.name,
							type: newItem.type,
							parent: newItem.parent,
							meta: newItem.meta
						}
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
					it.getChildrenTree({fields: 'id type name meta'}, function (err, childrens) {
						if (err) return callback(err);

						var dir = {
							_id: it._id,
							name: it.name,
							type: it.type,
							meta: it.meta,
							children: childrens
						}
						callback(null, dir);
					})
				});
			});

			async.parallel(fn, function (err, results) {
				if (err) return res.send(500);

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

	app.get('/item/:id/download', mw.checkAuth, mw.validateId, function (req, res) {
		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(500);
			if (!item) return res.send(404);

			item.getDirPath()
			.then(function (path) {
				if (item.type == 'file') {
                    res.download(path);
                } else {
                    var zip = new admZip();
                    zip.addLocalFolder(path, item.name);

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

			Utils.rmDir(item, function (err) {
				item.remove(function (err) {
					if (err) return res.send(500);

					res.send(200);
				});
			});
		});
	});

	/*
	 *	PUT
	 */
	app.put('/item/:id/name', mw.checkAuth, mw.validateId, function (req, res) {
		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(500);
			if (!item) return res.send(404);
			if (req.user != item.owner) return res.send(401);

			var name = req.body.name;
			Item.findOne({name: name, parent: item.parent}, function (err, i) {
				if (err) return res.send(500);
				if (i) name = Utils.rename(name);

				item.name = name;
				item.save(function (err, uitem) {
					if (err) return res.send(500);
					res.send(200, {
						data: uitem
					});
				});
			});
		});
	});

};
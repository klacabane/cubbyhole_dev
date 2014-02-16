var Item = require('../models/Item'),
	async = require('async'),
	Utils = require('../tools/utils'),
	mw = require('../tools/middlewares');

module.exports = function (app) {
	/*
	 *	POST
	 */
	app.post('/item', function (req, res) {
		var type = req.body.type,
			parent = req.body.parent,
			u = req.user,
			meta = {},
			name;

		if (type != 'folder' && type != 'file')
			return res.send({success: false, error: 'Invalid type.'});

		Item.parentExists(parent, function (err, exists) {
			if (err) return res.send(500);
			if (!exists) return res.send({success: false, error: 'Invalid Parent.'})

			if (type == 'folder') {
				name = req.body.name;
			} else {
				var f = req.files[Object.keys(req.files)[0]];
				name = f.name;
				meta = Utils.getFileMeta(f);
			}

			Item.findOne({name: name, type: type, parent: parent, owner: u}, function (err, item) {
				if (err) return res.send(500);
				if (item) name = name.substring(0, name.split('.')[0].length) + Date.now() + name.substring(name.split('.')[0].length, name.length);

				var newItem = new Item({name: name, type: type, owner: u, parent: parent, meta: meta});

				newItem.save(function (err) {
					if (err)
						return res.send(500, {
							success: false,
							error: 'Error creating ' + newItem.type + '.'
						});
					// OK
					return res.send(201, {
						success: true,
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
	app.get('/item/:id', mw.validateId, function (req, res) {
		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(500);
			if (!item) return res.send(404);

			res.send(200, {
				success: true,
				data: item
			});
		});
	});

	app.get('/item', function (req, res) {
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
					_id: -1,
					type: 'folder',
					name: 'My Cubbyhole',
					children: results
				}
				res.json({
					success: true,
					data: rootDir
				});
			});
		});
	});

	/* 
	 * 	DELETE
	 */
	app.delete('/item/:id', mw.validateId, function (req, res) {
		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(500);
			if (!item) return res.send(404);
			if (req.user != item.owner) return res.send(401);

			Utils.rmDir(item, function (err) {
				item.remove(function (err) {
					if (err) return res.send(500);

					res.send(200, {
						success: true
					});
				});
			});
		});
	});

};
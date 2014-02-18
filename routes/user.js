var User = require('../models/User'),
	Item = require('../models/Item'),
	async = require('async'),
	mw = require('../tools/middlewares');

module.exports = function (app) {
	// GET
	app.get('/user/:id', mw.checkAuth, mw.validateId, function (req, res) {
		User.findOne({ _id: req.params.id }, '_id mail registrationDate currentPlan', function (err, user) {
			if (err) return res.send(500);
			if (!user) return res.send(404);
			
			res.send(200, {
				success: true,
				data: user
			});
		});
	});

	// GET User Items
	app.get('/user/:id/items', mw.checkAuth, mw.validateId, function (req, res) {
		Item.find({owner: req.params.id, parent: { $exists: false }}, function (err, items) {
			var fn = [];
			items.forEach( function (it) {
				fn.push(function (callback) {
					it.getChildrenTree({fields: 'id type name meta'}, function (err, childrens) {
						if (err) return callback(err);

						var dir = {
							_id: it._id,
							name: it.name,
							type: it.type,
							children: childrens
						}
						callback(null, dir);
					})
				});
			});

			async.parallel(fn, function (err, results) {
				if (err) return res.send(500);

				var rootDir = {
					id: -1,
					type: 'folder',
					name: 'My Cubbyhole',
					children: results
				}
				res.send(200, {
					success: true,
					data: rootDir
				});
			});
		});
	});

	// PUT

	// DELETE
};
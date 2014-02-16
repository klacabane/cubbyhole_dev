var	jwt = require('jwt-simple'),
	cfg = require('../config'),
	async = require('async'),
	fs = require('fs');

var Utils = {
	/* Token */
	generateToken: function (u, r) {
		var dur = r ? cfg.token.expiration_long : cfg.token.expiration;

		var token = jwt.encode({
			id: u._id, 
			mail: u.mail, 
			exp: Date.now() + (86400000 * dur)
		}, cfg.token.secret);

		return token;
	},
	getTokenUser: function (token) {
		return jwt.decode(token, cfg.token.secret).id;
	},
	isTokenValid: function (token) {
		try {
			var u = jwt.decode(token, cfg.token.secret);
		} catch (err) {
			return false;
		}

		if (u.exp < Date.now())
			return false;

		return true;
	},
	/* File */
	getFileMeta: function (file) {
		return {
			tmp: file.path,
			size: file.size,
			type: file.type
		};
	},
	/* Folder */
	rmDir: function (item, cb) {
		item.getDirPath()
		.then(function (path) {
			var p = cfg.storage.dir + '/' + item.owner + '/' + path;
			if (item.type == 'file') {
				fs.unlink(p, function (err) {
					if (err) return cb(err);
					cb();
				});
			} else {
				item.getChildren(function (err, childs) {
					if (err) return cb(err);
					if (childs.length === 0) {
						fs.rmdir(p, function (e) {
							if (e) return cb(e);
							cb();
						});
					} else {
						async.each(childs, Utils.rmDir, function (err) {
							if (err) return cb(err);

							fs.rmdir(p, function (e) {
								if (e) return cb(e);
								cb();
							});
						});
					}
				});
			}
		});
	}
};

module.exports = Utils;
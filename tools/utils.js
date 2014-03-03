var	jwt = require('jwt-simple'),
	cfg = require('../config'),
	async = require('async'),
	fs = require('fs'),
	nodemailer = require('nodemailer'),
	Plan = require('../models/Plan'),
	Bandwidth = require('../models/Bandwidth');

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

		if (u.exp && u.exp < Date.now())
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
	rename: function (name) {
		return name.substring(0, name.split('.')[0].length) + Date.now() + name.substring(name.split('.')[0].length, name.length);
	},
	/* Folder */
	rmDir: function (item, cb) {
		item.getDirPath(function (err, path) {
            if (err) return cb(err);
			if (item.type == 'file') {
				fs.unlink(path, function (err) {
					if (err) return cb(err);
					cb();
				});
			} else {
				item.getChildren(function (err, childs) {
					if (err) return cb(err);
					if (childs.length === 0) {
						fs.rmdir(path, function (e) {
							if (e) return cb(e);
							cb();
						});
					} else {
						async.each(childs, Utils.rmDir, function (err) {
							if (err) return cb(err);

							fs.rmdir(path, function (e) {
								if (e) return cb(e);
								cb();
							});
						});
					}
				});
			}
		});
	},
	/* DB */
	insertPlanAndBw: function (callback) {
		fs.readFile('./datas/planAndBw.json', function (err, data) {
			data = JSON.parse(data);

			Plan.removeAll( function (err) {
				if (err) return callback(err);
				var bwCount = data.bandwidths.length,
					planCount = data.plans.length;
				data.bandwidths.forEach( function (bwArgs) {
					var bw = new Bandwidth(bwArgs);
					bw.save( function (err) {
						if (err) return callback(err);
						if (--bwCount == 0)
							data.plans.forEach( function (planArgs) {
								var plan = new Plan(planArgs);
								plan.save( function (err) {
									if (err) return callback(err);
									if (--planCount == 0)
										callback();
								});
							});
					});
				});
			});
		});
	},
	/* Email */
	sendEmail: function (recipient, details, callback) {
        var recipient = recipient,
            details = details,
            callback = callback || details,
            options = {
                from: "Cubbyhole <noreply@cubbyhole.com>",
                to: recipient.mail
            };

        var smtpTransport = nodemailer.createTransport("SMTP", {
            service: "Gmail",
            auth: {
                user: "cubbyholeapi@gmail.com",
                pass: "cubbyhole1"
            }
        });

        var token;
        if (typeof details === 'function') {    // Account Verification
            token = jwt.encode({
                id: recipient._id,
                created: Date.now()
            }, cfg.token.secret);

            options.subject = "Cubbyhole signup confirmation";
            options.html = "<a href='http://localhost:3000/auth/confirm/" + token + "''>Confirm your mail</a>";
        } else {
            if (!details.hasOwnProperty('share')) { // Remove
                options.subject = details.from.mail + ' removed the ' + details.item.type + ' ' + details.item.name + '.';
            } else {
                token = jwt.encode({
                    share: details.share,
                    created: Date.now()
                }, cfg.token.secret);

                options.subject = details.from.mail + ' wants to share the ' + details.item.type + ' ' + details.item.name + ' with you.';
                options.html = "<a href='http://localhost:3000/item/share/confirm/" + token + "''>See the" + details.item.type + "</a>";
            }
        }

        smtpTransport.sendMail(options, function (err, res) {
            if (err) return callback(err);

            smtpTransport.close();
            callback();
        });
	},
    sortByName: function (a, b) {
        if(a.name < b.name) return -1;
        if(a.name > b.name) return 1;
        return 0;
    }
};

module.exports = Utils;
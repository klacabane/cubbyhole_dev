var jwt = require('jwt-simple'),
    cfg = require('../config'),
    async = require('async'),
    fs = require('fs'),
    nodemailer = require('nodemailer'),
    path = require('path'),
    Plan = require('../models/Plan'),
    Bandwidth = require('../models/Bandwidth'),
    Cache = require('../tools/cache');

var Utils = {
    /*
     *  Token
     */
    generateToken: function (user, remember) {
        var duration = remember
            ? cfg.token.expiration_long
            : cfg.token.expiration;

        var token = jwt.encode({
            id: user._id,
            mail: user.mail,
            exp: Date.now() + (86400000 * duration)
        }, cfg.token.secret);

        return token;
    },
    getTokenUser: function (token) {
        return jwt.decode(token, cfg.token.secret).id;
    },
    isTokenValid: function (token) {
        try {
            var tkn = jwt.decode(token, cfg.token.secret);
        } catch (err) {
            return false;
        }

        if (tkn.exp && tkn.exp < Date.now())
            return false;

        if (tkn.isNonce)
            if (Cache.isBlacklisted(token))
                return false;
            else
                Cache.blacklistToken(token);

        return true;
    },
    /*
     *  File
     */
    getFileMeta: function (file) {
        var ext = file.originalFilename.split('.').pop();
        var type = this._extensions.find(ext);

        return {
            tmp: file.path,
            size: file.size,
            type: type
        };
    },
    rename: function (name) {
        return name.substring(0, name.split('.')[0].length)
            + Date.now()
            + name.substring(name.split('.')[0].length, name.length);
    },
	/* DB */
    insertPlanAndBw: function (callback) {
        fs.readFile('./datas/planAndBw.json', function (err, data) {
            data = JSON.parse(data);

            Plan.removeAll(function (err) {
                if (err) return callback(err);
                async.each(
                    data.bandwidths,
                    function (bwArgs, cb) {
                        new Bandwidth(bwArgs)
                            .save(cb);
                    },
                    function (err) {
                        if (err) return callback(err);

                        Bandwidth.find({}, function (err, bws) {
                            if (err) return callback(err);

                            var i = 0;
                            async.each(
                                data.plans,
                                function (planArgs, cb) {
                                    var plan = new Plan(planArgs);
                                    plan.bandwidth = bws[i++]._id;
                                    plan.save(cb);
                                },
                                callback);
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
                to: recipient.email
            };

        var smtpTransport = nodemailer.createTransport("SMTP", {
            service: "hotmail",
            auth: {
                user: "cubbyholeadm@outlook.com",
                pass: "Supinf0cubbyhole"
            }
        });

        var tokenOpts = {
            id: recipient._id,
            created: Date.now()
        };

        if (typeof details === 'function') {    // Account Verification
            var token = jwt.encode(tokenOpts, cfg.token.secret);
            options.subject = "Cubbyhole signup confirmation";
            options.html = "<a href='" + cfg.api.address + "/auth/confirm/" + token + "'>Confirm your mail</a>";
        } else {
            if (details.hasOwnProperty('share')) {
                var token = jwt.encode(tokenOpts, cfg.token.secret);

                options.subject = details.from.email + ' wants to share the ' + details.item.type + ' ' + details.item.name + ' with you.';
                options.html = "<a href='" + cfg.api.address + "/share/confirm/" + details.share + "/" + token + "'>View the " + details.item.type + "</a>";
            } else if (details.hasOwnProperty('link')) { // Link
                var from = details.from
                    ? details.from.email
                    : 'Someone';

                options.subject = from + ' invited you to see the resource ' + details.item.name + '.';
                options.html = "<a href='" + cfg.webclient.address + "/webapp.html#" + details.link + "'>View the " + details.item.type + "</a>";
            } else if (details.hasOwnProperty('delete')) { // Delete
                options.subject = details.from.email + ' removed the ' + details.item.type + ' ' + details.item.name + '.';
            } else if (details.hasOwnProperty('resetPassword')) {
                // token validity set to 1hr
                tokenOpts.exp = Date.now() + 3600000;
                tokenOpts.isNonce = true;
                var token = jwt.encode(tokenOpts, cfg.token.secret);

                options.subject = 'Cubbyhole password reset';
                options.html = 'If you didn\'t request a password reset, please ignore this email. ';
                options.html += "<a href='" + cfg.webclient.address + "/?resetPassword=" + token + "'>Reset your password</a>";
            }
        }

        smtpTransport.sendMail(options, function (err) {
            if (err) return callback(err);

            smtpTransport.close();
            callback();
        });
    },
    _sortByName: function (a, b) {
        if (a.name.toUpperCase() < b.name.toUpperCase()) return -1;
        if (a.name.toUpperCase() > b.name.toUpperCase()) return 1;
        return 0;
    },
    sortRecv: function (childrens) {
        if (!childrens.length) return;

        childrens.sort(Utils._sortByName);
        for (var i = 0, length = childrens.length; i < length; i++) {
            if (!childrens[i].children) continue;
            Utils.sortRecv(childrens[i].children);
        }
    },
    setChildrensPerms: function (childrens, permissions) {
        if (!childrens.length) return;
        for (var i = 0, length = childrens.length; i < length; i++) {
            childrens[i].permissions = permissions;

            if (!childrens[i].children) continue;
            Utils.setChildrensPerms(childrens[i].children, permissions);
        }
    },
    /*
     * Extensions
     */
    _extensions: {
        _image: ['Image', ['jpg', 'jpeg', 'png', 'jp2', 'gif']],
        _audio: ['Audio', ['mp3']],
        _video: ['Video', ['avi', 'mkv']],
        _archive: ['Archive', ['zip', 'rar']],
        find: function (ext) {
            for (var p in this) {
                var property = this[p];
                if (Array.isArray(property)
                    && property[1].indexOf(ext) > -1)
                    return property[0];
            }
            return 'Document';
        }
    },
    insertAtParentPath: function (childrens, item) {
        var subChildrens = [],
            inserted = false;

        if (!childrens.length) return;

        for (var i = 0, length = childrens.length; i < length; i++) {
            var child = childrens[i];

            if (child.type === 'folder') {
                if (child._id.toString() === item.parent.toString()) {
                    child.children.push(item);
                    inserted = true;
                    break;
                } else {
                    subChildrens = subChildrens.concat(child.children);
                }
            }

        }
        if (!inserted)
            Utils.insertAtParentPath(subChildrens, item);
    },
    getSharedChilds: function (childrens) {
        var results = [];

        for (var i = 0, length = childrens.length; i < length; i++) {
            var child = childrens[i];

            if (child.type === 'folder') {
                if (child.isShared)
                    results.push(child._id)
                else
                   results = results.concat(Utils.getSharedChilds(child.children));
            }
        }
        return results;
    },
    getSize: function (dirPath, callback) {
        fs.stat(dirPath, function (err, stats) {
            if (err) return callback(err);

            var total = stats.size;

            if (!stats.isDirectory())
                callback(null, total);
            else
                fs.readdir(dirPath, function (err, items) {
                    async.each(
                        items,
                        function (item, cb) {
                            Utils.getSize(path.join(dirPath, item), function (err, size) {
                                if (err) return cb(err);
                                total += size;
                                cb();
                            });
                        },
                        function (err) {
                            callback(err, total);
                        });
                });
        });
    },
    bytesToMb: function (bytes) {
        if (bytes == 0) return 0;
        return (bytes/1000000).toFixed(2);
    },
    /*
     *  Array
     */
    cleanArray: function (arr) {
        var res = [];
        for (var i = 0, length = arr.length; i < length; i++) {
            if (arr[i])
                res.push(arr[i]);
        }
        return res;
    },
    isMember: function (id, members) {
        var lookup = {};
        for (var i = 0, length = members.length; i < length; i++) {
            lookup[members[i]._id.toString()] = members[i];
        }

        return lookup[id] !== undefined;
    }
};


module.exports = Utils;